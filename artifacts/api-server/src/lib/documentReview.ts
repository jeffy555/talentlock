import OpenAI from "openai";
import type { Logger } from "pino";
import { and, count, eq } from "drizzle-orm";

import { db, documentsTable, freelancerProfilesTable, usersTable } from "@workspace/db";

import {
  type DocumentStatus,
  type DocumentType,
  isPdfStoragePath,
} from "./documentConstants";
import { pdfFirstPageDataUrl } from "./documentPdfPreview";
import { usesLocalObjectStorage } from "./localObjectStorage";
import { ObjectStorageService } from "./objectStorage";
import { resolveVisionImageUrl } from "./visionImageUrl";
import { logTokenUsage } from "./tokenLogger";
import { getSystemUserId } from "./systemUser";
import { createNotification, NotificationType, userIdFromFreelancerProfileId } from "./createNotification";
import { sendNotificationEmailAsync } from "./emailService";
import { evaluateTalentSearchForUpdatedProfile } from "./talentSearchEvaluator";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });
const objectStorageService = new ObjectStorageService();

export const DOCUMENT_REVIEW_SYSTEM_PROMPT = `You are reviewing a document image for a freelance platform. Assess whether the document appears to be:
- A genuine, legible identity document or professional credential
- Free from obvious signs of tampering or digital manipulation
- Matching the submitted document type

Return ONLY a JSON object — no preamble, no markdown:
{
  "verdict": "verified" | "rejected" | "needs_review",
  "confidence": number (0-100),
  "notes": "Brief plain-English reason, max 2 sentences. Be specific about why rejected."
}

If you cannot determine authenticity with reasonable confidence, return "needs_review".
Do NOT attempt to extract personal data (name, DOB, ID numbers) from the document.`;

type DbClient = Pick<typeof db, "select" | "update" | "insert">;

interface ReviewVerdict {
  verdict: DocumentStatus;
  confidence: number;
  notes: string;
}

function parseReviewResponse(content: string | null | undefined): ReviewVerdict {
  const fallback: ReviewVerdict = {
    verdict: "needs_review",
    confidence: 0,
    notes: "AI response could not be parsed — queued for manual review.",
  };
  if (!content) return fallback;

  try {
    const trimmed = content.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? trimmed) as {
      verdict?: string;
      confidence?: number;
      notes?: string;
    };

    const verdict =
      parsed.verdict === "verified" || parsed.verdict === "rejected" || parsed.verdict === "needs_review"
        ? parsed.verdict
        : "needs_review";

    return {
      verdict,
      confidence: typeof parsed.confidence === "number" ? Math.round(parsed.confidence) : 0,
      notes: typeof parsed.notes === "string" && parsed.notes.trim().length > 0
        ? parsed.notes.trim()
        : fallback.notes,
    };
  } catch {
    return fallback;
  }
}

export async function updateVerificationLevel(
  dbOrTx: DbClient,
  freelancerId: number,
): Promise<void> {
  const [verifiedCountRow] = await dbOrTx
    .select({ count: count() })
    .from(documentsTable)
    .where(and(eq(documentsTable.freelancerId, freelancerId), eq(documentsTable.status, "verified")));

  const verifiedCount = verifiedCountRow?.count ?? 0;
  const level =
    verifiedCount === 0
      ? "unverified"
      : verifiedCount === 1
        ? "partially_verified"
        : "fully_verified";

  await dbOrTx
    .update(freelancerProfilesTable)
    .set({
      verificationLevel: level,
      isVerified: level !== "unverified",
      updatedAt: new Date(),
    })
    .where(eq(freelancerProfilesTable.id, freelancerId));
}

export async function maybeTriggerTalentSearchAfterVerification(
  freelancerId: number,
  log: Logger,
): Promise<void> {
  const [profile] = await db
    .select({ completenessScore: freelancerProfilesTable.completenessScore })
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.id, freelancerId))
    .limit(1);
  if (!profile || profile.completenessScore < 60) return;

  evaluateTalentSearchForUpdatedProfile(db, freelancerId, log).catch((err) =>
    log.warn({ err, freelancerId }, "talent-search after document verify failed"),
  );
}

export async function triggerDocumentReview(
  dbOrTx: DbClient,
  log: Logger,
  freelancerId: number,
  documentType: DocumentType,
): Promise<void> {
  const [doc] = await dbOrTx
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.freelancerId, freelancerId), eq(documentsTable.documentType, documentType)))
    .limit(1);

  if (!doc) return;

  let verdict: ReviewVerdict = {
    verdict: "needs_review",
    confidence: 0,
    notes: "AI review failed — queued for manual review.",
  };

  try {
    const visionImageUrl = isPdfStoragePath(doc.fileUrl)
      ? await loadPdfVisionImageUrl(doc.fileUrl)
      : await resolveVisionImageUrl(doc.fileUrl);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: DOCUMENT_REVIEW_SYSTEM_PROMPT },
            { type: "image_url", image_url: { url: visionImageUrl, detail: "high" } },
          ],
        },
      ],
    });

    verdict = parseReviewResponse(response.choices[0]?.message?.content);
    if (verdict.verdict === "needs_review" && verdict.notes === "AI response could not be parsed — queued for manual review.") {
      log.warn({ freelancerId, documentType }, "document review JSON parse failed");
    }

    await dbOrTx
      .update(documentsTable)
      .set({
        status: verdict.verdict,
        confidence: verdict.confidence,
        aiNotes: verdict.notes,
        reviewedBy: "ai",
        updatedAt: new Date(),
      })
      .where(and(eq(documentsTable.freelancerId, freelancerId), eq(documentsTable.documentType, documentType)));

    await updateVerificationLevel(dbOrTx, freelancerId);

    if (verdict.verdict === "verified") {
      maybeTriggerTalentSearchAfterVerification(freelancerId, log).catch((err) =>
        log.warn({ err, freelancerId, documentType }, "talent-search trigger after AI verify failed"),
      );
    }

    if (verdict.verdict === "verified" || verdict.verdict === "rejected") {
      const userId = await userIdFromFreelancerProfileId(freelancerId);
      const docLabel = documentType.replace(/_/g, " ");
      if (userId) {
        const docMsg = verdict.verdict === "verified"
          ? `Your ${docLabel} has been verified ✓`
          : `Your ${docLabel} was not verified — please re-upload`;
        createNotification(dbOrTx, {
          userId,
          type: verdict.verdict === "verified"
            ? NotificationType.DOCUMENT_VERIFIED
            : NotificationType.DOCUMENT_REJECTED,
          entityType: "document",
          entityId: freelancerId,
          message: docMsg,
        }).catch((err) => log.warn({ err, freelancerId, documentType }, "notification write failed"));
        sendNotificationEmailAsync(
          dbOrTx as typeof db, userId,
          verdict.verdict === "verified" ? "Document verified on TalentLock" : "Document review on TalentLock",
          docMsg, "/profile", log,
        );
      }
    }

    const usage = response.usage;
    if (usage) {
      const systemUserId = await getSystemUserId();
      await logTokenUsage(dbOrTx, systemUserId, "document_verification", {
        prompt_tokens: usage.prompt_tokens ?? 0,
        completion_tokens: usage.completion_tokens ?? 0,
        total_tokens: usage.total_tokens ?? 0,
      });
    }
  } catch (err) {
    log.error({ err, freelancerId, documentType }, "document review failed");
    await dbOrTx
      .update(documentsTable)
      .set({
        status: "needs_review",
        confidence: 0,
        aiNotes: "AI review failed — queued for manual review.",
        reviewedBy: "ai",
        updatedAt: new Date(),
      })
      .where(and(eq(documentsTable.freelancerId, freelancerId), eq(documentsTable.documentType, documentType)));
    await updateVerificationLevel(dbOrTx, freelancerId);
  }
}

export async function countVerifiedDocuments(freelancerId: number): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(documentsTable)
    .where(and(eq(documentsTable.freelancerId, freelancerId), eq(documentsTable.status, "verified")));
  return row?.count ?? 0;
}

async function loadPdfVisionImageUrl(relativeKey: string): Promise<string> {
  if (usesLocalObjectStorage()) {
    const buffer = await objectStorageService.readPrivateObjectBuffer(relativeKey);
    if (!buffer) throw new Error("PDF object not found");
    return pdfFirstPageDataUrl(buffer);
  }
  const signedUrl = await objectStorageService.getSignedReadUrlForKey(relativeKey, 15 * 60);
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error(`Failed to download PDF (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return pdfFirstPageDataUrl(buffer);
}

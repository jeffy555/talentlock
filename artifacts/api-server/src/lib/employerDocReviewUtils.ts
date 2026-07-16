import OpenAI from "openai";
import type { Logger } from "pino";
import { eq } from "drizzle-orm";

import {
  db,
  employerDocumentsTable,
  employerProfilesTable,
  type EmployerDocument,
  type EmployerDocumentType,
  type EmployerDocReviewResult,
  type EmployerVerificationLevel,
} from "@workspace/db";

import { createNotification, NotificationType } from "./createNotification";
import { sendNotificationEmailAsync } from "./emailService";
import { ObjectStorageService } from "./objectStorage";
import { logTokenUsage } from "./tokenLogger";
import { sanitiseText } from "./sanitise";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });
const objectStorageService = new ObjectStorageService();

export const DOCUMENT_TYPE_LABELS: Record<EmployerDocumentType, string> = {
  company_registration: "Company Registration Certificate",
  tax_vat_certificate: "Tax / VAT Certificate",
  business_licence: "Business Licence",
  representative_id: "Representative ID",
  proof_of_business_address: "Proof of Business Address",
};

export const REQUIRED_FOR_PARTIAL: EmployerDocumentType[] = ["representative_id"];
export const REQUIRED_FOR_FULL: EmployerDocumentType[] = [
  "representative_id",
  "company_registration",
  "tax_vat_certificate",
];

export function calculateVerificationLevel(
  docs: Pick<EmployerDocument, "documentType" | "status">[],
): { level: EmployerVerificationLevel; isVerified: boolean } {
  const verified = new Set(
    docs.filter((doc) => doc.status === "verified").map((doc) => doc.documentType),
  );
  const hasRepId = verified.has("representative_id");
  const hasCompanyRegistration = verified.has("company_registration");
  const hasTaxCertificate = verified.has("tax_vat_certificate");

  if (!hasRepId) return { level: "unverified", isVerified: false };
  if (hasRepId && hasCompanyRegistration && hasTaxCertificate) {
    return { level: "fully_verified", isVerified: true };
  }
  return { level: "partially_verified", isVerified: false };
}

// This deliberately receives a transaction object. Verification state must never
// be recalculated using a separate connection from the document status update.
export async function recalculateEmployerVerificationLevel(tx: any, employerId: number): Promise<void> {
  const docs = await tx.query.employerDocumentsTable.findMany({
    where: eq(employerDocumentsTable.employerId, employerId),
  });
  const { level, isVerified } = calculateVerificationLevel(docs);
  await tx
    .update(employerProfilesTable)
    .set({ verificationLevel: level, isVerified, updatedAt: new Date() })
    .where(eq(employerProfilesTable.id, employerId));
}

export function buildEmployerDocReviewPrompt(
  documentType: EmployerDocumentType,
  companyName: string | null | undefined,
): string {
  return `You are reviewing a business identity document uploaded to a professional hiring platform.
This is NOT a legal identity verification — it is a platform trust check only.

Declared document type: ${documentType}
Employer company name on profile: ${companyName ?? "not specified"}

Review the image and assess all of the following:
1. Does this document match the declared type "${DOCUMENT_TYPE_LABELS[documentType]}"?
2. Is a company name visible, and does it match "${companyName ?? "not specified"}"?
3. Is a registration, licence, or reference number visible?
4. Is the document legible and not obscured?
5. Does the document appear to have an expiry date? If so, has it expired?
6. Are there any signs of obvious digital tampering, editing artefacts, or inconsistencies?
7. For representative_id type: does the document appear to be a government-issued photo ID?

Return ONLY a JSON object — no preamble, no markdown:
{
  "status": "verified" | "needs_review" | "rejected",
  "confidence": <0-100>,
  "documentTypeMatch": <true|false>,
  "companyNameMatch": <true|false|null>,
  "registrationNumberVisible": <true|false>,
  "isLegible": <true|false>,
  "hasExpiry": <true|false>,
  "isExpired": <true|false|null>,
  "tamperingConcern": <true|false>,
  "adminNotes": "<technical assessment for platform admin — max 150 words — may include visible text from document>",
  "employerNotes": "<plain English message for the employer — max 50 words — never include raw document content, registration numbers, or ID numbers>"
}

Status rules:
- "verified": document matches type, company name consistent (if visible), legible, not expired, no tampering
- "needs_review": document is ambiguous, partially legible, or company name unclear — human review needed
- "rejected": clear type mismatch, obvious tampering, expired document, completely illegible

IMPORTANT: This assessment is for platform trust purposes only. Never state or imply legal verification.`;
}

export function validateEmployerDocReviewResponse(value: unknown): value is EmployerDocReviewResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<EmployerDocReviewResult>;
  return (
    (result.status === "verified" || result.status === "needs_review" || result.status === "rejected") &&
    typeof result.confidence === "number" &&
    result.confidence >= 0 &&
    result.confidence <= 100 &&
    typeof result.documentTypeMatch === "boolean" &&
    (typeof result.companyNameMatch === "boolean" || result.companyNameMatch === null) &&
    typeof result.registrationNumberVisible === "boolean" &&
    typeof result.isLegible === "boolean" &&
    typeof result.hasExpiry === "boolean" &&
    (typeof result.isExpired === "boolean" || result.isExpired === null) &&
    typeof result.tamperingConcern === "boolean" &&
    typeof result.adminNotes === "string" &&
    typeof result.employerNotes === "string"
  );
}

function fallbackReview(): EmployerDocReviewResult {
  return {
    status: "needs_review",
    confidence: 0,
    documentTypeMatch: false,
    companyNameMatch: null,
    registrationNumberVisible: false,
    isLegible: false,
    hasExpiry: false,
    isExpired: null,
    tamperingConcern: false,
    adminNotes: "AI review failed to parse response. Manual review required.",
    employerNotes: "We are reviewing your document and will update you shortly.",
  };
}

export async function reviewEmployerDocument(
  dbConn: typeof db,
  employerDocId: number,
  log: Logger,
): Promise<void> {
  const [doc] = await dbConn
    .select()
    .from(employerDocumentsTable)
    .where(eq(employerDocumentsTable.id, employerDocId))
    .limit(1);
  if (!doc) return;

  const [employer] = await dbConn
    .select()
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.id, doc.employerId))
    .limit(1);
  if (!employer) return;

  let result = fallbackReview();
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

  try {
    const signedUrl = await objectStorageService.getSignedReadUrlForKey(doc.fileUrl, 15 * 60);
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: signedUrl, detail: "high" } },
          { type: "text", text: buildEmployerDocReviewPrompt(doc.documentType as EmployerDocumentType, employer.companyName) },
        ],
      }],
    });
    usage = response.usage ?? undefined;
    const content = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.replace(/```json|```/g, "").trim()) as unknown;
    if (validateEmployerDocReviewResponse(parsed)) result = parsed;
    else log.warn({ employerDocId }, "Employer document review returned an invalid shape");
  } catch (err) {
    log.error({ err, employerDocId }, "Employer document review failed");
  }

  await dbConn.transaction(async (tx) => {
    await tx
      .update(employerDocumentsTable)
      .set({
        status: result.status,
        confidence: Math.round(result.confidence),
        aiNotes: sanitiseText(result.adminNotes),
        employerNotes: sanitiseText(result.employerNotes),
        reviewedBy: "ai",
        updatedAt: new Date(),
      })
      .where(eq(employerDocumentsTable.id, employerDocId));
    await recalculateEmployerVerificationLevel(tx, doc.employerId);
  });

  const userId = employer.userId;
  if (result.status === "verified" || result.status === "rejected") {
    const title = result.status === "verified"
      ? `Your ${DOCUMENT_TYPE_LABELS[doc.documentType as EmployerDocumentType]} has been verified ✓`
      : `Your ${DOCUMENT_TYPE_LABELS[doc.documentType as EmployerDocumentType]} requires attention`;
    createNotification(dbConn, {
      userId,
      type: result.status === "verified" ? "employer_doc_verified" : "employer_doc_rejected",
      entityType: "employer_document",
      entityId: employerDocId,
      message: result.employerNotes,
    }).catch((err) => log.warn({ err, employerDocId }, "Employer document notification failed"));
    sendNotificationEmailAsync(dbConn, userId, title, result.employerNotes, "/profile#verification", log);
  }

  if (usage) {
    logTokenUsage(dbConn, userId, "employer_doc_review", {
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
      total_tokens: usage.total_tokens ?? 0,
    }).catch((err) => log.warn({ err, employerDocId }, "Employer document token logging failed"));
  }
}

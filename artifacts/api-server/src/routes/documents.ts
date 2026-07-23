import { Router } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "crypto";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod/v4";

import { db, documentsTable, freelancerProfilesTable, usersTable } from "@workspace/db";

import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MIME_TO_EXT,
  INVALID_FILE_TYPE_ERROR,
  isAllowedDocumentMimeType,
  buildDocumentStoragePath,
  isDocumentType,
  isValidDocumentStoragePath,
} from "../lib/documentConstants";
import { triggerDocumentReview } from "../lib/documentReview";
import { ObjectStorageService } from "../lib/objectStorage";
import { logAudit } from "../lib/auditLogger";
import { daysUntil } from "../lib/credentialExpiryUtils";

const router = Router();
const objectStorageService = new ObjectStorageService();

const PostDocumentsUploadUrlBody = z.object({
  documentType: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
});

const PostDocumentsConfirmBody = z.object({
  documentType: z.string(),
  storagePath: z.string(),
  expiryDate: z.string().datetime().nullable().optional(),
});

const PatchDocumentExpiryBody = z.object({
  expiryDate: z.string().datetime().nullable(),
});

const TEN_MINUTES_MS = 10 * 60 * 1000;

async function resolveFreelancerContext(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  if (!user) return null;
  if (user.role !== "freelancer") return { user, profile: null, forbidden: true as const };

  const [profile] = await db
    .select()
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.clerkId, clerkId))
    .limit(1);

  return { user, profile: profile ?? null, forbidden: false as const };
}

async function repairStuckPendingDocuments(freelancerId: number): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - TEN_MINUTES_MS);
  await db
    .update(documentsTable)
    .set({
      status: "needs_review",
      aiNotes: "AI review timed out — queued for manual review.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documentsTable.freelancerId, freelancerId),
        eq(documentsTable.status, "pending"),
        lt(documentsTable.updatedAt, tenMinutesAgo),
      ),
    );
}

router.post("/documents/upload-url", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = PostDocumentsUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { documentType, mimeType, fileSize } = parsed.data;
  const normalizedMimeType = mimeType === "application/x-pdf" ? "application/pdf" : mimeType;

  if (!isDocumentType(documentType)) {
    res.status(400).json({ error: "Invalid document type" });
    return;
  }

  if (!isAllowedDocumentMimeType(normalizedMimeType)) {
    res.status(400).json({
      error: INVALID_FILE_TYPE_ERROR,
      code: "INVALID_FILE_TYPE",
    });
    return;
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    res.status(400).json({
      error: "File must be 10MB or smaller.",
      code: "FILE_TOO_LARGE",
    });
    return;
  }

  try {
    const ctx = await resolveFreelancerContext(clerkId);
    if (!ctx) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (ctx.forbidden || !ctx.profile) {
      res.status(403).json({ error: "Freelancer profile required" });
      return;
    }

    const ext = MIME_TO_EXT[normalizedMimeType as (typeof ALLOWED_MIME_TYPES)[number]];
    const filename = `${randomUUID()}${ext}`;
    const storagePath = buildDocumentStoragePath(ctx.user.id, documentType, filename);
    const uploadUrl = await objectStorageService.getSignedUploadUrlForKey(storagePath);

    res.json({ uploadUrl, storagePath });
  } catch (err) {
    req.log.error({ err }, "Failed to generate document upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.post("/documents/confirm", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = PostDocumentsConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { documentType, storagePath, expiryDate } = parsed.data;

  if (!isDocumentType(documentType)) {
    res.status(400).json({ error: "Invalid document type" });
    return;
  }

  try {
    const ctx = await resolveFreelancerContext(clerkId);
    if (!ctx) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (ctx.forbidden || !ctx.profile) {
      res.status(403).json({ error: "Freelancer profile required" });
      return;
    }

    if (!isValidDocumentStoragePath(storagePath, ctx.user.id, documentType)) {
      res.status(400).json({ error: "Invalid storage path" });
      return;
    }

    const exists = await objectStorageService.privateObjectExists(storagePath);
    if (!exists) {
      res.status(400).json({ error: "Uploaded file not found. Please upload again." });
      return;
    }

    // Re-uploading (upsert on freelancerId+documentType) must reset expiry
    // tracking — otherwise a renewed credential could inherit a stale
    // 'expired' alert stage and immediately re-trigger a false alert cycle.
    const resolvedExpiryDate = expiryDate ? new Date(expiryDate) : null;

    const [document] = await db
      .insert(documentsTable)
      .values({
        freelancerId: ctx.profile.id,
        documentType,
        fileUrl: storagePath,
        status: "pending",
        confidence: null,
        aiNotes: null,
        adminNotes: null,
        reviewedBy: null,
        expiryDate: resolvedExpiryDate,
        expiryAlertStage: "none",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [documentsTable.freelancerId, documentsTable.documentType],
        set: {
          fileUrl: storagePath,
          status: "pending",
          confidence: null,
          aiNotes: null,
          adminNotes: null,
          reviewedBy: null,
          expiryDate: resolvedExpiryDate,
          expiryAlertStage: "none",
          updatedAt: new Date(),
        },
      })
      .returning({ id: documentsTable.id });

    logAudit(db, {
      userId: ctx.user.id,
      action: "document.uploaded",
      entityType: "document",
      entityId: String(document!.id),
      metadata: { documentType },
    }).catch((err) => req.log.warn({ err }, "audit log write failed"));

    triggerDocumentReview(db, req.log, ctx.profile.id, documentType).catch((err) => {
      req.log.error({ err, freelancerId: ctx.profile!.id, documentType }, "document review trigger failed");
    });

    res.status(201).json({ status: "pending" });
  } catch (err) {
    req.log.error({ err }, "Failed to confirm document upload");
    res.status(500).json({ error: "Failed to confirm upload" });
  }
});

router.get("/documents/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const ctx = await resolveFreelancerContext(clerkId);
    if (!ctx) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (ctx.forbidden || !ctx.profile) {
      res.status(403).json({ error: "Freelancer profile required" });
      return;
    }

    await repairStuckPendingDocuments(ctx.profile.id);

    const [profile] = await db
      .select({ verificationLevel: freelancerProfilesTable.verificationLevel })
      .from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, ctx.profile.id))
      .limit(1);

    const documents = await db
      .select({
        documentType: documentsTable.documentType,
        status: documentsTable.status,
        confidence: documentsTable.confidence,
        aiNotes: documentsTable.aiNotes,
        adminNotes: documentsTable.adminNotes,
        updatedAt: documentsTable.updatedAt,
        expiryDate: documentsTable.expiryDate,
      })
      .from(documentsTable)
      .where(eq(documentsTable.freelancerId, ctx.profile.id));

    res.json({
      verificationLevel: profile?.verificationLevel ?? ctx.profile.verificationLevel,
      documents: documents.map((doc) => ({
        ...doc,
        updatedAt: doc.updatedAt.toISOString(),
        expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : null,
        daysUntilExpiry: doc.expiryDate ? daysUntil(doc.expiryDate) : null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get document verification status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/documents/:documentType/expiry", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const documentType = req.params.documentType;
  if (!isDocumentType(documentType)) {
    res.status(400).json({ error: "Invalid document type" });
    return;
  }

  const parsed = PatchDocumentExpiryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "expiryDate required (ISO date-time or null)" });
    return;
  }

  try {
    const ctx = await resolveFreelancerContext(clerkId);
    if (!ctx) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (ctx.forbidden || !ctx.profile) {
      res.status(403).json({ error: "Freelancer profile required" });
      return;
    }

    const [updated] = await db
      .update(documentsTable)
      .set({
        expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
        expiryAlertStage: "none",
        updatedAt: new Date(),
      })
      .where(and(eq(documentsTable.freelancerId, ctx.profile.id), eq(documentsTable.documentType, documentType)))
      .returning({ id: documentsTable.id });

    if (!updated) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update document expiry");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

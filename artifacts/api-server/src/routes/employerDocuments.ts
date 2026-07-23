import { Router } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import {
  db,
  employerDocumentsTable,
  employerProfilesTable,
  usersTable,
  type EmployerDocumentType,
} from "@workspace/db";

import { logAudit } from "../lib/auditLogger";
import { recalculateEmployerVerificationLevel, reviewEmployerDocument } from "../lib/employerDocReviewUtils";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

const DOCUMENT_TYPES: EmployerDocumentType[] = [
  "company_registration",
  "tax_vat_certificate",
  "business_licence",
  "representative_id",
  "proof_of_business_address",
];
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const uploadUrlBody = z.object({
  documentType: z.enum(DOCUMENT_TYPES as [EmployerDocumentType, ...EmployerDocumentType[]]),
  filename: z.string().min(1).max(200),
  mimeType: z.string(),
});
const confirmBody = z.object({
  documentType: z.enum(DOCUMENT_TYPES as [EmployerDocumentType, ...EmployerDocumentType[]]),
  fileUrl: z.string().min(1).max(500),
});

async function resolveEmployerContext(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  if (!user) return null;

  const isEmployer = user.role === "employer";
  const isPendingEmployerOnboarding =
    user.role === "pending" && user.onboardingRole === "employer";

  if (!isEmployer && !isPendingEmployerOnboarding) {
    return { user, profile: null, forbidden: true as const };
  }

  const [profile] = await db
    .select()
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.clerkId, clerkId))
    .limit(1);
  return { user, profile: profile ?? null, forbidden: false as const };
}

function safeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

function isOwnedStoragePath(fileUrl: string, employerId: number, documentType: EmployerDocumentType): boolean {
  return fileUrl.startsWith(`uploads/${employerId}/employer-docs/${documentType}/`) &&
    !fileUrl.includes("..");
}

router.post("/employer-documents/upload-url", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = uploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid upload request" });
    return;
  }
  if (!ACCEPTED_MIME_TYPES.includes(parsed.data.mimeType as (typeof ACCEPTED_MIME_TYPES)[number])) {
    res.status(400).json({
      error: "Please upload a JPEG, PNG, or WebP image. PDF support is coming soon.",
      code: "UNSUPPORTED_FILE_TYPE",
    });
    return;
  }

  try {
    const ctx = await resolveEmployerContext(clerkId);
    if (!ctx) { res.status(404).json({ error: "User not found" }); return; }
    if (ctx.forbidden || !ctx.profile) { res.status(403).json({ error: "Employer profile required" }); return; }

    const extension = parsed.data.mimeType === "image/png"
      ? ".png"
      : parsed.data.mimeType === "image/webp" ? ".webp" : ".jpg";
    const fileUrl = `uploads/${ctx.profile.id}/employer-docs/${parsed.data.documentType}/${Date.now()}-${randomUUID()}-${safeFilename(parsed.data.filename)}${extension}`;
    const uploadUrl = await objectStorageService.getSignedUploadUrlForKey(fileUrl);
    logAudit(db, {
      userId: ctx.user.id,
      action: "employer_doc_upload_requested",
      entityType: "employer_document",
      metadata: { employerId: ctx.profile.id, documentType: parsed.data.documentType },
    }).catch((err) => req.log.warn({ err }, "Employer document audit failed"));
    res.json({ uploadUrl, fileUrl });
  } catch (err) {
    req.log.error({ err }, "Failed to generate employer document upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.post("/employer-documents/confirm", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = confirmBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid confirmation request" }); return; }

  try {
    const ctx = await resolveEmployerContext(clerkId);
    if (!ctx) { res.status(404).json({ error: "User not found" }); return; }
    if (ctx.forbidden || !ctx.profile) { res.status(403).json({ error: "Employer profile required" }); return; }
    if (!isOwnedStoragePath(parsed.data.fileUrl, ctx.profile.id, parsed.data.documentType)) {
      res.status(400).json({ error: "Invalid storage path" });
      return;
    }

    const document = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(employerDocumentsTable)
        .values({
          employerId: ctx.profile!.id,
          documentType: parsed.data.documentType,
          fileUrl: parsed.data.fileUrl,
          status: "pending",
          confidence: null,
          aiNotes: null,
          employerNotes: null,
          adminNotes: null,
          reviewedBy: null,
          reviewedAt: null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [employerDocumentsTable.employerId, employerDocumentsTable.documentType],
          set: {
            fileUrl: parsed.data.fileUrl,
            status: "pending",
            confidence: null,
            aiNotes: null,
            employerNotes: null,
            adminNotes: null,
            reviewedBy: null,
            reviewedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: employerDocumentsTable.id });
      await recalculateEmployerVerificationLevel(tx, ctx.profile!.id);
      return row;
    });

    if (!document) { res.status(500).json({ error: "Failed to save document" }); return; }
    logAudit(db, {
      userId: ctx.user.id,
      action: "employer_doc_uploaded",
      entityType: "employer_document",
      entityId: String(document.id),
      metadata: { employerId: ctx.profile.id, documentType: parsed.data.documentType },
    }).catch((err) => req.log.warn({ err }, "Employer document audit failed"));
    reviewEmployerDocument(db, document.id, req.log).catch((err) => {
      req.log.error({ err, employerDocumentId: document.id }, "Employer document review trigger failed");
    });
    res.status(201).json({ documentId: document.id, status: "pending" });
  } catch (err) {
    req.log.error({ err }, "Failed to confirm employer document upload");
    res.status(500).json({ error: "Failed to confirm upload" });
  }
});

router.get("/employer-documents/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveEmployerContext(clerkId);
    if (!ctx) { res.status(404).json({ error: "User not found" }); return; }
    if (ctx.forbidden || !ctx.profile) { res.status(403).json({ error: "Employer profile required" }); return; }
    const documents = await db
      .select({
        documentType: employerDocumentsTable.documentType,
        status: employerDocumentsTable.status,
        employerNotes: employerDocumentsTable.employerNotes,
        updatedAt: employerDocumentsTable.updatedAt,
      })
      .from(employerDocumentsTable)
      .where(eq(employerDocumentsTable.employerId, ctx.profile.id));
    res.json({
      verificationLevel: ctx.profile.verificationLevel,
      isVerified: ctx.profile.isVerified,
      documents: documents.map((doc) => ({ ...doc, updatedAt: doc.updatedAt.toISOString() })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get employer document status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/employer-documents/me/:documentType/view-url", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const documentType = String(req.params.documentType) as EmployerDocumentType;
  if (!DOCUMENT_TYPES.includes(documentType)) { res.status(400).json({ error: "Invalid document type" }); return; }
  try {
    const ctx = await resolveEmployerContext(clerkId);
    if (!ctx) { res.status(404).json({ error: "User not found" }); return; }
    if (ctx.forbidden || !ctx.profile) { res.status(403).json({ error: "Employer profile required" }); return; }
    const [doc] = await db.select({ fileUrl: employerDocumentsTable.fileUrl })
      .from(employerDocumentsTable)
      .where(and(eq(employerDocumentsTable.employerId, ctx.profile.id), eq(employerDocumentsTable.documentType, documentType)))
      .limit(1);
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    const signedUrl = await objectStorageService.getSignedReadUrlForKey(doc.fileUrl, 15 * 60);
    logAudit(db, {
      userId: ctx.user.id,
      action: "employer_doc_viewed",
      entityType: "employer_document",
      metadata: { employerId: ctx.profile.id, documentType },
    }).catch((err) => req.log.warn({ err }, "Employer document audit failed"));
    res.json({ signedUrl, expiresInSeconds: 15 * 60 });
  } catch (err) {
    req.log.error({ err }, "Failed to generate employer document view URL");
    res.status(500).json({ error: "Failed to generate view URL" });
  }
});

export default router;

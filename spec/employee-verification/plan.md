# TalentLock — Implementation Plan: Employer Verification

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.
> Read `project.md` before every session.

---

## Pre-Implementation Codebase Checks

```bash
# 1. Exact documents table schema — column names and types
grep -A 25 "documents\s*=" lib/db/src/schema/*.ts | head -30

# 2. Existing AI document review pipeline — find the utility file
grep -rln "document.*review\|vision\|gpt-4o.*image\|base64" artifacts/api-server/src/ | head -5

# 3. GCS presigned URL generation utility
grep -rln "getSignedUrl\|presigned\|signedUrl\|storage.*upload" artifacts/api-server/src/ | head -5

# 4. Admin documents queue — current routes and structure
grep -n "admin.*document\|document.*admin" artifacts/api-server/src/routes/admin.ts | head -15

# 5. Confirm employer_profiles columns
grep -A 20 "employerProfiles\s*=" lib/db/src/schema/*.ts | head -25

# 6. Confirm accountDeletion.ts — where to insert employer doc anonymisation
grep -n "documents\|freelancer\|gcs\|storage" artifacts/api-server/src/lib/accountDeletion.ts | head -15

# 7. Check for any PDF conversion utility
grep -rln "pdf.*convert\|pdfToImage\|pdf2pic\|sharp" artifacts/api-server/src/ | head -3

# 8. Confirm accessControl.ts structure and resolveUserByClerkId signature
grep -n "export.*function\|export const" artifacts/api-server/src/lib/accessControl.ts | head -10
```

---

## Resolved Questions

---

### Q1 — Naming Conventions

**Decision: Match the existing `documents` table column names exactly.**

After inspection, use the confirmed column names from the freelancer `documents` table. The `employer_documents` table mirrors the same naming conventions (e.g. if freelancer table uses `aiReview` instead of `aiNotes`, use `aiReview` on employer table too). Document the confirmed names in a comment block at the top of the schema file.

The key columns on `employer_documents` regardless of name discovery:
- Owner FK: `employerId` (maps to `employer_profiles.id`) — NOT `freelancerId`
- Document classifier: `documentType` (same name)
- Review outcome: `status` (`pending | verified | rejected | needs_review`)
- AI score: `confidence` (0–100 integer)
- Admin-facing AI text: `aiNotes`
- Employer-facing plain-English text: `employerNotes` — this is NEW (freelancer table does not have this split)
- Admin override text: `adminNotes`
- Admin reviewer: `reviewedBy`

---

### Q2 — Existing AI Review Pipeline Reuse

**Decision: Create new `employerDocReviewUtils.ts`. Import GCS read utility from wherever it lives. Do not modify the freelancer review utility.**

```ts
// artifacts/api-server/src/lib/employerDocReviewUtils.ts (create new)

export async function reviewEmployerDocument(
  db: DB,
  employerDocId: string,
  log: Logger
): Promise<void> {
  // 1. Load the employer_documents row
  const doc = await db.query.employerDocuments.findFirst({
    where: eq(employerDocuments.id, employerDocId),
  });
  if (!doc) return;

  // 2. Load employer profile for company name
  const employer = await db.query.employerProfiles.findFirst({
    where: eq(employerProfiles.id, doc.employerId),
  });

  // 3. Read GCS file and convert to base64 image
  // (reuse the same GCS read pattern as freelancer document review)
  const imageBase64 = await readGcsFileAsBase64(doc.fileUrl);

  // 4. Call OpenAI vision
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        { type: 'text', text: buildEmployerDocReviewPrompt(doc.documentType, employer?.companyName) },
      ],
    }],
    max_tokens: 500,
  });

  const responseText = response.choices[0]?.message?.content ?? '';
  const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  // 5. Log tokens (charged to platform — no employer token quota affected)
  logTokenUsage(db, doc.employerId, 'employer_doc_review', {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  }).catch(err => log.warn({ err }, 'employer doc review token log failed'));

  // 6. Parse AI response
  let result: EmployerDocReviewResult;
  try {
    const cleaned = responseText.replace(/```json|```/g, '').trim();
    result = JSON.parse(cleaned);
    if (!validateEmployerDocReviewResponse(result)) throw new Error('invalid shape');
  } catch {
    log.warn({ employerDocId }, 'employer doc review parse failed — setting needs_review');
    result = {
      status: 'needs_review',
      confidence: 0,
      documentTypeMatch: false,
      companyNameMatch: false,
      registrationNumberVisible: false,
      isLegible: false,
      hasExpiry: false,
      isExpired: null,
      tamperingConcern: false,
      adminNotes: 'AI review failed to parse response. Manual review required.',
      employerNotes: 'We are reviewing your document and will update you shortly.',
    };
  }

  // 7. Update document status and recalculate verification level in one transaction
  await db.transaction(async (tx) => {
    await tx.update(employerDocuments)
      .set({
        status: result.status,
        confidence: result.confidence,
        aiNotes: sanitiseText(result.adminNotes),
        employerNotes: sanitiseText(result.employerNotes),
        updatedAt: new Date(),
      })
      .where(eq(employerDocuments.id, employerDocId));

    await recalculateEmployerVerificationLevel(tx, doc.employerId);
  });

  // 8. Notify employer (fire-and-forget)
  if (result.status === 'verified' || result.status === 'rejected') {
    const notificationTitle = result.status === 'verified'
      ? `Your ${DOCUMENT_TYPE_LABELS[doc.documentType]} has been verified ✓`
      : `Your ${DOCUMENT_TYPE_LABELS[doc.documentType]} requires attention`;

    createNotification(db, {
      userId: employer?.userId ?? doc.employerId,
      type: result.status === 'verified' ? 'employer_doc_verified' : 'employer_doc_rejected',
      title: notificationTitle,
      body: result.employerNotes,
      metadata: { documentType: doc.documentType },
    }).catch(err => log.warn({ err }, 'employer doc notification failed'));

    if (result.status === 'rejected') {
      sendNotificationEmail(db, employer?.userId ?? doc.employerId, {
        subject: notificationTitle,
        body: `${result.employerNotes} Please re-upload an updated document at ${process.env.APP_URL}/profile#verification`,
      }).catch(() => {});
    }
  }
}
```

---

### Q3 — GCS Presigned URL Generation

**Decision: Reuse the exact same GCS utility that freelancer documents use. Different path prefix only.**

```ts
// Employer document upload URL path format:
const gcsPath = `uploads/${employerId}/employer-docs/${documentType}/${Date.now()}-${sanitisedFilename}`;

// Use the existing GCS signed URL generator (confirm exact import from inspection)
const uploadUrl = await generatePresignedUploadUrl(gcsPath, mimeType, 15 * 60); // 15 min TTL
```

Phase 1 accepted MIME types (per Risk 1 resolution):
- `image/jpeg`
- `image/png`
- `image/webp`

PDF uploads are Phase 2. UI clearly states: "Upload as a JPEG, PNG, or WebP image (photograph or scan of your document)."

---

### Q4 — Admin Queue Structure

**Decision: New separate admin routes. Tab on the existing admin document queue UI.**

New routes under the admin router (CSRF-protected, admin session required):
```ts
GET  /api/admin/employer-documents          — paginated pending/needs_review queue
POST /api/admin/employer-documents/:id/verify  — admin verify
POST /api/admin/employer-documents/:id/reject  — admin reject (adminNotes required)
```

These are modelled exactly on whatever pattern the freelancer document admin routes use (confirm in inspection Q4). Admin console UI adds an "Employer Docs" tab to the existing documents section.

---

### Q5 — Verification Level Recalculation

**Decision: Single `recalculateEmployerVerificationLevel(tx, employerId)` function, always called in a transaction.**

```ts
export async function recalculateEmployerVerificationLevel(
  tx: DrizzleTransaction,  // receives the transaction object — never opens its own
  employerId: string
): Promise<void> {
  const docs = await tx.query.employerDocuments.findMany({
    where: eq(employerDocuments.employerId, employerId),
  });

  const { level, isVerified } = calculateVerificationLevel(docs);

  await tx.update(employerProfiles)
    .set({ verificationLevel: level, isVerified, updatedAt: new Date() })
    .where(eq(employerProfiles.id, employerId));
}

// Pure function — no DB access, fully testable
export function calculateVerificationLevel(
  docs: EmployerDocument[]
): { level: VerificationLevel; isVerified: boolean } {
  const verified = docs.filter(d => d.status === 'verified');
  const hasRepId = verified.some(d => d.documentType === 'representative_id');
  const hasCompanyReg = verified.some(d => d.documentType === 'company_registration');
  const hasTax = verified.some(d => d.documentType === 'tax_vat_certificate');

  if (!hasRepId) return { level: 'unverified', isVerified: false };
  if (hasRepId && hasCompanyReg && hasTax) return { level: 'fully_verified', isVerified: true };
  return { level: 'partially_verified', isVerified: false };
}
```

This function is called inside a transaction from:
1. `reviewEmployerDocument()` — after AI review updates the document status
2. Admin `/verify` route — after admin marks as verified
3. Admin `/reject` route — after admin marks as rejected

---

### Q6 — Admin Queue UI Placement

**Decision: Option A — tab on existing admin documents section.**

Admin console adds a tab toggle: `[Freelancer Documents] [Employer Documents]`. The employer documents tab loads from `GET /api/admin/employer-documents`. Same card layout, same verify/reject button pattern.

---

### Q7 — GDPR Employer Document Deletion

**Decision: Anonymise rows, delete GCS files, reset verification level.**

```ts
// In accountDeletion.ts Drizzle transaction — add after existing anonymisation:
await db.update(employerDocuments)
  .set({
    fileUrl: '[removed]',
    aiNotes: '[removed]',
    employerNotes: '[removed]',
    adminNotes: '[removed]',
    updatedAt: new Date(),
  })
  .where(eq(employerDocuments.employerId, employerProfileId));

// Reset verification level
await db.update(employerProfiles)
  .set({ verificationLevel: 'unverified', isVerified: false })
  .where(eq(employerProfiles.id, employerProfileId));

// After transaction — delete GCS files (fire-and-forget)
deleteGcsPrefix(`uploads/${employerProfileId}/employer-docs/`).catch(() => {});
```

---

### Q8 — File Types

**Decision: Phase 1 — JPEG, PNG, WebP only. PDF is Phase 2.**

Validation in `POST /api/employer-documents/upload-url`:
```ts
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
if (!ACCEPTED_MIME_TYPES.includes(body.mimeType)) {
  return res.status(400).json({
    error: 'UNSUPPORTED_FILE_TYPE',
    message: 'Please upload a JPEG, PNG, or WebP image. PDF support is coming soon.',
  });
}
```

---

## AI Review Prompt (Use Verbatim)

```
You are reviewing a business identity document uploaded to a professional hiring platform.
This is NOT a legal identity verification — it is a platform trust check only.

Declared document type: ${documentType}
Employer company name on profile: ${companyName ?? 'not specified'}

Review the image and assess all of the following:
1. Does this document match the declared type "${DOCUMENT_TYPE_LABELS[documentType]}"?
2. Is a company name visible, and does it match "${companyName ?? 'not specified'}"?
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

IMPORTANT: This assessment is for platform trust purposes only. Never state or imply legal verification.
```

---

## `employer_doc_review` Token Label

Add to `TokenFeature` union:
```ts
| 'employer_doc_review'   // AI vision review of employer business documents
```

Token cost: approximately 800–1,200 tokens per review (vision prompt + image). Charged to employer account for tracking but not deducted from the employer's plan token quota (it is platform infrastructure, not an AI feature the employer triggers voluntarily).

---

## Upsert Pattern for `POST /api/employer-documents/confirm`

```ts
// Use INSERT ... ON CONFLICT ... DO UPDATE (upsert) to handle re-uploads
await db.insert(employerDocuments)
  .values({
    id: generateId(),
    employerId: employer.id,
    documentType: body.documentType,
    fileUrl: body.fileUrl,
    status: 'pending',
    confidence: null,
    aiNotes: null,
    employerNotes: null,
    adminNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  .onConflictDoUpdate({
    target: [employerDocuments.employerId, employerDocuments.documentType],
    set: {
      fileUrl: body.fileUrl,
      status: 'pending',
      confidence: null,
      aiNotes: null,
      employerNotes: null,
      adminNotes: null,
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: new Date(),
    },
  });
```

After the upsert, recalculate verification level (it resets to `unverified` if the only previously-verified document is being re-uploaded):
```ts
await db.transaction(async (tx) => {
  await tx.insert(employerDocuments).values({...}).onConflictDoUpdate({...});
  await recalculateEmployerVerificationLevel(tx, employer.id);
});
```

---

## Constants

```ts
// artifacts/api-server/src/lib/employerDocReviewUtils.ts

export const DOCUMENT_TYPE_LABELS: Record<EmployerDocumentType, string> = {
  company_registration:       'Company Registration Certificate',
  tax_vat_certificate:        'Tax / VAT Certificate',
  business_licence:           'Business Licence',
  representative_id:          'Representative ID',
  proof_of_business_address:  'Proof of Business Address',
};

export const REQUIRED_FOR_PARTIAL: EmployerDocumentType[] = [
  'representative_id',
];

export const REQUIRED_FOR_FULL: EmployerDocumentType[] = [
  'representative_id',
  'company_registration',
  'tax_vat_certificate',
];
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full
- [ ] All 6 spec files read
- [ ] Codebase inspection complete — Q1–Q4 findings documented
- [ ] Freelancer `documents` table exact column names confirmed and matched
- [ ] GCS presigned URL utility import path confirmed
- [ ] Existing AI review pipeline function confirmed (no duplication)
- [ ] Admin queue existing route structure confirmed
- [ ] `employer_doc_review` not yet in `TokenFeature` (confirmed)
- [ ] PDF-only images decision accepted — UI copy updated

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Schema — `employer_documents` table, 2 columns on `employer_profiles` | ⬜ Not started |
| Phase 2 | Backend — upload/confirm/status routes, AI review utility, admin routes, GDPR extension, OpenAPI + codegen | ⬜ Not started |
| Phase 3 | Frontend — employer verification section, document upload/status UI, admin tab | ⬜ Not started |
| Phase 4 | Trust signals — Verified Employer badge on job posts, bookings, meetings | ⬜ Not started |

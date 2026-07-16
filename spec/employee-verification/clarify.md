# TalentLock — Clarification & Verification: Employer Verification

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `documents` table exists — freelancer credential uploads | Confirmed in `project.md` schema |
| `POST /api/documents/upload-url` — presigned GCS URL pattern established | Confirmed in `project.md` API routes |
| `POST /api/documents/confirm` — triggers AI review fire-and-forget | Confirmed |
| `GET /api/admin/documents` — admin document review queue already exists | Confirmed |
| GCS storage path scoped to userId: `uploads/{userId}/docs/` pattern | Confirmed — `accessControl.ts` storage ACL |
| `logAudit()` fire-and-forget for sensitive admin actions | Confirmed — Cursor notes + `auditLogger.ts` |
| `sanitiseText()` on all free-text DB writes | Confirmed — Cursor notes |
| `createNotification()` fire-and-forget for status change alerts | Confirmed — 15+ existing notification types |
| `sendNotificationEmail()` no-op when `RESEND_API_KEY` unset | Confirmed |
| Admin CSRF protection via `doubleCsrfProtection` on all admin POST routes | Confirmed — `csrf.ts` |
| Admin auth is separate from Clerk — HMAC-signed cookie | Confirmed — Auth Flow Notes |
| `employer_profiles` table exists with `id`, `userId` | Confirmed |
| GDPR deletion in `accountDeletion.ts` — anonymise + GCS file deletion | Confirmed |
| OpenAI vision model available server-side | Confirmed — used for document verification |
| Access control convention: 401 unauthenticated, 403 non-owner, 404 unknown | Confirmed — `accessControl.ts` |
| `resolveUserByClerkId()` helper in `accessControl.ts` | Confirmed |
| Fire-and-forget `.catch()` mandatory — never await from route handlers | Confirmed — Cursor notes |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Exact Schema of Existing `documents` Table

**Question:** Before building `employer_documents`, confirm the exact column names on the existing `documents` table — specifically whether it has `confidence`, `aiNotes`, `adminNotes`, `reviewedBy` columns already, and what values `status` can take. The `employer_documents` schema should be consistent with the freelancer table's naming conventions even though it is a separate table.

**Recommendation:**
```bash
grep -A 25 "documents\s*=" lib/db/src/schema/*.ts | head -30
```

If the freelancer `documents` table uses `aiReview` instead of `aiNotes`, or `verificationStatus` instead of `status`, the employer table should match those naming conventions.

---

### Q2 — How Does the Existing Freelancer AI Review Pipeline Work?

**Question:** The existing `POST /api/documents/confirm` triggers an AI review fire-and-forget. Confirm:
- Which file handles this logic? (likely a `documentReviewUtils.ts` or similar)
- Does it use `gpt-4o` vision with base64 image input?
- Does it read the GCS file and convert to base64, or use a signed URL as input to OpenAI?
- What is the exact function signature?

**Recommendation:**
```bash
grep -rln "document.*review\|review.*document\|vision\|gpt-4o.*image" artifacts/api-server/src/ | head -5
grep -rln "documents.*confirm\|confirm.*document" artifacts/api-server/src/routes/ | head -5
```

The employer AI review reuses the same vision call infrastructure but with a different prompt and response shape. Understanding the exact pattern prevents duplication.

---

### Q3 — How Does the Existing GCS Presigned URL Generation Work?

**Question:** `POST /api/documents/upload-url` generates a presigned GCS URL. Confirm:
- Which utility or library handles GCS presigned URL generation?
- What is the TTL for the upload URL?
- Is the GCS bucket name in an environment variable?
- What MIME types are accepted for document uploads?

**Recommendation:**
```bash
grep -rln "presigned\|signedUrl\|getSignedUrl\|storage.*upload" artifacts/api-server/src/ | head -5
```

The employer document upload URL generation reuses the exact same GCS utility — different path prefix, identical mechanism.

---

### Q4 — What Does the Admin Document Queue Currently Show?

**Question:** `GET /api/admin/documents` is the existing freelancer document queue. Confirm:
- Is it paginated? What is the response shape?
- Does it generate signed URLs for document preview?
- Are there existing `POST /api/admin/documents/:id/verify` and `reject` routes, or is the admin queue read-only?

**Recommendation:**
```bash
grep -n "admin.*document\|document.*admin" artifacts/api-server/src/routes/admin.ts | head -10
```

The employer document admin queue mirrors the freelancer queue. If verify/reject routes already exist for freelancer docs, extend the same pattern. If the queue is currently read-only, both queues need new mutation routes.

---

### Q5 — How Should `verificationLevel` Recalculation Be Triggered?

**Question:** `verificationLevel` on `employer_profiles` must be recalculated whenever any `employer_documents` row changes status. The status can change in three places:
- After AI review completes (fire-and-forget)
- After admin verify action
- After admin reject action

Each of these must recalculate and write `verificationLevel` + `isVerified` atomically in the same `db.update()`.

**Recommendation:** Create a single `recalculateEmployerVerificationLevel(db, employerId)` function that:
1. Queries all `employer_documents` rows for this employer
2. Runs `calculateVerificationLevel()`
3. Updates `employer_profiles.verificationLevel` and `employer_profiles.isVerified` atomically

This function is called from all three trigger points — never inline.

---

### Q6 — Should the Admin Queue Be a New Tab or a Filter on the Existing Queue?

**Question:** Two options for surfacing employer documents in the admin console:

- **(A)** Extend the existing `/admin` documents section with a tab: [Freelancer Docs] [Employer Docs]
- **(B)** New separate `/admin/employer-verification` page

**Recommendation: Option A** — a tab on the existing admin document queue. It is simpler, keeps verification workflows in one place for the admin, and avoids adding a new admin nav item. The tab is controlled by a query param: `GET /api/admin/employer-documents` is a new route that mirrors the freelancer doc queue structure.

---

### Q7 — GDPR: What Happens to Employer Documents on Account Deletion?

**Question:** The existing GDPR deletion (`accountDeletion.ts`) handles freelancer documents. How should employer document deletion be handled?

**Recommendation:**
- In the Drizzle transaction: anonymise `employer_documents` rows for the deleted employer:
  - Set `fileUrl = '[removed]'`
  - Set `aiNotes = '[removed]'`
  - Set `employerNotes = '[removed]'`
  - Set `adminNotes = '[removed]'`
  - Keep the row (for audit trail) but strip all PII and file references
- After the transaction: fire-and-forget GCS deletion of all `uploads/{employerId}/employer-docs/` files
- Update `employer_profiles.verificationLevel = 'unverified'` and `isVerified = false` (the account is being deleted so this is moot, but keeps the table consistent)

---

### Q8 — What MIME Types and File Size Limits Apply to Document Uploads?

**Question:** Business documents are typically PDFs or images (JPEG, PNG). The AI vision model can process both. What limits should apply?

**Recommendation:**
- Accepted MIME types: `image/jpeg`, `image/png`, `application/pdf`
- File size limit: 10MB per document (business documents are often scanned PDFs — larger than identity photos)
- Note: if the uploaded file is a PDF, the backend must convert the first page to an image before passing to the vision model (since OpenAI vision accepts images, not PDFs directly). Confirm whether this PDF-to-image conversion utility already exists for the freelancer pipeline.

```bash
grep -rln "pdf.*convert\|convert.*pdf\|pdfToImage" artifacts/api-server/src/ | head -3
```

If no PDF converter exists, limit Phase 1 to images only (JPEG, PNG) and note PDF support as Phase 2. Business documents uploaded as screenshots/photos are acceptable for the trust purposes of this feature.

---

## ⚠️ Risks & Notes

### Risk 1 — AI Vision Cannot Read PDFs Directly

If employers upload PDF documents (common for company registration certificates), the OpenAI vision model cannot accept a PDF binary. Options:
- **(A)** Restrict to image uploads only in Phase 1 — clear in the UI: "Upload as JPEG or PNG (scan or photograph your document)"
- **(B)** Convert first PDF page to image server-side using a library like `sharp` or `pdf2pic`

**Recommendation: Option A for Phase 1.** Clear upload instruction in the UI. PDF support is Phase 2 after confirming the conversion library is available.

### Risk 2 — `UNIQUE (employerId, documentType)` Requires Upsert Pattern

The unique constraint means `INSERT` will fail on re-upload. The `POST /api/employer-documents/confirm` handler must use an upsert (`INSERT ... ON CONFLICT (employer_id, document_type) DO UPDATE SET ...`) rather than a plain insert. This resets `status = 'pending'`, `fileUrl = newUrl`, clears `aiNotes`, `employerNotes`, `confidence`, `reviewedBy`, `reviewedAt` — effectively starting a fresh review for the new document.

### Risk 3 — AI Notes Must Never Leak to Employers

The `aiNotes` field contains technical admin-facing text that may include specific details about document content (registration numbers, director names, expiry dates). This must never appear in any employer-facing API response. The `GET /api/employer-documents/me` response must be an explicit allowlist of returned fields — never `SELECT *`.

### Risk 4 — Verification Level Recalculation Must Be Atomic

If the AI review fire-and-forget updates `employer_documents.status` and then separately calls `recalculateEmployerVerificationLevel()`, there is a window where the document status is updated but `verificationLevel` has not been recalculated yet. To handle this: run both updates in a single Drizzle transaction where possible. For the fire-and-forget AI review (which runs outside the route handler), wrap both the document status update and the verification level recalculation in a single transaction.

### Risk 5 — Admin Signed URL Generation

The admin document queue needs to show the actual document image/file. This requires generating a short-lived signed GCS URL per document per queue load. At 20 documents per page, this is 20 GCS signed URL generations per admin queue request. This is acceptable — GCS signed URLs are cheap to generate. Cache them in the response for the duration of that page load only.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Exact `documents` table column names | Task 1.2 (schema — match naming conventions) |
| Q2 | Existing AI review pipeline function location and signature | Task 2.2 (employer AI review utility) |
| Q3 | GCS presigned URL generation utility | Task 2.1 (upload URL route) |
| Q4 | Existing admin queue structure and mutation routes | Task 2.5 (admin queue extension) |
| Q8 | PDF vs image-only for Phase 1 | Task 2.1 (upload URL validation) |

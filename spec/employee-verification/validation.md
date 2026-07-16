# TalentLock — Validation Guide: Employer Verification

---

## Phase 1 Validation — Database

### V1.1 — `employer_documents` Table Exists

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name = 'employer_documents';
```

- [ ] Table present

### V1.2 — All Columns Correct

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'employer_documents';
```

- [ ] `id` — text, NOT NULL, PRIMARY KEY
- [ ] `employer_id` — text, NOT NULL, FK to `employer_profiles.id`
- [ ] `document_type` — text, NOT NULL
- [ ] `file_url` — text, NOT NULL
- [ ] `status` — text, NOT NULL, DEFAULT 'pending'
- [ ] `confidence` — integer, nullable
- [ ] `ai_notes` — text, nullable
- [ ] `employer_notes` — text, nullable
- [ ] `admin_notes` — text, nullable
- [ ] `reviewed_by` — text, nullable
- [ ] `reviewed_at` — timestamptz, nullable
- [ ] `created_at` — timestamptz, NOT NULL
- [ ] `updated_at` — timestamptz, NOT NULL

### V1.3 — UNIQUE Constraint Exists

```sql
SELECT constraint_name, constraint_type FROM information_schema.table_constraints
WHERE table_name = 'employer_documents' AND constraint_type = 'UNIQUE';
```

- [ ] UNIQUE constraint on `(employer_id, document_type)` exists

### V1.4 — Indexes Exist

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'employer_documents';
```

- [ ] Index on `employer_id`
- [ ] Index on `status`

### V1.5 — New Columns on `employer_profiles`

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'employer_profiles'
AND column_name IN ('verification_level', 'is_verified');
```

- [ ] `verification_level` — text, NOT NULL, DEFAULT 'unverified'
- [ ] `is_verified` — boolean, NOT NULL, DEFAULT false
- [ ] All existing rows have `verification_level = 'unverified'`
- [ ] All existing rows have `is_verified = false`

---

## Phase 2 Validation — Backend

### V2.1 — Token Feature Added

```bash
grep "employer_doc_review" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] `'employer_doc_review'` present in `TokenFeature` union

### V2.2 — Upload URL Route (Employer Only)

```bash
# Valid employer request
curl -X POST http://localhost:8080/api/employer-documents/upload-url \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"documentType": "representative_id", "filename": "passport.jpg", "mimeType": "image/jpeg"}'
```

- [ ] Returns `{ uploadUrl, fileUrl }` with 200
- [ ] `uploadUrl` is a valid presigned GCS URL
- [ ] `fileUrl` path contains `employer-docs/representative_id/`

```bash
# Freelancer request — should 403
curl -X POST http://localhost:8080/api/employer-documents/upload-url \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"documentType": "representative_id", "filename": "x.jpg", "mimeType": "image/jpeg"}'
```

- [ ] Returns 403

```bash
# Invalid MIME type
curl -X POST http://localhost:8080/api/employer-documents/upload-url \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"documentType": "representative_id", "filename": "x.pdf", "mimeType": "application/pdf"}'
```

- [ ] Returns 400 with `UNSUPPORTED_FILE_TYPE` error

```bash
# Invalid document type
curl -X POST http://localhost:8080/api/employer-documents/upload-url \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"documentType": "passport", "filename": "x.jpg", "mimeType": "image/jpeg"}'
```

- [ ] Returns 400

### V2.3 — Confirm Upload (Upsert Pattern)

```bash
# First upload — creates row
curl -X POST http://localhost:8080/api/employer-documents/confirm \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"documentType": "representative_id", "fileUrl": "uploads/emp-1/employer-docs/representative_id/test.jpg"}'
```

- [ ] Returns `{ documentId, status: 'pending' }` with 201
- [ ] One row in `employer_documents` with `status = 'pending'`

```bash
# Re-upload — same documentType — should upsert, not create duplicate
curl -X POST http://localhost:8080/api/employer-documents/confirm \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"documentType": "representative_id", "fileUrl": "uploads/emp-1/employer-docs/representative_id/updated.jpg"}'
```

- [ ] Still only ONE row in `employer_documents` for `(employer_id, representative_id)`
- [ ] Row has updated `file_url` and `status = 'pending'`
- [ ] Previous AI review fields (`confidence`, `ai_notes`, `employer_notes`) are cleared

### V2.4 — Re-Upload Resets Verification Level

If `representative_id` was previously `verified`, re-upload should downgrade `verification_level`:

```sql
-- Manually set status to 'verified' to simulate previous verification
UPDATE employer_documents SET status = 'verified' WHERE employer_id = 'emp-1'
AND document_type = 'representative_id';

-- Recalculate (should set to 'partially_verified' if this is the only verified doc)
-- Then re-upload (confirm) — should reset to 'unverified'
```

- [ ] After re-upload, `verification_level` returns to `'unverified'` (or `'partially_verified'` if other docs still verified)
- [ ] `is_verified` = `false` after re-upload (since `fully_verified` status lost)

### V2.5 — `GET /api/employer-documents/me` Field Allowlist

```bash
curl http://localhost:8080/api/employer-documents/me \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Response contains: `documentType`, `status`, `employerNotes`, `updatedAt`
- [ ] Response does NOT contain: `fileUrl`, `aiNotes`, `confidence`, `reviewedBy`, `adminNotes`
- [ ] Response does NOT contain raw document content or registration numbers

### V2.6 — AI Review Fires Fire-and-Forget

After `POST /api/employer-documents/confirm`:

- [ ] Route returns within 500ms (AI review is fire-and-forget, never awaited)
- [ ] After ~15 seconds, document status updates from `pending` to `verified`/`rejected`/`needs_review`
- [ ] `employer_profiles.verification_level` updated atomically with status change

### V2.7 — `aiNotes` vs `employerNotes` Are Separate

```sql
SELECT ai_notes, employer_notes FROM employer_documents WHERE employer_id = 'emp-1';
```

- [ ] `ai_notes` contains technical admin-facing detail (may reference document content)
- [ ] `employer_notes` contains plain-English employer-friendly message (no raw document content)
- [ ] Both fields are non-null after AI review completes

### V2.8 — Verification Level Calculation

Manually set document statuses and verify level:

```sql
-- Only representative_id verified
UPDATE employer_documents SET status = 'verified'
WHERE employer_id = 'emp-1' AND document_type = 'representative_id';
```

After `recalculateEmployerVerificationLevel()`:
- [ ] `verification_level = 'partially_verified'`
- [ ] `is_verified = false`

```sql
-- Add company_registration verified
UPDATE employer_documents SET status = 'verified'
WHERE employer_id = 'emp-1' AND document_type = 'company_registration';
```

After recalculate:
- [ ] `verification_level = 'partially_verified'` (still needs tax certificate)

```sql
-- Add tax_vat_certificate verified
UPDATE employer_documents SET status = 'verified'
WHERE employer_id = 'emp-1' AND document_type = 'tax_vat_certificate';
```

After recalculate:
- [ ] `verification_level = 'fully_verified'`
- [ ] `is_verified = true`

### V2.9 — Admin Verify Route

```bash
curl -X POST http://localhost:8080/api/admin/employer-documents/<doc_id>/verify \
  -H "Cookie: tl_admin=<admin_cookie>" \
  -H "X-CSRF-Token: <csrf_token>" \
  -d '{"adminNotes": "Verified manually — clean document"}'
```

- [ ] Returns `{ success: true, newVerificationLevel }`
- [ ] Document `status` changed to `'verified'`
- [ ] `reviewed_by` set to admin user ID
- [ ] `reviewed_at` set
- [ ] `verification_level` on `employer_profiles` recalculated
- [ ] Employer receives `employer_doc_verified` in-app notification
- [ ] `logAudit()` called with `'admin_employer_doc_verified'`

### V2.10 — Admin Reject Route

```bash
# Rejection without notes — should fail
curl -X POST http://localhost:8080/api/admin/employer-documents/<doc_id>/reject \
  -H "Cookie: tl_admin=<admin_cookie>" \
  -H "X-CSRF-Token: <csrf_token>" \
  -d '{}'
```

- [ ] Returns 400 — adminNotes required

```bash
# Rejection with notes — should succeed
curl -X POST http://localhost:8080/api/admin/employer-documents/<doc_id>/reject \
  -H "Cookie: tl_admin=<admin_cookie>" \
  -H "X-CSRF-Token: <csrf_token>" \
  -d '{"adminNotes": "Company name on document does not match profile name"}'
```

- [ ] Returns `{ success: true, newVerificationLevel }`
- [ ] Document `status = 'rejected'`
- [ ] `employer_notes` updated to admin's rejection notes
- [ ] `verification_level` recalculated
- [ ] Employer receives `employer_doc_rejected` notification + email
- [ ] `logAudit()` called

### V2.11 — Admin Queue Without Admin Session

```bash
curl http://localhost:8080/api/admin/employer-documents
# No admin cookie
```

- [ ] Returns 401 or 403

### V2.12 — Token Usage Logged

After AI review completes:

```bash
curl http://localhost:8080/api/token-usage/me \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] `employer_doc_review` token usage entry present (tracked but not deducted from plan quota)

### V2.13 — `GET /api/employers/me` Includes Verification Level

```bash
curl http://localhost:8080/api/employers/me \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Response includes `verificationLevel`
- [ ] Response includes `isVerified`

### V2.14 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero errors

---

## Phase 3 Validation — Frontend

### V3.1 — Verification Section Appears for Employers Only

Log in as employer, navigate to `/profile`:

- [ ] "Business Verification" section visible
- [ ] Disclaimer banner shown
- [ ] All 5 document type rows shown

Log in as freelancer, navigate to `/profile`:

- [ ] NO "Business Verification" section visible

### V3.2 — All 5 Document Rows Render

On a new employer account (no documents uploaded):

- [ ] 5 rows shown: Company Registration, Tax/VAT, Business Licence, Representative ID, Proof of Address
- [ ] All show "Not uploaded" state with "Upload →" button
- [ ] Required badge shown on Representative ID, Company Registration, Tax/VAT

### V3.3 — Upload Flow

Click "Upload →" on Representative ID, select a JPEG image:

- [ ] Button shows spinner + "Uploading..."
- [ ] Image uploaded to GCS directly
- [ ] Confirm call fires
- [ ] Row updates to "Under review" state with amber spinner

### V3.4 — Status States All Render

Manually set document statuses via DB, reload page:

- [ ] `pending` → amber spinner, "Under review"
- [ ] `verified` → green checkmark, "Verified", no upload button
- [ ] `rejected` → red X, "Action required", `employerNotes` shown, "Re-upload →" button
- [ ] `needs_review` → amber warning, `employerNotes` shown, no upload button (admin reviews)

### V3.5 — Re-upload on Rejected

Click "Re-upload →" on a rejected document, select new file:

- [ ] Upload flow repeats
- [ ] Status resets to "Under review" after confirm
- [ ] Previous error notes disappear

### V3.6 — Overall Status Pill

- [ ] No documents verified → "Unverified" grey pill
- [ ] Only rep ID verified → "Partially Verified" amber pill
- [ ] Rep ID + company reg + tax verified → "Fully Verified" green pill

### V3.7 — Next Steps Prompts

- [ ] Unverified employer → sees "Start with your Representative ID" prompt
- [ ] Partially verified employer → sees "Almost there" prompt
- [ ] Fully verified employer → no prompt shown

### V3.8 — Verified Employer Badge on Job Posts

Log in as freelancer, browse Talent Vault or job listings:

- [ ] Fully verified employer's job shows green "✓ Verified Employer" badge
- [ ] Partially verified employer's job shows amber "◐ ID Verified" badge
- [ ] Unverified employer's job shows NO badge

### V3.9 — Badge on Booking Detail (Freelancer View)

Freelancer views `/bookings/:id` for a booking with a fully verified employer:

- [ ] "✓ Verified Employer" badge shown next to employer name
- [ ] No documents, file URLs, or AI notes shown to freelancer

### V3.10 — Badge on Meeting Detail (Freelancer View)

Freelancer views `/meetings/:id` for a meeting with a fully verified employer:

- [ ] "✓ Verified Employer" badge shown
- [ ] No sensitive data exposed

### V3.11 — Admin Employer Docs Tab

Log in as admin:

- [ ] "Employer Documents" tab visible on the admin documents section
- [ ] Tab shows count of pending/needs_review employer documents
- [ ] Each card shows: employer name, document type, confidence, AI notes, document preview link, verify/reject buttons

### V3.12 — Admin Reject Without Notes

In admin console, click "Reject" without entering admin notes:

- [ ] Client-side error: "Admin notes required for rejection"
- [ ] No API call made until notes are entered

### V3.13 — Build Passes

```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero errors

---

## Security Validation

### S1 — Employer Cannot Access Another Employer's Documents

```bash
curl http://localhost:8080/api/employer-documents/me \
  -H "Authorization: Bearer <employer_B_token>"
```

- [ ] Returns only Employer B's documents — Employer A's are NOT included

### S2 — Freelancer Cannot Access Any Employer Document Routes

```bash
curl http://localhost:8080/api/employer-documents/me \
  -H "Authorization: Bearer <freelancer_token>"
curl -X POST http://localhost:8080/api/employer-documents/upload-url \
  -H "Authorization: Bearer <freelancer_token>"
curl -X POST http://localhost:8080/api/employer-documents/confirm \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] All three return 403

### S3 — `aiNotes` Never Exposed to Employer

```bash
curl http://localhost:8080/api/employer-documents/me \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Response JSON does not contain `aiNotes` key
- [ ] Response JSON does not contain `confidence` key
- [ ] Response JSON does not contain `fileUrl` key
- [ ] Response JSON does not contain `adminNotes` key

### S4 — `aiNotes` Not Exposed in Any Freelancer-Facing Response

```bash
curl http://localhost:8080/api/jobs \
  -H "Authorization: Bearer <freelancer_token>"
curl http://localhost:8080/api/bookings/:id \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] No `aiNotes`, `fileUrl`, `confidence`, `registrationNumber` or document content in any freelancer API response
- [ ] Only `verificationLevel` (enum string) and `isVerified` (boolean) visible to freelancers

### S5 — GCS File URL Not Directly Accessible by Freelancer

The document GCS path `uploads/{employerId}/employer-docs/{type}/filename` must not be served by `GET /api/storage/objects/uploads/{employerId}/employer-docs/...` to freelancers.

- [ ] Confirm the storage ACL in `accessControl.ts` or storage routes blocks freelancer access to employer doc paths
- [ ] Only short-lived signed URLs (from `/me/:documentType/view-url` for employers and from admin queue) can access the files

### S6 — Unauthenticated Access Denied

```bash
curl http://localhost:8080/api/employer-documents/me
curl -X POST http://localhost:8080/api/employer-documents/confirm
```

- [ ] Both return 401

### S7 — Admin Routes Require CSRF Token

```bash
# Missing CSRF token
curl -X POST http://localhost:8080/api/admin/employer-documents/<id>/verify \
  -H "Cookie: tl_admin=<valid_admin_cookie>"
```

- [ ] Returns 403 (CSRF protection)

---

## Regression Validation

### R1 — Freelancer Document Verification Unaffected

```bash
curl http://localhost:8080/api/documents/me \
  -H "Authorization: Bearer <freelancer_token>"
curl -X POST http://localhost:8080/api/documents/upload-url \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"documentType": "identity", "filename": "id.jpg"}'
```

- [ ] Freelancer document routes work identically to before
- [ ] `documents` table unchanged
- [ ] Existing admin freelancer document queue unaffected

### R2 — Employer Profile Routes Unaffected

```bash
curl http://localhost:8080/api/employers/me \
  -H "Authorization: Bearer <employer_token>"
curl -X PUT http://localhost:8080/api/employers/me \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"companyName": "Updated Name"}'
```

- [ ] Both work correctly
- [ ] PUT does NOT reset `verificationLevel` (it is independent of company profile fields)

### R3 — GDPR Deletion Works

Run GDPR deletion for an employer account:

- [ ] `employer_documents` rows anonymised (fileUrl, aiNotes, employerNotes, adminNotes all `[removed]`)
- [ ] GCS files deleted from `uploads/{employerId}/employer-docs/`
- [ ] `verification_level` reset to `'unverified'`
- [ ] Other GDPR deletion steps (bookings, agreements, etc.) unaffected

### R4 — All Other Employer Features Unaffected

- [ ] Job posting works
- [ ] Booking creation works
- [ ] Agreement generation works
- [ ] TalentSearch works
- [ ] Employer spend analytics renders

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Database | ⬜ | | |
| Phase 2 — Backend | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| Phase 4 — Trust Signals | ⬜ | | |
| Security Checks | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

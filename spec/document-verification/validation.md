# TalentLock — Validation Guide: Document Verification Feature

> **Purpose:** This file is the definitive checklist for verifying the Document Verification feature is correctly implemented before it is considered complete. It is used after all 4 phases of `task.md` are marked done.
>
> **How to use:** Run each check in order, phase by phase. Mark each item ✅ pass or ❌ fail with a note. Do not mark a phase complete until every check in it passes. A failed check must be fixed and re-run — do not skip.
>
> **Who runs this:** The developer who implemented the feature, or a second developer doing a review pass. Both roles should run the full checklist independently before the feature is merged.

---

## Phase 1 Validation — Database

### V1.1 — `documents` Table Exists

**How to check:**
```bash
# Connect to Neon and inspect the table
pnpm --filter @workspace/db run push --dry-run
# Or query directly:
# SELECT column_name, data_type, is_nullable
# FROM information_schema.columns
# WHERE table_name = 'documents'
# ORDER BY ordinal_position;
```

**Expected columns:**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | serial / integer | NO | auto |
| `freelancer_id` | text | NO | — |
| `document_type` | text | NO | — |
| `file_url` | text | NO | — |
| `status` | text | NO | `'pending'` |
| `confidence` | integer | YES | null |
| `ai_notes` | text | YES | null |
| `admin_notes` | text | YES | null |
| `reviewed_by` | text | YES | null |
| `created_at` | timestamptz | NO | now() |
| `updated_at` | timestamptz | NO | now() |

- [ ] All 11 columns present with correct types
- [ ] `status` default is `'pending'`

### V1.2 — Unique Constraint on `(freelancer_id, document_type)`

```sql
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'documents';
```

- [ ] A UNIQUE constraint exists on `(freelancer_id, document_type)`

### V1.3 — `verification_level` Column on `freelancer_profiles`

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
AND column_name = 'verification_level';
```

- [ ] Column exists, type `text`, default `'unverified'`

### V1.4 — `TokenFeature` Type Updated

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

```bash
grep -n "document_verification" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] `'document_verification'` is present in the `TokenFeature` union type

### V1.5 — `SYSTEM_USER_ID` Constant Exists

```bash
grep -rn "SYSTEM_USER_ID" artifacts/api-server/src/lib/
```

- [ ] `SYSTEM_USER_ID = 'system'` constant exists
- [ ] `checkTokenQuota()` has a guard at the top that returns `{ allowed: true }` when `userId === 'system'`

---

## Phase 2 Validation — Backend API

### V2.1 — Upload URL Endpoint: Happy Path

```bash
# As an authenticated freelancer
curl -X POST http://localhost:8080/api/documents/upload-url \
  -H "Authorization: Bearer <clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"government_id","mimeType":"image/jpeg","fileSize":2048000}'
```

- [ ] Returns `HTTP 200` with `{ uploadUrl, storagePath }`
- [ ] `storagePath` follows the pattern `documents/{userId}/government_id/{uuid}.jpg`
- [ ] `uploadUrl` is a valid GCS presigned URL

### V2.2 — Upload URL Endpoint: PDF Rejection

```bash
curl -X POST http://localhost:8080/api/documents/upload-url \
  -H "Authorization: Bearer <clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"government_id","mimeType":"application/pdf","fileSize":1000000}'
```

- [ ] Returns `HTTP 400`
- [ ] Response body: `{ "error": "Only JPEG, PNG, and WebP images are accepted. PDF support coming soon.", "code": "INVALID_FILE_TYPE" }`

### V2.3 — Upload URL Endpoint: File Too Large

```bash
curl -X POST http://localhost:8080/api/documents/upload-url \
  -H "Authorization: Bearer <clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"government_id","mimeType":"image/jpeg","fileSize":11534336}'
```

- [ ] Returns `HTTP 400`
- [ ] Response body: `{ "error": "File must be 10MB or smaller.", "code": "FILE_TOO_LARGE" }`

### V2.4 — Upload URL Endpoint: Invalid Document Type

```bash
curl -X POST http://localhost:8080/api/documents/upload-url \
  -H "Authorization: Bearer <clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"selfie","mimeType":"image/jpeg","fileSize":500000}'
```

- [ ] Returns `HTTP 400` with a validation error

### V2.5 — Upload URL Endpoint: Employer Blocked

```bash
# Authenticated as an employer (not a freelancer)
curl -X POST http://localhost:8080/api/documents/upload-url \
  -H "Authorization: Bearer <employer_clerk_token>" \
  ...
```

- [ ] Returns `HTTP 403` — employers cannot upload documents

### V2.6 — Confirm Endpoint: Atomic Upsert

**Test — first upload:**
```bash
curl -X POST http://localhost:8080/api/documents/confirm \
  -H "Authorization: Bearer <clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"government_id","storagePath":"documents/user_x/government_id/abc.jpg"}'
```

- [ ] Returns `HTTP 201 { "status": "pending" }`
- [ ] One row in `documents` table with `status = 'pending'`

**Test — re-upload same type:**

Run confirm again with a different `storagePath` for the same `documentType`.

- [ ] Still exactly **one** row in `documents` for this `(freelancerId, documentType)` — no duplicate
- [ ] `file_url` updated to the new path
- [ ] `status` reset to `'pending'`
- [ ] `ai_notes` reset to `null`

### V2.7 — AI Review Pipeline: Non-Blocking

After calling confirm, the endpoint must return before the AI review completes.

- [ ] `POST /api/documents/confirm` returns in under 500ms (not waiting for OpenAI)
- [ ] After ~10–20 seconds, `GET /api/documents/me` shows status changed from `'pending'` to `'verified'`, `'rejected'`, or `'needs_review'`
- [ ] `reviewed_by` column is set to `'ai'` after review
- [ ] `confidence` column is populated (0–100)
- [ ] `ai_notes` column is populated with a non-empty string
- [ ] `token_usage` table has a new row with `feature = 'document_verification'` and `user_id = 'system'`

### V2.8 — Stuck-Pending Safety Net

Manually set a document to `status = 'pending'` with `updated_at = now() - 11 minutes`:

```sql
UPDATE documents
SET status = 'pending', updated_at = NOW() - INTERVAL '11 minutes'
WHERE freelancer_id = '<your_freelancer_id>'
AND document_type = 'government_id';
```

Then call `GET /api/documents/me`.

- [ ] The document is returned with `status = 'needs_review'`
- [ ] `ai_notes` = `'AI review timed out — queued for manual review.'`
- [ ] `updated_at` is refreshed to now

### V2.9 — `verificationLevel` Updates Automatically

After a document is reviewed and set to `verified`:

```sql
SELECT verification_level FROM freelancer_profiles WHERE id = '<freelancer_id>';
```

- [ ] `verification_level = 'partially_verified'` when exactly 1 doc is verified
- [ ] `verification_level = 'fully_verified'` when 2+ docs are verified
- [ ] `verification_level = 'unverified'` when all docs are rejected/pending

### V2.10 — `GET /api/documents/me` Response Shape

```bash
curl http://localhost:8080/api/documents/me \
  -H "Authorization: Bearer <clerk_token>"
```

- [ ] Returns `{ verificationLevel, documents: [...] }`
- [ ] Each document object contains: `documentType`, `status`, `confidence`, `aiNotes`, `adminNotes`, `updatedAt`
- [ ] Freelancer can see their own `aiNotes` (rejection reason visible to them)
- [ ] Response does NOT contain `fileUrl` — raw file path never exposed to frontend

### V2.11 — `GET /api/freelancers/:id` Employer View

```bash
curl http://localhost:8080/api/freelancers/<freelancer_id> \
  -H "Authorization: Bearer <employer_clerk_token>"
```

- [ ] Response includes `verification: { level, verifiedDocumentCount }`
- [ ] Response does NOT include individual document statuses for non-verified docs
- [ ] Response does NOT include `aiNotes`, `fileUrl`, or `adminNotes`
- [ ] When `level = 'unverified'`, `verifiedDocumentCount = 0`

### V2.12 — Talent Vault Verified Filter

```bash
# Should return only freelancers with at least 1 verified document
curl "http://localhost:8080/api/freelancers?verified=true" \
  -H "Authorization: Bearer <employer_clerk_token>"
```

- [ ] Returns only freelancers where at least one `documents` row has `status = 'verified'`
- [ ] A freelancer with only `pending` or `rejected` docs does NOT appear
- [ ] Calling without `?verified=true` returns all freelancers as before (no regression)

### V2.13 — GCS Route Guard: Documents Are Private

```bash
# Without admin session — should be blocked
curl http://localhost:8080/api/storage/objects/documents/user_x/government_id/abc.jpg
```

- [ ] Returns `HTTP 403 { "error": "Forbidden" }` without an admin session
- [ ] The same URL returns the file when called WITH a valid admin session cookie

### V2.14 — Admin: Document Queue Endpoint

```bash
curl http://localhost:8080/api/admin/documents \
  -H "Cookie: tl_admin=<admin_session_cookie>"
```

- [ ] Returns only documents with `status = 'needs_review'`
- [ ] Response shape: `{ data: [...], total: number }`
- [ ] Each item includes: freelancer name, email, documentType, aiNotes, confidence, updatedAt
- [ ] Each item does NOT include `fileUrl`
- [ ] Calling without admin cookie returns `HTTP 401`

### V2.15 — Admin: Signed URL Endpoint

```bash
curl http://localhost:8080/api/admin/documents/<doc_id>/signed-url \
  -H "Cookie: tl_admin=<admin_session_cookie>"
```

- [ ] Returns a signed GCS URL
- [ ] URL expires within 15 minutes (check by waiting 16 min and confirming the URL no longer works)
- [ ] Calling without admin cookie returns `HTTP 401`

### V2.16 — Admin: Override Verdict

```bash
curl -X PATCH http://localhost:8080/api/admin/documents/<doc_id> \
  -H "Cookie: tl_admin=<admin_session_cookie>" \
  -H "Content-Type: application/json" \
  -d '{"verdict":"verified","adminNotes":"Document confirmed valid upon manual inspection."}'
```

- [ ] Returns `HTTP 200`
- [ ] `documents` row updated: `status = 'verified'`, `reviewed_by = 'admin'`, `admin_notes` set
- [ ] `freelancer_profiles.verification_level` updated correctly after override
- [ ] Calling with `verdict: 'rejected'` also works and updates status to `'rejected'`
- [ ] Calling without admin cookie returns `HTTP 401`

### V2.17 — TypeCheck Passes

```bash
pnpm typecheck
```

- [ ] Zero TypeScript errors across the entire workspace

---

## Phase 3 Validation — Frontend

### V3.1 — Freelancer Profile: Verification Section Visible

Log in as a freelancer and navigate to `/profile`.

- [ ] "Identity Verification" section is visible below existing profile fields
- [ ] Section shows all 3 document type rows: Government ID, Professional Credential, Portfolio Proof
- [ ] Each row shows "Not submitted" status with an Upload button when no docs uploaded
- [ ] Section does NOT appear when logged in as an employer

### V3.2 — Upload Flow: Client-Side Validation

On `/profile`, attempt to upload:

**PDF file:**
- [ ] Error shown immediately (before any network call): `"Only JPEG, PNG, and WebP images are accepted. PDF support coming soon."`
- [ ] No API request is made

**File > 10MB:**
- [ ] Error shown immediately: `"File must be 10MB or smaller."`
- [ ] No API request is made

### V3.3 — Upload Flow: Full Happy Path

Upload a valid JPEG image for Government ID.

- [ ] Step 1: File selected, no immediate error
- [ ] Step 2: `"Preparing upload..."` spinner shown while requesting presigned URL
- [ ] Step 3: `"Uploading... {N}%"` progress bar fills to 100%
- [ ] Step 4: `"Saving..."` spinner shown while confirming
- [ ] Step 5: `"Uploaded! AI review in progress..."` success message shown
- [ ] Document row switches to Pending state: clock icon + `"Reviewing..."` badge + `"AI review in progress..."` detail line
- [ ] Upload button disappears while pending

### V3.4 — Pending Polling

While a document is in `pending` status on the profile page:

- [ ] Page polls `GET /api/documents/me` every 3 seconds (check Network tab in DevTools)
- [ ] When AI review completes, the document row updates WITHOUT a page refresh
- [ ] Polling STOPS once no documents remain in `pending` status (verify in Network tab)

### V3.5 — Document Row: All 5 States Render Correctly

Manually seed documents via the DB to test each state:

```sql
-- Verified
UPDATE documents SET status = 'verified', confidence = 92,
  ai_notes = 'Document appears genuine.', reviewed_by = 'ai',
  updated_at = NOW()
WHERE document_type = 'government_id';

-- Rejected
UPDATE documents SET status = 'rejected', confidence = 15,
  ai_notes = 'Image was too dark to verify. Please upload a clearer photo.',
  reviewed_by = 'ai', updated_at = NOW()
WHERE document_type = 'professional_credential';

-- Needs Review
UPDATE documents SET status = 'needs_review',
  ai_notes = 'AI review timed out — queued for manual review.',
  updated_at = NOW()
WHERE document_type = 'portfolio_proof';
```

**Government ID (Verified):**
- [ ] Green ShieldCheck icon
- [ ] `"✓ Verified"` badge with `bg-emerald-100 text-emerald-700`
- [ ] `"Verified on {date}"` detail line
- [ ] Re-upload button visible (ghost style — less prominent)

**Professional Credential (Rejected):**
- [ ] Red ShieldX icon
- [ ] `"✗ Rejected"` badge with `bg-red-100 text-red-700`
- [ ] AI rejection reason shown: `"Image was too dark to verify. Please upload a clearer photo."`
- [ ] Re-upload button visible (outline style — prominent)

**Portfolio Proof (Needs Review):**
- [ ] Amber AlertTriangle icon
- [ ] `"Under Review ⏳"` badge with `bg-amber-100 text-amber-700`
- [ ] `"Sent for manual review — usually resolved within 24 hours"` detail line
- [ ] No upload/re-upload button

**Overall Status Badge:**
- [ ] With 1 verified + 1 rejected + 1 needs_review → `"Partially Verified ◑"` amber badge
- [ ] With 2 verified docs → `"Fully Verified ✓"` green badge
- [ ] With 0 verified docs → `"Not Verified ○"` gray badge

### V3.6 — Verification Badge Component: All Variants

Navigate to a freelancer's profile as an employer.

**Fully verified freelancer:**
- [ ] `<VerificationBadge size="md">` shows: ShieldCheck icon + `"Fully Verified"` in green
- [ ] Hovering shows tooltip: `"Identity and credentials verified by AI review"` + disclaimer

**Partially verified freelancer:**
- [ ] Badge shows amber `"Partially Verified"` with partial shield icon

**Unverified freelancer:**
- [ ] NO badge rendered at all — no placeholder, no empty space

### V3.7 — Employer View on `/freelancers/:id`

Log in as an employer and view a verified freelancer's detail page.

- [ ] Verification section appears below the bio
- [ ] Shows `<VerificationBadge>` with correct level
- [ ] Shows `"{N} document{s} verified"` count line
- [ ] Shows AI disclaimer: `"Document reviewed by AI — not a legal identity verification."`
- [ ] Does NOT show individual document types, their statuses, or any rejection notes
- [ ] Unverified freelancers show NO verification section (not even an empty card)

### V3.8 — Talent Vault: Verified Badge on Cards

On `/freelancers` (Talent Vault):

- [ ] Freelancer cards for verified freelancers show `<VerificationBadge size="sm">` badge
- [ ] Badge appears alongside the Lock badge (if booked) — both can coexist
- [ ] Unverified freelancer cards show no badge
- [ ] Badge tooltip shows disclaimer on hover

### V3.9 — Talent Vault: Verified Filter Toggle

- [ ] "Verified only" toggle exists in the filter panel
- [ ] Toggle is OFF by default — all freelancers shown
- [ ] Toggling ON: list updates to show only verified freelancers (no page refresh needed)
- [ ] Toggling OFF: full list returns
- [ ] Filter state persists if you change another filter while Verified is on
- [ ] URL reflects the filter: `?verified=true` appears in the address bar when active

### V3.10 — Public Profile `/f/:id`

Visit a public freelancer profile page while logged out.

- [ ] Verified badge appears below the freelancer's name/role for verified freelancers
- [ ] Unverified freelancers show no badge
- [ ] Tooltip works on hover

### V3.11 — Employer Cannot See Document Details

As an employer, inspect the network response for `GET /api/freelancers/:id`:

- [ ] Response body contains `verification.level` and `verification.verifiedDocumentCount` only
- [ ] Response body does NOT contain any `fileUrl`, `aiNotes`, `adminNotes`, or per-document status array
- [ ] There is no UI element on `/freelancers/:id` that reveals a rejection reason

---

## Phase 4 Validation — Admin Console

### V4.1 — Document Review Tab Visible

Log in to `/admin` with admin credentials.

- [ ] "Document Review" tab appears in the admin tab bar
- [ ] Tab has `<ShieldCheck>` icon
- [ ] Tab label shows a count badge when `needs_review` documents exist: `Document Review (N)`
- [ ] Count badge is `0` or hidden when queue is empty

### V4.2 — Review Queue Table

With at least one `needs_review` document in the DB:

- [ ] Table shows: Freelancer (name + email), Doc Type, Submitted time, Confidence, Action
- [ ] Confidence cell colour: ≥ 70 green text, 40–69 amber, < 40 red, `—` when null
- [ ] Submitted time shown as relative (`"2h ago"`) with full timestamp on hover
- [ ] `[Review]` button visible per row

### V4.3 — Review Panel Opens

Click `[Review]` on a queue item.

- [ ] Sheet slides in from the right at `w-[520px]`
- [ ] Sheet shows freelancer name + document type + submission timestamp
- [ ] AI Assessment block shows confidence + `aiNotes` text
- [ ] Document image loads (fetches signed URL — may take 1–2 seconds)
- [ ] `"Expires in 15min"` note shown below image
- [ ] Admin note textarea is present and editable
- [ ] `[✗ Reject]` and `[✓ Verify]` buttons are present

### V4.4 — Admin Verify Action

In the review panel, enter an optional note and click `[✓ Verify]`.

- [ ] Button shows spinner while request is in flight
- [ ] Sheet closes on success
- [ ] Toast: `"Document marked as verified."`
- [ ] Verified document NO LONGER appears in the queue table
- [ ] Freelancer's `verificationLevel` in `freelancer_profiles` updated correctly
- [ ] On the freelancer's profile (`/profile`), the document row now shows Verified state

### V4.5 — Admin Reject Action

Click `[✗ Reject]` with an admin note.

- [ ] Sheet closes on success
- [ ] Toast: `"Document rejected — freelancer notified."`
- [ ] Document removed from queue
- [ ] Freelancer's profile shows Rejected state with `adminNotes` visible

### V4.6 — Empty Queue State

When no `needs_review` documents exist:

- [ ] ShieldCheck icon + `"No documents pending review."` + `"All submitted documents have been processed."` shown
- [ ] Tab count badge shows `0` or is hidden

---

## Security Validation

These checks are critical and must all pass before the feature ships.

### S1 — Document Files Inaccessible Without Admin

```bash
# Attempt direct object access as a logged-out user
curl http://localhost:8080/api/storage/objects/documents/any/path/file.jpg
```

- [ ] Returns `HTTP 403` — no file content returned

```bash
# Attempt as a logged-in freelancer (not admin)
curl http://localhost:8080/api/storage/objects/documents/any/path/file.jpg \
  -H "Authorization: Bearer <clerk_token>"
```

- [ ] Returns `HTTP 403` — freelancers cannot access raw document files

### S2 — Employer Cannot Access Document Endpoints

```bash
# Employer tries to call freelancer-only endpoint
curl http://localhost:8080/api/documents/me \
  -H "Authorization: Bearer <employer_clerk_token>"
```

- [ ] Returns `HTTP 403`

```bash
# Employer tries to request upload URL
curl -X POST http://localhost:8080/api/documents/upload-url \
  -H "Authorization: Bearer <employer_clerk_token>" \
  -d '{"documentType":"government_id","mimeType":"image/jpeg","fileSize":1000}'
```

- [ ] Returns `HTTP 403`

### S3 — Freelancer Cannot Access Another Freelancer's Documents

```bash
# Freelancer A tries to see Freelancer B's documents
curl http://localhost:8080/api/documents/me \
  -H "Authorization: Bearer <freelancer_A_token>"
```

- [ ] Only returns Freelancer A's own documents — never another freelancer's

### S4 — Admin Endpoints Require Admin Session

```bash
# Without admin cookie
curl http://localhost:8080/api/admin/documents
curl http://localhost:8080/api/admin/documents/1/signed-url
curl -X PATCH http://localhost:8080/api/admin/documents/1 -d '{"verdict":"verified"}'
```

- [ ] All three return `HTTP 401` without a valid admin session cookie

### S5 — AI System Prompt Does Not Leak PII

Inspect the OpenAI call in `documentReview.ts`:

- [ ] System prompt contains: `"Do NOT attempt to extract personal data (name, DOB, ID numbers) from the document."`
- [ ] The AI response stored in `ai_notes` contains no names, dates of birth, or ID numbers extracted from the document

---

## Regression Validation

Confirm the feature has not broken any existing functionality.

### R1 — Existing GCS Routes Unaffected

```bash
# Portfolio image — should still be accessible publicly
curl http://localhost:8080/api/storage/objects/portfolio/user_x/image.jpg
```

- [ ] Returns the image (non-document GCS paths are NOT blocked)

### R2 — `checkTokenQuota` Still Works for Employers

```bash
# Trigger an AI action as an employer who has used > quota
# Should still return 402 TOKEN_LIMIT as before
```

- [ ] Employer token quota gating still fires correctly
- [ ] `SYSTEM_USER_ID = 'system'` guard does NOT affect employer quota checks

### R3 — `GET /api/freelancers` Without Filter Works

```bash
curl http://localhost:8080/api/freelancers \
  -H "Authorization: Bearer <employer_clerk_token>"
```

- [ ] Returns all freelancers as before — `?verified=true` is additive, not default
- [ ] Response includes new `verification` field on each freelancer object

### R4 — Existing Freelancer Profile Fields Unchanged

Log in as a freelancer and navigate to `/profile`.

- [ ] All existing profile fields (bio, skills, rate, availability, portfolio) are intact
- [ ] Verification section is additive — no existing section is displaced or removed

### R5 — Existing Admin Tabs Unaffected

Log in to `/admin`.

- [ ] All existing tabs (Users, Activity Log, Bookings, Jobs, Subscriptions, Token Usage) still work
- [ ] Document Review is a new tab — it does not replace or break any existing tab

### R6 — TypeCheck and Build Pass

```bash
pnpm typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero TypeScript errors
- [ ] Frontend build completes without errors
- [ ] Backend build completes without errors

---

## Final Sign-Off

All checks above must be ✅ before the feature is considered complete.

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Database | ⬜ | | |
| Phase 2 — Backend API | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| Phase 4 — Admin Console | ⬜ | | |
| Security Checks | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

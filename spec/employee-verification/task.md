# TalentLock — Task Breakdown: Employer Verification

---

## Summary

Four phases: Database (new `employer_documents` table + 2 columns on `employer_profiles`) → Backend (upload/confirm/status routes, AI review pipeline, admin routes, GDPR, OpenAPI + codegen) → Frontend (employer verification UI section, document states) → Trust Signals (Verified Employer badge on job posts, bookings, meetings). The existing freelancer document system is completely untouched.

Read `specs/employer-verification/plan.md` before writing any code.

---

## Phase 1 — Database

### Task 1.1 — Codebase Inspection

Run all pre-implementation checks from `plan.md`. Document and confirm:
- Exact column names on existing `documents` table (match naming conventions)
- GCS presigned URL utility import path
- Existing AI review pipeline function location and signature
- Admin queue existing route structure
- `employer_profiles` exact column list (confirm no existing `verificationLevel` column)

### Task 1.2 — Create `employer_documents` Table

**File:** `lib/db/src/schema/` — new table

```ts
export const employerDocuments = pgTable('employer_documents', {
  id:            text('id').primaryKey(),
  employerId:    text('employer_id').notNull()
                   .references(() => employerProfiles.id),
  documentType:  text('document_type').notNull(),
                 // 'company_registration' | 'tax_vat_certificate' |
                 // 'business_licence' | 'representative_id' |
                 // 'proof_of_business_address'
  fileUrl:       text('file_url').notNull(),
  status:        text('status').notNull().default('pending'),
                 // 'pending' | 'verified' | 'rejected' | 'needs_review'
  confidence:    integer('confidence'),
  aiNotes:       text('ai_notes'),       // admin-facing — NEVER returned to employer
  employerNotes: text('employer_notes'), // employer-facing plain English
  adminNotes:    text('admin_notes'),    // human admin override notes
  reviewedBy:    text('reviewed_by'),    // admin user ID
  reviewedAt:    timestamp('reviewed_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueEmployerDocType: unique().on(t.employerId, t.documentType),
  employerIdx: index().on(t.employerId),
  statusIdx:   index().on(t.status),
}));
```

### Task 1.3 — Export Types

**File:** `lib/db/src/schema/` (or shared types file)

```ts
export type EmployerDocumentType =
  | 'company_registration'
  | 'tax_vat_certificate'
  | 'business_licence'
  | 'representative_id'
  | 'proof_of_business_address';

export type EmployerDocumentStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'needs_review';

export type VerificationLevel =
  | 'unverified'
  | 'partially_verified'
  | 'fully_verified';

export interface EmployerDocReviewResult {
  status: EmployerDocumentStatus;
  confidence: number;
  documentTypeMatch: boolean;
  companyNameMatch: boolean | null;
  registrationNumberVisible: boolean;
  isLegible: boolean;
  hasExpiry: boolean;
  isExpired: boolean | null;
  tamperingConcern: boolean;
  adminNotes: string;
  employerNotes: string;
}
```

### Task 1.4 — Add Columns to `employer_profiles`

```ts
verificationLevel: text('verification_level').notNull().default('unverified'),
isVerified:        boolean('is_verified').notNull().default(false),
```

Migration: both columns have safe defaults — existing rows backfill to `'unverified'` / `false` automatically.

### Task 1.5 — Run Migration and Verify

```bash
pnpm --filter @workspace/db run push
```

```sql
-- Verify table exists
SELECT table_name FROM information_schema.tables WHERE table_name = 'employer_documents';

-- Verify unique constraint
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'employer_documents' AND constraint_type = 'UNIQUE';

-- Verify employer_profiles new columns
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_name = 'employer_profiles'
AND column_name IN ('verification_level', 'is_verified');

-- Verify backfills
SELECT DISTINCT verification_level FROM employer_profiles;  -- expect: 'unverified' only
SELECT COUNT(*) FROM employer_profiles WHERE is_verified = true;  -- expect: 0
```

---

## Phase 2 — Backend

### Task 2.1 — Add Token Feature

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

```ts
| 'employer_doc_review'   // AI vision review of employer business documents
```

### Task 2.2 — Create `employerDocReviewUtils.ts`

**File:** `artifacts/api-server/src/lib/employerDocReviewUtils.ts` (create new)

Implement:
1. `DOCUMENT_TYPE_LABELS` — human-readable labels per `EmployerDocumentType`
2. `REQUIRED_FOR_PARTIAL` and `REQUIRED_FOR_FULL` arrays
3. `calculateVerificationLevel(docs): { level, isVerified }` — pure function, no DB
4. `recalculateEmployerVerificationLevel(tx, employerId): Promise<void>` — always receives transaction
5. `buildEmployerDocReviewPrompt(documentType, companyName): string` — verbatim from `plan.md`
6. `validateEmployerDocReviewResponse(parsed): boolean` — shape check
7. `reviewEmployerDocument(db, employerDocId, log): Promise<void>` — full implementation per `plan.md`

### Task 2.3 — Create `routes/employerDocuments.ts`

**File:** `artifacts/api-server/src/routes/employerDocuments.ts` (create new)

All routes require Clerk authentication. All resolve employer identity from Clerk ID and verify ownership. Freelancers get 403.

**`POST /api/employer-documents/upload-url`:**
```ts
// Body: { documentType: EmployerDocumentType, filename: string, mimeType: string }
// Validates: documentType in valid set, mimeType in ['image/jpeg', 'image/png', 'image/webp']
// GCS path: uploads/{employerId}/employer-docs/{documentType}/{timestamp}-{filename}
// Returns: { uploadUrl: string, fileUrl: string }
// logAudit('employer_doc_upload_requested', { employerId, documentType })
```

**`POST /api/employer-documents/confirm`:**
```ts
// Body: { documentType: EmployerDocumentType, fileUrl: string }
// Upsert into employer_documents (reset status to 'pending') — see plan.md
// Recalculate verificationLevel in same transaction
// Fire-and-forget: reviewEmployerDocument(db, docId, req.log).catch(...)
// Returns: { documentId, status: 'pending' }
// logAudit('employer_doc_uploaded', { employerId, documentType })
```

**`GET /api/employer-documents/me`:**
```ts
// Returns ONLY: [{ documentType, status, employerNotes, updatedAt }]
// NEVER returns: fileUrl, aiNotes, adminNotes, confidence, reviewedBy
// Allowlist enforced — never SELECT *
```

**`GET /api/employer-documents/me/:documentType/view-url`:**
```ts
// Returns a 15-minute signed GCS URL for the employer to preview their own uploaded document
// 404 if no document exists for this type
// logAudit('employer_doc_viewed', { employerId, documentType })
```

### Task 2.4 — Register Employer Document Routes

**File:** `artifacts/api-server/src/routes/index.ts`

```ts
import employerDocumentsRouter from './employerDocuments';
app.use('/api/employer-documents', employerDocumentsRouter);
```

### Task 2.5 — Extend Admin Routes

**File:** `artifacts/api-server/src/routes/admin.ts`

Add three new admin routes (CSRF-protected, admin session required):

**`GET /api/admin/employer-documents`:**
```ts
// Query: page, pageSize, status (comma-separated — pending|needs_review|verified|rejected; default pending,needs_review)
// Returns paginated list with:
//   employerName, companyName, documentType, status, confidence,
//   aiNotes, adminNotes, signedFileUrl, createdAt, reviewedAt
// verified/rejected lists ordered by reviewedAt DESC
```

**`POST /api/admin/employer-documents/:id/verify`:**
```ts
// Body: { adminNotes?: string }
// Updates employer_documents: status='verified', reviewedBy=adminId, reviewedAt=now()
// Calls recalculateEmployerVerificationLevel() in transaction
// Sends 'employer_doc_verified' notification to employer
// logAudit('admin_employer_doc_verified', { docId, employerId, adminId })
// Returns: { success: true, newVerificationLevel }
```

**`POST /api/admin/employer-documents/:id/reject`:**
```ts
// Body: { adminNotes: string }  — required, 400 if missing
// Updates employer_documents: status='rejected', adminNotes, employerNotes=adminNotes,
//   reviewedBy=adminId, reviewedAt=now()
// Calls recalculateEmployerVerificationLevel() in transaction
// Sends 'employer_doc_rejected' notification + email to employer
// logAudit('admin_employer_doc_rejected', { docId, employerId, adminId })
// Returns: { success: true, newVerificationLevel }
```

### Task 2.6 — GDPR Extension

**File:** `artifacts/api-server/src/lib/accountDeletion.ts`

Inside the existing Drizzle transaction (after existing employer profile anonymisation, if any):

```ts
// Anonymise employer documents
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
```

After the transaction (fire-and-forget):
```ts
deleteGcsPrefix(`uploads/${employerProfileId}/employer-docs/`).catch(() => {});
```

### Task 2.7 — `GET /api/employers/me` Response Extension

**File:** `artifacts/api-server/src/routes/employers.ts`

Ensure `GET /api/employers/me` includes `verificationLevel` and `isVerified` in the response. Do NOT include `employer_documents` rows here — those are fetched separately via `GET /api/employer-documents/me`.

### Task 2.8 — OpenAPI + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add all 4 employer-facing routes and 3 admin routes. Add schemas:
- `EmployerDocumentStatus` — the employer-safe status object (no `aiNotes`, no `fileUrl`)
- `EmployerDocumentUploadUrl` — `{ uploadUrl, fileUrl }`
- `EmployerVerificationLevel` — `{ verificationLevel, isVerified }`

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

---

## Phase 3 — Frontend

### Task 3.1 — Verify Generated Hooks

```bash
grep -r "employerDocument\|verificationLevel\|isVerified" lib/api-client-react/src/ | head -10
```

- [ ] `usePostEmployerDocumentsUploadUrl()` exists
- [ ] `usePostEmployerDocumentsConfirm()` exists
- [ ] `useGetEmployerDocumentsMe()` exists
- [ ] `EmployerProfile` type includes `verificationLevel` and `isVerified`

### Task 3.2 — Create `<EmployerVerificationSection />`

**File:** `artifacts/talentlock/src/components/employer/EmployerVerificationSection.tsx` (create new)

See `UI.md` for full component spec. Renders:
- Disclaimer banner
- Overall status pill
- Document checklist (5 document types, one row each)
- Upload flow per document (image file picker → GCS upload → confirm)

### Task 3.3 — Integrate Into Employer Profile Page

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

Add `<EmployerVerificationSection />` inside the employer profile page (after company details, before delete account). Visible only when `userRole === 'employer'`.

### Task 3.4 — Verified Employer Badge Component

**File:** `artifacts/talentlock/src/components/employer/VerifiedEmployerBadge.tsx` (create new)

```tsx
interface VerifiedEmployerBadgeProps {
  verificationLevel: 'unverified' | 'partially_verified' | 'fully_verified';
  size?: 'sm' | 'md';
}
```

Three render states:
- `unverified` → render nothing (no badge)
- `partially_verified` → amber "◐ ID Verified" pill
- `fully_verified` → green "✓ Verified Employer" pill

### Task 3.5 — Add Badge to Job Postings

**File:** `artifacts/talentlock/src/pages/Jobs.tsx` and `artifacts/talentlock/src/pages/JobDetail.tsx`

Fetch employer's `verificationLevel` alongside job data. Render `<VerifiedEmployerBadge />` next to employer company name. No documents or sensitive data shown to freelancers.

### Task 3.6 — Add Badge to Booking Detail

**File:** `artifacts/talentlock/src/pages/BookingDetail.tsx`

Add `<VerifiedEmployerBadge />` next to employer name in the booking header. Visible to freelancers.

### Task 3.7 — Add Badge to Meeting Detail

**File:** `artifacts/talentlock/src/pages/MeetingDetail.tsx`

Add `<VerifiedEmployerBadge />` next to employer name. Visible to freelancers.

### Task 3.8 — Admin UI — Employer Documents Tab

**File:** `artifacts/talentlock/src/components/AdminEmployerDocumentTab.tsx`

Add "Employer Docs" tab to the existing admin document review section with **three sub-sections**:

| Section | API | UI |
|---------|-----|-----|
| Pending | `GET /admin/employer-documents?status=pending,needs_review` | Approve / Reject actions |
| Approved | `GET /admin/employer-documents?status=verified` | Read-only history |
| Rejected | `GET /admin/employer-documents?status=rejected` | Read-only history with admin notes |

- Card per document: employer name, company name, document type, status badge, AI confidence, AI notes, document preview (signed URL)
- Pending cards: Approve and Reject buttons with admin notes input
- Approved/Rejected cards: `reviewedAt`, `adminNotes`, view document — no action buttons
- Main admin nav badge count = Pending total only

### Task 3.9 — Onboarding mandatory document step

**Backend:** `artifacts/api-server/src/routes/employerDocuments.ts`

Update `resolveEmployerContext()` to allow `users.role = 'pending'` when `onboardingRole = 'employer'` and employer profile exists.

**OpenAPI:** Add `employer_documents` to `PatchOnboardingStepBody.onboardingStep` enum (shared with onboarding-scaffolding).

**Frontend:** `artifacts/talentlock/src/components/onboarding/EmployerDocumentOnboardingStep.tsx`

- Single required upload: `representative_id`
- Finish calls `PUT /users/me` with `role: employer` only after upload

**Integration:** `artifacts/talentlock/src/pages/Onboarding.tsx` — employer flow step 4; company profile save must `PATCH onboarding-step` before `PUT /employers/me`.

See `spec/onboarding-scaffolding/` Tasks 3.4–3.5 and `UI.md` onboarding section below.

---

## Acceptance Criteria

- [ ] `employer_documents` table created with all 8 columns + unique constraint + 3 indexes
- [ ] `verificationLevel` and `isVerified` added to `employer_profiles` — all existing rows default to `'unverified'` / `false`
- [ ] `employer_doc_review` in `TokenFeature`
- [ ] `POST /api/employer-documents/upload-url` returns signed URL — rejects non-image MIME types
- [ ] `POST /api/employer-documents/upload-url` returns 403 for freelancers
- [ ] `POST /api/employer-documents/confirm` upserts (not inserts) — re-upload resets to `pending`
- [ ] `POST /api/employer-documents/confirm` recalculates `verificationLevel` atomically in same transaction
- [ ] `POST /api/employer-documents/confirm` fires `reviewEmployerDocument()` fire-and-forget
- [ ] `GET /api/employer-documents/me` returns only `documentType`, `status`, `employerNotes`, `updatedAt` — never `aiNotes`, `fileUrl`, or `confidence`
- [ ] AI review generates two note fields: `aiNotes` (admin) and `employerNotes` (employer)
- [ ] `aiNotes` never appears in any employer-facing API response
- [ ] `verificationLevel` recalculated in transaction after every status change (AI review + admin verify + admin reject)
- [ ] `calculateVerificationLevel()` correctly returns `fully_verified` only when rep ID + company reg + tax cert are all verified
- [ ] `partially_verified` when only rep ID is verified
- [ ] Admin `GET /api/admin/employer-documents` returns paginated queue with signed URLs
- [ ] Admin verify route sends `employer_doc_verified` notification to employer
- [ ] Admin reject route requires `adminNotes` — returns 400 if missing
- [ ] Admin reject route sends notification + email to employer
- [ ] All admin routes are CSRF-protected and require admin session
- [ ] `logAudit()` called on upload, admin verify, admin reject
- [ ] GDPR deletion anonymises `employer_documents` content and deletes GCS files
- [ ] GDPR deletion resets `verificationLevel = 'unverified'`, `isVerified = false`
- [ ] Employer verification section renders on `/profile` for employers only
- [ ] All 5 document type rows shown with correct status states
- [ ] Upload flow: file picker → GCS upload → confirm → status updates to `pending`
- [ ] Re-upload on rejected document resets to `pending` and triggers new AI review
- [ ] Onboarding: pending employer with company profile can upload Representative ID (403 without profile)
- [ ] Onboarding: employer cannot complete registration without at least one uploaded document
- [ ] Onboarding: `PUT /users/me` with `role: employer` only after document upload step
- [ ] Disclaimer banner shown prominently on the verification section
- [ ] `<VerifiedEmployerBadge />` renders nothing for `unverified`
- [ ] Badge renders amber pill for `partially_verified`
- [ ] Badge renders green pill for `fully_verified`
- [ ] Badge shown on job postings, booking detail, meeting detail — freelancer-visible
- [ ] No `aiNotes`, `fileUrl`, `confidence`, or registration numbers exposed in freelancer-facing responses
- [ ] Admin employer docs tab shows Pending / Approved / Rejected sub-sections
- [ ] Pending section: verify/reject actions; Approved/Rejected: read-only history with reviewedAt and adminNotes
- [ ] `GET /admin/employer-documents?status=verified` and `?status=rejected` return reviewed documents
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 → 1.4 → 1.5 (verify migration)
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8 (codegen + typecheck)
Task 3.1 (verify hooks) → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8
```

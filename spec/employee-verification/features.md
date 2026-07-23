# TalentLock — Features Specification: Employer Verification

## Overview

Freelancers using TalentLock accept booking requests, sign legal agreements, and commit to exclusive engagements — all on the trust that the employer on the other side is a legitimate business. Currently TalentLock has no way to verify that an employer is who they say they are. A freelancer booking a 3-month contract with "Jefferson Academy" has no platform-level signal that Jefferson Academy is a real registered organisation rather than a fictitious entity.

**Employer Verification** closes this gap. It gives employers a structured way to upload business identity documents, puts those documents through an AI-assisted review pipeline, and then surfaces a visible "Verified Employer ✓" trust signal to freelancers across job postings, booking requests, and meeting invitations.

This is a **parallel system** to the existing freelancer document verification. It does not reuse the freelancer `documents` table or its routes unchanged — it introduces a new `employer_documents` table with employer-specific document types, an employer-specific AI review prompt, and employer-specific access controls. The underlying infrastructure (GCS presigned URLs, vision model review, admin queue pattern, `logAudit()`, GDPR deletion) is reused without modification.

**AI review is not legal KYC.** Every employer-facing surface clearly states that the AI document check is for platform trust purposes only and does not constitute legal identity or business verification.

---

## Feature Modules

### Module 1 — Employer Document Types

Five document types, each targeting a specific aspect of business legitimacy:

```ts
type EmployerDocumentType =
  | 'company_registration'        // Companies House certificate, Articles of Association,
                                  // Certificate of Incorporation, or equivalent
  | 'tax_vat_certificate'         // VAT registration certificate, GSTIN, EIN confirmation
                                  // letter, or equivalent tax registration
  | 'business_licence'            // Trading licence, sector-specific permit, professional
                                  // body membership — required for regulated sectors
                                  // (education, healthcare)
  | 'representative_id'           // Government-issued photo ID of company director, owner,
                                  // or authorised representative uploading on behalf of the org
  | 'proof_of_business_address'   // Utility bill, bank statement, or lease agreement showing
                                  // the business's registered address — must be < 3 months old
```

**Required vs optional by verification level:**

| Document | `partially_verified` | `fully_verified` |
|---|---|---|
| `representative_id` | ✅ Required | ✅ Required |
| `company_registration` | ❌ Optional | ✅ Required |
| `tax_vat_certificate` | ❌ Optional | ✅ Required |
| `business_licence` | ❌ (sector-specific) | ❌ (sector-specific) |
| `proof_of_business_address` | ❌ Optional | ❌ Optional |

Partial verification (representative ID only) unlocks a "Partially Verified" badge.
Full verification (representative ID + company registration + tax certificate, all verified) unlocks the full "Verified Employer ✓" badge.

---

### Module 2 — `employer_documents` Table

A dedicated table. Not a generalisation of the existing `documents` table.

```ts
employer_documents:
  id              text PK
  employerId      text FK → employer_profiles.id   NOT NULL
  documentType    text NOT NULL
                  // 'company_registration' | 'tax_vat_certificate' |
                  // 'business_licence' | 'representative_id' |
                  // 'proof_of_business_address'
  fileUrl         text NOT NULL        // GCS path (not public URL)
  status          text NOT NULL DEFAULT 'pending'
                  // 'pending' | 'verified' | 'rejected' | 'needs_review'
  confidence      integer              // 0–100 — AI confidence score
  aiNotes         text                 // admin-facing AI assessment (never shown to employers)
  employerNotes   text                 // sanitised, employer-facing plain-English status message
  adminNotes      text                 // human admin override notes
  reviewedBy      text                 // admin user ID who last reviewed
  reviewedAt      timestamptz
  createdAt       timestamptz NOT NULL
  updatedAt       timestamptz NOT NULL

UNIQUE (employerId, documentType)
// Enforces one active document per type per employer
// Re-upload uses UPSERT — resets status to 'pending' on the existing row
```

**GCS storage path:** `uploads/{employerId}/employer-docs/{documentType}/{filename}`
Scoped to employer ID — completely separate namespace from freelancer document paths (`uploads/{userId}/docs/`).

---

### Module 3 — Verification Level on `employer_profiles`

Two new columns on `employer_profiles`:

```ts
verificationLevel: text('verification_level').notNull().default('unverified'),
// 'unverified' | 'partially_verified' | 'fully_verified'

isVerified: boolean('is_verified').notNull().default(false),
// true when verificationLevel = 'fully_verified'
// convenience field — always equals (verificationLevel === 'fully_verified')
```

Both are recalculated server-side in the same atomic `db.update(employerProfiles)` call that updates a document's status — they never drift from the actual document states.

**Calculation logic:**
```ts
function calculateVerificationLevel(
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

---

### Module 4 — Upload APIs

Three new employer-facing routes, all requiring Clerk authentication and employer profile ownership:

**Access rule:** `role = employer`, OR (`role = pending` AND `onboardingRole = employer` AND `employer_profiles` row exists). Freelancers and other pending users receive 403.

```
POST /api/employer-documents/upload-url
  Generate a presigned GCS upload URL for a specific document type.
  Body: { documentType: EmployerDocumentType, filename: string, mimeType: string }
  Returns: { uploadUrl: string, fileUrl: string }
  Validates: documentType must be one of the 5 valid values

POST /api/employer-documents/confirm
  Called after successful upload to GCS.
  Body: { documentType: EmployerDocumentType, fileUrl: string }
  Creates or updates (upserts) the employer_documents row with status = 'pending'.
  Triggers AI review fire-and-forget.
  Recalculates verificationLevel on employer_profiles atomically.
  Returns: { documentId, status: 'pending' }

GET /api/employer-documents/me
  Returns all document statuses for the current employer.
  Returns: array of { documentType, status, employerNotes, updatedAt }
  NEVER returns: fileUrl (use signed URL endpoint), aiNotes, adminNotes, confidence
```

Signed URL for viewing an uploaded document (employer re-downloading their own):
```
GET /api/employer-documents/me/:documentType/view-url
  Returns a short-lived (15-minute) signed GCS URL for the employer to preview
  their uploaded document. Admin can view via the admin queue endpoint.
```

---

### Module 5 — AI Review Pipeline

Fires fire-and-forget from `POST /api/employer-documents/confirm`, after the route returns. Never blocks the response.

**Model:** `gpt-4o` with vision (image input)
**Token label:** `employer_doc_review`
**Temperature:** `0` — deterministic, factual assessment

**Prompt (use verbatim — see `plan.md` for exact string):**
Reviews the uploaded document image against 7 criteria:
1. Document type match (does it match the declared type?)
2. Company name consistency (does it match the employer's registered company name?)
3. Registration/reference number visibility
4. Legibility and completeness
5. Expiry validity (where applicable)
6. Obvious tampering or editing artefacts
7. Whether the uploader appears to be an authorised representative (for `representative_id`)

**AI response shape:**
```ts
{
  status: 'verified' | 'needs_review' | 'rejected',
  confidence: number,               // 0–100
  documentTypeMatch: boolean,
  companyNameMatch: boolean,
  registrationNumberVisible: boolean,
  isLegible: boolean,
  hasExpiry: boolean,
  isExpired: boolean | null,
  tamperingConcern: boolean,
  adminNotes: string,               // technical, admin-facing — max 200 words
  employerNotes: string,            // plain English, employer-facing — max 60 words
}
```

**Two notes fields — always generated separately:**
- `aiNotes` (stored as `aiNotes` on the row) — technical detail for admin: "Company name 'Jefferson Academy Ltd' visible on document. Registration number CH123456 present. Document appears unaltered. Minor legibility issue on bottom-left corner."
- `employerNotes` (stored as `employerNotes`) — plain English for employer: "Your company registration certificate looks good. We'll complete the review shortly." or "We need a clearer copy — the registration number is partially obscured."

The `aiNotes` field is NEVER returned in any employer-facing API response. Only admins see it.

After the AI review, update the `employer_documents` row and recalculate `verificationLevel` atomically.

**Notifications on status change:**
- `verified`: in-app notification + email to employer — "Your [document type] has been verified ✓"
- `rejected`: in-app notification + email — "Your [document type] requires attention. [employerNotes]"
- `needs_review`: no notification to employer — admin reviews manually

---

### Module 6 — Employer Verification UI

A "Verification" section added to the employer profile/settings page (`/profile` for employers, or a dedicated `/settings/verification` route).

**Section header with disclaimer:**
```
Business Verification
──────────────────────────────────────────────────
⚠ AI document review is for platform trust purposes only.
  It does not constitute legal identity or KYC verification.
```

**Overall status indicator:**
```
○ Unverified          — no representative ID verified
◐ Partially Verified  — representative ID verified, other docs pending
● Fully Verified ✓    — representative ID + company reg + tax cert all verified
```

**Document checklist (one row per document type):**
Each row shows: document name, status badge, employer-facing note (if any), upload/re-upload button.

Five status badge variants:
- Not uploaded → grey "Not uploaded" + "Upload →" button
- Pending → amber spinner + "Under review"
- Needs review → amber warning + employer-friendly note
- Verified → green "✓ Verified"
- Rejected → red "Action required" + employerNotes + "Re-upload →" button

---

### Module 10 — Onboarding Mandatory Document Gate

During employer registration (`/onboarding`), one document upload is **required** before the account is activated:

| Requirement | Detail |
|---|---|
| Required document | `representative_id` only |
| Minimum to proceed | One row exists for `(employerId, representative_id)` with status `pending`, `verified`, `rejected`, or `needs_review` (upload counts; verification can complete later) |
| When account activates | `PUT /api/users/me` with `role: employer` runs only after upload |
| Additional documents | Optional — full 5-document checklist remains on `/profile` via `EmployerVerificationSection` |
| UI component | `EmployerDocumentOnboardingStep.tsx` — step 4 of employer onboarding |

This gates **registration completion**, not job posting (employers may use the platform unverified for jobs per Non-Goals).

**Company profile prerequisite:** `PUT /api/employers/me` must succeed before document upload (creates `employer_profiles` row used by upload routes).

---

### Module 7 — Admin Review Queue Extension

The existing `GET /api/admin/documents` queue shows freelancer documents. Employer documents are surfaced in the same admin console under a new tab or filter.

**New admin routes:**
```
GET  /api/admin/employer-documents
  Paginated employer document list for admin review.
  Query `status` (comma-separated): pending | needs_review | verified | rejected
  Default: pending,needs_review (action queue).
  Use status=verified or status=rejected for the approved/rejected history trackers.
  Returns: { employerName, companyName, documentType, status, confidence,
             aiNotes, adminNotes, signedFileUrl (short expiry), createdAt, reviewedAt }
  Secured: admin session + CSRF
  Ordering: pending queue ascending by createdAt; verified/rejected descending by reviewedAt

POST /api/admin/employer-documents/:id/verify
  Admin marks document as verified.
  Body: { adminNotes?: string }
  Recalculates verificationLevel on employer_profiles atomically.
  Logs audit event.
  Sends 'verified' notification to employer.

POST /api/admin/employer-documents/:id/reject
  Admin marks document as rejected.
  Body: { adminNotes: string }  — required for rejection
  Recalculates verificationLevel atomically.
  Sends 'rejected' notification to employer with adminNotes as employerNotes.
  Logs audit event.
```

**Admin console UI — three sub-sections on the Employer Documents tab:**

| Section | API filter | Purpose |
|---------|------------|---------|
| Pending | `status=pending,needs_review` | Action queue — Approve / Reject buttons |
| Approved | `status=verified` | Read-only history — reviewedAt, adminNotes, view document |
| Rejected | `status=rejected` | Read-only history — rejection notes, reviewedAt, view document |

The main admin nav badge count reflects **Pending** only (not approved/rejected totals).

**Admin queue card shows:**
- Employer name + company name
- Document type (human-readable label)
- AI confidence score + status badge
- `aiNotes` (technical AI assessment — admin only)
- Secure signed file URL (15-minute expiry, regenerated on each queue load)
- Verify / Reject buttons with optional admin notes field (Pending section only)
- Timestamp of upload
- On Approved/Rejected sections: `reviewedAt`, `adminNotes`, status badge — no action buttons

---

### Module 8 — Employer-Facing Trust Signals

When `employer_profiles.isVerified = true` or `verificationLevel = 'partially_verified'`, a badge appears on:

**Fully Verified badge (`isVerified = true`):**
- Job postings list and detail pages — "✓ Verified Employer"
- Booking request detail — "✓ Verified Employer" next to company name
- Meeting invitation — "✓ Verified Employer" badge
- Employer's public company profile (if surfaced)

**Partially Verified badge (`verificationLevel = 'partially_verified'`):**
- Same locations — "◐ ID Verified" (smaller, less prominent)

**What freelancers NEVER see:**
- Raw document files or file URLs
- `aiNotes`, `confidence`, or `adminNotes`
- Registration numbers, tax IDs, or any document content
- Which specific documents are verified (only the overall level)

---

### Module 9 — Security and Privacy

All 9 security requirements from the feature brief, mapped to existing patterns:

| Requirement | Implementation |
|---|---|
| Employer-only access to own statuses | `resolveEmployerContext()` — `role = employer` OR (`role = pending` AND `onboardingRole = employer` AND employer profile exists) |
| Admin-only access to raw files | GCS path never returned in employer APIs — signed URL only, admin queue only |
| Signed URLs with 15-min expiry | Same GCS presigned URL generation as freelancer docs |
| Storage paths scoped to employer ID | `uploads/{employerId}/employer-docs/{type}/` |
| Audit on upload, review, admin override | `logAudit()` fire-and-forget on all 3 admin actions + employer upload |
| GDPR deletion | Anonymise `employer_documents` rows + delete GCS files in deletion transaction |
| No registration numbers in public APIs | `GET /api/employer-documents/me` returns status only — never file content |

---

## Plan Gating

Employer verification is available on all employer plans. It is a trust infrastructure feature, not a premium upsell. However the **badge** visibility can be plan-influenced in future — for Phase 1, the badge shows for any verified employer regardless of plan.

| Plan | Can Upload Documents | Badge Shown |
|---|---|---|
| `employer_starter` | ✅ | ✅ (if verified) |
| `employer_growth` | ✅ | ✅ (if verified) |
| `employer_enterprise` | ✅ | ✅ (if verified) |

---

## Non-Goals

- Legal KYC or AML (Anti-Money Laundering) compliance — this is platform trust only
- Third-party verification service integration (Companies House API, Dun & Bradstreet) — Phase 2
- Automatic rejection without admin override — AI result is always overridable
- Blocking employers from posting jobs until verified — verification is encouraged, not gating job creation
- Blocking employer **registration** until Representative ID is uploaded — **in scope** (onboarding gate; see Module 10)
- Freelancer-facing breakdown of which documents are verified (only overall level shown)
- Document versioning history — one row per type, upsert replaces on re-upload
- Team member document uploads — only the account owner uploads business documents
- Automatic expiry tracking for business documents (Phase 2 — follows credential expiry spec pattern)

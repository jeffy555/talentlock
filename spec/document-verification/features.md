# TalentLock — Features Specification: Document Verification

## Overview

TalentLock lists Document Verification as Key Feature #16 in `project.md` — "Freelancers upload ID/credential documents for AI review" — but there is currently zero implementation behind it: no database table, no API route, no UI, and no AI review logic. This is a trust and safety gap. Employers have no way to verify a freelancer is who they say they are before booking them or signing a legal agreement. This feature closes that gap by giving freelancers a structured way to submit identity and credential documents, having them AI-reviewed, and surfacing a Verified badge to employers across the platform.

---

## Feature Modules

### 1. Document Upload (Freelancer)

Freelancers submit up to 3 documents from their Profile page. Each document has a type:

- `government_id` — passport, driving licence, or national ID
- `professional_credential` — degree certificate, professional licence, certification
- `portfolio_proof` — proof of past work (relevant for higher-value bookings)

Each upload:
- Uses the existing GCS presigned URL flow (`POST /api/storage/uploads/request-url`)
- Stores the file URL and metadata in a new `documents` table
- Immediately queues an AI review (OpenAI vision)
- Can be replaced at any time — new upload supersedes the previous one of the same type

---

### 2. AI Document Review

After upload, the server calls OpenAI vision to review the document image/PDF. The AI returns a structured verdict:

- `verified` — document appears genuine, name/details legible, no obvious tampering
- `rejected` — document is illegible, expired, mismatched name, or obviously invalid
- `needs_review` — AI is uncertain; flagged for admin manual review

Review result, confidence score (0–100), and AI notes are stored on the `documents` row. The freelancer is notified of the verdict (via the Notifications Centre once that feature ships; for now, status is visible on their Profile page).

Token usage is logged via the existing `logTokenUsage()` utility with feature label `document_verification`.

---

### 3. Verification Badge (Employer-Facing)

Once a freelancer has at least one document with status `verified`:

- A **Verified** badge (`✓ Verified`) appears on their Talent Vault card (`/freelancers`)
- The badge appears on their freelancer detail page (`/freelancers/:id`)
- The badge appears on their public profile (`/f/:id`)
- Employers can filter the Talent Vault by "Verified only"

The badge is distinct from the existing Lock (booking) badge — it is a trust signal, not a booking status signal.

---

### 4. Document Status Panel (Freelancer Profile)

On the freelancer's `/profile` page, a dedicated "Verification" section shows:

- Each submitted document type with its current status (`pending` / `verified` / `rejected` / `needs_review`)
- The AI review notes (visible to the freelancer so they know why a document was rejected)
- An upload/re-upload button per document type
- Overall verification level: `unverified` (0 verified docs) / `partially_verified` (1 verified) / `fully_verified` (2+ verified)

---

### 5. Admin Review Queue

Documents with status `needs_review` appear in a new "Document Review" tab in the admin console (`/admin`). Admins can:

- View the document image (JPEG, PNG, WebP, or PDF preview)
- Override the AI verdict to `verified` or `rejected`
- Add a note explaining the decision (shown to the freelancer)

**P1 follow-up (2026-07-23):** When AI review fails (common in local dev or when signed URLs are unreachable), admins must still be able to view the uploaded file in the review panel. The admin UI must not rely solely on external signed URLs that the browser cannot fetch — see `plan.md` §Q10.

---

### 6. Employer Document Visibility

On `/freelancers/:id`, employers can see:

- Which document types have been submitted and their status (`verified` / `pending` / `rejected` / `not submitted`)
- The AI review summary (not the actual document image — privacy protection)
- Overall verification level badge

Employers cannot see the raw document files. Only admins can.

---

## Plan Gating

Document upload and verification is available on all freelancer plans:

| Plan | Upload Limit | AI Review |
|---|---|---|
| `freelancer_free` | 3 documents | ✅ |
| `freelancer_pro` | 3 documents | ✅ |

Token usage for AI review is NOT charged against the employer's monthly token quota — it is a platform cost, not a user-facing AI call. The `logTokenUsage()` call uses a system user ID (or null userId) so it doesn't affect any plan limit.

---

## Non-Goals (Out of Scope for This Phase)

- Real-time identity verification via third-party KYC providers (Persona, Onfido, Stripe Identity)
- Biometric liveness checks or selfie matching
- Automatic expiry detection and re-verification reminders
- Document storage encryption at rest beyond what GCS provides by default
- Employer-initiated verification requests ("Please verify your ID before I book you")
- Sharing verified document status across platforms (portable verification)
- Verification required to receive payment (gating payouts on verification)
- More than 3 documents per freelancer in this phase
- Fixing admin preview in a future phase — **now in scope as P1 follow-up** (see `plan.md` §Q10) when AI review queues documents for manual verification

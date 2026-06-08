# TalentLock — Clarification & Verification: Document Verification Feature

This file audits `features.md` against `project.md`, the completed token-consumption feature, and the in-progress ai-enhancements feature to surface gaps, architectural risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| GCS presigned upload URL flow | `POST /api/storage/uploads/request-url` already exists and is in use for portfolio images and signature uploads |
| GCS object serving | `GET /api/storage/objects/*path` already exists |
| OpenAI client available server-side | `lib/integrations-openai-ai-server/` confirmed in `project.md` |
| `logTokenUsage()` utility exists | Completed in token-consumption Phase 2, Task 2.1 |
| `token_usage` table exists | Completed in token-consumption Phase 1 |
| Clerk auth middleware pattern | All existing routes follow `req.auth.userId` → resolve to `users.id` |
| `requireAdmin` middleware | Confirmed — all `/api/admin/` routes use it |
| Admin dashboard tab pattern | Token Usage tab created in token-consumption Phase 4 — same pattern |
| `freelancer_profiles` table exists | Confirmed in `project.md` |
| `users` table has `signatureImageUrl` | Confirmed — same upload pattern reused for document files |
| shadcn/ui, React Query, Wouter routing | Confirmed tech stack |
| OpenAPI → codegen → React Query hooks | Confirmed `lib/api-client-react/` pattern |
| `orval.config.ts` `indexFiles: false` rule | Confirmed — must be preserved after every codegen run |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Document Storage Path Convention

**Question:** Existing GCS uploads follow a path convention for portfolio images and signatures. What path prefix should document uploads use to stay consistent?

**Options:**
- **(A)** `documents/{userId}/{documentType}/{filename}` — namespaced by user and type
- **(B)** `documents/{userId}/{timestamp}-{documentType}` — flat per user, timestamp-prefixed
- **(C)** `user-uploads/{userId}/documents/{documentType}/{filename}` — under existing `user-uploads/` prefix if one exists

**Impact:** Path prefix is passed to `POST /api/storage/uploads/request-url`. Must be confirmed before the upload route is written.

**Recommendation:** Option A — cleanest namespace, easiest to list all documents for a user or by type.

---

### Q2 — Can OpenAI Vision Process PDFs Directly?

**Question:** Some credential documents (degree certificates, professional licences) are PDFs. OpenAI vision accepts image inputs (`image_url` or base64 image). Can it process PDFs natively, or must PDFs be converted to images first?

**Impact:** If PDFs must be converted to images before the AI review call, a server-side PDF-to-image conversion step is required (e.g. using `pdf2pic` or `sharp` with a PDF plugin). This adds complexity to the review pipeline.

**Recommendation:** For this phase, restrict document uploads to image formats only (`image/jpeg`, `image/png`, `image/webp`). PDFs are rejected at the upload validation step with a clear error message. This removes the conversion dependency entirely and can be revisited in Phase 2.

---

### Q3 — How Is the AI Review Triggered?

**Question:** After the freelancer uploads a document, when is the AI review called?

**Options:**
- **(A)** Synchronously — the upload endpoint calls OpenAI before returning the response (blocks the upload response until AI review completes, ~5–15 seconds)
- **(B)** Asynchronously — the upload endpoint returns immediately with `status: 'pending'`, then a background job calls OpenAI
- **(C)** Manually triggered — a separate `POST /api/documents/:id/review` endpoint that the upload endpoint calls fire-and-forget

**Impact:** Option A creates a poor upload UX (long spinner). Option B requires a job queue (not currently in the stack). Option C is a pragmatic middle ground — the upload endpoint saves the document then immediately fires a non-awaited async call to the review function in the same process.

**Recommendation:** Option C — fire-and-forget within the same process. No job queue needed. The review function calls OpenAI, updates the document row, and logs any errors via Pino. The frontend polls `GET /api/documents/me` every 3 seconds while any document is `pending`.

---

### Q4 — Token Logging: System User vs No userId

**Question:** `features.md` states AI review tokens are a platform cost, not charged to any user's monthly quota. `logTokenUsage()` currently requires a `userId`. Should this call use:

- **(A)** A reserved system user ID (a fixed string like `'system'` or `'platform'`) stored as a constant
- **(B)** The freelancer's `userId` but with a flag that exempts it from quota checks
- **(C)** Skip `logTokenUsage()` entirely for document verification — just log via Pino

**Impact:** Option A keeps all AI usage in one table, useful for platform cost analysis in the admin console. Option C loses visibility into how much document verification is costing in tokens.

**Recommendation:** Option A — use a `SYSTEM_USER_ID = 'system'` constant. Update `logTokenUsage()` to accept `userId: string | 'system'`. The `checkTokenQuota()` function already short-circuits when `userId` is not an employer — add a check: if `userId === 'system'`, skip quota entirely.

---

### Q5 — Maximum File Size

**Question:** What is the maximum allowed file size per document upload?

**Impact:** The presigned URL request must include a content-length constraint. The frontend must validate before uploading. OpenAI vision has a 20MB limit per image.

**Recommendation:** 10MB per document. Enforces a reasonable limit well within OpenAI's constraint, prevents abuse of GCS storage, and covers high-resolution passport scans.

---

### Q6 — What Happens When a Freelancer Re-uploads a Document?

**Question:** `features.md` states "new upload supersedes the previous one of the same type." When a re-upload happens:

- **(A)** Hard delete the old document row and GCS file, insert a new row
- **(B)** Soft delete (set `deletedAt` on the old row), insert a new row — preserves audit history
- **(C)** Update the existing row in place (overwrite `fileUrl`, reset `status` to `pending`, clear AI notes)

**Impact:** Option A loses audit history. Option C is simplest but means there's always exactly one row per freelancer per document type.

**Recommendation:** Option C — update in place. One row per `(freelancerId, documentType)` enforced by a unique constraint. Simpler queries, simpler UI, sufficient for this phase. Add `updatedAt` column for audit trail.

---

### Q7 — Employer Document Visibility: Which Statuses Are Shown?

**Question:** On `/freelancers/:id`, employers see document status. Should they see:
- **(A)** Only `verified` documents (positive signal only — "2 documents verified")
- **(B)** All statuses including `rejected` and `needs_review` (full transparency)
- **(C)** Verified count + "unverified" for anything else (collapsed negative signal)

**Impact:** Showing `rejected` to employers could unfairly penalise a freelancer whose document was rejected for a correctable reason (e.g. image too dark). Option A is safest for freelancer experience.

**Recommendation:** Option A — employers see only verified documents and overall verification level. The detailed per-document status (including rejection reasons) is only visible to the freelancer on their own Profile page and to admins.

---

### Q8 — Talent Vault "Verified Only" Filter

**Question:** The Verified filter on `/freelancers` needs a backend query change. The existing `GET /api/freelancers` endpoint accepts filter params. Should the verified filter be:
- **(A)** `?verified=true` — returns only freelancers with at least 1 verified document
- **(B)** `?verificationLevel=fully_verified` — matches the verification level enum from `features.md`
- **(C)** `?minVerifiedDocs=1` — numeric minimum

**Recommendation:** Option A — `?verified=true` is the simplest, most intuitive filter param. Internally maps to: "has at least one document row with `status = 'verified'`".

---

### Q9 — `needs_review` Admin Flow: Email Notification?

**Question:** When a document is flagged `needs_review`, should the admin receive:
- **(A)** No notification — admin checks the queue tab periodically
- **(B)** An email to a configured admin address
- **(C)** An in-app notification (requires Notifications Centre feature to be built first)

**Impact:** Option B requires an email provider (not currently in the stack). Option C depends on a future feature.

**Recommendation:** Option A — no notification for this phase. The admin queue tab shows an unread count badge on the tab label showing how many items are pending review. Email/push notifications deferred to when the Notifications Centre is built.

---

## ⚠️ Risks & Notes

### Risk 1 — OpenAI Vision Accuracy on Identity Documents

OpenAI vision is not a KYC service. It can detect obvious issues (blank image, clearly fake, illegible) but cannot perform cryptographic verification or liveness checks. The AI verdict should be treated as a first-pass filter, not a legal guarantee. This must be clearly communicated to employers in the UI: "Document reviewed by AI — not a legal identity verification."

### Risk 2 — GCS File Privacy

Document files (government IDs, credentials) are sensitive. The GCS bucket must NOT serve these files publicly. Unlike portfolio images which can be public, document files must only be accessible via signed URLs with short TTL (e.g. 15 minutes), generated server-side on demand for admin review. The frontend never receives a direct GCS public URL for documents.

### Risk 3 — Fire-and-Forget Error Handling

If the AI review call fails (OpenAI timeout, rate limit), the document stays `pending` indefinitely. A safety net is needed: a scheduled check (or a retry on next GET /api/documents/me request) that moves documents stuck in `pending` for more than 10 minutes to `needs_review` so an admin can manually review them.

### Risk 4 — Unique Constraint Race Condition

The unique constraint on `(freelancerId, documentType)` combined with an upsert (update-in-place) must use Drizzle's `onConflictDoUpdate` to be atomic. A non-atomic check-then-update would create a race condition if the freelancer submits two uploads in quick succession.

### Risk 5 — `orval.config.ts` / `index.ts` Export Rules

After adding new document endpoints to `lib/api-spec/openapi.yaml` and running codegen:
- `lib/api-zod/orval.config.ts` must keep `indexFiles: false`
- `lib/api-zod/src/index.ts` must only export `./generated/api`
- Run `pnpm typecheck` before proceeding to Phase 3

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | GCS path prefix convention | Task 2.1 (upload endpoint) |
| Q2 | PDF support or image-only restriction | Task 2.1 (upload validation) |
| Q3 | Sync vs async vs fire-and-forget review trigger | Task 2.2 (review pipeline) |
| Q4 | System user ID for token logging | Task 2.2 (logTokenUsage call) |
| Q5 | Maximum file size | Task 2.1 (presigned URL request) |
| Q6 | Re-upload behaviour | Task 1.1 (schema unique constraint) |

Questions Q7, Q8, Q9 are lower priority and can be resolved during implementation.

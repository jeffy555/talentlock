# TalentLock — Clarification & Verification: Credential Expiry Tracking

---

## Verified — Consistent with Existing Architecture

| Item | Verified Against |
|------|------------------|
| `documents` table exists with `status: pending\|verified\|rejected\|needs_review` | `lib/db/src/schema/documents.ts` |
| `documentType`: `government_id` \| `professional_credential` | `documentConstants.ts` |
| `updateVerificationLevel()` recalculates badge purely from count of `status = 'verified'` rows | `documentReview.ts` |
| `freelancer_profiles.teachingLicenceExpiry` exists (education professionals) | `freelancerProfiles.ts` |
| `REQUIRED_DOCUMENTS_BY_EDUCATION_TYPE` — teaching licence required for `school_teacher` | `teachingProfileTypes.ts` |
| `createNotification()` + `sendNotificationEmail()` fire-and-forget infra | `createNotification.ts`, `emailService.ts` |
| Talent Vault gate today is only `completenessScore >= 60` | `routes/freelancers.ts` |
| No cron/scheduler infrastructure exists anywhere in the repo | grep across `artifacts/api-server/src` |
| Deployment target is Replit **autoscale** — instances idle/scale, not a persistent long-running process | `.replit` |
| Nightly scheduled GitHub Actions workflow pattern already exists (`test.yml`, `schedule: cron`) | `.github/workflows/test.yml` |
| Admin routes use header/secret-style guards elsewhere (CSRF double-submit) | `csrf.ts` |

---

## Resolved Questions (decisions carried into `plan.md`)

### Q1 — What counts as a "credential" with expiry?

**Decision:** Two independent sources, tracked separately:
1. `documents.expiryDate` (new column) — freelancer-supplied, for `professional_credential` uploads.
2. `freelancer_profiles.teachingLicenceExpiry` (existing column) — education professionals only.

DBS expiry is explicitly out of scope (no date field exists; see Non-Goals).

### Q2 — How does the daily job run without persistent infra?

**Decision:** Secret-protected endpoint `POST /api/admin/cron/credential-expiry`, guarded by a shared-secret header (`X-Cron-Secret` matching `CRON_SECRET` env var — not the Clerk-based admin session, since this is a machine-to-machine call). Idempotent — safe to call multiple times a day. Triggered by a new scheduled GitHub Actions workflow, mirroring the existing nightly test cron.

### Q3 — Does Vault removal apply to every expired document, or only required ones?

**Decision:** Vault removal applies **only** when `professionCategory === 'education' && educationProfessionType === 'school_teacher' && teachingLicenceExpiry < now()`. Generic `professional_credential` expiry never removes a freelancer from Vault — it only downgrades the verification badge via the existing `updateVerificationLevel()` and fires alerts. This avoids a breaking behavioural change for the general (technology) freelancer population, where verification has never gated Vault visibility.

### Q4 — Avoiding duplicate/missed alerts

**Decision:** Add an `expiryAlertStage` tracking column per credential source (`documents.expiryAlertStage`, `freelancer_profiles.teachingLicenceAlertStage`), each an enum-like text: `none | 90d | 30d | 7d | expired`. The daily job computes the correct target stage from days-remaining and only fires alerts / mutates state when the stage **advances** — never re-fires a stage already reached, and safely catches up if a day was missed (e.g. stage jumps straight from `none` to `7d` if the job didn't run for a while).

### Q5 — Which document types get expiry tracking?

**Decision:** `expiryDate` is accepted for both `government_id` and `professional_credential` (some government IDs also expire), but the alert copy is generic ("credential") — no special-casing per type needed for Sprint 1.

### Q6 — What happens to `isAvailable` / booking state on Vault removal?

**Decision:** Nothing. Vault removal for expired-licence school teachers only affects `GET /api/freelancers` list visibility (an additional `WHERE` condition), exactly like the existing `completenessScore >= 60` gate. `isAvailable`, active bookings, and direct profile access (`GET /api/freelancers/:id`, `/f/:id`) are unaffected — an employer with an existing booking is never blocked from viewing or continuing an engagement with that freelancer.

---

## Risks & Notes

### Risk 1 — Cron endpoint must not be discoverable/guessable

`CRON_SECRET` must be a long random value (`openssl rand -hex 32`), compared with a constant-time check, and the endpoint must return the same 401 shape whether the secret is missing or wrong (no timing/enumeration signal).

### Risk 2 — `documents.status = 'expired'` is a new status value

Every place that reads `documents.status` (list logic, `countVerifiedDocuments`, admin queue filters, `VerificationSection.tsx` UI) must tolerate an unrecognised status gracefully. Confirmed: `updateVerificationLevel()` only checks `=== 'verified'`, so `expired` is automatically excluded — no code change needed there. The freelancer-facing `GET /documents/me` and `VerificationSection.tsx` need an explicit `expired` render state so it isn't confused with `pending`.

### Risk 3 — `expiryAlertStage` must reset on re-upload

When a freelancer re-uploads a `professional_credential` (existing upsert path in `POST /documents/confirm`), the new document effectively replaces the old one (same `documentType`, same row via `ON CONFLICT`). `expiryAlertStage` and `expiryDate` must be reset to `none`/`null` on that upsert, otherwise a renewed credential could inherit a stale `expired` stage and immediately re-trigger a false expiry notification cycle.

### Risk 4 — Teaching licence renewal must reset the alert stage

`teachingLicenceAlertStage` must reset to `none` whenever `PATCH /api/freelancers/me` changes `teachingLicenceExpiry` to a new (later) date — otherwise a renewed licence stays stuck at `expired` stage and the freelancer remains excluded from Vault despite renewing.

### Risk 5 — Email/notification suppression parity

Reuse `sendNotificationEmail()`'s existing opt-out check (`emailNotificationsEnabled`) — do not build a second suppression mechanism.

---

## Summary of Blockers

| ID | Blocker | Gates |
|----|---------|-------|
| Q1 | Two-source scope | Phase 1 schema |
| Q2 | Cron trigger mechanism | Phase 2 route + Phase 3 workflow |
| Q3 | Vault removal scope | Phase 2 `GET /freelancers` query |
| Q4 | Alert stage tracking | Phase 1 schema + Phase 2 job logic |

All resolved above; no open blockers remain for `task.md`.

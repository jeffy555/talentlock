# TalentLock — Features Specification: Credential Expiry Tracking

## Overview

Freelancers upload identity/credential documents (`documents` table: `government_id`, `professional_credential`) and, for education professionals, a teaching licence with a known expiry date (`freelancer_profiles.teachingLicenceExpiry`). Today nothing tracks these expiry dates — a verified credential stays "verified" forever even after it lapses, and neither the freelancer nor the employer viewing their profile is ever told a credential has expired.

**Credential Expiry Tracking** adds a daily scan that alerts freelancers as their credentials approach expiry (90/30/7 days out), visibly degrades the verification badge on the expiry day, and — for the one credential type that is already documented as *required* (teaching licence for `school_teacher` education professionals) — removes the freelancer from Talent Vault search results until they upload a renewed licence.

Low effort, Sprint 1. Applies to all plans. No token consumption (no AI involved).

---

## Feature Modules

### Module 1 — Expiry Date Capture

- New nullable `expiryDate` field on `documents` (freelancer-supplied at upload time for `professional_credential`; optional for `government_id`).
- Existing `freelancer_profiles.teachingLicenceExpiry` (education professionals) is reused as-is — no new capture UI needed, already collected in onboarding/profile.

### Module 2 — Daily Expiry Scan

A secret-protected endpoint (`POST /api/admin/cron/credential-expiry`) that an external scheduler calls once daily. It scans both expiry sources and, per credential, advances a **stage** (`none → 90d → 30d → 7d → expired`) based on days remaining. The stage only ever moves forward — safe to call more than once a day, and safe if a day is missed.

External trigger: a scheduled GitHub Actions workflow (same pattern as the existing nightly integration-test cron) POSTs to the endpoint daily with a shared secret header. This avoids relying on an always-on process, since the API runs on an autoscale deployment target that may idle.

### Module 3 — Alert Schedule

| Days remaining | Action |
|---|---|
| ≤ 90 | Email to freelancer: "Your credential expires in ~90 days" |
| ≤ 30 | Email + in-app notification; amber banner appears on the freelancer's own profile page |
| ≤ 7 | In-app notification (urgent); red banner on profile; "Expiring Soon" badge appears on the freelancer's Talent Vault card |
| ≤ 0 (expiry day) | `documents.status` for the credential flips to `expired` (existing `updateVerificationLevel()` recalculates the verification badge automatically since it only counts `status = 'verified'`); for teaching licences, `dbsCheckStatus`-style downgrade is not applicable — the licence itself is flagged expired |

### Module 4 — Verification Badge Degradation

No new badge component logic needed — `updateVerificationLevel()` (existing, `documentReview.ts`) already derives `verificationLevel`/`isVerified` purely from the count of `documents.status = 'verified'` rows. Flipping an expired document's status to `expired` and re-running this function is sufficient to downgrade `fully_verified → partially_verified → unverified` automatically.

### Module 5 — Talent Vault Removal (Scoped)

Removal from Talent Vault search results (`GET /api/freelancers`) applies **only** to education professionals whose `educationProfessionType` requires a teaching licence (`school_teacher`) and whose `teachingLicenceExpiry` has passed. This is the one credential already documented as *required* per `REQUIRED_DOCUMENTS_BY_EDUCATION_TYPE`. Generic `professional_credential` expiry does **not** remove a freelancer from Vault — it only degrades their verification badge and fires alerts, preserving today's behaviour where verification has never gated Vault visibility for the general freelancer population.

### Module 6 — Vault "Expiring Soon" Indicator

`GET /api/freelancers` list response gains an optional `expiringCredential: { daysRemaining: number } | null` field, populated when any tracked credential (document or teaching licence) for that freelancer is within 7 days of expiry (or already expired, for non-Vault-gating credentials). The Talent Vault card renders an amber "Expiring Soon" badge when present.

---

## Non-Goals

- New document types or the full "Teaching Credential Verification" document upload flow (degree/DBS/licence document types) — that is a separate, larger roadmap feature (Sprint 3, Feature 16)
- DBS check expiry tracking — `dbsCheckStatus` has no expiry **date** field today; adding one is out of scope for this low-effort pass
- Renewal upload UX beyond the existing "re-upload a document" flow already supported by `POST /api/documents/confirm` (upsert)
- Employer document (`employer_documents`) expiry tracking — separate table, separate concern, not in this spec
- AI-based expiry date extraction from uploaded documents — `expiryDate` is freelancer-entered, not AI-inferred
- Grace periods, appeals, or manual admin override of expiry — admin can already re-verify a re-uploaded document through the existing document review flow
- Push notifications or SMS — email + in-app notification only, matching existing notification infrastructure
- Removing education professionals other than `school_teacher` from Vault — `university_lecturer`, `tutor`, `researcher` have no *required* document with a tracked expiry date today

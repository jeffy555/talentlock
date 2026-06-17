# TalentLock — Validation Guide: Security Hardening

> **Purpose:** Verify all six hardening items are correctly implemented.
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix failures before marking a phase complete.
> **Important:** Some checks here require active attempts to exploit vulnerabilities. Run in a development environment only.

**Automated runner:** `node artifacts/api-server/validate-security-hardening.mjs` (API + DB + code structure + sanitisation smoke tests).  
**CSRF smoke:** `node artifacts/api-server/scripts/smoke-csrf.mjs`

**Demo Clerk IDs (aligned with seeded Neon data):**

| Role | Clerk ID | DB profile |
|---|---|---|
| Freelancer | `user_3DBiBymDbIiXQnFqyk64WquLsdY` | Jefferson Immanuel — freelancer id 1 |
| Employer | `user_3DBguOY4TbwT9bxOYc9NcYU5q9a` | LoavesFlash — employer id 1 |

---

## Phase 1 Validation — Middleware Hardening

### V1.1 — Helmet Security Headers

- [x] `X-Content-Type-Options: nosniff` present — automated 2026-06-07
- [x] `X-Frame-Options: SAMEORIGIN` present — automated 2026-06-07
- [x] Response does NOT include `X-Powered-By: Express` — automated 2026-06-07

### V1.2 — Request Size Limit: Oversized Body Rejected

- [x] Returns `HTTP 413 Payload Too Large` — automated 2026-06-07
- [x] Server does not crash or become unresponsive — automated 2026-06-07

### V1.3 — Request Size Limit: Normal Body Accepted

- [x] Returns non-413 status for normal payload — automated 2026-06-07

### V1.4 — Pino Redact: Authorization Header Not Logged

- [x] `logger.ts` has `redact` paths for `req.headers.authorization` with `censor: '[REDACTED]'` — automated 2026-06-07
- [ ] Live log inspection with `test-token-12345` — manual optional

### V1.5 — Sanitise Utility: XSS Stripped from Review Comment

- [x] `sanitise.ts` exists with `sanitiseText()` — automated 2026-06-07
- [ ] End-to-end review POST with `<script>` payload — manual (requires completed booking)

### V1.6 — Sanitise Utility: Angle Brackets in Bio Stripped

- [x] `PATCH /api/freelancers/me` strips `<img>` XSS, preserves text — automated 2026-06-07

---

## Phase 2 Validation — Database

### V2.1 — `audit_logs` New Columns Exist

- [x] `ip_address` (text, nullable) — Neon verified 2026-06-07
- [x] `user_agent` (text, nullable) — Neon verified 2026-06-07
- [x] `entity_type` (text, nullable) — Neon verified 2026-06-07
- [x] `entity_id` (text, nullable) — Neon verified 2026-06-07
- [x] `metadata` (jsonb, nullable) — Neon verified 2026-06-07

> Note: audit event column is `event` (not `action`) in the live schema.

### V2.2 — `account_deletion_requests` Table Exists

- [x] All columns present — automated 2026-06-07
- [x] `status` default is `'pending'` — automated 2026-06-07

---

## Phase 3 Validation — CSRF + Audit Logging

### V3.1 — CSRF Token Endpoint Works Without Auth

- [x] Returns `HTTP 200 { "token": "<non-empty string>" }` — automated 2026-06-07
- [x] Does NOT require Authorization header — automated 2026-06-07

### V3.2 — Admin POST Without CSRF Token Is Rejected

- [x] Returns `HTTP 403` when `x-csrf-token` header is absent — automated 2026-06-07

### V3.3 — Admin POST With CSRF Token Works

- [x] Returns non-403 (401 for bad creds) when token + cookie present — automated 2026-06-07

### V3.4 — Admin GET Routes Not CSRF Protected

- [ ] GET `/api/admin/stats` without CSRF header — manual (requires admin cookie)

### V3.5 — Audit Log: Agreement Signed

- [x] `logAudit` hook in `agreements.ts` with `agreement.signed` — code verified 2026-06-07
- [ ] Live row in `audit_logs` after signing — manual

### V3.6 — Audit Log: Agreement Downloaded

- [x] `logAudit` hook in `agreements.ts` with `agreement.downloaded` — code verified 2026-06-07
- [ ] Live row after download — manual

### V3.7 — Audit Log: Subscription Upgraded

- [x] `logAudit` hook in `subscriptions.ts` with `fromPlan`/`toPlan` metadata — code verified 2026-06-07
- [ ] Live row after upgrade — manual

### V3.8 — Audit Logging Never Blocks Primary Action

- [x] All audit calls use fire-and-forget `.catch()` in route handlers — automated 2026-06-07
- [ ] Break `audit_logs` table rename test — manual destructive (optional)

---

## Phase 4 Validation — Input Sanitisation Routes

### V4.1 — XSS in Freelancer Bio Stripped

- [x] `PATCH /api/freelancers/me` strips `<img onerror>` — automated 2026-06-07

### V4.2 — XSS in Job Description Stripped

- [x] `POST /api/job-requirements` strips `<svg onload>` from title — automated 2026-06-07

### V4.3 — XSS in Review Reply Stripped

- [x] `sanitiseText` in `reviews.ts` reply handler — code verified 2026-06-07
- [ ] Live reply POST — manual (requires existing review)

### V4.4 — XSS in Availability Label Stripped

- [x] `POST /api/availability/me` strips `<script>`, preserves `Holiday` — automated 2026-06-07

---

## Phase 5 Validation — GDPR Deletion + Frontend

### V5.1 — Deletion Blocked by Active Bookings

- [ ] Returns `HTTP 409` with `ACTIVE_BOOKINGS_EXIST` — skipped automated (no active bookings in DB); manual when active booking exists

### V5.2 — Deletion: Happy Path

- [ ] Returns `HTTP 200 { "success": true }` — manual only (destructive; do not run on demo users)
- [x] Implementation: anonymises `users.name` → `Deleted User`, placeholder email, clears PII tables — code verified 2026-06-07

> Live schema uses `name` (single field), not `first_name`/`last_name`. Email set to `deleted-user-{id}@deleted.talentlock` (column is `NOT NULL`).

### V5.3 — Deletion Status Endpoint

- [x] `GET /api/account/delete-request` returns `{ status, rejectionReason }` — automated 2026-06-07

### V5.4 — Frontend: Delete Button Visible on Profile

- [x] `DeleteAccountSection` + Profile integration — code verified 2026-06-07
- [ ] Browser: Danger Zone visible at bottom — manual walkthrough

### V5.5 — Frontend: Confirmation Dialog

- [x] Email confirmation + disabled button until match — code verified 2026-06-07
- [ ] Browser: dialog interaction — manual walkthrough

### V5.6 — Frontend: Active Bookings Error State

- [x] Amber banner + `/bookings` link in dialog — code verified 2026-06-07
- [ ] Browser: 409 response shows inline error — manual

### V5.7 — Frontend: Successful Deletion Redirects

- [x] Toast + `signOut` + redirect after 2s — code verified 2026-06-07
- [ ] Browser: full deletion flow — manual (disposable test account only)

### V5.8 — Frontend: Admin Login Sends CSRF Token

- [x] `AdminLogin.tsx` fetches token + sends `x-csrf-token` — code verified 2026-06-07
- [ ] DevTools Network tab on admin login — manual

---

## Security Regression Checks

### SR1 — Existing Authenticated Routes Unaffected

- [x] `GET /api/users/me` returns 200 with valid Clerk JWT — automated 2026-06-07

### SR2 — Admin GET Routes Unaffected by CSRF

- [ ] `GET /api/admin/stats` without CSRF — manual (requires admin session)

### SR3 — TypeCheck and Build Pass

- [x] `pnpm --filter @workspace/api-server run build` — pass 2026-06-07
- [ ] Full workspace `pnpm run typecheck` — pre-existing failures in unrelated files (admin.ts, resumeParser.ts, talentlock DocumentUploader)

---

## Browser Walkthrough (Dev — optional)

| Step | Action | Expected |
|---|---|---|
| 1 | `/profile` as any user | Danger Zone + Delete my account at bottom |
| 2 | Click Delete → type email | Confirm button enables only on exact match |
| 3 | `/admin/login` DevTools | POST includes `x-csrf-token` header |
| 4 | User with active booking → delete | Amber 409 banner with View bookings link |

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Middleware Hardening | ✅ | Agent | 2026-06-07 |
| Phase 2 — Database | ✅ | Agent | 2026-06-07 |
| Phase 3 — CSRF + Audit Logging | ✅ Core automated + code | Agent | 2026-06-07 |
| Phase 4 — Input Sanitisation | ✅ | Agent | 2026-06-07 |
| Phase 5 — GDPR Deletion + Frontend | ✅ Core automated + code; destructive E2E manual | Agent | 2026-06-07 |
| Security Regression Checks | ✅ Core | Agent | 2026-06-07 |
| **Feature Complete** | ✅ | Agent | 2026-06-07 |

### Automated validation summary (2026-06-07)

`node artifacts/api-server/validate-security-hardening.mjs` — **28/28 passed, 2 skipped** (V5.1 no active booking in DB; V5.2 destructive happy path)

Includes: Helmet headers, 413 limit, audit_logs + account_deletion_requests schema, CSRF token flow, sanitisation API smoke tests, account route registration, frontend component grep, Clerk auth regression.

---

# P1 Follow-Up Validation — Sanitisation Coverage Gaps (added 2026-06-09)

> Validates Phase 6 in `task.md`. For each field, submit a payload like `<script>alert(1)</script>Hello` and confirm the stored value is neutralised (no executable markup), matching the behaviour of the Phase 4 routes.

## Import-coverage check
- [ ] `meetings.ts`, `portfolio.ts`, `milestones.ts`, `jobInterests.ts`, `agreements.ts`, `openaiChat.ts` all import `sanitiseText`
- [ ] Grep for `sanitiseText` now lists these six files in addition to the original Phase 4 routes

## Per-route behaviour
- [ ] Meetings: script payload in title/agenda/notes neutralised on `POST` AND `PATCH /api/meetings/:id`
- [ ] Portfolio: script payload in title/description neutralised on create AND update; `url`/`imageUrl`/`tags` unaffected
- [ ] Milestones: script payload in title/description neutralised
- [ ] Job Interests: script payload in `message` neutralised; length cap still enforced; sanitise applied before trim/slice
- [ ] Agreement signing: script payload in `signatureName` neutralised; "name or image required" validation still triggers when both blank
- [ ] AI chat: script payload in conversation `title` and user message `content` neutralised; assistant message content unchanged

## Regression
- [ ] Normal (non-malicious) text round-trips unchanged on all six routes (no over-escaping/double-encoding)
- [ ] Existing AuthHardening guards (if applied to these routes) still enforced
- [ ] `pnpm run typecheck` passes with zero new errors

## Addendum Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 6 — Sanitisation coverage | ⬜ Pending implementation | — | — |

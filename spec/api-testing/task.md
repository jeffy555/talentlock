# TalentLock — Task: Automated Test Inventory

> Branch: `cursor/regression-tests-9a23` (Regression)
> Status: Phase 0 scaffold committed; Phases 1–6 below are the full test backlog.

---

## Phase 0 — Test harness (foundation)

### 0.1 Tooling & scripts

- [x] Add Vitest + Supertest to `@workspace/api-server`
- [x] `pnpm run test:unit` — `vitest run tests/unit`
- [x] `pnpm run test:integration` — `vitest run tests/integration` (requires `.env.test`)
- [x] `pnpm run test:watch` — local dev loop
- [x] `pnpm run test:validate` — runs `scripts/test-regression.mjs` (legacy bridge)
- [x] Root `pnpm run test` — unit + integration (integration skipped in CI if secrets missing)

### 0.2 Shared helpers (`tests/helpers/`)

| Helper | Purpose | Status |
|--------|---------|--------|
| `env.ts` | Load `.env.test`; fail if prod DB URL | ✅ |
| `apiClient.ts` | Supertest wrapper + auth headers | ✅ |
| `db.ts` | Pool, fixture loaders | ✅ |
| `adminSession.ts` | Admin login + CSRF | ✅ |
| `openaiMock.ts` | Vitest mock for OpenAI | ⬜ Phase 4 |
| `assert402.ts` | Assert `{ error, code, planNeeded }` shape | ✅ |

### 0.3 Initial unit tests (committed in Phase 0)

| File | Cases |
|------|-------|
| `tests/unit/sanitise.test.ts` | `sanitiseText` strips HTML; `sanitiseRichText` allows safe tags |
| `tests/unit/completenessUtils.test.ts` | Score 0–100; missing fields; ≥60 gate |
| `tests/unit/paginationUtils.test.ts` | Page bounds, totalPages math |
| `tests/unit/plans.test.ts` | All 5 plan IDs exist; limits match `project.md` |
| `tests/unit/subscriptionGating.test.ts` | `aggregateTokenUsageRows`, `getUtcTokenResetDate` |
| `tests/unit/searchUtils.test.ts` | `sanitiseSearchQuery` injection-safe |
| `tests/unit/skillsUtils.test.ts` | Normalisation / dedup |
| `tests/unit/rateFormatUtils.test.ts` | Frontend `formatRate` / `rateUnitLabel` (move to talentlock package) |

---

## Phase 1 — Auth, security & access control

**Source specs:** `AuthHardening/validation.md`, `SecurityHardening/validation.md`  
**Legacy script to port:** `artifacts/api-server/validate-auth-hardening.mjs`, `validate-security-hardening.mjs`

### 1.1 Middleware & headers (`tests/integration/security/middleware.test.ts`)

- [ ] `GET /api/healthz` → 200
- [ ] Response includes `X-Content-Type-Options: nosniff`
- [ ] Response includes `X-Frame-Options`
- [ ] `X-Powered-By` absent
- [ ] JSON body limit >1MB → 413
- [ ] CORS: allowed origin passes; unknown origin blocked in production mode

### 1.2 Access control exports (`tests/unit/accessControl.test.ts`)

- [ ] All exports present: `resolveUserByClerkId`, `canAccessBooking`, `canAccessMeeting`, `canAccessJobRequirement`, `canAccessConversation`, `canAccessAgreement`, `agreementRoleForUser`

### 1.3 IDOR guards (`tests/integration/auth/idor.test.ts`)

| Route | No auth | Wrong user | Participant |
|-------|---------|------------|-------------|
| `GET /bookings/:id` | 401 | 403 | 200 |
| `PATCH /bookings/:id` | 401 | 403 | 200 |
| `GET /meetings/:id` | 401 | 403 | 200 |
| `PATCH /meetings/:id` | 401 | 403 | 200 |
| `GET /agreements/:id` | 401 | 403 | 200 |
| `POST /agreements/:id/sign` | 401 | 403 | 200/4xx |
| `GET /agreements/:id/download` | 401 | 403 | 200 when fully_signed |
| `GET/PATCH /job-requirements/:id` | 401 | 403 owner | 200 owner |
| `GET/DELETE /openai/conversations/:id` | 401 | 403 | 200 owner |
| `POST /openai/conversations/:id/messages` | 401 | 403 | 200 |
| `GET /conversations/:id/messages` | 401 | 403 non-participant | 200 |
| `POST /storage/uploads/request-url` | 401 | 403 wrong namespace | 200 own userId |

### 1.4 Admin auth & CSRF (`tests/integration/admin/auth.test.ts`)

- [ ] `POST /admin/login` wrong password → 401
- [ ] `POST /admin/login` rate limit after N failures
- [ ] `GET /admin/csrf-token` returns token
- [ ] Admin POST without CSRF → 403
- [ ] Admin POST with valid CSRF cookie + header → 200
- [ ] `POST /admin/logout` clears session

### 1.5 Input sanitisation (`tests/integration/security/sanitisation.test.ts`)

- [ ] Profile bio with `<script>` stored stripped
- [ ] Review comment HTML stripped
- [ ] Booking message HTML stripped
- [ ] Job description HTML stripped on PATCH

### 1.6 GDPR deletion (`tests/integration/account/deletion.test.ts`)

- [ ] `POST /account/delete-request` blocked when active booking exists
- [ ] Pending request returns status on `GET`
- [ ] Messages anonymised to `[Message removed]` after deletion job
- [ ] PII fields nulled on users/profiles

---

## Phase 2 — Core marketplace API

### 2.1 Users & onboarding (`tests/integration/users/`)

- [ ] `GET /users/me` unauthenticated → 401
- [ ] New Clerk user → 404 (drives onboarding)
- [ ] `PUT /users/me` updates display fields
- [ ] `PUT /users/me/signature` save + clear URL
- [ ] `PATCH /users/me/notification-preferences` toggles email flag

### 2.2 Freelancers & Talent Vault (`tests/integration/freelancers/`)

- [ ] `GET /freelancers` public list; completeness ≥60% only
- [ ] Filters: `?q=`, `?availableFrom=`, `?professionCategory=`, `?teachingSubject=`
- [ ] `GET /freelancers/:id` includes `nextAvailableDate`, ratings
- [ ] `PUT /freelancers/me` recalculates `completenessScore` atomically
- [ ] Profile &lt;60% excluded from vault list after update
- [ ] `GET /public/freelancers/:id` no auth required
- [ ] Saved freelancers: POST save, GET list, DELETE unsave
- [ ] Portfolio CRUD + public list on profile

**Legacy:** `lib/db/scripts/validate-product-gaps.mjs`, `validate-product-gaps-utils.mjs`

### 2.3 Employers (`tests/integration/employers/`)

- [ ] `GET/PUT /employers/me` employer-only (403 freelancer)
- [ ] Verification level fields returned; `aiNotes` never in response

### 2.4 Jobs & interests (`tests/integration/jobs/`)

- [ ] CRUD job requirements; employer ownership enforced
- [ ] `POST .../interest` enforces monthly express-interest quota (402)
- [ ] `GET .../my-interest` returns current user's interest
- [ ] Job delete blocked when active bookings exist (409)

### 2.5 Bookings & negotiation (`tests/integration/bookings/`)

- [ ] Paginated `GET /bookings` shape `{ data, total, page, pageSize, totalPages }`
- [ ] Create booking with optional `message` (max 500)
- [ ] Active booking quota → 402 `PLAN_LIMIT`
- [ ] Rate negotiation: propose → counter → accept flow
- [ ] Agreement generation blocked until rates agreed
- [ ] Milestones: create, PATCH status, DELETE
- [ ] `FREELANCER_UNAVAILABLE` when freelancer locked (409)
- [ ] Availability block created only when booking becomes **active** (signed agreement path)

**Legacy:** `validate-resend-booking-email.mjs`, `validate-notification-scenario.mjs`

### 2.6 Meetings (`tests/integration/meetings/`)

- [ ] CRUD meetings; participant access only
- [ ] Confirm meeting triggers brief generation (mock OpenAI); poll until `briefGeneratedAt`
- [ ] `POST /meetings/:id/brief` → 202; employer-only; confirmed-only

**Legacy:** `spec/aimeetingdebrief/validation.md` checks

### 2.7 Agreements (`tests/integration/agreements/`)

- [ ] Generate agreement (mock AI); sign both parties
- [ ] `GET .../download` 403 when not `fully_signed`
- [ ] PDF cached after first download (mock GCS)
- [ ] Redline suggest + accept clears health/summary cache
- [ ] Health score POST caches on row
- [ ] Summarise POST 403 for employer; 200 freelancer

**Legacy:** `scripts/validate-agreement-redlining.mjs`, `validate-contract-health-score.mjs`, `validate-agreement-ai-summary.mjs`, `scripts/test-agreement-pdf-download.mjs`

### 2.8 Reviews (`tests/integration/reviews/`)

- [ ] POST review only on completed booking; one per booking
- [ ] Freelancer reply once
- [ ] Public `GET /reviews/freelancer/:id`
- [ ] Average rating updated on profile

**Legacy:** `scripts/verify-reviews-*.mjs` (phase1–4, all)

### 2.9 Availability (`tests/integration/availability/`)

- [ ] Public `GET /availability/:freelancerId` before `/me` route ordering
- [ ] Freelancer manual block create/delete
- [ ] Delete manual block → 409 if auto-created from booking
- [ ] `nextAvailableDate` refreshed after block changes

**Legacy:** `validate-availability-calendar.mjs`

---

## Phase 3 — Billing, quotas & tokens

### 3.1 Subscriptions (`tests/integration/subscriptions/`)

- [ ] `GET /subscriptions/plans` lists 5 plans
- [ ] `GET /subscriptions/me` current plan + usage counts
- [ ] `POST /subscriptions/upgrade` simulated upsert
- [ ] Wrong-audience plan rejected

### 3.2 Quota enforcement (`tests/integration/quotas/`)

- [ ] Job posts/month → 402 at limit
- [ ] Active bookings → 402 at limit
- [ ] Express interests → 402 at limit
- [ ] Token usage → 402 `TOKEN_LIMIT` with `{ error, code, planNeeded }`
- [ ] Quota checks use transaction + `FOR UPDATE` (concurrent double-post test)

### 3.3 Token usage (`tests/integration/token-usage/`)

- [ ] `GET /token-usage/me` monthly summary + breakdown all 16 features
- [ ] `GET /token-usage/conversation/:id` Growth+ only; 402 Starter

**Legacy:** `scripts/validate-per-conversation-token-breakdown.mjs`

---

## Phase 4 — AI endpoints (OpenAI mocked)

| Test file | Endpoint | Key assertions |
|-----------|----------|----------------|
| `ai/openaiChat.test.ts` | `POST /openai/conversations/:id/messages` | Tokens logged; employer-only |
| `ai/matchExplanation.test.ts` | `GET /ai/match-explanation` | Structured response |
| `ai/jobDescription.test.ts` | `POST /ai/job-description` | generate/improve/check modes |
| `ai/proposal.test.ts` | `POST /ai/proposal` | Freelancer-only |
| `ai/rateSuggestion.test.ts` | `POST /ai/rate-suggestion` | Static fallback all plans; AI Growth+ |
| `ai/agreementGenerate.test.ts` | `POST /agreements` | Template selection |
| `documents/aiReview.test.ts` | confirm upload triggers review | Status pending→verified/rejected |
| `employerDocuments/aiReview.test.ts` | employer doc confirm | aiNotes admin-only |

**Legacy:** `validate-ai-proposal-generator.mjs`, `validate-smart-rate-suggestions.mjs`, `validate-smarter-matching.mjs`

### 4.1 Automation evaluators (unit + integration)

| File | Unit tests | Integration |
|------|------------|-------------|
| `cruiseModeUtils.test.ts` | `preFilter`, `isInBlackoutWindow`, prompt validation | Job create fires evaluator (mock AI) |
| `cruiseMode.test.ts` | — | activate dry-run/live; activity feed; monthly quota |
| `talentSearchUtils.test.ts` | `talentSearchPreFilter`, prompt validation | Profile update fires evaluator |
| `talentSearch.test.ts` | — | config CRUD; activity; stats; **opt-out when implemented** |

**Legacy:** `spec/cruisemode/validation.md`, `spec/employer-cruisemode/validation.md`

---

## Phase 5 — Messaging, notifications, documents

### 5.1 Direct messaging (`tests/integration/messaging/`)

- [ ] `POST /conversations/direct` dedupes same employer+freelancer+context
- [ ] `GET /conversations/direct` paginated inbox
- [ ] `POST .../messages` 422 on `ai_match` conversation
- [ ] Rate limit 30/hr → 429
- [ ] `GET .../messages` marks read; unread count decrements
- [ ] `GET /messages/unread-count`

**Legacy:** `spec/messaging-service/validation.md`

### 5.2 Notifications (`tests/integration/notifications/`)

- [ ] CRUD read state; `read-all` before `/:id/read` ordering
- [ ] 15 trigger events create rows (table-driven test per event type)
- [ ] Email suppressed when recipient read in last 5 min

**Legacy:** `scripts/verify-notifications-*.mjs` (phase1–4, all)

### 5.3 Document verification (`tests/integration/documents/`)

- [ ] Upload URL + confirm flow
- [ ] Admin verify/reject updates freelancer badge
- [ ] Employer documents: upsert per type; view-url 15min TTL
- [ ] `verificationLevel` recalculated atomically

**Legacy:** `spec/document-verification/validation.md`, `spec/employee-verification/validation.md`

---

## Phase 6 — Dashboard, teams, analytics

### 6.1 Dashboard (`tests/integration/dashboard/`)

- [ ] `GET /dashboard/stats` role-specific shape
- [ ] `GET /dashboard/earnings-intelligence` freelancer-only
- [ ] `GET /dashboard/spend-analytics` employer-only
- [ ] `GET /dashboard/hiring-analytics` window param `30d|90d|12m`
- [ ] `GET /dashboard/activity` recent feed

**Legacy:** `scripts/verify-earnings-intelligence.mjs`

### 6.2 Team accounts (`tests/integration/team/`)

- [ ] Enterprise plan required → 402 otherwise
- [ ] Create team once; invite + accept token flow
- [ ] Admin vs member permissions
- [ ] Shared shortlist CRUD
- [ ] `GET /team/analytics` admin-only

**Legacy:** `validate-team-accounts.mjs`

### 6.3 Teaching professional profile (`tests/integration/teaching/`)

- [ ] Default `professionCategory=technology` for existing rows
- [ ] Education fields nullable; vault filters additive
- [ ] `buildProfessionContext()` empty string for technology jobs (regression diff test)

**Legacy:** `spec/teaching-professional-profile/validation.md`

---

## Phase 7 — Frontend tests (Vitest + Testing Library)

| Area | File | Cases |
|------|------|-------|
| Utils | `rateFormatUtils.test.ts` | All `rateType` labels |
| Utils | `contractHealthUtils.test.ts` | Grade A–F boundaries |
| Utils | `agreementSummaryUtils.test.ts` | Section order |
| Components | `VerifiedEmployerBadge.test.tsx` | Renders nothing when unverified |
| Components | `PaginationControls.test.tsx` | Disabled states at bounds |
| Components | `CompletenessBanner.test.tsx` | Shows missing fields |
| Hooks | 402 handler | TOKEN_LIMIT inline vs PLAN_LIMIT redirect |
| Copy | Exclusivity strings | Pending booking never says "locked" |

**Optional E2E (Playwright `e2e/`):**

- [ ] Employer: sign in → browse vault → open freelancer → create booking
- [ ] Freelancer: pending booking → write proposal drawer → copy accept
- [ ] Agreement: generate → sign both → download PDF
- [ ] Admin: login → document queue → verify
- [ ] Messages: send message → unread badge clears

---

## Phase 8 — Legacy script migration map

Run via `pnpm run test:validate` until each row is ✅ in Vitest.

| Legacy script | Target Vitest suite | Priority |
|---------------|---------------------|----------|
| `validate-auth-hardening.mjs` | `integration/auth/idor.test.ts` | P0 |
| `validate-security-hardening.mjs` | `integration/security/*` | P0 |
| `validate-product-gaps-utils.mjs` | `unit/completenessUtils.test.ts` | P0 |
| `lib/db/scripts/validate-product-gaps.mjs` | `integration/freelancers/` | P1 |
| `validate-availability-calendar.mjs` | `integration/availability/` | P1 |
| `validate-smart-rate-suggestions.mjs` | `integration/ai/rateSuggestion.test.ts` | P1 |
| `validate-ai-proposal-generator.mjs` | `integration/ai/proposal.test.ts` | P1 |
| `validate-smarter-matching.mjs` | `integration/ai/matchExplanation.test.ts` | P1 |
| `validate-per-conversation-token-breakdown.mjs` | `integration/token-usage/` | P1 |
| `validate-contract-health-score.mjs` | `integration/agreements/health.test.ts` | P1 |
| `validate-agreement-redlining.mjs` | `integration/agreements/redline.test.ts` | P1 |
| `validate-agreement-ai-summary.mjs` | `integration/agreements/summary.test.ts` | P1 |
| `test-agreement-pdf-download.mjs` | `integration/agreements/download.test.ts` | P1 |
| `validate-team-accounts.mjs` | `integration/team/` | P2 |
| `validate-notification-scenario.mjs` | `integration/notifications/` | P2 |
| `validate-resend-booking-email.mjs` | `integration/bookings/email.test.ts` | P2 |
| `validate-resend-e2e.mjs` | `integration/notifications/email.test.ts` | P2 |
| `verify-notifications-phase*.mjs` (4) | `integration/notifications/` | P2 |
| `verify-reviews-phase*.mjs` (5) | `integration/reviews/` | P2 |
| `verify-earnings-intelligence.mjs` | `integration/dashboard/earnings.test.ts` | P2 |
| `verify-security-phase2.mjs` | `integration/security/` | P2 |

**Total legacy scripts:** 29 → **~45 Vitest files**, **~320 individual test cases** (estimated).

---

## Phase 9 — CI & regression gates

- [ ] `.github/workflows/test.yml` — unit on every PR; integration on main + nightly
- [ ] Integration job provisions Neon branch or uses persistent test DB
- [ ] Secrets: `DATABASE_URL_TEST`, `CLERK_SECRET_KEY`, `CSRF_SECRET`, `ADMIN_PASSWORD`
- [ ] Fail PR if `pnpm run typecheck` or `pnpm run test:unit` fails
- [ ] Report Vitest JUnit artifact for CI dashboard
- [ ] Branch protection: require `test:unit` pass before merge

---

## Test count summary

| Layer | Files (target) | Cases (est.) | CI without secrets |
|-------|----------------|--------------|-------------------|
| Unit | 25 | 120 | ✅ |
| Integration | 45 | 200 | ❌ |
| Regression ports | 29 scripts | 150 | ❌ |
| Playwright E2E | 5 | 25 | ❌ |
| **Total** | **~75** | **~495** | Unit only initially |

---

## Sign-off

| Phase | Owner | Status |
|-------|-------|--------|
| 0 Harness | — | 🔄 In progress |
| 1 Auth/Security | — | ⬜ |
| 2 Core API | — | ⬜ |
| 3 Billing/Tokens | — | ⬜ |
| 4 AI (mocked) | — | ⬜ |
| 5 Messaging/Docs | — | ⬜ |
| 6 Dashboard/Teams | — | ⬜ |
| 7 Frontend/E2E | — | ⬜ |
| 8 Legacy migration | — | ⬜ |
| 9 CI | — | ⬜ |

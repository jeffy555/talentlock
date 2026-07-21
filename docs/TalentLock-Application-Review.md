# TalentLock — Application Review

**Document version:** 1.0  
**Review date:** June 8, 2026  
**Scope:** Architecture, codebase quality, security, performance, and feature roadmap  
**Sources reviewed:** `project.md`, `spec/spec.md`, backend routes, frontend pages, database schema, OpenAPI spec

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Application Overview](#application-overview)
3. [Architectural Strengths](#architectural-strengths)
4. [Code Improvements](#code-improvements)
5. [Feature Improvements](#feature-improvements)
6. [Spec & Process Improvements](#spec--process-improvements)
7. [Priority Matrix](#priority-matrix)
8. [Appendix: Key File References](#appendix-key-file-references)

---

## Executive Summary

TalentLock is a **dual-sided freelance marketplace** with a differentiated engagement lifecycle: exclusive bookings, rate negotiation, AI-assisted matching and contracts, e-signatures, milestone tracking, reviews, and tiered subscription monetization. The codebase is **architecturally mature and feature-rich** for an MVP.

**Primary strength:** A contract-first monorepo (OpenAPI → Orval → React Query + Zod), spec-driven feature development (`features → clarify → plan → task → UI → validation`), and correct quota gating patterns (`SELECT … FOR UPDATE` inside transactions).

**Primary gap:** **Inconsistent authorization** on several resource routes (bookings, meetings, agreements, AI conversations). The milestones and negotiate endpoints demonstrate the correct pattern; it needs to be applied systematically before production launch.

**Highest-ROI product gaps:** Real Stripe billing (currently simulated), booking acceptance before locking freelancer availability, and completing the email notification layer (Resend infrastructure exists).

---

## Application Overview

### Core Value Proposition

TalentLock connects employers with freelancers through an **exclusive booking model** — booked freelancers receive a Lock badge and become unavailable in the Talent Vault. The platform wraps the full engagement lifecycle:

```
Discover → Match (AI) → Book → Negotiate Rate → Generate Agreement (AI) → E-Sign → Milestones → Review
```

### Monorepo Structure

| Package | Purpose |
|---------|---------|
| `artifacts/talentlock/` | React + Vite frontend (port 25807) |
| `artifacts/api-server/` | Express 5 API server (port 8080) |
| `lib/db/` | Drizzle ORM schema + PostgreSQL |
| `lib/api-spec/` | OpenAPI spec + Orval codegen config |
| `lib/api-client-react/` | Generated React Query hooks |
| `lib/api-zod/` | Generated Zod validators |
| `spec/` | Feature specifications (six-file workflow) |

### Database Tables (22)

`users`, `freelancer_profiles`, `employer_profiles`, `job_requirements`, `bookings`, `agreements`, `conversations`, `messages`, `meetings`, `subscriptions`, `audit_logs`, `token_usage`, `documents`, `reviews`, `notifications`, `account_deletion_requests`, `availability_blocks`, `teams`, `team_members`, `team_shortlist`

### Subscription Plans

| Plan ID | Role | Price | Key Limits |
|---------|------|-------|------------|
| `freelancer_free` | Freelancer | $0 | 3 active bookings, 5 job interests/month |
| `freelancer_pro` | Freelancer | $19/mo | 10 active bookings, unlimited interests |
| `employer_starter` | Employer | $49/mo | 3 active bookings, 5 job posts/month, 50k tokens/month |
| `employer_growth` | Employer | $199/mo | 15 active bookings, 30 job posts/month, 250k tokens/month |
| `employer_enterprise` | Employer | Custom | Unlimited; team accounts enabled |

### Completed Features (per spec index)

- AI Token Consumption Dashboard
- AI Enhancements (match, job description, proposals, rate suggestions)
- Document Verification
- Smarter Matching Explanation
- Agreement Templates + Redlining
- Job Description Assistant
- Per-Conversation Token Breakdown
- Reviews & Ratings
- Notifications Centre
- Earnings Intelligence (freelancer dashboard)
- Employer Spend Analytics
- Employer Analytics Dashboard
- Availability Calendar
- Security Hardening
- Product Gaps (pagination, search, completeness gate)
- AI Proposal Generator
- Smart Rate Suggestions
- Team Accounts (Enterprise)

---

## Architectural Strengths

### 1. Contract-First API Pipeline

OpenAPI (`lib/api-spec/openapi.yaml`) is the single source of truth. Orval generates:
- React Query hooks → `@workspace/api-client-react`
- Zod validators → `@workspace/api-zod`

Backend routes consistently use `safeParse` on generated schemas. This prevents frontend/backend drift when followed completely.

### 2. Quota Gating Done Right

Bookings, job posts, job interests, and token checks use Drizzle transactions with `SELECT … FOR UPDATE` on the `users` row before checking limits. This prevents race conditions under concurrent requests.

### 3. Security Foundations

- Helmet headers, 1 MB body limits
- Pino logging with redaction (`lib/logger.ts`)
- `sanitiseText()` on many free-text writes
- Admin CSRF via double-submit cookie (`lib/csrf.ts`)
- Separate admin auth (HMAC-signed `tl_admin` cookie, 8h TTL)
- GDPR account deletion flow
- `logAudit()` on sensitive actions

### 4. Pragmatic Frontend State

- Clerk for authentication
- TanStack Query for server state (generated hooks)
- Query client configured to NOT retry 4xx errors
- Role-aware navigation and page guards

### 5. Spec-Driven Development

The six-file workflow in `spec/spec.md` is unusually mature:

```
features.md → clarify.md → plan.md → task.md → UI.md → validation.md
```

Each feature has binding decisions, exact file paths, acceptance criteria, and validation checklists. The `.cursor/rules/talentlock.mdc` enforces execution order automatically.

### 6. Patterns Worth Preserving

| Pattern | Example |
|---------|---------|
| Participant authorization | `canAccessBooking()` in `routes/milestones.ts` |
| Turn-taking negotiation | `POST /bookings/:id/negotiate` checks `lastProposedBy` |
| Fire-and-forget side effects | Notifications, audit logs, email use `.catch()` |
| 402 error differentiation | `PLAN_LIMIT` → redirect to `/pricing`; `TOKEN_LIMIT` → inline error |
| One-time agreement download | Certified download unlocked after both parties sign |

---

## Code Improvements

### P0 — Authorization Gaps (Production Blocker)

Several routes allow anyone with a resource ID to read or mutate sensitive data. Contrast with milestones (correct) vs bookings GET/PATCH (missing checks).

| Route | File | Issue |
|-------|------|-------|
| `GET /bookings/:id` | `routes/bookings.ts` | No auth — exposes booking details, rates, messages |
| `PATCH /bookings/:id` | `routes/bookings.ts` | No participant check — anyone can change status |
| `GET /meetings/:id` | `routes/meetings.ts` | No auth — exposes emails and Jitsi links |
| `PATCH /meetings/:id` | `routes/meetings.ts` | No participant check |
| `GET /agreements/:id` | `routes/agreements.ts` | No auth — full contract text exposed |
| `POST /agreements/:id/sign` | `routes/agreements.ts` | No Clerk auth — `role` comes from request body |
| `GET /openai/conversations/:id` | `routes/openaiChat.ts` | No ownership check |
| `DELETE /openai/conversations/:id` | `routes/openaiChat.ts` | No ownership check |
| `POST /openai/conversations/:id/messages` | `routes/openaiChat.ts` | Auth present but no `conv.userId === user.id` check |
| `PATCH /job-requirements/:id` | `routes/jobRequirements.ts` | No employer ownership check |
| `DELETE /job-requirements/:id` | `routes/jobRequirements.ts` | No employer ownership check |

**Recommended fix:** Extract shared helpers into `artifacts/api-server/src/lib/accessControl.ts`:

```typescript
export async function canAccessBooking(userId: number, role: string, booking: Booking): Promise<boolean>
export async function canAccessAgreement(userId: number, role: string, agreement: Agreement): Promise<boolean>
export async function canAccessConversation(userId: number, conversation: Conversation): Promise<boolean>
```

Apply uniformly to all resource routes. Add integration tests for IDOR prevention.

---

### P0 — Storage Security

| Issue | Location | Risk |
|-------|----------|------|
| Unauthenticated upload URL | `POST /storage/uploads/request-url` in `routes/storage.ts` | Anyone can obtain upload paths |
| Minimal object ACL | `GET /storage/objects/*` | Signatures, portfolio images served without user ACL |
| Commented-out ACL code | `routes/storage.ts` lines ~172–185 | Private file access not enforced |

**Recommended fix:**
1. Require Clerk auth on `POST /storage/uploads/request-url`
2. Namespace paths by `userId` (e.g. `uploads/{userId}/...`)
3. Enforce ownership on `GET /storage/objects/*` for non-public prefixes

---

### P1 — OpenAPI Drift

Several implemented endpoints are **not in OpenAPI**, causing the frontend to use raw `fetch` instead of generated hooks:

| Endpoint | Frontend Location |
|----------|-------------------|
| `PUT /users/me/signature` | `pages/Profile.tsx` |
| `GET /account/delete-request` | `components/DeleteAccountSection.tsx` |
| `POST /account/delete-request` | `components/DeleteAccountSection.tsx` |
| `POST /freelancers/parse-resume` | Resume importer component |
| Admin routes (all) | `pages/AdminDashboard.tsx`, `lib/adminCsrf.ts` |

**Recommended fix:** Add endpoints to `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`, replace raw `fetch` with generated hooks.

---

### P1 — Token Usage Breakdown Incomplete

`getMonthlyTokenUsage()` in `lib/subscriptionGating.ts` only aggregates two features:

```typescript
const breakdown: TokenUsageBreakdown = { ai_match: 0, agreement_generation: 0 };
```

But `lib/tokenLogger.ts` logs **eight feature types**:

- `ai_match`
- `ai_match_explanation`
- `agreement_generation`
- `contract_redlining`
- `job_description_assistant`
- `ai_proposal`
- `document_verification`
- `rate_suggestion`

The quota check sums all tokens correctly, but the `/billing` UI breakdown under-reports usage for six features.

**Recommended fix:** Extend `TokenUsageBreakdown` type and aggregation loop to include all eight features. Update `TokenUsageWidget` to display them.

---

### P1 — Input Sanitisation Gaps

`sanitiseText()` from `lib/sanitise.ts` is used in ~9 route files. Missing on:

| Route / Field | File |
|---------------|------|
| Meeting notes / agenda | `routes/meetings.ts` |
| Portfolio title / description | `routes/portfolio.ts` |
| Milestone title / description | `routes/milestones.ts` |
| Job interest message | `routes/jobInterests.ts` (only `.trim().slice()`) |
| Agreement signature names | `routes/agreements.ts` |
| AI chat message content | `routes/openaiChat.ts` |

**Recommended fix:** Audit all free-text DB writes. Apply `sanitiseText()` or `sanitiseRichText()` consistently.

---

### P2 — Performance

#### N+1 Query Patterns

List endpoints run 2+ extra queries per row for name enrichment:

- `GET /bookings` — `routes/bookings.ts` lines 76–80
- `GET /meetings` — `enrichMeeting()` per row
- `GET /agreements` — `enrichAgreement()` per row

**Fix:** Use JOINs or batched `inArray` lookups.

#### Premature Availability Lock

Creating a booking immediately sets `isAvailable: false` on the freelancer profile (pending status). This removes talent from the vault before acceptance.

**Fix:** Gate Lock badge and availability block on `confirmed` status only.

#### Full-Text Search Without Index

Freelancer search uses inline `to_tsvector`/`to_tsquery`. Backfill script notes GIN index was intentionally skipped.

**Fix:** Add GIN index on `freelancer_profiles` search vector column.

#### Notification Polling

30-second polling interval per active user (`NotificationBell.tsx`). Acceptable for MVP; consider SSE or WebSockets at scale.

#### AI Match Handler

Reloads up to 20 freelancer profiles and full message history on every message (`openaiChat.ts`). No history cap or caching.

---

### P2 — Schema & Type Hygiene

| Issue | Detail |
|-------|--------|
| Schema location inconsistency | `token_usage` in `lib/db/schema.ts`; other tables in `lib/db/src/schema/` |
| Missing foreign keys | Core tables (`bookings`, `freelancer_profiles`, etc.) lack Drizzle `.references()` |
| Widespread `as any` | Routes (`bookings.ts`, `openaiChat.ts`, `agreements.ts`) and frontend `enabled` options |
| Transaction scope | `getUserSubscription()` uses global `db` inside transactions instead of `tx` |
| Confusing default | `negotiationStatus` defaults to `"agreed"` in schema but bookings created as `"negotiating"` |
| Hand-rolled Zod | `milestones.ts`, `account.ts`, negotiate body in `bookings.ts` alongside generated schemas |
| Large route files | `agreements.ts` (~864 lines), `admin.ts` (~927 lines), `aiAssist.ts` (~552 lines) |

---

### P2 — Testing & CI Gaps

| Area | Current State |
|------|---------------|
| Unit tests | None — no `*.test.ts` / `*.spec.ts` files |
| Integration tests | None — no supertest/vitest API tests |
| E2E | Playwright in devDependencies; only used by manual validation scripts |
| CI scripts | Root `package.json` has `typecheck` and `build` only — no `test` script |
| Manual validation | 9 `validate-*.mjs` scripts in `artifacts/api-server/` — not wired to CI |

**Highest-value test targets:**
1. Authorization helpers (IDOR prevention)
2. Subscription gating + `FOR UPDATE` transactions
3. 402 error response shapes (`PLAN_LIMIT`, `TOKEN_LIMIT`)
4. Agreement sign + one-time download flow
5. Team invite token expiry and acceptance
6. Account deletion guard (active bookings block deletion)

---

### P3 — Minor Issues

| Issue | Location |
|-------|----------|
| `localStorage` for intended role | `Landing.tsx`, `Onboarding.tsx` (rules prefer `sessionStorage`) |
| Phantom API route | `POST /api/ai/interview-questions` in `project.md` but not implemented |
| Spec folder inconsistency | `spec/spec.md` references `specs/` but repo uses `spec/` |
| Admin default credentials | `lib/adminAuth.ts` falls back to `admin` / `TalentLockAdmin123!` |
| Demo login in production | `routes/demo.ts` with `ENABLE_DEMO_LOGIN=true` |
| CORS `origin: true` | `app.ts` — reflects any Origin header |
| `trust proxy` disabled | `app.ts` — `req.ip` wrong behind reverse proxy |
| In-memory admin rate limit | `admin.ts` — ineffective with multiple server instances |
| Unregistered stub route | `routes/verifyDocuments.ts` exists (410 stub) but not in `routes/index.ts` |

---

## Feature Improvements

### Near-Term (High Impact, Builds on Existing Code)

| Feature | Rationale | Dependencies |
|---------|-----------|--------------|
| **Real Stripe billing** | Schema has `stripeCustomerId`/`stripeSubscriptionId`; upgrade is simulated | Stripe API keys, webhook handler |
| **Email notifications (Resend)** | `emailService.ts` exists; no-op without `RESEND_API_KEY` | Resend account, email templates |
| **AI Interview Questions** | Documented in `project.md` but not built | OpenAPI + route + frontend drawer |
| **Booking acceptance flow** | Freelancer should accept/decline before Lock badge | Status machine change on `bookings` |
| **In-app messaging** | Meetings + notifications exist; no threaded chat on bookings | New `messages` scope or booking chat table |
| **Milestone payment tracking** | Milestones track status; no payment integration | Manual "mark as paid" or Stripe Connect |
| **Freelancer job discovery** | Jobs exist; no dedicated browse experience for freelancers | New `/jobs` view for freelancer role |
| **Search improvements** | GIN index, verified badge filter, rating threshold, "available now" | DB index + Talent Vault UI filters |

### Medium-Term (Differentiation)

| Feature | Rationale |
|---------|-----------|
| **Escrow / milestone release** | Stripe Connect — hold funds, release on milestone completion |
| **Calendar sync** | Export availability to Google/Outlook; reduce double-booking |
| **Contract versioning** | Redlining exists; no version history for comparing drafts |
| **Freelancer analytics export** | CSV/PDF export of earnings intelligence for tax purposes |
| **Referral program** | Network effects for both sides via unique invite links |
| **Dispute resolution** | Formal workflow for booking disagreements |
| **Portfolio verification** | Extend AI document review to portfolio claims |
| **Saved searches / alerts** | Employers save Talent Vault filter presets; notify on new matches |

### Enterprise Extensions

| Feature | Rationale |
|---------|-----------|
| **SSO / SAML** | Enterprise buyers expect it; Clerk supports it |
| **Approval workflows** | Team admin approves bookings before they go out |
| **Custom agreement templates UI** | Templates exist server-side; enterprise needs self-serve editor |
| **Audit log export** | Compliance teams need downloadable audit trails |
| **Department-level budgets** | Spend caps per team member on top of team analytics |

### Deferred (Explicitly Out of Scope per Specs)

- Stripe Connect escrow (mentioned in specs as future phase)
- Real-time WebSocket notifications (polling is MVP approach)
- Mobile native apps
- Multi-language / i18n

---

## Spec & Process Improvements

### 1. Unify Spec Folder Path

`spec/spec.md` references `specs/` in folder structure diagrams, but the repository uses `spec/`. Update `.cursor/rules/talentlock.mdc` and all references to use one consistent path.

### 2. Sync Feature Index Statuses

Several features show "Ready to Execute" in the folder structure diagram but "Complete" in the Feature Index table. Maintain one source of truth; update diagram when status changes.

### 3. Create Security Audit Spec

Add `spec/security-audit-phase2/` with:
- `features.md` — IDOR closure, storage ACL, auth middleware standardisation
- `plan.md` — `accessControl.ts` helper design
- `validation.md` — curl commands testing unauthorized access returns 403

### 4. Wire Validation Scripts to CI

The 9 `validate-*.mjs` scripts in `artifacts/api-server/` are valuable for manual QA. Run them on every PR against a test database:

```yaml
# Suggested CI step
- run: pnpm --filter @workspace/api-server run validate:all
```

### 5. Add `project.md` Sync Rule

When an endpoint is added outside OpenAPI, flag it in `clarify.md` so `project.md` does not document phantom routes (e.g. interview-questions).

### 6. Mandatory Production Env Check

Add startup guard that refuses to boot in production without:
- `CSRF_SECRET` (64-char hex)
- `ADMIN_PASSWORD` (not default)
- `SESSION_SECRET` (not dev fallback)
- `CLERK_SECRET_KEY`

---

## Priority Matrix

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| **P0** | Fix IDOR on bookings, meetings, agreements, AI conversations | Medium | Critical — production blocker |
| **P0** | Auth-gate storage upload URLs + object ACL | Medium | Critical — data exposure |
| **P1** | Complete OpenAPI coverage; eliminate raw `fetch` | Low–Medium | High — contract integrity |
| **P1** | Fix token usage breakdown (all 8 features) | Low | High — billing accuracy |
| **P1** | Apply `sanitiseText()` to all free-text writes | Low | High — XSS prevention |
| **P1** | Defer Lock badge until booking confirmed | Low | High — UX trust |
| **P2** | Add automated API integration tests + CI | Medium | High — regression safety |
| **P2** | Fix N+1 on list endpoints (JOINs) | Medium | Medium — performance at scale |
| **P2** | Move `token_usage` schema; add FKs on core tables | Low | Medium — data integrity |
| **P2** | Stripe real checkout | High | Critical — revenue |
| **P2** | Resend email notifications (full wiring) | Medium | High — engagement |
| **P3** | Implement or remove interview-questions from docs | Low | Low — doc accuracy |
| **P3** | GIN index for full-text search | Low | Medium — search performance |
| **P3** | Enable `trust proxy` in production | Low | Medium — audit accuracy |
| **P3** | Tighten CORS origins | Low | Medium — security hygiene |

---

## Appendix: Key File References

### Backend

| File | Purpose |
|------|---------|
| `artifacts/api-server/src/routes/index.ts` | Route registration |
| `artifacts/api-server/src/routes/bookings.ts` | Booking CRUD + negotiation |
| `artifacts/api-server/src/routes/agreements.ts` | Agreement generation, signing, redlining |
| `artifacts/api-server/src/routes/milestones.ts` | Milestone CRUD (has correct auth pattern) |
| `artifacts/api-server/src/routes/openaiChat.ts` | AI match conversations |
| `artifacts/api-server/src/routes/storage.ts` | File upload/download |
| `artifacts/api-server/src/lib/subscriptionGating.ts` | Quota checks + token usage |
| `artifacts/api-server/src/lib/tokenLogger.ts` | Token feature types |
| `artifacts/api-server/src/lib/sanitise.ts` | Input sanitisation |
| `artifacts/api-server/src/lib/plans.ts` | Subscription plan definitions |
| `artifacts/api-server/src/lib/adminAuth.ts` | Admin session management |
| `artifacts/api-server/src/lib/csrf.ts` | Admin CSRF protection |
| `artifacts/api-server/src/lib/accountDeletion.ts` | GDPR deletion flow |
| `artifacts/api-server/src/lib/emailService.ts` | Resend email wrapper |
| `artifacts/api-server/src/middleware/requireTeam.ts` | Enterprise team guards |

### Frontend

| File | Purpose |
|------|---------|
| `artifacts/talentlock/src/App.tsx` | Routes + Query client config |
| `artifacts/talentlock/src/pages/Billing.tsx` | Subscription + token usage |
| `artifacts/talentlock/src/pages/Profile.tsx` | Signature upload (raw fetch) |
| `artifacts/talentlock/src/components/TokenUsageWidget.tsx` | Token breakdown display |
| `artifacts/talentlock/src/components/NotificationBell.tsx` | 30s polling |
| `artifacts/talentlock/src/components/RateSuggestionWidget.tsx` | AI rate suggestions |
| `artifacts/talentlock/src/components/ProposalGeneratorDrawer.tsx` | AI proposal generator |

### Schema

| File | Purpose |
|------|---------|
| `lib/db/src/schema/` | All table definitions |
| `lib/db/schema.ts` | Legacy `token_usage` table location |
| `lib/api-spec/openapi.yaml` | API contract (single source of truth) |

### Specs

| File | Purpose |
|------|---------|
| `project.md` | Architecture reference |
| `spec/spec.md` | Master spec index + execution rules |
| `spec/{feature}/plan.md` | Binding engineering decisions |
| `spec/{feature}/task.md` | Implementation tasks |
| `spec/{feature}/validation.md` | Phase sign-off checklist |
| `.cursor/rules/talentlock.mdc` | Cursor agent enforcement rules |

### Validation Scripts

```
artifacts/api-server/validate-security-hardening.mjs
artifacts/api-server/validate-team-accounts.mjs
artifacts/api-server/validate-availability.mjs
artifacts/api-server/validate-notifications.mjs
artifacts/api-server/validate-earnings-intelligence.mjs
artifacts/api-server/validate-employer-spend-analytics.mjs
artifacts/api-server/validate-employer-analytics.mjs
artifacts/api-server/validate-ai-proposal-generator.mjs
artifacts/api-server/validate-product-gaps.mjs
```

---

## Conclusion

TalentLock has a **mature architecture and an unusually complete feature set** for a marketplace MVP. The OpenAPI codegen pipeline, spec-driven development workflow, and AI integration across the engagement lifecycle are genuine competitive advantages.

The path from "demo-ready" to "production-ready" is clear:

1. **Close authorization gaps** systematically (P0)
2. **Secure file storage** (P0)
3. **Wire real payments** (P2 but highest business impact)
4. **Add automated tests** for auth and gating (P2)
5. **Ship email notifications** (P2)

Everything else — search indexing, N+1 fixes, enterprise extensions — builds naturally on the solid foundation already in place.

---

*This document was generated from a full codebase and specification review on June 8, 2026.*

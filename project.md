# TalentLock — Project Reference

> Architecture reference for the TalentLock monorepo. Read this before every feature implementation session.

---

## Architecture

### Monorepo Structure
- `artifacts/talentlock/` — React + Vite frontend (port 25807, path `/`)
- `artifacts/api-server/` — Express 5 API server (port 8080, path `/api`)
- `lib/db/` — Drizzle ORM schema + PostgreSQL migrations (`lib/db/src/schema/`)
- `lib/api-spec/` — OpenAPI spec + Orval codegen config
- `lib/api-client-react/` — Generated React Query hooks (from OpenAPI) — never hand-edit
- `lib/api-zod/` — Generated Zod schemas (from OpenAPI) — never hand-edit
- `lib/integrations-openai-ai-server/` — OpenAI client (server-side)
- `lib/integrations-openai-ai-react/` — OpenAI client (frontend)

The Vite dev server has a proxy rule that forwards `/api` calls to `localhost:8080`, so you only open one URL in the browser.

---

## Database Schema (tables)

| Table | Purpose |
|-------|---------|
| `users` | Core accounts (linked to Clerk IDs). Has `signatureImageUrl`, `emailNotificationsEnabled` columns. |
| `freelancer_profiles` | Freelancer professional info, skills, rate, availability. Has `averageRating`, `reviewCount`, `nextAvailableDate`, `completenessScore` columns. |
| `employer_profiles` | Employer company info |
| `job_requirements` | Job postings by employers |
| `bookings` | Exclusive engagements. Has negotiation columns: `proposedRate`, `lastProposedBy`, `negotiationStatus`, and optional employer `message` |
| `agreements` | AI-generated legal agreements. Has `freelancerSignatureImageUrl`, `employerSignatureImageUrl`, `status` |
| `conversations` | AI match chat sessions. Has `jobRequirementId` column. |
| `messages` | Individual chat messages |
| `meetings` | Discovery meeting requests |
| `subscriptions` | Per-user billing plan and status |
| `audit_logs` | Login/logout and sensitive-action audit trail. Has `ipAddress`, `userAgent`, `entityType`, `entityId`, `metadata` columns. |
| `token_usage` | AI token consumption per user per feature. Has `conversationId` column. |
| `documents` | Freelancer identity/credential uploads for AI verification. |
| `reviews` | Employer reviews of freelancers after completed bookings. One per booking. |
| `notifications` | In-app notification rows for all users. Triggered server-side on key platform events. |
| `account_deletion_requests` | GDPR deletion requests. Tracks status from pending → complete. |
| `availability_blocks` | Freelancer unavailability date ranges. Has `freelancerId`, `startDate`, `endDate`, `reason`, `label`, `bookingId` columns. Auto-created from confirmed bookings; manually created by freelancers. |
| `teams` | Enterprise team accounts. Has `ownerUserId`, `name` columns. |
| `team_members` | Team membership with roles (admin/member), invite tokens, and status. |
| `team_shortlist` | Shared freelancer shortlist for enterprise teams. |

### Schema changes workflow

After editing `lib/db/src/schema/*.ts`:
```bash
pnpm --filter @workspace/db run push
```

---

## API Contract Workflow (OpenAPI → codegen)

The single source of truth for the API contract is:
```
lib/api-spec/openapi.yaml
```

After editing the spec, regenerate the React Query hooks and Zod schemas:
```bash
pnpm --filter @workspace/api-spec run codegen
```

This updates:
- `lib/api-client-react/src/` — React Query hooks used by the frontend
- `lib/api-zod/src/` — Zod schemas used by the backend for validation

**Never hand-edit the generated files** — they are overwritten on every codegen run.

Post-codegen mandatory checks:
- `lib/api-zod/orval.config.ts` must still have `indexFiles: false`
- `lib/api-zod/src/index.ts` must only export `./generated/api`
- Run `pnpm run typecheck` before any frontend work

---

## Frontend Routes

| Path | Page | Access |
|------|------|--------|
| `/` | Landing page | Public |
| `/sign-in` `/sign-up` | Clerk auth pages | Public |
| `/onboarding` | Role selection + profile setup | Authenticated |
| `/dashboard` | Role-specific metrics + charts; employer sees Spend Analytics and Hiring Analytics panels; freelancer sees Earnings Intelligence | Authenticated |
| `/freelancers` | Talent Vault (browse + filter + `?q=` keyword + `?availableFrom=` date filter; completeness ≥ 60%) | Employer only |
| `/freelancers/:id` | Freelancer detail + book + read-only availability calendar + rate suggestion widget | Employer only |
| `/jobs` `/jobs/new` `/jobs/:id` | Job postings | Authenticated |
| `/bookings` `/bookings/:id` | Booking management + milestones + negotiation + AI proposal generator (freelancer) | Authenticated |
| `/agreements` `/agreements/:id` | Legal agreements + e-signing | Authenticated |
| `/ai-match` | AI talent matching chat | Employer only |
| `/profile` | User profile + signature management + availability manager (freelancer) + completeness banner + delete account | Authenticated |
| `/pricing` | Subscription tier grid | Authenticated |
| `/billing` | Current plan + usage | Authenticated |
| `/f/:id` | Public freelancer profile + read-only availability calendar | Public |
| `/team` | Team management (enterprise only) | `employer_enterprise` |
| `/team/analytics` | Team-level spend and hiring analytics | `employer_enterprise` admin |
| `/team/accept-invite` | Accept team invite via token | Public |
| `/admin/login` | Admin login | Public |
| `/admin` | Admin dashboard | Admin session only |

---

## API Routes (all prefixed `/api`)

```
GET  /api/users/me                                Current user profile
PUT  /api/users/me                                Update user profile
PUT  /api/users/me/signature                      Save/clear signature image URL
PATCH /api/users/me/notification-preferences      Toggle email notification opt-in/out

GET  /api/freelancers                             List freelancers (filters + ?q=keyword + ?availableFrom=YYYY-MM-DD; completeness ≥ 60%)
GET  /api/freelancers/:id                         Freelancer detail (includes nextAvailableDate)
GET  /api/freelancers/me                          My freelancer profile
PUT  /api/freelancers/me                          Update my freelancer profile (recalculates completenessScore atomically)

GET  /api/employers/me                            My employer profile
PUT  /api/employers/me                            Update my employer profile

GET  /api/job-requirements                        List jobs
POST /api/job-requirements                        Create job
GET  /api/job-requirements/:id                    Job detail
PATCH /api/job-requirements/:id                   Update job
DELETE /api/job-requirements/:id                  Delete job

GET  /api/bookings                                Paginated list (?page, ?pageSize — returns {data,total,page,pageSize,totalPages})
POST /api/bookings                                Create booking (optional `message` max 500 chars)
GET  /api/bookings/:id                            Booking detail (includes review object and employer message)
PATCH /api/bookings/:id                           Update booking (status, milestones, negotiation)

GET  /api/agreements                              Paginated list (?page, ?pageSize)
POST /api/agreements                              Generate agreement (AI)
GET  /api/agreements/:id                          Agreement detail
POST /api/agreements/:id/sign                     Sign agreement (image or typed name)
GET  /api/agreements/:id/download                 One-time PDF/text download
POST /api/agreements/:id/redline                  AI contract review suggestions (Growth+)
PATCH /api/agreements/:id/accept-redline          Accept a redline suggestion

GET  /api/meetings                                Paginated list (?page, ?pageSize)
POST /api/meetings                                Request meeting
GET  /api/meetings/:id                            Meeting detail
PATCH /api/meetings/:id                           Update meeting

GET  /api/openai/conversations                    List AI chat conversations
POST /api/openai/conversations/:id/messages       Send AI chat message

GET  /api/ai/match-explanation                    AI match explanation for a freelancer
POST /api/ai/job-description                      AI job description generator (generate/improve/check)
POST /api/ai/proposal                             AI proposal generator for freelancer booking responses
POST /api/ai/interview-questions                  AI interview question generator
POST /api/ai/rate-suggestion                      AI rate recommendation widget (Growth+ for AI; all plans get static data)

GET  /api/reviews/freelancer/:id                  Public list of reviews for a freelancer
POST /api/reviews                                 Submit review (employer, completed bookings only)
POST /api/reviews/:id/reply                       Freelancer reply to a review

GET  /api/notifications                           Paginated notifications for current user
GET  /api/notifications/unread-count              Integer count of unread notifications
PATCH /api/notifications/read-all                 Mark all notifications as read (register BEFORE /:id/read)
PATCH /api/notifications/:id/read                 Mark single notification as read

GET  /api/token-usage/me                          Monthly token usage summary
GET  /api/token-usage/conversation/:id            Per-conversation token breakdown (Growth+)

GET  /api/documents/me                            Freelancer own document statuses
POST /api/documents/upload-url                    Request presigned GCS upload URL for document
POST /api/documents/confirm                       Confirm document upload and trigger AI review

GET  /api/availability/:freelancerId              Public availability blocks (no auth — register BEFORE /me)
GET  /api/availability/me                         Freelancer own blocks with labels and bookingId
POST /api/availability/me                         Create a manual availability block (holiday or unavailable only)
DELETE /api/availability/me/:id                   Delete a manual block — 409 if auto-created from booking

POST /api/account/delete-request                  Authenticated user submits GDPR account deletion request
GET  /api/account/delete-request                  Check status of user deletion request
GET  /api/admin/csrf-token                        Fetch CSRF token for admin console (no auth; register BEFORE doubleCsrfProtection)

GET  /api/dashboard/stats                         Dashboard metrics
GET  /api/dashboard/earnings-intelligence         Freelancer earnings trend, benchmark, projection, top skills
GET  /api/dashboard/spend-analytics               Employer spend trend, field breakdown, top freelancers, rate benchmark
GET  /api/dashboard/hiring-analytics              Employer hiring funnel, skills gap, retention, lifecycle, outcomes (?window=30d|90d|12m)
GET  /api/dashboard/activity                      Recent activity feed

GET  /api/subscriptions/plans                     Plan list
GET  /api/subscriptions/me                        My plan + usage
POST /api/subscriptions/upgrade                   Upgrade plan (simulated checkout — shaped for Stripe)

POST /api/storage/uploads/request-url             Request presigned GCS upload URL
GET  /api/storage/objects/*path                   Serve stored object

GET  /api/team                                    Team details + member list (enterprise only)
POST /api/team                                    Create team (enterprise employer, once per account)
PUT  /api/team                                    Update team name/settings (admin only)
POST /api/team/invite                             Invite member by email (admin only)
GET  /api/team/accept-invite                      Accept invite token (public)
DELETE /api/team/members/:userId                  Remove/deactivate team member (admin only — cannot remove owner)
GET  /api/team/shortlist                          Shared team shortlist
POST /api/team/shortlist                          Add freelancer to shared shortlist
DELETE /api/team/shortlist/:freelancerId          Remove from shared shortlist
GET  /api/team/analytics                          Team-level spend and hiring analytics (admin only)

GET  /api/admin/stats                             Admin: platform stats
GET  /api/admin/users                             Admin: user list
GET  /api/admin/audit                             Admin: audit log
GET  /api/admin/bookings                          Admin: all bookings
GET  /api/admin/jobs                              Admin: all jobs
GET  /api/admin/subscriptions                     Admin: subscription data
GET  /api/admin/documents                         Admin: document review queue
GET  /api/admin/token-usage                       Admin: token usage by employer
POST /api/admin/login                             Admin: login
POST /api/admin/logout                            Admin: logout
```

---

## Key Features Summary

1. **Dual Role System** — Register as freelancer or employer via onboarding
2. **Talent Vault** — Browse/filter freelancers by field, rate, availability, available-from date, and keyword search (`?q=`); shortlist with heart icon; completeness gate ≥ 60%
3. **Exclusive Bookings** — Booked freelancers get a Lock badge and become unavailable
4. **Rate Negotiation** — Employer proposes a rate; freelancer accepts or counter-proposes; agreement generation gated until both agree
5. **AI Talent Matching** — GPT-powered chat that recommends matching freelancers
6. **AI Agreement Generation** — GPT-4 generates legal engagement contracts from booking details
7. **Signature Upload** — Users upload handwritten signature images on their Profile; reused across all agreements
8. **Agreement Safe Locker** — Fully executed agreements unlock a one-time certified download per party
9. **Milestone Tracking** — Bookings track milestones with title, amount, due date, status
10. **Reviews & Ratings** — Employers rate completed bookings (1–5 stars + comment); average rating shown on profiles; freelancers can reply
11. **Portfolio** — Freelancers manage portfolio items with images, URLs, and tags
12. **Public Profiles** — Unauthenticated `/f/:id` pages for freelancer discovery
13. **Availability Calendar** — Visual date-range calendar; freelancers manage blocks (booked/holiday/unavailable); auto-blocks from confirmed bookings; employer read-only view; Talent Vault `?availableFrom` filter; `nextAvailableDate` badge on cards
14. **Subscription Tiers** — 5 plans with enforced limits on bookings, job posts, and interest expressions
15. **Admin Console** — Stats, user management, audit log, booking/job overview at `/admin`; CSRF-protected state-changing routes
16. **Document Verification** — Freelancers upload ID/credential documents for AI review; verified badge shown to employers
17. **AI Token Tracking** — Monthly token quota per employer plan; per-conversation breakdown (Growth+)
18. **Agreement Templates** — Industry-specific templates + enterprise custom clauses for AI agreement generation
19. **Contract Redlining** — AI review and edit suggestions before signing (Growth+)
20. **Job Description Assistant** — AI writing assistant (generate/improve/check) for job posts
21. **Smarter Matching** — AI explains why each freelancer was recommended (skills, rate, availability)
22. **Notifications Centre** — In-app bell + unread badge; 15 event triggers; fire-and-forget `.catch()` pattern; polling every 30s
23. **Earnings Intelligence** — Freelancer dashboard: 6-month trend vs platform avg, rate benchmarking percentile, monthly projection, top earning skills
24. **Employer Spend Analytics** — Employer dashboard: spend trend, field breakdown, top freelancers by spend, committed spend, rate vs market
25. **Employer Analytics Dashboard** — Hiring funnel conversion, skills demand vs supply gap, freelancer retention rate, booking lifecycle duration, outcome breakdown
26. **Security Hardening** — Helmet headers, 1MB body limits, Pino redaction, `sanitiseText()` on all free-text writes, admin CSRF (`csrf-csrf`), `logAudit()` on sensitive actions, GDPR account deletion
27. **Product Gaps** — Resend email notifications (opt-out toggle), Talent Vault keyword search, profile completeness gate (≥ 60%), paginated list endpoints, employer booking message, public profile preview link
28. **AI Proposal Generator** — Freelancer "Write proposal" drawer on pending `/bookings/:id`; three tones; copyable accepted block; `ai_proposal` token label
29. **Smart Rate Suggestions** — Rate context widget on booking creation and negotiation; static context (all plans) + AI suggestion (Growth+, `rate_suggestion` token label); "Use suggested rate" fills input only
30. **Team Accounts (Enterprise)** — Multi-member teams for `employer_enterprise`; invite flow with 7-day expiring UUID tokens; admin/member roles; shared Talent Vault shortlist; team analytics page

### Dashboard analytics panels

| Panel | Role | Endpoint | Frontend components |
|---|---|---|---|
| Earnings Intelligence | Freelancer | `GET /api/dashboard/earnings-intelligence` | `artifacts/talentlock/src/components/earnings/` |
| Spend Analytics | Employer | `GET /api/dashboard/spend-analytics` | `artifacts/talentlock/src/components/spend/` |
| Hiring Analytics | Employer | `GET /api/dashboard/hiring-analytics` | `artifacts/talentlock/src/components/hiring/` |

Shared server utilities: `artifacts/api-server/src/lib/earningsUtils.ts` (`getLast6Months`, `fillZeroMonths`, `formatCurrency`, `getWindowDates`, `safeAverage`, `getLifecycleTrend`).

### Utility file registry

| File | Purpose |
|---|---|
| `artifacts/api-server/src/lib/availabilityUtils.ts` | `calculateNextAvailableDate`, `refreshNextAvailableDate`, `createAvailabilityBlock`, `deleteAvailabilityBlockByBookingId` |
| `artifacts/api-server/src/lib/sanitise.ts` | `sanitiseText()`, `sanitiseRichText()` — strip HTML from all free-text writes |
| `artifacts/api-server/src/lib/auditLogger.ts` | `logAudit()` — fire-and-forget structured audit events |
| `artifacts/api-server/src/lib/csrf.ts` | `generateCsrfToken`, `doubleCsrfProtection` for admin routes |
| `artifacts/api-server/src/lib/accountDeletion.ts` | GDPR deletion: active-booking guard, anonymise, hard-delete PII |
| `artifacts/api-server/src/lib/emailService.ts` | `sendNotificationEmail()` — Resend wrapper; no-op when `RESEND_API_KEY` unset |
| `artifacts/api-server/src/lib/searchUtils.ts` | `sanitiseSearchQuery()` — full-text query sanitiser for `?q=` |
| `artifacts/api-server/src/lib/completenessUtils.ts` | `calculateCompletenessScore()` — profile scoring (photo, bio, skills, rate, field, availability) |
| `artifacts/api-server/src/lib/rateSuggestionUtils.ts` | `getMarketMedian()`, `getEmployerHistoricalAvg()` for rate suggestion widget |
| `artifacts/api-server/src/middleware/requireTeam.ts` | `requireTeamMember()`, `requireTeamAdmin()` — enterprise team permission guards |
| `artifacts/api-server/src/routes/account.ts` | `POST/GET /api/account/delete-request` |
| `artifacts/api-server/src/routes/team.ts` | All `/api/team/*` routes |
| `artifacts/talentlock/src/lib/availabilityUtils.ts` | `formatNextAvailable`, `getAvailabilityColour` |
| `artifacts/talentlock/src/lib/adminCsrf.ts` | Admin CSRF token fetch + `adminMutate()` helper |
| `artifacts/talentlock/src/components/availability/` | `AvailabilityCalendar` (read-only), `AvailabilityManager` (freelancer edit), `AddBlockModal` |
| `artifacts/talentlock/src/components/PaginationControls.tsx` | Shared Prev/Next pagination for list pages |
| `artifacts/talentlock/src/components/CompletenessBanner.tsx` | Freelancer profile completeness banner on `/profile` |
| `artifacts/talentlock/src/components/DeleteAccountSection.tsx` | Danger zone + email confirmation on `/profile` |
| `artifacts/talentlock/src/components/RateSuggestionWidget.tsx` | Rate context + AI suggestion on booking form and negotiation panel |
| `artifacts/talentlock/src/components/ProposalGeneratorDrawer.tsx` | AI proposal generator drawer on `/bookings/:id` (freelancer) |

---

## Useful pnpm Commands

```bash
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/talentlock run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/scripts run seed
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/talentlock run dev
```

---

## Subscription Plans (defined in `artifacts/api-server/src/lib/plans.ts`)

| Plan ID | Role | Price | Limits |
|---------|------|-------|--------|
| `freelancer_free` | Freelancer | $0 | 3 active bookings, 5 job interests/month, no token quota |
| `freelancer_pro` | Freelancer | $19/mo | 10 active bookings, unlimited interests, no token quota |
| `employer_starter` | Employer | $49/mo | 3 active bookings, 5 job posts/month, 50k tokens/month |
| `employer_growth` | Employer | $199/mo | 15 active bookings, 30 job posts/month, 250k tokens/month |
| `employer_enterprise` | Employer | Custom | Unlimited; team accounts enabled |

---

## Auth Flow Notes

- New Clerk users get a 404 from `GET /api/users/me` — intentional
- The React Query client is configured to NOT retry 4xx errors
- `Landing.tsx` redirects to `/onboarding` when `useGetMe` returns an error
- `Onboarding.tsx` treats a 404 as "new user"
- Admin auth is completely separate from Clerk — uses an HMAC-signed cookie (`tl_admin`, 8h TTL)
- Admin POST/PATCH/DELETE routes are CSRF-protected via `csrf-csrf` double-submit pattern

---

## Common Development Tasks

### Add a new database column
1. Edit the relevant file in `lib/db/src/schema/`
2. Run `pnpm --filter @workspace/db run push`
3. If existing data is affected, run backfill SQL immediately after push

### Add a new API endpoint
1. Add the route definition in `lib/api-spec/openapi.yaml`
2. Run `pnpm --filter @workspace/api-spec run codegen`
3. Implement the route in `artifacts/api-server/src/routes/`
4. Register it in `artifacts/api-server/src/routes/index.ts` if a new file
5. Use the generated hook in the frontend

### Add a new frontend page
1. Create the component in `artifacts/talentlock/src/pages/`
2. Add the route in `artifacts/talentlock/src/App.tsx`

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `CLERK_SECRET_KEY` | Yes | Clerk backend API (auth + account deletion) |
| `CSRF_SECRET` | Yes | 64-char hex for admin CSRF (`openssl rand -hex 32`) |
| `RESEND_API_KEY` | Optional | Transactional email — no-op if unset |
| `EMAIL_FROM` | Optional | From address (default `noreply@talentlock.io`) |
| `APP_URL` | Optional | Base URL for email CTAs (default `http://localhost:25807`) |

---

## Notes for Cursor

- **pnpm workspace** — always use `pnpm --filter @workspace/<name>` to target a package
- **Never edit generated files** in `lib/api-client-react/src/` or `lib/api-zod/src/`
- **Pino logging** — use `req.log` in route handlers, never `console.log`
- **React Query hooks** — import from `@workspace/api-client-react`
- **Zod validation** — import from `@workspace/api-zod` in route handlers
- **Vite proxy** — all `/api` requests proxied to `localhost:8080`; no CORS config needed
- **GCS credentials** — required for file uploads; all other features work without it
- **Codegen checks** — after every codegen run: `orval.config.ts` must have `indexFiles: false`; `index.ts` must only export `./generated/api`
- **Route ordering** — `GET /api/availability/me` BEFORE `GET /api/availability/:freelancerId`; `PATCH /api/notifications/read-all` BEFORE `PATCH /api/notifications/:id/read`; `GET /api/admin/csrf-token` BEFORE `doubleCsrfProtection` is applied
- **Fire-and-forget pattern** — auto-blocks, `createNotification()`, `logAudit()`, `sendNotificationEmail()` must ALL use `.catch()` — never awaited from route handlers
- **Input sanitisation** — all free-text DB writes must pass through `sanitiseText()` from `lib/sanitise.ts`
- **Completeness score** — `calculateCompletenessScore()` must be saved atomically in the same `db.update()` as the profile change
- **Pagination shape** — bookings/agreements/meetings list endpoints return `{ data, total, page, pageSize, totalPages }` — never a plain array
- **Rate suggestion** — "Use suggested rate" fills the rate input only; never submits the booking form
- **Team routes** — require `employer_enterprise` plan + active `team_members` row; use `requireTeamMember()` / `requireTeamAdmin()` middleware
- **Invite tokens** — single-use UUID; cleared immediately on acceptance; expire after 7 days (`inviteExpiresAt`)
- **GDPR deletion** — anonymise in Drizzle transaction first, then call Clerk API outside the transaction; if Clerk fails, reset request to `pending` for retry
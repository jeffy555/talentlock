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
| `bookings` | Exclusive engagements. Has negotiation columns: `proposedRate`, `lastProposedBy`, `negotiationStatus`, optional employer `message`, and post-engagement debrief cache: `debriefContent` (jsonb — dual employer/freelancer slices), `debriefGeneratedAt`, `debriefRegeneratedAt` |
| `agreements` | AI-generated legal agreements. Has `freelancerSignatureImageUrl`, `employerSignatureImageUrl`, `status`, `healthScore`, `healthScoreDetail`, `healthScoredAt`, `freelancerSummary`, `freelancerSummaryScoredAt`, `employerSignedAt`, `freelancerSignedAt` columns. |
| `conversations` | AI match chat sessions. Has `jobRequirementId` column. |
| `messages` | Individual chat messages |
| `meetings` | Discovery meeting requests |
| `subscriptions` | Per-user billing plan and status |
| `audit_logs` | Login/logout and sensitive-action audit trail. Has `ipAddress`, `userAgent`, `entityType`, `entityId`, `metadata` columns. |
| `token_usage` | AI token consumption per user per feature. Has `conversationId` column. |
| `documents` | Freelancer identity/credential uploads for AI verification. Has `expiryDate` (nullable, freelancer-supplied) and `expiryAlertStage` (`none\|90d\|30d\|7d\|expired`, tracks which expiry alert was last sent) columns. `status` gains an `expired` value alongside `pending\|verified\|rejected\|needs_review`. |
| `reviews` | Employer reviews of freelancers after completed bookings. One per booking. |
| `notifications` | In-app notification rows for all users. Triggered server-side on key platform events. |
| `account_deletion_requests` | GDPR deletion requests. Tracks status from pending → complete. |
| `availability_blocks` | Freelancer unavailability date ranges. Has `freelancerId`, `startDate`, `endDate`, `reason`, `label`, `bookingId` columns. Auto-created from confirmed bookings; manually created by freelancers. |
| `teams` | Enterprise team accounts. Has `ownerUserId`, `name` columns. |
| `team_members` | Team membership with roles (admin/member), invite tokens, and status. |
| `saved_freelancers` | Employer personal watchlist (heart icon on Talent Vault). Has `employerUserId`, `freelancerId`, `createdAt`, `notes` (nullable private employer note, max 500 chars), `lastAlertAt` (nullable — debounces `WATCHLIST_UPDATE` notifications to once per 24 h per pair). UNIQUE on `(employerUserId, freelancerId)`. |
| `team_shortlist` | Shared freelancer shortlist for enterprise teams. |
| `cruise_mode_configs` | One per freelancer. Has `isActive`, `isDryRun`, `rules` (jsonb), `rulesVersion`, `messagesThisMonth`, `messagesResetAt` columns. |
| `cruise_mode_activity` | Per-job evaluation log.
| `employer_documents` | Employer business identity document uploads. Has `id`, `employerId`, `documentType`, `fileUrl`, `status` (pending|verified|rejected|needs_review), `confidence`, `aiNotes` (admin-facing — never returned to employer), `employerNotes` (employer-facing plain English), `adminNotes`, `reviewedBy`, `reviewedAt`. UNIQUE on `(employerId, documentType)`. Upsert on re-upload — single row per type. |
| `talent_search_configs` | One per employer. Mirror of `cruise_mode_configs`. Has `isActive`, `isDryRun`, `rules` (jsonb), `rulesVersion`, `hoursUsedToday`, `dailyLimitHours`, `hoursResetAt` columns. UNIQUE on `employerId`. |
| `talent_search_activity` | Per-freelancer evaluation log. Has `employerId`, `freelancerId`, `score`, `decision`, `matchReasons`, `proposedMessage`, `sentAt` columns. | Has `freelancerId`

`conversations` gains 5 new nullable columns: `type` (text NOT NULL DEFAULT 'ai_match' — 'ai_match'|'human_direct'), `employerId`, `freelancerId`, `bookingId`, `meetingId`, `lastMessageAt`. `messages` gains `senderType` (text NOT NULL DEFAULT 'ai' — 'ai'|'human') and `readAt` (timestamptz nullable). All existing rows backfilled to 'ai_match' / 'ai' via column defaults — AI chat is completely unchanged.

`meetings` gains `briefContent` (jsonb nullable — `MeetingBrief` type) and `briefGeneratedAt` (timestamptz nullable). Brief is generated fire-and-forget when meeting `status` changes to `confirmed`. Cached on the meeting row. Regeneratable via `POST /api/employer-documents/upload-url              Presigned GCS upload URL for employer business document (employer only, image types only)
POST /api/employer-documents/confirm                 Confirm employer document upload and trigger AI review fire-and-forget; upserts row
GET  /api/employer-documents/me                      Employer own document statuses (allowlist: documentType, status, employerNotes, updatedAt — never aiNotes/fileUrl)
GET  /api/employer-documents/me/:documentType/view-url  Short-lived 15-min signed URL for employer to preview own document
GET  /api/admin/employer-documents                   Paginated admin queue of pending/needs_review employer documents with signed file URLs and aiNotes
POST /api/admin/employer-documents/:id/verify        Admin verify employer document; recalculates verificationLevel; notifies employer
POST /api/admin/employer-documents/:id/reject        Admin reject employer document; adminNotes required; notifies employer

POST /api/conversations/direct                    Create or retrieve a human_direct conversation between employer and freelancer
GET  /api/conversations/direct                    Paginated inbox of human_direct conversations for current user
GET  /api/conversations/:id/messages              Paginated message history (human thread — marks messages read on fetch)
POST /api/conversations/:id/messages              Send a human message (rate-limited 30/hr; 403 non-participant; 422 for ai_match conversations)
PATCH /api/conversations/:id/read                 Mark all unread messages in this conversation as read
GET  /api/messages/unread-count                   Count of conversations with unread messages for current user

POST /api/meetings/:id/brief`., `jobRequirementId`, `score`, `decision`, `matchReasons`, `proposedMessage`, `sentAt` columns. |
| `employer_documents` | Employer business identity document uploads. Has `id`, `employerId`, `documentType`, `fileUrl`, `status` (pending|verified|rejected|needs_review), `confidence`, `aiNotes` (admin-facing — never returned to employer), `employerNotes` (employer-facing plain English), `adminNotes`, `reviewedBy`, `reviewedAt`. UNIQUE on `(employerId, documentType)`. Upsert on re-upload — single row per type. |
| `talent_search_configs` | One per employer. Has `isActive`, `isDryRun`, `rules` (jsonb), `rulesVersion`, `hoursUsedToday`, `dailyLimitHours`, `hoursResetAt`. UNIQUE on `employerId`. |
| `talent_search_activity` | Per-freelancer evaluation log. Has `employerId`, `freelancerId`, `rulesVersion`, `score`, `decision`, `matchReasons`, `proposedMessage`, `sentAt`, `freelancerResponded`, `freelancerOptedOut`. |

### Teaching Professional Profile additions (additive, non-breaking)

`employer_profiles` gains `verificationLevel` (text NOT NULL DEFAULT 'unverified' — 'unverified'|'partially_verified'|'fully_verified') and `isVerified` (boolean NOT NULL DEFAULT false). Both recalculated atomically in the same transaction as every `employer_documents` status change — they never drift.

`freelancer_profiles` gains `talentSearchNotificationsToday` (integer DEFAULT 0) and `talentSearchNotificationsResetAt` (timestamptz) for freelancer daily notification cap (max 3 TalentSearch notifications per day).

`freelancer_profiles` gains `professionCategory` (text, NOT NULL DEFAULT 'technology') and 12 nullable education fields: `educationProfessionType`, `teachingSubjects`, `teachingLevels`, `yearsTeachingExperience`, `highestDegree`, `degreeSubject`, `degreeInstitution`, `teachingLicenceState`, `teachingLicenceExpiry`, `dbsCheckStatus`, `researchPublications`, `preferredTeachingMode`, `location`.

`job_requirements` gains `professionCategory` (text, NOT NULL DEFAULT 'technology') and `rateType` (text, NOT NULL DEFAULT 'hourly').

All existing rows backfilled to `'technology'` / `'hourly'` via column default — zero behaviour change for existing data.

### Credential Expiry Tracking additions (additive, non-breaking)

`freelancer_profiles` gains `teachingLicenceAlertStage` (text NOT NULL DEFAULT 'none' — `none|90d|30d|7d|expired`), tracking the last expiry alert stage sent for `teachingLicenceExpiry` so alerts never duplicate and safely catch up if the daily scan misses a day.

`documents` gains `expiryDate` (timestamptz, nullable, freelancer-supplied at upload time) and `expiryAlertStage` (text NOT NULL DEFAULT 'none' — same 5-value enum). `status` gains a 5th value, `expired`, alongside the existing `pending|verified|rejected|needs_review` — set when a `verified` document's `expiryDate` passes; `updateVerificationLevel()` (unchanged) automatically downgrades the badge since it only counts `status = 'verified'`.

### Freelancer Watchlist additions (additive, non-breaking)

`saved_freelancers` gains `notes` (text, nullable) and `lastAlertAt` (timestamptz, nullable). Existing rows need no backfill.

Personal watchlist plan limits: `employer_starter` = 25, `employer_growth` = 100. Active enterprise `team_members` use `team_shortlist` instead — personal watchlist endpoints return `[]` / `403`.

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
| `/messages` | Messages inbox — all human_direct conversations, sorted by last message | Authenticated |
| `/messages/:id` | Message thread — full conversation with input box and 30s polling | Authenticated |
| `/cruise-mode` | Cruise Mode setup, activity feed, and stats | `freelancer_pro` only |
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
                                                   Additive optional filters: ?professionCategory=technology|education, ?teachingSubject=<text> (case-insensitive array match)
GET  /api/freelancers/:id                         Freelancer detail (includes nextAvailableDate)
GET  /api/freelancers/me                          My freelancer profile
PUT  /api/freelancers/me                          Update my freelancer profile (recalculates completenessScore atomically)
GET  /api/freelancers/saved                       List employer personal watchlist (WatchlistItem[]; employer only; [] for active team members)
GET  /api/freelancers/:id/saved                   Check if freelancer is on employer watchlist
POST /api/freelancers/:id/save                    Toggle watchlist save/unsave (employer only; 402 at plan limit; 403 for active team members)
PATCH /api/freelancers/:id/watchlist              Update private notes for a watchlisted freelancer (employer only)

GET  /api/employers/me                            My employer profile
PUT  /api/employers/me                            Update my employer profile

GET  /api/job-requirements                        List jobs
POST /api/job-requirements                        Create job
GET  /api/job-requirements/:id                    Job detail
PATCH /api/job-requirements/:id                   Update job
DELETE /api/job-requirements/:id                  Delete job

GET  /api/bookings                                Paginated list (?page, ?pageSize — returns {data,total,page,pageSize,totalPages})
POST /api/bookings                                Create booking (optional `message` max 500 chars)
GET  /api/bookings/:id                            Booking detail (includes review object, employer message, `hasDebrief`, `debriefGeneratedAt` — never raw `debriefContent`)
PATCH /api/bookings/:id                           Update booking (status, milestones, negotiation)
GET  /api/bookings/:id/debrief                    Role-filtered post-engagement debrief slice (participant only; 404 if not ready)
POST /api/bookings/:id/debrief                    Generate or regenerate debrief (202 Accepted; 24h cooldown; `booking_debrief` token charged to employer)

GET  /api/agreements                              Paginated list (?page, ?pageSize)
POST /api/agreements                              Generate agreement (AI)
GET  /api/agreements/:id                          Agreement detail
POST /api/agreements/:id/sign                     Sign agreement (image or typed name)
GET  /api/agreements/:id/download                 Download fully signed agreement as a formatted PDF; cached in GCS after first generation; both parties; requires status = fully_signed
POST /api/agreements/:id/redline                  AI contract review suggestions (Growth+)
PATCH /api/agreements/:id/accept-redline          Accept a redline suggestion
POST /api/agreements/:id/health-score             AI contract quality score across 5 dimensions (0–100); cached on agreements table; invalidated on redline accept
POST /api/agreements/:id/summarise               AI plain-English summary for freelancer (6 sections + attention flags); cached; invalidated on redline accept; freelancer-only (403 for employers)

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

GET  /api/documents/me                            Freelancer own document statuses (includes expiryDate, daysUntilExpiry)
POST /api/documents/upload-url                    Request presigned GCS upload URL for document
POST /api/documents/confirm                       Confirm document upload and trigger AI review (accepts optional expiryDate; resets expiry state on re-upload)
PATCH /api/documents/:documentType/expiry         Set/clear expiry date on an existing document without re-uploading

POST /api/cron/credential-expiry                  Daily credential expiry scan (machine-only; requires x-cron-secret header matching CRON_SECRET; NOT under /api/admin, bypasses CSRF middleware)

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

GET  /api/talent-search                          Employer TalentSearch config (null if none)
POST /api/talent-search                          Create or update TalentSearch config
PATCH /api/talent-search/activate                Activate live mode (employer only)
PATCH /api/talent-search/dry-run                 Activate dry run mode
PATCH /api/talent-search/deactivate              Deactivate
POST /api/talent-search/parse-rules              AI parses free-form employer rules into structured TalentSearchRules
GET  /api/talent-search/activity                 Paginated activity feed (freelancers evaluated, scores, decisions)
PATCH /api/talent-search/activity/:id/responded  Mark freelancer as responded
POST /api/talent-search/opt-out/:employerId      Freelancer opts out of notifications from specific employer
GET  /api/talent-search/stats                    Today stats + hours used

GET  /api/talent-search                          Employer TalentSearch config (null if none)
POST /api/talent-search                          Create or update TalentSearch config
PATCH /api/talent-search/activate                Activate live mode (employer only)
PATCH /api/talent-search/dry-run                 Activate dry run mode
PATCH /api/talent-search/deactivate              Deactivate
POST /api/talent-search/parse-rules              AI parses free-form text into TalentSearchRules
GET  /api/talent-search/activity                 Paginated activity feed (freelancers evaluated)
POST /api/talent-search/activity/:id/follow-up   Mark employer follow-up sent
GET  /api/talent-search/stats                    Today and monthly stats

GET  /api/cruise-mode                            Freelancer Cruise Mode config (null if none)
POST /api/cruise-mode                            Create or update Cruise Mode config
PATCH /api/cruise-mode/activate                  Activate live mode (freelancer_pro only)
PATCH /api/cruise-mode/dry-run                   Activate dry run mode
PATCH /api/cruise-mode/pause                     Pause Cruise Mode
PATCH /api/cruise-mode/deactivate                Deactivate and clear
POST /api/cruise-mode/parse-rules                AI parses free-form text into structured rules
GET  /api/talent-search                          Employer TalentSearch config (null if none)
POST /api/talent-search                          Create or update TalentSearch config
PATCH /api/talent-search/activate                Activate live mode (employer only)
PATCH /api/talent-search/dry-run                 Activate dry run mode
PATCH /api/talent-search/deactivate              Deactivate
POST /api/talent-search/parse-rules              AI parses free-form text into TalentSearchRules
GET  /api/talent-search/activity                 Paginated activity feed (freelancers evaluated)
POST /api/talent-search/activity/:id/follow-up   Mark employer follow-up sent
GET  /api/talent-search/stats                    Today and monthly stats

GET  /api/cruise-mode/activity                   Paginated activity feed (jobs evaluated, scores, decisions, messages)
POST /api/cruise-mode/activity/:id/follow-up     Mark follow-up sent for an activity entry
GET  /api/talent-search                          Employer TalentSearch config (null if none)
POST /api/talent-search                          Create or update TalentSearch config
PATCH /api/talent-search/activate                Activate live mode (employer only)
PATCH /api/talent-search/dry-run                 Activate dry run mode
PATCH /api/talent-search/deactivate              Deactivate
POST /api/talent-search/parse-rules              AI parses free-form text into TalentSearchRules
GET  /api/talent-search/activity                 Paginated activity feed (freelancers evaluated)
POST /api/talent-search/activity/:id/follow-up   Mark employer follow-up sent
GET  /api/talent-search/stats                    Today and monthly stats

GET  /api/cruise-mode/stats                      Today and monthly stats

POST /api/employer-documents/upload-url              Presigned GCS upload URL for employer business document (employer only, image types only)
POST /api/employer-documents/confirm                 Confirm employer document upload and trigger AI review fire-and-forget; upserts row
GET  /api/employer-documents/me                      Employer own document statuses (allowlist: documentType, status, employerNotes, updatedAt — never aiNotes/fileUrl)
GET  /api/employer-documents/me/:documentType/view-url  Short-lived 15-min signed URL for employer to preview own document
GET  /api/admin/employer-documents                   Paginated admin queue of pending/needs_review employer documents with signed file URLs and aiNotes
POST /api/admin/employer-documents/:id/verify        Admin verify employer document; recalculates verificationLevel; notifies employer
POST /api/admin/employer-documents/:id/reject        Admin reject employer document; adminNotes required; notifies employer

POST /api/conversations/direct                    Create or retrieve a human_direct conversation between employer and freelancer
GET  /api/conversations/direct                    Paginated inbox of human_direct conversations for current user
GET  /api/conversations/:id/messages              Paginated message history (human thread — marks messages read on fetch)
POST /api/conversations/:id/messages              Send a human message (rate-limited 30/hr; 403 non-participant; 422 for ai_match conversations)
PATCH /api/conversations/:id/read                 Mark all unread messages in this conversation as read
GET  /api/messages/unread-count                   Count of conversations with unread messages for current user

POST /api/meetings/:id/brief                      Generate or regenerate AI meeting brief (employer only, confirmed meetings only, returns 202 Accepted)

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
2. **Talent Vault** — Browse/filter freelancers by field, rate, availability, available-from date, and keyword search (`?q=`); personal watchlist with heart icon (enterprise uses shared team shortlist); completeness gate ≥ 60%
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
30. **Team Accounts (Enterprise)**
31. **AI Contract Health Score** — On-demand 0–100 composite score across 5 dimensions (Clarity, Fairness, Completeness, Enforceability, Industry Fit); letter grade A–F; cached on agreements table; invalidated when redline accepted; visible to both parties on `/agreements/:id`
32. **Auth Hardening (Access Control)** — Per-resource authorization on 11 routes + storage ACL via `accessControl.ts`; server-side agreement signing role; namespaced upload paths; IDOR protection (401/403/404 convention)
33. **Agreement AI Summary**
34. **Agreement PDF Download**
35. **Cruise Mode** — `freelancer_pro` feature; freelancer defines rules (skills, rate range, exclusions, blackout windows) via form or free-form text/file; AI evaluates every new job post against the rules and sends a personalised interest message to the employer on the freelancer's behalf when score ≥ threshold; two-stage filter (pre-filter + AI evaluation); dry run mode; daily digest option; activity feed with match scores and sent messages; monthly quota of 10 messages; employer sees a "Cruise Mode ✦" badge; `cruise_mode_evaluation` token label — `GET /api/agreements/:id/download` returns a professionally formatted PDF for fully signed agreements; rendered via `@react-pdf/renderer` with both signature images (or cursive typed names), signing timestamps, metadata block, and TalentLock footer; cached in GCS after first generation; available to both parties on all plans; GDPR deletion removes cached PDFs — Freelancer-only "✦ Summarise for me" button on `/agreements/:id`; AI produces 6-section plain-English summary (what you do, payment, IP, termination, restrictions, key dates) + up to 3 attention flags; disclaimer always first; cached on agreements table (`freelancerSummary`, `freelancerSummaryScoredAt`); invalidated on redline accept alongside health score; `agreement_summary` token label; 403 for employers

37. **TalentSearch (Employer Cruise Mode)** — mirror of Cruise Mode for employers; fires on `PUT /api/freelancers/me` (not job post); two-stage pre-filter + AI evaluation against `talent_search_configs` rules; sends Express Interest notification to matching freelancers on employer's behalf; freelancer daily cap (3 notifications/day); 30-day duplicate window per employer–freelancer pair; 6h/day budget same model as Cruise Mode; `talent_search_evaluation` token label; `TalentSearch ✦` badge on freelancer notification; employer-only `/talent-search` page with teal accent

36. **Teaching Professional Profile** — `professionCategory` (`technology`|`education`, NOT NULL DEFAULT 'technology') on `freelancer_profiles` and `job_requirements`; `rateType` (`hourly`|`per_day`|`per_session`|`per_course`, NOT NULL DEFAULT 'hourly') on `job_requirements`; 12 nullable education fields (subjects, levels, degree, teaching licence, DBS status, research profile, location) on `freelancer_profiles` for `educationProfessionType` (`school_teacher`|`university_lecturer`|`tutor`|`researcher`); onboarding gains a conditional profession-category step for freelancers (employers unaffected); Talent Vault gains `professionCategory`/`teachingSubject` filters (additive, default behaviour unchanged); AI matching prompt gains profession-context injection that is byte-identical (empty string) for technology jobs; `formatRate()`/`rateUnitLabel()` utility centralises rate unit display across 9 call sites

37. **TalentSearch (Employer Cruise Mode)** — mirror of Cruise Mode for employers; fires on `PUT /api/freelancers/me` when matchable profile fields change (hash-based detection via `profileMatchHash`); employer sets profession/skill/rate/location/required-document rules; AI evaluates freelancer profile fit 0–100; sends personalised "TalentSearch ✦" Express Interest notification to freelancer when score >= threshold; per-`rulesVersion` duplicate prevention; freelancer opt-out per employer; 2 new tables (`talent_search_configs`, `talent_search_activity`); 1 new column on `freelancer_profiles` (`profileMatchHash`); `talent_search_evaluation` token label; employer-only `/talent-search` page

40. **Employer Verification** — parallel to freelancer document verification; new `employer_documents` table (5 document types: company_registration, tax_vat_certificate, business_licence, representative_id, proof_of_business_address); `employer_profiles` gains `verificationLevel` and `isVerified` calculated atomically on every doc status change; AI vision review (employer-specific prompt) produces admin-facing `aiNotes` and employer-facing `employerNotes` separately; upsert on re-upload (UNIQUE constraint per employer+documentType); `employer_doc_review` token label (tracked, not deducted from plan quota); admin queue extension with Employer Docs tab; Verified Employer badge (✓ / ◐ / none) shown on job posts, bookings, meetings to freelancers; aiNotes/fileUrl/confidence NEVER returned to employers or freelancers; GDPR anonymises document content and deletes GCS files; all plans

39. **In-App Direct Messaging** — extends existing `conversations` (adds `type`, `employerId`, `freelancerId`, `bookingId`, `meetingId`, `lastMessageAt`) and `messages` (adds `senderType`, `readAt`) tables with additive columns; AI chat (`type='ai_match'`) completely unchanged; human threads (`type='human_direct'`) support employer↔freelancer messaging scoped to optional booking or meeting; fire-and-forget `new_message` notification + email on each message; email suppressed if recipient read in last 5 min; 30 messages/hour rate limit per user per conversation; deduplication via UNIQUE partial indexes; GDPR anonymises message content to `[Message removed]` on account deletion; `/messages` inbox + `/messages/:id` thread + Messages tab on booking + Messages section on meeting + "Message" button on freelancer profile; unread badge in nav; 30-second polling; all plans

38. **AI Meeting Brief Generator** — fires fire-and-forget when meeting `status → confirmed`; generates 5-section brief for employer: candidate snapshot (name/field/rate/credentials/reviews), why they match (3 specific reasons), suggested questions (5–8 tailored to job + candidate), rate context (vs market median + employer historical avg + budget check), watch points; cached as `briefContent` jsonb on `meetings` table; manual regeneration via `POST /api/employer-documents/upload-url              Presigned GCS upload URL for employer business document (employer only, image types only)
POST /api/employer-documents/confirm                 Confirm employer document upload and trigger AI review fire-and-forget; upserts row
GET  /api/employer-documents/me                      Employer own document statuses (allowlist: documentType, status, employerNotes, updatedAt — never aiNotes/fileUrl)
GET  /api/employer-documents/me/:documentType/view-url  Short-lived 15-min signed URL for employer to preview own document
GET  /api/admin/employer-documents                   Paginated admin queue of pending/needs_review employer documents with signed file URLs and aiNotes
POST /api/admin/employer-documents/:id/verify        Admin verify employer document; recalculates verificationLevel; notifies employer
POST /api/admin/employer-documents/:id/reject        Admin reject employer document; adminNotes required; notifies employer

POST /api/conversations/direct                    Create or retrieve a human_direct conversation between employer and freelancer
GET  /api/conversations/direct                    Paginated inbox of human_direct conversations for current user
GET  /api/conversations/:id/messages              Paginated message history (human thread — marks messages read on fetch)
POST /api/conversations/:id/messages              Send a human message (rate-limited 30/hr; 403 non-participant; 422 for ai_match conversations)
PATCH /api/conversations/:id/read                 Mark all unread messages in this conversation as read
GET  /api/messages/unread-count                   Count of conversations with unread messages for current user

POST /api/meetings/:id/brief` (202 Accepted); employer-only — freelancers never see it; plan-gated questions (Growth+ only in UI, always generated server-side); `meeting_brief` token label charged to employer; amber accent UI card on meeting detail page

41. **Credential Expiry Tracking** — daily scan (`POST /api/cron/credential-expiry`, machine-only, `x-cron-secret` header, triggered by a scheduled GitHub Actions workflow since the API runs on an autoscale deployment target) tracks two expiry sources: `documents.expiryDate` (freelancer-supplied, `professional_credential`/`government_id`) and `freelancer_profiles.teachingLicenceExpiry` (education professionals); alert schedule 90d email → 30d email + in-app + amber profile banner → 7d in-app + red urgent banner + "Expiring Soon" Talent Vault badge → expiry day flips `documents.status` to `expired` (badge auto-downgrades via existing `updateVerificationLevel()`); each credential tracks an `expiryAlertStage` (`none|90d|30d|7d|expired`) so the stage only ever advances — never duplicates an alert, safely catches up if a day is missed; Talent Vault removal (`GET /api/freelancers` exclusion) is scoped **only** to `professionCategory: 'education'` + `educationProfessionType: 'school_teacher'` freelancers with an expired `teachingLicenceExpiry` — the one credential already documented as required; generic `professional_credential` expiry never removes a freelancer from Vault, only degrades the badge and fires alerts; direct profile access (`GET /freelancers/:id`, `/f/:id`) is never blocked by Vault exclusion; re-uploading a document or renewing a teaching licence resets the alert stage to `none`; all plans, no token consumption
42. **Freelancer Watchlist** — employer personal talent pipeline built on `saved_freelancers`; dedicated Watchlist tab on `/freelancers` (non-enterprise); private notes per entry (`PATCH /api/freelancers/:id/watchlist`); in-app `WATCHLIST_UPDATE` notifications when a watched freelancer becomes available or changes rate ≥ 5% (debounced 24 h via `lastAlertAt`); plan limits (starter 25 / growth 100); dashboard summary card; active enterprise team members use `team_shortlist` instead — personal watchlist API returns `[]`/`403`; freelancers never know they are on a watchlist

43. **Post-Engagement AI Debrief** — fires fire-and-forget when booking `status → completed`; single OpenAI call (`gpt-4o-mini`) produces dual role-specific debrief cached as `debriefContent` jsonb on `bookings`; each party reads their slice via `GET /api/bookings/:id/debrief`; manual regeneration via `POST /api/bookings/:id/debrief` (202, 24h cooldown via `debriefRegeneratedAt`); `booking_debrief` token label charged to employer; `BOOKING_DEBRIEF_READY` notification + email to both parties; violet (employer) / indigo (freelancer) `DebriefCard` on `/bookings/:id`; employer starter plan gates sections 3–5 in UI only; GDPR nullifies debrief columns on account deletion

44. **Multi-Currency & Location** — country-derived currency on `users` and denormalised on `freelancer_profiles`; booking `currencyCode` frozen at creation with `exchangeRateAtCreation` snapshot for employer spend analytics; `GET /api/countries` + `GET /api/exchange-rates`; onboarding `location` step; Talent Vault dual-currency display and country/currency filters; agreement rate clause uses booking currency (not hardcoded USD)
45. **Employer Uploaded Agreement** — employers can upload PDF/DOCX/TXT agreements via presigned upload; AI employer-facing summary; amendment points; AI enrich with booking dates/rate; finalize runs contract health review; employer signs via existing e-sign flow (`agreements.source`, `uploadStage`, `employerSummary`, `amendments`)

### Dashboard analytics panels

| Panel | Role | Endpoint | Frontend components |
|---|---|---|---|
| Earnings Intelligence | Freelancer | `GET /api/dashboard/earnings-intelligence` | `artifacts/talentlock/src/components/earnings/` |
| Spend Analytics | Employer | `GET /api/dashboard/spend-analytics` | `artifacts/talentlock/src/components/spend/` |
| Hiring Analytics | Employer | `GET /api/dashboard/hiring-analytics` | `artifacts/talentlock/src/components/hiring/` |

Shared server utilities: `artifacts/api-server/src/lib/earningsUtils.ts` (`getLast6Months`, `fillZeroMonths`, `formatCurrency`, `getWindowDates`, `safeAverage`, `getLifecycleTrend`).


### Cursor notes — Employer Verification

- `employer_documents` is a SEPARATE table from `documents` — never query `documents` for employer docs
- `POST /api/employer-documents/confirm` uses UPSERT (`ON CONFLICT (employer_id, document_type) DO UPDATE`) — re-upload resets to pending
- `recalculateEmployerVerificationLevel(tx, employerId)` receives a transaction object — always called inside a Drizzle transaction alongside the document status update
- `aiNotes` is NEVER returned in any employer-facing or freelancer-facing API response — it is admin-only
- `employerNotes` is employer-safe plain English — no raw document content, no registration numbers
- `GET /api/employer-documents/me` must use an explicit field allowlist — never SELECT *
- Verified Employer badge renders nothing for unverified employers — no empty badge shown to freelancers
- `verificationLevel = fully_verified` requires ALL THREE: representative_id + company_registration + tax_vat_certificate verified
- `employer_doc_review` tokens are tracked against employer account but NOT deducted from plan token quota
- GCS storage path: `uploads/{employerId}/employer-docs/{documentType}/` — separate from freelancer doc paths
- Phase 1: JPEG/PNG/WebP only — PDF support is Phase 2
- Admin reject route: adminNotes is REQUIRED — return 400 if missing

### Cursor notes — In-App Direct Messaging

- `conversations.type` NOT NULL DEFAULT 'ai_match' — all existing AI chat rows are backfilled; NEVER query human threads without `WHERE type = 'human_direct'`
- AI chat routes (`/api/openai/conversations/*`) are COMPLETELY UNCHANGED — human messaging routes live at `/api/conversations/*` (different router)
- `POST /api/conversations/:id/messages` returns 422 if called on an `ai_match` conversation — it is NOT the AI chat endpoint
- Deduplication is enforced by two UNIQUE partial indexes (scoped to booking_id, and unscoped) — `findOrCreateConversation()` uses upsert pattern
- `createNotification()` and `sendNotificationEmail()` are fire-and-forget `.catch()` — never awaited from the message route handler
- Email suppression: check `messages.readAt > now() - 5 minutes` for messages TO the recipient before calling `sendNotificationEmail()`
- Rate limit: count messages from `senderId` in `conversationId` in last 1 hour — return 429 if >= 30
- GDPR: `accountDeletion.ts` must anonymise `messages.content` to `[Message removed]` for deleted user's messages — do NOT delete conversation rows
- `readAt` is tracked server-side but NOT shown as read receipts to senders in Phase 1 UI

### Cursor notes — AI Meeting Brief

- Brief generation fires fire-and-forget on `PATCH /api/meetings/:id` when `status` changes from non-`confirmed` to `confirmed` — capture `previousStatus` BEFORE the `db.update()` call
- Re-fetch meeting at start of `generateMeetingBrief()` and exit early if `status !== confirmed` (guards against race where meeting is cancelled immediately after being confirmed)
- `briefContent` is cached on the `meetings` row — no separate table, no version history, regeneration overwrites
- Token `meeting_brief` is charged to the EMPLOYER account (not freelancer)
- `POST /api/employer-documents/upload-url              Presigned GCS upload URL for employer business document (employer only, image types only)
POST /api/employer-documents/confirm                 Confirm employer document upload and trigger AI review fire-and-forget; upserts row
GET  /api/employer-documents/me                      Employer own document statuses (allowlist: documentType, status, employerNotes, updatedAt — never aiNotes/fileUrl)
GET  /api/employer-documents/me/:documentType/view-url  Short-lived 15-min signed URL for employer to preview own document
GET  /api/admin/employer-documents                   Paginated admin queue of pending/needs_review employer documents with signed file URLs and aiNotes
POST /api/admin/employer-documents/:id/verify        Admin verify employer document; recalculates verificationLevel; notifies employer
POST /api/admin/employer-documents/:id/reject        Admin reject employer document; adminNotes required; notifies employer

POST /api/conversations/direct                    Create or retrieve a human_direct conversation between employer and freelancer
GET  /api/conversations/direct                    Paginated inbox of human_direct conversations for current user
GET  /api/conversations/:id/messages              Paginated message history (human thread — marks messages read on fetch)
POST /api/conversations/:id/messages              Send a human message (rate-limited 30/hr; 403 non-participant; 422 for ai_match conversations)
PATCH /api/conversations/:id/read                 Mark all unread messages in this conversation as read
GET  /api/messages/unread-count                   Count of conversations with unread messages for current user

POST /api/meetings/:id/brief` returns 202 Accepted — client polls `GET /api/meetings/:id` until `briefGeneratedAt` is populated
- Plan gating is UI-only — server always generates full brief including questions regardless of plan
- `rateSuggestionUtils.ts` functions called at brief generation time — read-only, no modification

### Cursor notes — TalentSearch

- `profileMatchHash` (nullable text) added to `freelancer_profiles` — computed SHA-256 of matchable fields; TalentSearch evaluation only fires when this hash changes (bio/photo updates do not trigger evaluation)
- TalentSearch fires on `PUT /api/freelancers/me` (profile update) — fire-and-forget, never awaited, never delays response
- Duplicate prevention: per `(employerId, freelancerId, rulesVersion)` — changing rules version allows re-evaluation of same freelancer
- Freelancer opt-out: `POST /api/talent-search/opt-out/:employerId` — permanently skips all future evaluations for that pair
- Reuses `isInBlackoutWindow()` and `getNextMidnightUTC()` from `cruiseModeUtils.ts` directly
- Teaching Professional Profile spec MUST be implemented before TalentSearch Phase 2 — evaluator reads education columns

Cursor notes — Teaching Professional Profile

- `professionCategory` and `rateType` are NOT NULL with DB defaults (`'technology'` / `'hourly'`) — never write `?? 'technology'` fallback checks, the column guarantees a value
- The 12 education fields are genuinely nullable — guard all education-specific UI on `educationProfessionType !== null`, never on `professionCategory` alone
- AI matching prompt: `buildProfessionContext()` MUST return `''` (empty string, no whitespace) for `professionCategory !== 'education'` — this guarantees byte-identical prompts for all existing technology jobs. Any prompt change here requires the diff regression test in `specs/teaching-professional-profile/task.md` Task 2.3
- `calculateCompletenessScore()` is NOT modified by this feature — education fields do not affect the ≥60% Talent Vault visibility gate
- No new columns on `bookings` or `agreements` — `professionCategory`/`rateType` are read via `booking.jobRequirementId` join when needed (e.g. agreement generation in a future spec)

### Cursor notes — Credential Expiry Tracking

- The cron route lives at `POST /api/cron/credential-expiry`, deliberately **outside** `/api/admin` — `app.use("/api/admin", ...)` in `app.ts` applies CSRF double-submit protection to every non-GET method under that prefix, which is wrong for a machine-to-machine scheduled call. Never move this route under `/api/admin`.
- Auth for the cron route is a shared-secret header (`x-cron-secret` matching `CRON_SECRET` env var, timing-safe compared), NOT the Clerk-based admin session — there is no browser session involved.
- Fails closed: if `CRON_SECRET` is unset, the route returns 500 (same pattern as `CSRF_SECRET`), never silently skipping auth.
- No in-process `setInterval` scheduler exists or should be added — the deployment target (`.replit`, `deploymentTarget = "autoscale"`) idles/scales instances, so a persistent in-process timer is unreliable. The daily trigger is an external scheduled GitHub Actions workflow (`.github/workflows/credential-expiry-cron.yml`) that POSTs to the cron endpoint.
- `expiryAlertStage` (`documents`) and `teachingLicenceAlertStage` (`freelancer_profiles`) only ever advance forward (`none → 90d → 30d → 7d → expired`) — the scan is safe to run more than once a day and safe if a day is skipped.
- Vault exclusion in `GET /api/freelancers` is scoped to `professionCategory: 'education' && educationProfessionType: 'school_teacher' && teachingLicenceExpiry < now()` only — do not extend this to generic `professional_credential` expiry without a separate, explicitly scoped decision; verification status has never gated Vault visibility for the general freelancer population.
- Re-upload via `POST /documents/confirm` (existing upsert on `(freelancerId, documentType)`) MUST reset `expiryDate: null, expiryAlertStage: 'none'` — otherwise a renewed credential inherits a stale `expired` stage and immediately re-triggers a false alert.
- `PATCH /api/freelancers/me` MUST reset `teachingLicenceAlertStage: 'none'` whenever `teachingLicenceExpiry` changes to a new value — otherwise a renewed licence stays excluded from Vault after renewal.
- `updateVerificationLevel()` (`documentReview.ts`) is unchanged and reused as-is — it already only counts `status = 'verified'`, so flipping a document to `expired` automatically downgrades the badge with zero new logic.

### Cursor notes — Freelancer Watchlist

- `saved_freelancers` is the personal employer watchlist — do NOT merge with `team_shortlist`. Enterprise active `team_members` must be blocked from personal save endpoints server-side (`403`/`[]`), not only in the UI.
- `GET /api/freelancers/saved` MUST be registered before `GET /api/freelancers/:id` — otherwise Express matches `:id = "saved"`.
- `GET /api/freelancers/saved` list query MUST use a single JOIN — the current per-ID `Promise.all` pattern is replaced in this feature.
- `notifyWatchlistSubscribers()` fires fire-and-forget from `PUT /api/freelancers/me` after a successful profile update — never awaited, never blocks the response.
- `lastAlertAt` debounce is per `(employerUserId, freelancerId)` row — max one `WATCHLIST_UPDATE` notification per pair per 24 hours.
- Rate-change alerts use a ≥ 5% relative threshold on `hourlyRate` or `dailyRate`; availability alerts fire only on `isAvailable: false → true`.
- Watchlist entries persist even when a freelancer drops below the 60% Vault gate — show a muted "No longer in Talent Vault" badge on the card; do not auto-remove saves.
- Frontend 402 `PLAN_LIMIT` on save toggle redirects to `/pricing` — do NOT show inline error in a drawer (match PostJob/JobDetail pattern).

### Cursor notes — Post-Engagement AI Debrief

- Debrief auto-fires on `PATCH /api/bookings/:id` when `status` transitions to `completed` — fire-and-forget, never awaited
- `GET /api/bookings/:id/debrief` returns **role-filtered slice only** — never full `debriefContent` to client
- Token `booking_debrief` charged to **employer** account
- Re-fetch booking at start of `generateBookingDebrief()` — exit if `status !== 'completed'`
- Manual regen debounced 24h via `debriefRegeneratedAt` — auto-trigger on first completion is not debounced
- GDPR: nullify `debriefContent` + timestamps on account deletion for participant bookings
- Agreement `content` field must NEVER be passed to the debrief prompt
- Plan gating for employer sections 3–5 is UI-only — server always generates full employer debrief

### Utility file registry

| File | Purpose |
|---|---|
| `artifacts/api-server/src/lib/availabilityUtils.ts` | `calculateNextAvailableDate`, `refreshNextAvailableDate`, `createAvailabilityBlock`, `deleteAvailabilityBlockByBookingId` |
| `artifacts/api-server/src/lib/employerDocReviewUtils.ts` | `reviewEmployerDocument()`, `calculateVerificationLevel()`, `recalculateEmployerVerificationLevel()`, `buildEmployerDocReviewPrompt()`, `validateEmployerDocReviewResponse()`, `DOCUMENT_TYPE_LABELS`, `REQUIRED_FOR_PARTIAL`, `REQUIRED_FOR_FULL` |
| `artifacts/api-server/src/routes/employerDocuments.ts` | All `/api/employer-documents/*` routes |
| `artifacts/talentlock/src/components/employer/EmployerVerificationSection.tsx` | Employer profile verification section — disclaimer, status pill, 5-doc checklist, upload flow |
| `artifacts/talentlock/src/components/employer/VerifiedEmployerBadge.tsx` | Trust badge component — renders green/amber/nothing based on verificationLevel |
| `artifacts/api-server/src/lib/conversationsUtils.ts` | `findOrCreateConversation()`, `sendHumanMessage()`, `shouldSuppressEmail()`, `markConversationRead()`, `getUnreadConversationCount()` |
| `artifacts/api-server/src/routes/conversations.ts` | All `/api/conversations/*` and `/api/messages/unread-count` routes |
| `artifacts/talentlock/src/pages/MessagesInbox.tsx` | `/messages` inbox page with conversation list |
| `artifacts/talentlock/src/pages/MessageThread.tsx` | `/messages/:id` full thread view |
| `artifacts/talentlock/src/components/messages/` | `BookingMessageThread`, `MeetingMessageThread`, `InlineMessageThread` |
| `artifacts/api-server/src/lib/meetingBriefGenerator.ts` | `generateMeetingBrief(db, meetingId, log)` — fire-and-forget brief generation; `resolveJobRequirement()` — 3-path job resolution; `buildMeetingBriefPrompt()` — verbatim prompt builder |
| `artifacts/talentlock/src/components/meetings/MeetingBriefCard.tsx` | Brief card with 4 states: not-generated, generating (polling), loaded, error |
| `artifacts/api-server/src/lib/bookingDebriefGenerator.ts` | `generateBookingDebrief(db, bookingId, log)` — fire-and-forget dual debrief generation; `validateDebriefResponse()`, `buildBookingDebriefPrompt()`, `isWithinDebriefRegenCooldown()` |
| `artifacts/talentlock/src/components/bookings/DebriefCard.tsx` | Post-engagement debrief card with 4 states; violet (employer) / indigo (freelancer); starter plan gating |
| `artifacts/api-server/src/lib/talentSearchUtils.ts` | `talentSearchPreFilter()`, `normaliseFreelancer()`, `buildTalentSearchEvaluationPrompt()`, `validateTalentSearchResponse()` |
| `artifacts/api-server/src/lib/talentSearchEvaluator.ts` | `evaluateTalentSearchForUpdatedProfile()` — background evaluation pipeline; fires after profile update |
| `artifacts/api-server/src/routes/talentSearch.ts` | All `/api/talent-search/*` routes |
| `artifacts/talentlock/src/components/talent-search/` | `TalentSearchStatusBar`, `TalentSearchRuleBuilder`, `TalentSearchActivityFeed` |
| `artifacts/talentlock/src/lib/rateFormatUtils.ts` | `formatRate(amount, rateType, currencySymbol)`, `rateUnitLabel(rateType)` — centralised rate display for hourly/per_day/per_session/per_course |
| `artifacts/api-server/src/lib/employerDocReviewUtils.ts` | `reviewEmployerDocument()`, `calculateVerificationLevel()`, `recalculateEmployerVerificationLevel()`, `buildEmployerDocReviewPrompt()`, `validateEmployerDocReviewResponse()`, `DOCUMENT_TYPE_LABELS`, `REQUIRED_FOR_PARTIAL`, `REQUIRED_FOR_FULL` |
| `artifacts/api-server/src/routes/employerDocuments.ts` | All `/api/employer-documents/*` routes |
| `artifacts/talentlock/src/components/employer/EmployerVerificationSection.tsx` | Employer profile verification section — disclaimer, status pill, 5-doc checklist, upload flow |
| `artifacts/talentlock/src/components/employer/VerifiedEmployerBadge.tsx` | Trust badge component — renders green/amber/nothing based on verificationLevel |
| `artifacts/api-server/src/lib/conversationsUtils.ts` | `findOrCreateConversation()`, `sendHumanMessage()`, `shouldSuppressEmail()`, `markConversationRead()`, `getUnreadConversationCount()` |
| `artifacts/api-server/src/routes/conversations.ts` | All `/api/conversations/*` and `/api/messages/unread-count` routes |
| `artifacts/talentlock/src/pages/MessagesInbox.tsx` | `/messages` inbox page with conversation list |
| `artifacts/talentlock/src/pages/MessageThread.tsx` | `/messages/:id` full thread view |
| `artifacts/talentlock/src/components/messages/` | `BookingMessageThread`, `MeetingMessageThread`, `InlineMessageThread` |
| `artifacts/api-server/src/lib/meetingBriefGenerator.ts` | `generateMeetingBrief(db, meetingId, log)` — fire-and-forget brief generation; `resolveJobRequirement()` — 3-path job resolution; `buildMeetingBriefPrompt()` — verbatim prompt builder |
| `artifacts/talentlock/src/components/meetings/MeetingBriefCard.tsx` | Brief card with 4 states: not-generated, generating (polling), loaded, error |
| `artifacts/api-server/src/lib/talentSearchUtils.ts` | `employerPreFilter()`, `computeProfileMatchHash()`, `buildTalentSearchPrompt()`, `validateTalentSearchResponse()` |
| `artifacts/api-server/src/lib/talentSearchEvaluator.ts` | `evaluateTalentSearchForUpdatedProfile()` — background pipeline; fires on profile update |
| `artifacts/api-server/src/routes/talentSearch.ts` | All `/api/talent-search/*` routes |
| `artifacts/talentlock/src/components/talent-search/` | `TalentSearchStatusBar`, `TalentSearchRuleBuilder`, `TalentSearchActivityFeed` |
| `artifacts/talentlock/src/components/onboarding/TeachingDetailsSection.tsx` | Conditional onboarding/profile section for `professionCategory: 'education'` freelancers |
| `lib/db/src/schema/` — `REQUIRED_DOCUMENTS_BY_EDUCATION_TYPE` | Static lookup: required/recommended documents per `educationProfessionType` |
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
| `artifacts/api-server/src/lib/contractHealthUtils.ts` | `buildHealthScorePrompt()`, `validateHealthScoreResponse()` — server-side health score utilities |
| `artifacts/talentlock/src/lib/contractHealthUtils.ts` | `getHealthGrade()`, `verdictColour()`, `DIMENSION_LABELS` — client-side score display helpers |
| `artifacts/talentlock/src/components/ContractHealthScoreCard.tsx` | Health score card with 5-dimension breakdown, grade badge, redline nudge |
| `artifacts/api-server/src/lib/accessControl.ts` | `resolveUserByClerkId`, `canAccessBooking/Meeting/JobRequirement/Conversation/Agreement`, `agreementRoleForUser` — per-resource authorization helpers |
| `artifacts/api-server/validate-auth-hardening.mjs` | Automated validation runner for Auth Hardening (32 checks) |
| `artifacts/api-server/src/lib/agreementSummaryUtils.ts` | `buildSummaryPrompt()`, `validateSummaryResponse()`, `AGREEMENT_SUMMARY_DISCLAIMER` — server-side summary utilities |
| `artifacts/talentlock/src/lib/agreementSummaryUtils.ts` | `SECTION_ORDER`, `SECTION_ICONS`, `AGREEMENT_SUMMARY_DISCLAIMER` — client-side section ordering and icon map |
| `artifacts/talentlock/src/components/AgreementSummaryPanel.tsx` | 6-section plain-English summary panel with attention flags, disclaimer, cache indicator; freelancer-only |
| `artifacts/api-server/src/lib/agreementPdfUtils.ts` | `generateAgreementPdf()`, `preprocessAgreementContent()`, `formatSignedAt()`, `AgreementPdf` React component — server-side PDF generation |
| `artifacts/talentlock/src/lib/downloadUtils.ts` | `downloadAgreementPdf()` — shared browser file download helper for detail page and list page |
| `artifacts/api-server/src/lib/cruiseModeUtils.ts` | `preFilter()`, `isInBlackoutWindow()`, `normaliseJob()`, `buildEvaluationPrompt()`, `validateEvaluationResponse()` |
| `artifacts/api-server/src/lib/cruiseModeEvaluator.ts` | `evaluateCruiseModeForNewJob()` — background evaluation pipeline; fires after job creation |
| `artifacts/api-server/src/routes/cruiseMode.ts` | All `/api/cruise-mode/*` routes |
| `artifacts/talentlock/src/components/cruise-mode/` | `CruiseModeStatusBar`, `CruiseModeRuleBuilder`, `CruiseModeActivityFeed` |
| `artifacts/api-server/src/lib/credentialExpiryUtils.ts` | `daysUntil()`, `targetStageForDaysRemaining()`, `stageAdvanced()`, `alertCopyForStage()` — shared expiry-stage math for both `documents` and teaching licence |
| `artifacts/api-server/src/lib/credentialExpiryScan.ts` | `runCredentialExpiryScan(log)` — daily scan pipeline; scans `documents.expiryDate` and `freelancer_profiles.teachingLicenceExpiry`, advances alert stages, fires alerts, flips expired document status |
| `artifacts/api-server/src/lib/cronAuth.ts` | `requireCronSecret()` — Express middleware; timing-safe `x-cron-secret` header check against `CRON_SECRET`, fails closed (500) if unset |
| `artifacts/api-server/src/routes/cron.ts` | `POST /api/cron/credential-expiry` — machine-only, mounted outside `/api/admin` |
| `artifacts/talentlock/src/components/CredentialExpiryBanner.tsx` | Amber (≤30d) / red (≤7d or expired) banner on `/profile`, sourced from `GET /documents/me` + teaching licence fields |
| `artifacts/api-server/src/lib/watchlistLimits.ts` | `WATCHLIST_LIMITS`, `watchlistLimitForPlan()`, `countWatchlist()` — plan gate for personal watchlist |
| `artifacts/api-server/src/lib/watchlistAlerts.ts` | `shouldNotifyAvailability()`, `shouldNotifyRateChange()`, `notifyWatchlistSubscribers()` — fire-and-forget watchlist change alerts |
| `artifacts/api-server/src/lib/teamMembership.ts` | `isActiveTeamMember()` — blocks personal watchlist for enterprise team members |
| `artifacts/api-server/src/routes/savedFreelancers.ts` | `/api/freelancers/saved`, `/api/freelancers/:id/saved`, `/api/freelancers/:id/save`, `/api/freelancers/:id/watchlist` |
| `artifacts/talentlock/src/components/watchlist/WatchlistToggleButton.tsx` | Heart toggle for personal watchlist |
| `artifacts/talentlock/src/components/watchlist/WatchlistNotesEditor.tsx` | Inline private notes editor on watchlist panel |
| `artifacts/talentlock/src/components/watchlist/WatchlistSummaryCard.tsx` | Employer dashboard watchlist summary |

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

### Per-Resource Authorization (Access Control)

- Clerk authentication (`getAuth(req)`) only proves **who** the caller is — it does NOT prove they own a given resource. Every `/:id` detail, mutation, sign, download, and delete route must additionally verify participation/ownership.
- Canonical pattern: resolve the `users` row from the Clerk id, load the resource, then check the caller's `employer_profiles`/`freelancer_profiles` id against the resource's `employerId`/`freelancerId`. See `artifacts/api-server/src/routes/milestones.ts` (`canAccessBooking`) and `POST /bookings/:id/negotiate`.
- Shared helpers live in `artifacts/api-server/src/lib/accessControl.ts` (`spec/AuthHardening/`). Convention: not authenticated → `401`; authenticated non-participant → `403`; unknown id → `404`.
- `freelancer_profiles` and `employer_profiles` carry **both** `clerkId` and `userId`; access-control helpers join on `userId` after resolving the user once.
- Gated routes (validated 2026-06-09): `GET/PATCH /api/bookings/:id`, `GET/PATCH /api/meetings/:id`, `GET /api/agreements/:id`, `POST /api/agreements/:id/sign` (role derived server-side), `GET /api/agreements/:id/download`, `GET/DELETE /api/openai/conversations/:id`, `POST /api/openai/conversations/:id/messages`, `PATCH/DELETE /api/job-requirements/:id`, `POST /api/storage/uploads/request-url`, `GET /api/storage/objects/uploads/{userId}/...`.
- Intentionally public (no per-resource gate): `GET /api/freelancers`, `GET /api/freelancers/:id`, `GET /api/job-requirements`, `GET /api/job-requirements/:id`, public profile `/f/:id`, and `GET /api/storage/public-objects/*`.
- `POST /api/bookings/:id/negotiate` retains its existing participant check (unchanged by Auth Hardening).
- Validation: `node artifacts/api-server/validate-auth-hardening.mjs` — 32/32 passed (2026-06-09).

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
| `CRON_SECRET` | Required for `/api/cron/*` routes | Shared secret for `x-cron-secret` header on machine-triggered scheduled jobs (e.g. credential expiry scan); route fails closed (500) if unset |

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
- **Agreement summary cache** — nullify `freelancerSummary` and `freelancerSummaryScoredAt` in the SAME `db.update()` call as health score cache nullification in `accept-redline` handler — one update, both caches cleared atomically
- **Cruise Mode evaluation** — fires fire-and-forget after `POST /api/job-requirements`; use `evaluateCruiseModeForNewJob(db, jobId, req.log).catch(...)` — never awaited, never delays the response; evaluation failure must never affect job creation
- **Cruise Mode plan gate** — `PATCH /api/cruise-mode/activate` requires `freelancer_pro`; return `402 PLAN_LIMIT` for `freelancer_free`
- **Agreement PDF download** — `GET /api/agreements/:id/download` requires `status === 'fully_signed'` (403 with `code: NOT_FULLY_SIGNED` otherwise); GCS upload of cached PDF is fire-and-forget `.catch()` — never block the response
- **Agreement summary is freelancer-only** — `POST /api/agreements/:id/summarise` returns 403 for any employer; `<AgreementSummaryPanel />` is conditionally rendered only when `userRole === 'freelancer'` — not hidden with CSS, not rendered at all
# TalentLock — Validation Guide: AI Meeting Brief Generator

---

## Phase 1 Validation — Database

### V1.1 — New Columns Exist on `meetings`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'meetings'
AND column_name IN ('brief_content', 'brief_generated_at');
```

- [ ] `brief_content` — `jsonb`, nullable
- [ ] `brief_generated_at` — `timestamp with time zone`, nullable

### V1.2 — Existing Meetings Unaffected

```sql
SELECT COUNT(*) FROM meetings WHERE brief_content IS NOT NULL;
-- Expected: 0 immediately after migration

SELECT COUNT(*) FROM meetings WHERE status = 'confirmed';
-- Baseline count for regression check
```

- [ ] All existing meeting rows have `brief_content IS NULL`
- [ ] All existing meeting rows have `brief_generated_at IS NULL`
- [ ] Existing confirmed meetings are not affected — no brief auto-generated on migration

---

## Phase 2 Validation — Backend

### V2.1 — Token Feature Added

```bash
grep "meeting_brief" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] `'meeting_brief'` present in `TokenFeature` union

### V2.2 — Brief Generates on Meeting Confirmation

Create a meeting between a test employer and test freelancer. Confirm the meeting via `PATCH /api/meetings/:id`:

```bash
curl -X PATCH http://localhost:8080/api/meetings/<meeting_id> \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"status": "confirmed"}'
```

Wait 15 seconds, then check:

```bash
curl http://localhost:8080/api/meetings/<meeting_id> \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Response time for `PATCH` < 500ms (brief generation is fire-and-forget)
- [ ] `briefContent` is populated after ~15 seconds (not null)
- [ ] `briefGeneratedAt` is set
- [ ] `briefContent.whyTheyMatch` has exactly 3 items
- [ ] `briefContent.suggestedQuestions` has 5–8 items
- [ ] `briefContent.watchPoints` is an array (may be empty)
- [ ] `briefContent.rateContext` has `proposedRate`, `marketMedian`, `assessment`, `withinBudget`
- [ ] `briefContent.candidateSnapshot.verifiedCredentials` is an array (may be empty)

### V2.3 — Brief Only Fires Once per Confirmation

Confirm the same meeting to `confirmed` status again (simulate re-confirmation):

- [ ] `briefGeneratedAt` does not change — brief is NOT regenerated automatically on re-confirmation if already generated (the check should be `previousStatus !== 'confirmed'`)

### V2.4 — Meeting Status Re-Fetch Guard (Risk 3)

Confirm a meeting, then immediately cancel it within 1 second (race condition test):

```bash
# Two rapid requests
curl -X PATCH .../meetings/<id> -d '{"status": "confirmed"}'
curl -X PATCH .../meetings/<id> -d '{"status": "cancelled"}'
```

- [ ] If the brief generator fires after cancellation, it exits early (meeting status is now `cancelled`)
- [ ] `briefContent` remains null after the race

### V2.5 — `POST /api/meetings/:id/brief` Manual Regeneration

```bash
# Confirmed meeting — should return 202
curl -X POST http://localhost:8080/api/meetings/<confirmed_meeting_id>/brief \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns HTTP 202 with `{ message: 'Brief generation started' }`

```bash
# Non-confirmed meeting — should return 422
curl -X POST http://localhost:8080/api/meetings/<pending_meeting_id>/brief \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns HTTP 422

```bash
# Freelancer trying to generate — should return 403
curl -X POST http://localhost:8080/api/meetings/<confirmed_meeting_id>/brief \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns HTTP 403

### V2.6 — Partial Brief When No Job Requirement

Create a confirmed meeting with no linked job requirement. Trigger brief generation.

- [ ] Brief generated without error
- [ ] `briefContent.whyTheyMatch` → `["No job requirement linked to this meeting"]` (or similar)
- [ ] `briefContent.suggestedQuestions` contains 5 generic questions
- [ ] `briefContent.rateContext.jobBudgetMin` → `null`
- [ ] `briefContent.rateContext.jobBudgetMax` → `null`
- [ ] No exception thrown, no 500 error

### V2.7 — Token Usage Logged to Employer Account

After brief generation:

```bash
curl http://localhost:8080/api/token-usage/me \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] `meeting_brief` token usage visible
- [ ] Usage attributed to employer account (not freelancer)

### V2.8 — Employer Notification Created

After brief generation:

```bash
curl http://localhost:8080/api/notifications \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Notification of type `meeting_brief_ready` present
- [ ] Notification title: "Your meeting brief is ready"
- [ ] Notification `metadata.meetingId` matches the meeting

### V2.9 — Freelancer Does NOT Receive Notification

```bash
curl http://localhost:8080/api/notifications \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] No `meeting_brief_ready` notification for the freelancer

### V2.10 — `GET /api/meetings/:id` Includes Brief Fields

```bash
curl http://localhost:8080/api/meetings/<meeting_id> \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Response includes `briefContent` (object or null)
- [ ] Response includes `briefGeneratedAt` (string or null)

### V2.11 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — Brief Card Not Visible to Freelancer

Log in as freelancer, navigate to `/meetings/:id` for a confirmed meeting:

- [ ] No "AI Meeting Brief" card rendered anywhere on the page
- [ ] The card is conditionally NOT rendered — not hidden with CSS

### V3.2 — Brief Card Not Visible for Non-Confirmed Meetings

Log in as employer, navigate to `/meetings/:id` for a `pending` meeting:

- [ ] No "AI Meeting Brief" card rendered

### V3.3 — State 1: Not Generated

Log in as employer, navigate to a confirmed meeting with `briefContent === null`:

- [ ] "AI Meeting Brief" card shows "Generate brief" button
- [ ] Button has amber colour scheme
- [ ] No error state shown

### V3.4 — Generate Brief Flow

Click "Generate brief":

- [ ] Button changes to spinner state ("Generating your meeting brief...")
- [ ] `POST /api/meetings/:id/brief` called (visible in network tab)
- [ ] Polling begins (3-second interval)
- [ ] When `briefContent` is populated, spinner disappears and brief card renders

### V3.5 — Brief Card Renders All Sections

When brief is loaded:

- [ ] "Candidate Snapshot" section with name, field, rate, rating, verified credentials
- [ ] "Why They Match" section with 3 emerald-coloured bullets
- [ ] "Suggested Questions" section (or upgrade prompt for starter)
- [ ] "Rate Context" section with 4 data cells
- [ ] "Watch Points" section if `watchPoints.length > 0`
- [ ] Watch Points section hidden if `watchPoints.length === 0`

### V3.6 — Plan Gating: Starter Sees Upgrade Prompt

Log in as `employer_starter`:

- [ ] "Suggested Questions" section replaced with: "AI-generated interview questions are available on the Growth plan."
- [ ] "Upgrade to Growth →" link points to `/pricing`
- [ ] All other sections (snapshot, match, rate, watch) render normally

### V3.7 — Plan Gating: Growth Sees Full Questions

Log in as `employer_growth`:

- [ ] "Suggested Questions" section shows Q1–Q8 with numbered badges
- [ ] No upgrade prompt visible

### V3.8 — Regenerate Button

Click "Regenerate" on an existing brief:

- [ ] Card enters generating state (spinner)
- [ ] After ~15 seconds, brief re-renders with new `briefGeneratedAt`
- [ ] New brief replaces the old one (no version history shown)

### V3.9 — Polling Timeout

If the brief fails to generate (simulate by blocking the API):

- [ ] Polling stops after 30 seconds (10 attempts × 3 seconds)
- [ ] Error state shown: "Brief generation is taking longer than expected. Please try again."
- [ ] "Generate brief" button reappears

### V3.10 — Rate Context Colours

- [ ] When `withinBudget: true` — rate shown in emerald text with "✅ Within budget"
- [ ] When `withinBudget: false` — rate shown in red text with "⚠ Above budget"

### V3.11 — Generated Date

- [ ] `briefGeneratedAt` displayed as human-readable date in header ("Generated Jun 18")
- [ ] Updates after regeneration

### V3.12 — Build Passes

```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero errors

---

## Regression Validation

### R1 — Meeting Confirmation Still Works

```bash
curl -X PATCH http://localhost:8080/api/meetings/<id> \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"status": "confirmed"}'
```

- [ ] Returns HTTP 200 with updated meeting
- [ ] Response time < 500ms (brief generation is fire-and-forget)
- [ ] Meeting status correctly updated in DB

### R2 — Meeting Detail Page Still Loads

Navigate to `/meetings/:id` as both employer and freelancer:

- [ ] Page loads without errors for both roles
- [ ] Existing meeting fields (date, participants, status) render correctly
- [ ] Freelancer sees no new UI elements (brief card is employer-only)

### R3 — Other Meeting Routes Unaffected

```bash
# List meetings
curl http://localhost:8080/api/meetings \
  -H "Authorization: Bearer <employer_token>"

# Request a meeting
curl -X POST http://localhost:8080/api/meetings \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"freelancerId": "<id>", "bookingId": "<id>"}'
```

- [ ] `GET /api/meetings` returns correct paginated list (new brief columns may appear as null — no breaking change)
- [ ] `POST /api/meetings` works correctly — brief not generated for new (non-confirmed) meetings

### R4 — Rate Suggestion Widget Unaffected

Navigate to `/bookings/new` or the negotiation panel:

- [ ] Rate suggestion widget still renders and returns market data correctly
- [ ] `rateSuggestionUtils.ts` functions unchanged

### R5 — All Other AI Features Unaffected

- [ ] Agreement generation works
- [ ] Contract health score works
- [ ] Agreement AI summary works
- [ ] Cruise Mode evaluations work
- [ ] TalentSearch evaluations work

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Database | ✅ (V1.1, V1.2 executed against DB) | automated | 2026-07-06 |
| Phase 2 — Backend | 🟢 Static ✅ (V2.1 grep, V2.11 typecheck, route/guard/fallback verified by code) · ⏳ Runtime deferred (V2.2–V2.9 need live server + Clerk token + OpenAI) | automated | 2026-07-06 |
| Phase 3 — Frontend | 🟢 Static ✅ (V3.12 build, gating/plan/colour/date logic verified by code) · ⏳ Browser flows deferred (V3.4, V3.8, V3.9) | automated | 2026-07-06 |
| Regression Checks | 🟢 Static ✅ (R3/R4/R5 — no changes to list/create routes, rateSuggestionUtils, or other AI features) · ⏳ R1/R2 runtime deferred | automated | 2026-07-06 |
| **Feature Complete** | ⏳ Pending one live end-to-end run (confirm → brief) in an authenticated environment | | |

> **Deviations found & resolved during validation**
> - **V2.6** — the no-job-requirement partial brief was originally AI-delegated; added the plan.md Q3 static fallback (`whyTheyMatch: ["No job requirement linked to this meeting"]`, 5 generic questions, null budgets, no AI call). Now compliant.
>
> **Deviations noted (schema-driven, not defects)**
> - **V2.8** — the real `notifications` table has no `title`/`metadata` columns; the brief notification is created with `type = meeting_brief_ready`, `entityType = "meeting"`, `entityId = <meetingId>`, and a human message. This is correct for the actual schema; the "title"/"metadata.meetingId" wording in this file reflects the plan's assumed notification shape.
>
> **Not executed** — every check that requires a running API server with a valid Clerk bearer token and a live OpenAI call (V2.2–V2.9, V3.4/V3.8/V3.9, R1/R2). These need an authenticated runtime and were not run here.

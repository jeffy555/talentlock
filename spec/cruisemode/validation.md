# TalentLock — Validation Guide: Cruise Mode

---

## Phase 1 Validation — Database

### V1.1 — Tables Exist

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('cruise_mode_configs', 'cruise_mode_activity');
```

- [ ] Both tables present

### V1.2 — Unique Constraint on `cruise_mode_configs.freelancer_id`

```sql
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'cruise_mode_configs' AND constraint_type = 'UNIQUE';
```

- [ ] UNIQUE constraint exists on `freelancer_id`

### V1.3 — Indexes on `cruise_mode_activity`

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'cruise_mode_activity';
```

- [ ] Index on `freelancer_id` exists
- [ ] Composite index on `(freelancer_id, job_requirement_id)` exists

---

## Phase 2 Validation — Backend

### V2.1 — TokenFeature Updated

```bash
grep "cruise_mode" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] `'cruise_mode_parse'` present
- [ ] `'cruise_mode_evaluation'` present

### V2.2 — Pre-Filter: Excluded Keywords

```ts
// Test in isolation
preFilter({ excludedKeywords: ['crypto'], requiredSkills: [], minRate: null, maxRate: null },
  { title: 'Crypto NFT Platform', description: '', skills: [], minRate: 50, maxRate: 100, durationWeeks: 4, fieldOfWork: 'dev' })
// Expected: false
```

- [ ] Returns `false` when excluded keyword in title
- [ ] Returns `false` when excluded keyword in description
- [ ] Returns `true` when no excluded keywords match

### V2.3 — Pre-Filter: Rate Range

```ts
preFilter({ minRate: 80, maxRate: 120, requiredSkills: [], excludedKeywords: [] },
  { ..., minRate: 30, maxRate: 50 }) // Expected: false
preFilter({ minRate: 80, maxRate: 120, ... },
  { ..., minRate: 100, maxRate: 150 }) // Expected: true (overlap exists)
```

- [ ] Rejects when job's max rate is below freelancer's min rate
- [ ] Rejects when job's min rate is above freelancer's max rate
- [ ] Passes when rate ranges overlap

### V2.4 — Blackout Window Check

```ts
// Configure a blackout window for current time and confirm isInBlackoutWindow returns true
isInBlackoutWindow({
  blackoutWindows: {
    timezone: 'UTC',
    windows: [{ start: '00:00', end: '23:59', days: [] }] // all day
  }
}) // Expected: true
```

- [ ] Returns `true` during configured blackout
- [ ] Returns `false` outside blackout window
- [ ] Handles overnight windows (e.g. 22:00–06:00)

### V2.5 — Evaluation Does Not Slow Job Creation

```bash
time curl -X POST http://localhost:8080/api/job-requirements \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"title":"React Developer","description":"Need React dev","skills":["React"]}'
```

- [ ] Response time < 500ms (evaluation is fire-and-forget, never awaited)
- [ ] `HTTP 201` returned

### V2.6 — Evaluation Fires After Job Creation

Create a job while a `freelancer_pro` user has active Cruise Mode with matching rules:

```bash
# After job creation, wait 5 seconds, then check activity
sleep 5
curl http://localhost:8080/api/cruise-mode/activity \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Activity row created for the new job
- [ ] `score` is between 0 and 100
- [ ] `decision` is one of the valid values

### V2.7 — Dry Run: No Employer Notification

Activate Cruise Mode in dry-run mode. Create a matching job:

```bash
# Check employer notifications
curl http://localhost:8080/api/notifications \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] No `cruise_mode_interest` notification for the employer
- [ ] Activity row exists with `decision: 'dry_run_would_send'`
- [ ] Freelancer receives notification about dry run evaluation

### V2.8 — Duplicate Prevention

Evaluate the same job twice for the same freelancer:

```bash
# Manually trigger a second evaluation for the same job
# (or post the same job twice in testing)
```

- [ ] Only ONE activity row with `decision: 'sent'` for a given freelancer+job combination
- [ ] Second evaluation is skipped silently

### V2.9 — Blackout Window Skips

Configure a blackout window that includes current time. Create a matching job:

- [ ] Activity row created with `decision: 'blackout'`
- [ ] No employer notification sent
- [ ] No freelancer "sent" notification

### V2.10 — Monthly Quota Enforcement

Set `messages_this_month = 10` directly in DB:

```sql
UPDATE cruise_mode_configs SET messages_this_month = 10
WHERE freelancer_id = '<id>';
```

Create a matching job:

- [ ] Activity row created with `decision: 'quota_exceeded'`
- [ ] `messages_this_month` does not increment beyond 10
- [ ] No employer notification

### V2.11 — `freelancer_free` Cannot Activate

```bash
curl -X PATCH http://localhost:8080/api/cruise-mode/activate \
  -H "Authorization: Bearer <freelancer_free_token>"
```

- [ ] Returns `HTTP 402` or `HTTP 403` with appropriate error

### V2.12 — `freelancer_pro` Can Activate

```bash
curl -X PATCH http://localhost:8080/api/cruise-mode/activate \
  -H "Authorization: Bearer <freelancer_pro_token>"
```

- [ ] Returns `HTTP 200`

### V2.13 — Parse Rules Endpoint

```bash
curl -X POST http://localhost:8080/api/cruise-mode/parse-rules \
  -H "Authorization: Bearer <freelancer_pro_token>" \
  -d '{"rawText":"I want React and TypeScript projects, $80-$120/hr, no crypto or gambling."}'
```

- [ ] Returns `HTTP 200`
- [ ] Response has `rules.requiredSkills` containing "React" and/or "TypeScript"
- [ ] Response has `rules.minRate: 80`, `rules.maxRate: 120`
- [ ] Response has `rules.excludedKeywords` containing "crypto" and "gambling"
- [ ] Response has `warnings` array (may be empty)

### V2.14 — Activity Feed Paginated

```bash
curl "http://localhost:8080/api/cruise-mode/activity?page=1&pageSize=10" \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns `{ data, total, page, pageSize, totalPages }` shape
- [ ] Each item has `score`, `decision`, `matchReasons`, `proposedMessage`, `createdAt`
- [ ] Job title is included (join or serialised)

### V2.15 — Stats Endpoint

```bash
curl http://localhost:8080/api/cruise-mode/stats \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns `evaluatedToday`, `sentToday`, `skippedToday`, `messagesThisMonth`, `monthlyLimit`
- [ ] Counts match the actual `cruise_mode_activity` rows

### V2.16 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — Page Accessible for Freelancer Only

Log in as freelancer: `/cruise-mode` renders correctly.
Log in as employer: redirected or shown 403.

- [ ] Freelancer can access `/cruise-mode`
- [ ] Employer cannot access `/cruise-mode`

### V3.2 — Nav Item for Freelancer

Log in as freelancer:

- [ ] "Cruise Mode" nav item visible in sidebar
- [ ] Pulsing green dot visible when Cruise Mode is active
- [ ] Not visible for employers

### V3.3 — Inactive State (First Visit)

Navigate to `/cruise-mode` as a freelancer with no config:

- [ ] "Set up Cruise Mode" onboarding panel shown
- [ ] Status bar shows "○ Off"
- [ ] No activity feed (empty state message)

### V3.4 — Rule Form Saves Correctly

Fill in the rule builder form. Click "Save rules":

- [ ] Config saved (`GET /api/cruise-mode` returns the new rules)
- [ ] Form repopulates with saved values on next load

### V3.5 — Text Parser Populates Form

Paste "I want React projects, $80-$120/hr, no crypto" and click "✦ Parse with AI":

- [ ] Spinner shown during parsing
- [ ] Preview card renders with parsed rules
- [ ] ✅ items for found rules
- [ ] ⚠ items for missing/ambiguous rules
- [ ] "Use" button populates the form with parsed values

### V3.6 — Activation Confirmation Dialog

Click "Activate":

- [ ] Confirmation dialog shown
- [ ] "Activate Cruise Mode" button activates
- [ ] Status bar changes to "● Active"
- [ ] Success toast shown

### V3.7 — Dry Run Mode

Click "Dry Run":

- [ ] Status bar changes to "● Dry Run"
- [ ] Activity feed shows `● Dry Run` decision badges after job evaluations
- [ ] No sent messages (V2.7 confirmed this in backend)

### V3.8 — Activity Feed Renders Correctly

After a matching job is posted:

- [ ] New entry appears in activity feed
- [ ] Score badge shows correct number in correct colour
- [ ] Decision badge shows correct label
- [ ] Match reasons visible below job title
- [ ] "View message" expands the proposed message in violet block
- [ ] "Send follow-up" button present on `sent` entries

### V3.9 — Follow-Up Button

Click "Send follow-up" on a sent activity entry:

- [ ] Entry updates to show "✓ Follow-up sent"
- [ ] `freelancerFollowUpSent: true` in DB

### V3.10 — Stats Tab

Navigate to Stats tab:

- [ ] 4 metric cards show correct counts
- [ ] Monthly usage bar shows correct fraction
- [ ] Reset date displayed correctly

### V3.11 — Pause and Resume

Click Pause:

- [ ] Status changes to "◐ Paused"
- [ ] Confirm no new evaluations fire (post a matching job — no activity created)

Click Resume:

- [ ] Status changes to "● Active"
- [ ] Evaluations resume

### V3.12 — Pro Upgrade Prompt for Free Users

Log in as `freelancer_free`. Navigate to `/cruise-mode`:

- [ ] Upgrade prompt shown: "Cruise Mode is available on the Pro plan."
- [ ] "Upgrade" links to `/pricing`
- [ ] No ability to configure or activate

### V3.13 — Build Passes

```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero errors

---

## Security Validation

### S1 — Freelancer Cannot Access Another Freelancer's Config

```bash
curl http://localhost:8080/api/cruise-mode \
  -H "Authorization: Bearer <freelancer_B_token>"
# Should return Freelancer B's config (null or their own), not Freelancer A's
```

- [ ] Each freelancer sees only their own config

### S2 — Freelancer Cannot Access Another Freelancer's Activity

```bash
curl "http://localhost:8080/api/cruise-mode/activity" \
  -H "Authorization: Bearer <freelancer_B_token>"
```

- [ ] Returns only Freelancer B's activity rows

### S3 — Employer Cannot View Freelancer's Cruise Mode Config

```bash
curl http://localhost:8080/api/cruise-mode \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 403`

### S4 — Cruise Mode Does Not Expose Job Poster Identity

The evaluation engine reads job requirements. Confirm the employer's personal data (email, phone) is never included in the AI prompt or the activity log.

- [ ] Activity log `matchReasons` contains only job-level data (title, skills)
- [ ] Employer's contact details never appear in `proposedMessage`

---

## Regression Validation

### R1 — Job Creation Still Works

```bash
curl -X POST http://localhost:8080/api/job-requirements \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"title":"Test Job","description":"Test","skills":["React"]}'
```

- [ ] Returns `HTTP 201` — unaffected by Cruise Mode hook

### R2 — Notifications Centre Unaffected

```bash
curl http://localhost:8080/api/notifications \
  -H "Authorization: Bearer <any_user_token>"
```

- [ ] Returns correct paginated notifications
- [ ] Cruise Mode notifications appear correctly alongside other notification types

### R3 — Existing Freelancer Features Unaffected

- [ ] `/api/freelancers` search works
- [ ] `/api/bookings` creation works
- [ ] `/api/availability/me` works

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Database | ⬜ | | |
| Phase 2 — Backend | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| Security Checks | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

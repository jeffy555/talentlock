# TalentLock — Validation Guide: TalentSearch (Employer Cruise Mode)

---

## Phase 1 Validation — Database

### V1.1 — Tables Exist

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('talent_search_configs', 'talent_search_activity');
```

- [ ] Both tables present

### V1.2 — UNIQUE Constraint on `talent_search_configs.employer_id`

```sql
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'talent_search_configs' AND constraint_type = 'UNIQUE';
```

- [ ] UNIQUE constraint exists on `employer_id`

### V1.3 — Indexes on `talent_search_activity`

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'talent_search_activity';
```

- [ ] Index on `employer_id`
- [ ] Index on `freelancer_id`
- [ ] Composite index on `(employer_id, freelancer_id)`

### V1.4 — Freelancer Notification Cap Columns

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
AND column_name IN ('talent_search_notifications_today', 'talent_search_notifications_reset_at');
```

- [ ] Both columns present
- [ ] `talent_search_notifications_today` has `DEFAULT 0`
- [ ] All existing rows have `talent_search_notifications_today = 0`

### V1.5 — No Regressions on Existing Tables

```sql
SELECT COUNT(*) FROM freelancer_profiles WHERE talent_search_notifications_today != 0;
-- Expected: 0

SELECT COUNT(*) FROM freelancer_profiles WHERE completeness_score IS NULL;
-- Expected: same count as before this change
```

- [ ] All existing freelancer profile rows unaffected

---

## Phase 2 Validation — Backend

### V2.1 — Token Features Updated

```bash
grep "talent_search" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] `'talent_search_parse'` present
- [ ] `'talent_search_evaluation'` present

### V2.2 — Pre-Filter: Profession Category Mismatch

Seed employer with `professionCategory: 'education'` rule. Seed freelancer with `professionCategory: 'technology'`. Trigger profile update.

- [ ] Pre-filter rejects — no AI call made, no activity logged

### V2.3 — Pre-Filter: Rate Mismatch

Employer rule: `maxRate: 150`. Freelancer rate: `200`.

- [ ] Pre-filter rejects — returns false immediately

### V2.4 — Pre-Filter: DBS Required but Not Verified

Employer rule: `requireDbs: true`. Freelancer `dbsCheckStatus: 'uploaded'` (not `'verified'`).

- [ ] Pre-filter rejects — `dbsCheckStatus !== 'verified'`

### V2.5 — Completeness Gate

Freelancer updates profile but `completenessScore = 45` (below 60 threshold).

- [ ] TalentSearch hook does NOT fire
- [ ] `PUT /api/freelancers/me` response time unaffected
- [ ] No `talent_search_activity` row created

### V2.6 — Profile Update Does Not Slow Response

```bash
time curl -X PUT http://localhost:8080/api/freelancers/me \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"bio": "Updated bio"}'
```

- [ ] Response time < 300ms (TalentSearch hook is fire-and-forget, never awaited)
- [ ] HTTP 200 returned

### V2.7 — Evaluation Fires for Active Config

Create employer with `isActive: true` TalentSearch config (threshold 70, required skills: "React"). Update freelancer profile with `completenessScore >= 60` and `skills: ["React"]`.

Wait 5 seconds, then check activity:

```bash
curl http://localhost:8080/api/talent-search/activity \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Activity row created with valid `score`, `decision`, `matchReasons`

### V2.8 — 30-Day Duplicate Prevention

After a `sent` activity exists for employer–freelancer pair:
Trigger another profile update from the same freelancer.

- [ ] Second evaluation exits silently — no new activity row with `decision: 'sent'`

### V2.9 — Freelancer Daily Cap (Max 3 Per Day)

Set `talent_search_notifications_today = 3` on a freelancer:

```sql
UPDATE freelancer_profiles
SET talent_search_notifications_today = 3
WHERE id = '<freelancer_id>';
```

Trigger a profile update that would match an active employer config.

- [ ] Activity logged as `daily_freelancer_limit_reached`
- [ ] No notification sent to freelancer
- [ ] `talent_search_notifications_today` not incremented beyond 3

### V2.10 — Employer Daily Limit

Set `hours_used_today = 6.0` on employer config:

```sql
UPDATE talent_search_configs SET hours_used_today = 6.0
WHERE employer_id = '<employer_id>';
```

Trigger a matching profile update.

- [ ] Activity logged as `daily_limit_reached`
- [ ] No freelancer notification sent
- [ ] `isActive` unchanged (remains `true`)

### V2.11 — Dry Run: No Freelancer Notification

Activate employer TalentSearch in dry run mode. Update a matching freelancer profile.

- [ ] Activity row created with `decision: 'dry_run_would_send'`
- [ ] Freelancer receives NO notification
- [ ] Employer receives notification about the dry run evaluation

### V2.12 — Blackout Window Skips

Configure a blackout window that includes current time. Update a matching freelancer profile.

- [ ] Activity logged as `decision: 'blackout'`
- [ ] No notification sent to freelancer

### V2.13 — Freelancer Gets 403 on All Routes

```bash
curl http://localhost:8080/api/talent-search \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns HTTP 403

### V2.14 — Parse Rules Endpoint

```bash
curl -X POST http://localhost:8080/api/talent-search/parse-rules \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"rawText": "I need GCSE Maths teachers in Manchester, £100-£200/day. DBS required. No junior candidates."}'
```

- [ ] Returns HTTP 200
- [ ] `rules.professionCategory` = `'education'`
- [ ] `rules.requiredSkills` contains "GCSE Mathematics" or "GCSE Maths"
- [ ] `rules.requireDbs` = `true`
- [ ] `rules.excludedKeywords` contains "junior"
- [ ] `rules.location` = `"Manchester"` (or similar)
- [ ] `warnings` array present

### V2.15 — Activity Feed Paginated

```bash
curl "http://localhost:8080/api/talent-search/activity?page=1&pageSize=10" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `{ data, total, page, pageSize, totalPages }`
- [ ] Each item has `score`, `decision`, `matchReasons`, `proposedMessage`, `freelancerId`, `createdAt`
- [ ] Freelancer name/field populated (via join or serialisation)

### V2.16 — Stats Endpoint

```bash
curl http://localhost:8080/api/talent-search/stats \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `evaluatedToday`, `sentToday`, `skippedToday`, `hoursUsedToday`, `dailyLimitHours`, `hoursRemainingToday`, `hoursResetAt`
- [ ] Counts match actual `talent_search_activity` rows

### V2.17 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — Freelancer Cannot Access `/talent-search`

Log in as freelancer, navigate to `/talent-search`:

- [ ] Redirected or shown 403 — not accessible
- [ ] "TalentSearch" nav item NOT visible in freelancer sidebar

### V3.2 — Employer Sees TalentSearch in Nav

Log in as employer:

- [ ] "TalentSearch" nav item visible with `Radar` icon
- [ ] Pulsing green dot shown when `isActive: true`

### V3.3 — Inactive State (First Visit)

Employer with no TalentSearch config:

- [ ] "Set up TalentSearch" onboarding panel shown
- [ ] Status bar shows "○ TalentSearch is off"
- [ ] "Turn On" and "Dry Run" buttons visible

### V3.4 — Rule Form Saves

Fill in rule form. Click "Save rules":

- [ ] Config saved (`GET /api/talent-search` returns updated rules)
- [ ] Form pre-populates with saved values on next load
- [ ] Education sub-type picker only appears when "Education" is selected

### V3.5 — Text Parser Works

Paste sample rules text. Click "✦ Parse with AI":

- [ ] Spinner shown during parsing
- [ ] Preview card renders with ✅ and ⚠ items
- [ ] "Use these" button populates form with parsed values

### V3.6 — Activation Confirmation

Click "Turn On":

- [ ] Confirmation dialog shown with correct body copy
- [ ] Clicking "Activate TalentSearch" calls the activate endpoint
- [ ] Status bar updates to "● Active"

### V3.7 — Dry Run Mode

Click "Dry Run":

- [ ] Status bar changes to "● Dry Run"
- [ ] After a matching profile update: activity shows `● Dry Run` badge
- [ ] No freelancer notification sent (confirmed in backend V2.11)

### V3.8 — Activity Feed Renders

After a matching profile update triggers evaluation:

- [ ] New entry appears in activity feed
- [ ] Score badge correct colour (green/amber/red)
- [ ] Decision badge correct label
- [ ] Freelancer name, education sub-type badge, location visible
- [ ] Match reasons shown below
- [ ] "View message sent" expands the proposed message in teal-bordered block
- [ ] "Send follow-up" button present on `sent` entries

### V3.9 — Follow-Up Button

Click "Send follow-up":

- [ ] Entry updates to show "✓ Follow-up sent"
- [ ] `employerFollowUpSent: true` in DB

### V3.10 — Freelancer Notification Card

When a freelancer receives a TalentSearch notification:

- [ ] "TalentSearch ✦" badge visible with teal colours
- [ ] Employer company name shown
- [ ] Message body shown (not collapsed)
- [ ] "View their profile →" link present

### V3.11 — Stats Tab

Navigate to Stats tab:

- [ ] 4 metric cards show correct counts
- [ ] Daily usage bar shows correct fraction
- [ ] Reset time displayed

### V3.12 — Build Passes

```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero errors

---

## Regression Validation

### R1 — `PUT /api/freelancers/me` Unaffected

```bash
curl -X PUT http://localhost:8080/api/freelancers/me \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"bio": "Updated bio", "skills": ["React"]}'
```

- [ ] Returns HTTP 200 in < 300ms
- [ ] Profile saved correctly
- [ ] Existing `completenessScore` recalculation unchanged

### R2 — Cruise Mode Still Fires on Job Post

Post a new job requirement while a freelancer has Cruise Mode active:

- [ ] `cruise_mode_activity` row created correctly
- [ ] TalentSearch code does not interfere with Cruise Mode pipeline

### R3 — Cruise Mode and TalentSearch Token Labels Are Separate

```sql
SELECT feature, user_id, COUNT(*) FROM token_usage
WHERE feature IN ('cruise_mode_evaluation', 'talent_search_evaluation')
GROUP BY feature, user_id;
```

- [ ] `cruise_mode_evaluation` rows attributed to freelancer accounts
- [ ] `talent_search_evaluation` rows attributed to employer accounts
- [ ] No cross-contamination

### R4 — All Other Employer Features Unaffected

- [ ] Job posting works
- [ ] Booking creation works
- [ ] Agreement generation works
- [ ] Spend Analytics dashboard renders
- [ ] Hiring Analytics dashboard renders

### R5 — Freelancer Features Unaffected

- [ ] Cruise Mode still works
- [ ] Profile update flow works
- [ ] Talent Vault profile visible
- [ ] Bookings, agreements, meetings all work

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Database | ⬜ | | |
| Phase 2 — Backend | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

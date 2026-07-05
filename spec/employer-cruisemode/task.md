# TalentLock — Task Breakdown: TalentSearch (Employer Cruise Mode)

---

## Summary

Three phases: Database (two new tables + two new columns on `freelancer_profiles`) → Backend (pre-filter utility, evaluator, hook on `PUT /api/freelancers/me`, all API routes, OpenAPI + codegen) → Frontend (`/talent-search` page mirroring `/cruise-mode`). No new routes change existing behaviour. No existing tables modified beyond two additive columns on `freelancer_profiles`.

Read `specs/cruise-mode/task.md` before implementing — TalentSearch mirrors that pattern with flipped roles.

---

## Phase 1 — Database

### Task 1.1 — Codebase Inspection

Run all pre-implementation checks from `plan.md`. Document:
- Exact location of `PUT /api/freelancers/me` handler and `db.update()` call
- Confirmed `completenessScore` recalculation timing (before or after `res.json()`?)
- `talent_search_parse` and `talent_search_evaluation` not yet in `TokenFeature` (confirm)
- `employer_profiles` exact column names for `companyName` and sector
- `cruiseModeUtils.ts` path confirmed for reuse of `isInBlackoutWindow()` and `getNextMidnightUTC()`

### Task 1.2 — Create `talent_search_configs` Table

**File:** `lib/db/src/schema/` — new table

```ts
export const talentSearchConfigs = pgTable('talent_search_configs', {
  id:                text('id').primaryKey(),
  employerId:        text('employer_id').notNull()
                       .references(() => employerProfiles.id),
  isActive:          boolean('is_active').notNull().default(false),
  // isActive is ONLY changed manually via /activate or /deactivate — never automatically
  isDryRun:          boolean('is_dry_run').notNull().default(false),
  rules:             jsonb('rules').notNull().$type<TalentSearchRules>(),
  rulesVersion:      integer('rules_version').notNull().default(1),
  rawRulesText:      text('raw_rules_text'),
  hoursUsedToday:    decimal('hours_used_today', { precision: 4, scale: 2 }).notNull().default('0'),
  dailyLimitHours:   decimal('daily_limit_hours', { precision: 4, scale: 2 }).notNull().default('6'),
  hoursResetAt:      timestamp('hours_reset_at', { withTimezone: true })
                       .notNull().$defaultFn(() => getNextMidnightUTC()),
  activatedAt:       timestamp('activated_at',    { withTimezone: true }),
  deactivatedAt:     timestamp('deactivated_at',  { withTimezone: true }),
  deletedAt:         timestamp('deleted_at',      { withTimezone: true }),
  createdAt:         timestamp('created_at',      { withTimezone: true }).defaultNow().notNull(),
  updatedAt:         timestamp('updated_at',      { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqEmployer: unique().on(t.employerId), // One config per employer
}));
```

### Task 1.3 — Create `talent_search_activity` Table

```ts
export const talentSearchActivity = pgTable('talent_search_activity', {
  id:                    text('id').primaryKey(),
  employerId:            text('employer_id').notNull()
                           .references(() => employerProfiles.id),
  freelancerId:          text('freelancer_id').notNull()
                           .references(() => freelancerProfiles.id),
  rulesVersion:          integer('rules_version').notNull(),
  score:                 integer('score').notNull(),
  decision:              text('decision').notNull(),
  // Valid: sent | skipped | dry_run_would_send | dry_run_skipped |
  //        blackout | duplicate | daily_limit_reached |
  //        daily_freelancer_limit_reached | talent_search_off
  matchReasons:          jsonb('match_reasons').notNull().$type<MatchReasons>(),
  proposedMessage:       text('proposed_message'),
  sentAt:                timestamp('sent_at',         { withTimezone: true }),
  skippedReason:         text('skipped_reason'),
  employerFollowUpSent:  boolean('employer_follow_up_sent').notNull().default(false),
  createdAt:             timestamp('created_at',      { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  employerIdx:        index().on(t.employerId),
  employerFreelancerIdx: index().on(t.employerId, t.freelancerId),
  freelancerIdx:      index().on(t.freelancerId),
}));
```

### Task 1.4 — Add Freelancer Notification Cap Columns

**File:** `lib/db/src/schema/` — `freelancer_profiles` table (additive)

```ts
talentSearchNotificationsToday:   integer('talent_search_notifications_today').notNull().default(0),
talentSearchNotificationsResetAt: timestamp('talent_search_notifications_reset_at', { withTimezone: true }),
```

Migration produces `DEFAULT 0` for existing rows. `talentSearchNotificationsResetAt` defaults to NULL and is populated on first use. Both columns are invisible to all existing technology freelancers — no UI renders them for non-TalentSearch contexts.

### Task 1.5 — Export Types

**File:** `lib/db/src/schema/` (or shared types file)

```ts
export interface TalentSearchRules {
  professionCategory:          'technology' | 'education' | null;
  educationSubType:            'school_teacher' | 'university_lecturer' | 'tutor' | 'researcher' | null;
  requiredSkills:              string[];
  preferredSkills:             string[];
  minRate:                     number | null;
  maxRate:                     number | null;
  rateType:                    'hourly' | 'per_day' | 'per_session' | 'per_course';
  availableFrom:               string | null;
  locationRequired:            boolean;
  location:                    string | null;
  locationRadiusKm:            number | null;
  excludedKeywords:            string[];
  requireVerifiedCredentials:  boolean;
  requireDbs:                  boolean;
  preferredFields:             string[];
  matchThreshold:              number;   // 0-100, default 70
  messageTone:                 'professional' | 'friendly' | 'concise';
  blackoutWindows:             { timezone: string; windows: BlackoutWindow[] } | null;
  dryRun:                      boolean;
  dailyDigest:                 boolean;
  version:                     number;
}

export interface NormalisedFreelancer {
  id:                        string;
  professionCategory:        string;
  educationProfessionType:   string | null;
  skills:                    string[];
  teachingSubjects:          string[] | null;
  teachingLevels:            string[] | null;
  fieldOfWork:               string;
  rate:                      number;
  bio:                       string | null;
  dbsCheckStatus:            string | null;
  hasAnyVerifiedDocument:    boolean;
  location:                  string | null;
  completenessScore:         number;
}
```

### Task 1.6 — Run Migration and Verify

```bash
pnpm --filter @workspace/db run push
```

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('talent_search_configs', 'talent_search_activity');

-- Verify UNIQUE constraint on employer_id
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'talent_search_configs' AND constraint_type = 'UNIQUE';

-- Verify new columns on freelancer_profiles
SELECT column_name FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
AND column_name IN ('talent_search_notifications_today', 'talent_search_notifications_reset_at');

-- Verify default values
SELECT talent_search_notifications_today FROM freelancer_profiles LIMIT 3;
-- Expected: 0 for all existing rows
```

---

## Phase 2 — Backend

### Task 2.1 — Add Token Features

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

```ts
| 'talent_search_parse'        // Rule parsing from free-form text
| 'talent_search_evaluation'   // Per-freelancer Stage 2 AI evaluation
```

### Task 2.2 — Create `talentSearchUtils.ts`

**File:** `artifacts/api-server/src/lib/talentSearchUtils.ts` (create new)

Implement:
1. `talentSearchPreFilter(rules, freelancer): boolean` — Stage 1 filter per `plan.md` Q3
2. `normaliseFreelancer(freelancerRow): NormalisedFreelancer` — maps DB row to standard interface. Must include `hasAnyVerifiedDocument` derived from a subquery or join on the `documents` table (`status = 'verified'`)
3. `buildTalentSearchEvaluationPrompt(employer, rules, freelancer, reasons): string` — verbatim from `plan.md` Q5 system prompt
4. `validateTalentSearchResponse(parsed): boolean` — confirms response has `score`, `decision`, `reasons`, `proposedMessage`

Import and reuse from `cruiseModeUtils.ts`:
```ts
import { isInBlackoutWindow, getNextMidnightUTC } from './cruiseModeUtils';
```

### Task 2.3 — Create `talentSearchEvaluator.ts`

**File:** `artifacts/api-server/src/lib/talentSearchEvaluator.ts` (create new)

Main evaluation pipeline:

```ts
export async function evaluateTalentSearchForUpdatedProfile(
  db: DB, freelancerId: string, log: Logger
) {
  // 1. Load freelancer profile
  const freelancerRow = await db.query.freelancerProfiles.findFirst({
    where: eq(freelancerProfiles.id, freelancerId),
  });
  if (!freelancerRow || freelancerRow.completenessScore < 60) return;

  const freelancer = normaliseFreelancer(freelancerRow);

  // 2. Load all active TalentSearch configs
  const configs = await db.query.talentSearchConfigs.findMany({
    where: and(
      eq(talentSearchConfigs.isActive, true),
      isNull(talentSearchConfigs.deletedAt),
    ),
  });
  if (configs.length === 0) return;

  // 3. Pre-filter (Stage 1 — no AI, no time cost)
  const candidates = configs.filter(c => talentSearchPreFilter(c.rules, freelancer));

  // 4. Cap at 50 concurrent evaluations
  const batch = candidates.slice(0, 50);

  // 5. Evaluate all — one failure must not stop others
  await Promise.allSettled(
    batch.map(config => evaluateSingleEmployer(db, config, freelancerRow, freelancer, log))
  );
}

async function evaluateSingleEmployer(db, config, freelancerRow, freelancer, log) {
  try {
    // Blackout check
    if (config.rules.blackoutWindows && isInBlackoutWindow(config.rules)) {
      await logTalentSearchActivity(db, config, freelancer.id, { decision: 'blackout', score: 0,
        matchReasons: { matched: [], concerns: [], blockers: ['Blackout window active'] },
        proposedMessage: null, skippedReason: 'Blackout window' });
      return;
    }

    // 30-day duplicate check
    const recentlySent = await db.query.talentSearchActivity.findFirst({
      where: and(
        eq(talentSearchActivity.employerId, config.employerId),
        eq(talentSearchActivity.freelancerId, freelancer.id),
        eq(talentSearchActivity.decision, 'sent'),
        gte(talentSearchActivity.sentAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      ),
    });
    if (recentlySent) return; // Silent skip

    // Daily hours check (employer side)
    const now = new Date();
    let currentConfig = config;
    if (new Date(config.hoursResetAt) < now) {
      await db.update(talentSearchConfigs).set({
        hoursUsedToday: 0, hoursResetAt: getNextMidnightUTC(),
      }).where(eq(talentSearchConfigs.id, config.id));
      currentConfig = { ...config, hoursUsedToday: 0 };
    }
    if (Number(currentConfig.hoursUsedToday) >= Number(currentConfig.dailyLimitHours)) {
      await logTalentSearchActivity(db, config, freelancer.id, { decision: 'daily_limit_reached', score: 0,
        matchReasons: { matched: [], concerns: [], blockers: ['Daily 6h limit reached'] },
        proposedMessage: null, skippedReason: 'Daily employer limit reached' });
      return;
    }

    // Freelancer daily notification cap check (max 3 per freelancer per day)
    let fl = freelancerRow;
    if (!fl.talentSearchNotificationsResetAt || new Date(fl.talentSearchNotificationsResetAt) < now) {
      await db.update(freelancerProfiles).set({
        talentSearchNotificationsToday: 0, talentSearchNotificationsResetAt: getNextMidnightUTC(),
      }).where(eq(freelancerProfiles.id, freelancer.id));
      fl = { ...fl, talentSearchNotificationsToday: 0 };
    }
    if (fl.talentSearchNotificationsToday >= 3) {
      await logTalentSearchActivity(db, config, freelancer.id, {
        decision: 'daily_freelancer_limit_reached', score: 0,
        matchReasons: { matched: [], concerns: [], blockers: ['Freelancer daily cap reached'] },
        proposedMessage: null, skippedReason: 'Freelancer received 3 TalentSearch notifications today' });
      return;
    }

    // Load employer data
    const [employerProfile, employerUser] = await Promise.all([
      db.query.employerProfiles.findFirst({ where: eq(employerProfiles.id, config.employerId) }),
      db.query.users.findFirst({ where: eq(users.id, config.employerId) }),
    ]);
    if (!employerProfile) return;

    // Stage 2 AI evaluation
    const prompt = buildTalentSearchEvaluationPrompt(
      { companyName: employerProfile.companyName ?? employerUser?.firstName ?? 'Unknown' },
      config.rules, freelancer
    );

    const evalStart = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    });
    const evalDurationHours = (Date.now() - evalStart) / 3_600_000;
    const responseText = response.choices[0]?.message?.content ?? '';
    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Deduct time from employer's daily budget
    await db.update(talentSearchConfigs)
      .set({ hoursUsedToday: sql`${talentSearchConfigs.hours_used_today} + ${evalDurationHours}` })
      .where(eq(talentSearchConfigs.id, config.id));

    // Log tokens (charged to employer)
    logTokenUsage(db, config.employerId, 'talent_search_evaluation', {
      promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    }).catch(err => log.warn({ err }, 'talent-search token log failed'));

    // Parse AI response
    let evaluation: TalentSearchEvaluation;
    try {
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      evaluation = JSON.parse(cleaned);
      if (!validateTalentSearchResponse(evaluation)) throw new Error('invalid shape');
    } catch {
      log.warn({ employerId: config.employerId, freelancerId: freelancer.id }, 'talent-search parse failed');
      return;
    }

    // Determine final decision
    const hasBlocker = evaluation.reasons.blockers.length > 0;
    const meetsThreshold = evaluation.score >= (config.rules.matchThreshold ?? 70);
    const willSend = !hasBlocker && meetsThreshold;
    const isDryRun = config.isDryRun;

    const decision = isDryRun
      ? (willSend ? 'dry_run_would_send' : 'dry_run_skipped')
      : (willSend ? 'sent' : 'skipped');

    // Log activity
    const activityId = generateId();
    await db.insert(talentSearchActivity).values({
      id: activityId,
      employerId: config.employerId,
      freelancerId: freelancer.id,
      rulesVersion: config.rulesVersion,
      score: evaluation.score,
      decision,
      matchReasons: evaluation.reasons,
      proposedMessage: evaluation.proposedMessage ?? null,
      sentAt: decision === 'sent' ? new Date() : null,
      skippedReason: decision === 'skipped'
        ? `Score ${evaluation.score} below threshold ${config.rules.matchThreshold}`
        : null,
      createdAt: new Date(),
    });

    if (decision === 'sent') {
      // Notify freelancer (with isTalentSearch: true for badge)
      createNotification(db, {
        userId: freelancer.id,
        type: 'talent_search_interest',
        title: `${employerProfile.companyName} is interested in your profile`,
        body: evaluation.proposedMessage,
        metadata: {
          employerId: config.employerId,
          activityId,
          isTalentSearch: true,   // drives "TalentSearch ✦" badge
        },
      }).catch(err => log.warn({ err }, 'talent-search freelancer notification failed'));

      // Notify employer
      createNotification(db, {
        userId: config.employerId,
        type: 'talent_search_sent',
        title: 'TalentSearch sent an interest message',
        body: `Your AI assistant expressed interest in ${freelancerRow.firstName ?? ''}'s profile (match score: ${evaluation.score}/100)`,
        metadata: { activityId, freelancerId: freelancer.id, score: evaluation.score },
      }).catch(err => log.warn({ err }, 'talent-search employer notification failed'));

      // Increment freelancer daily notification counter
      await db.update(freelancerProfiles)
        .set({ talentSearchNotificationsToday: sql`${freelancerProfiles.talent_search_notifications_today} + 1` })
        .where(eq(freelancerProfiles.id, freelancer.id));
    }

  } catch (err) {
    log.error({ err, employerId: config.employerId, freelancerId: freelancer.id },
      'talent-search single evaluation failed');
  }
}
```

### Task 2.4 — Hook Into `PUT /api/freelancers/me`

**File:** `artifacts/api-server/src/routes/freelancers.ts`

```ts
import { evaluateTalentSearchForUpdatedProfile } from '../lib/talentSearchEvaluator';

// AFTER db.update() returns and AFTER res.json() is called:
if (updatedProfile.completenessScore >= 60) {
  evaluateTalentSearchForUpdatedProfile(db, updatedProfile.id, req.log)
    .catch(err => req.log.warn({ err, freelancerId: updatedProfile.id },
      'talent-search evaluation hook failed'));
}
```

### Task 2.5 — Create `routes/talentSearch.ts`

**File:** `artifacts/api-server/src/routes/talentSearch.ts` (create new)

All routes require `userRole === 'employer'` — freelancers get 403.

Implement all 9 routes:
- `GET /api/talent-search` — return config or null
- `POST /api/talent-search` — upsert config, increment `rulesVersion` on rule change
- `PATCH /api/talent-search/activate` — `isActive: true`, `isDryRun: false`, `activatedAt: now()`
- `PATCH /api/talent-search/dry-run` — `isActive: true`, `isDryRun: true`
- `PATCH /api/talent-search/deactivate` — `isActive: false`, `deactivatedAt: now()`
- `POST /api/talent-search/parse-rules` — AI parses free-form text → `TalentSearchRules` + `warnings[]`
- `GET /api/talent-search/activity` — paginated activity feed, newest first
- `POST /api/talent-search/activity/:id/follow-up` — set `employerFollowUpSent: true`
- `GET /api/talent-search/stats` — `{ evaluatedToday, sentToday, skippedToday, hoursUsedToday, dailyLimitHours, hoursRemainingToday, hoursResetAt }`

### Task 2.6 — Register Routes

**File:** `artifacts/api-server/src/routes/index.ts`

```ts
import talentSearchRouter from './talentSearch';
app.use('/api/talent-search', talentSearchRouter);
```

### Task 2.7 — OpenAPI + Codegen

Add all 9 routes to `lib/api-spec/openapi.yaml`. Include:
- `TalentSearchConfig` schema
- `TalentSearchActivity` schema
- `TalentSearchRules` schema
- `TalentSearchStats` response schema

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

---

## Phase 3 — Frontend

### Task 3.1 — Verify Generated Hooks

```bash
grep -r "talentSearch\|talent-search" lib/api-client-react/src/ | head -10
```

- [ ] `useGetTalentSearch()` hook exists
- [ ] `usePatchTalentSearchActivate()` hook exists
- [ ] `TalentSearchConfig` and `TalentSearchRules` types generated

### Task 3.2 — Create `/talent-search` Route

**File:** `artifacts/talentlock/src/App.tsx`

```tsx
<Route path="/talent-search" component={TalentSearch} />
```

Add "TalentSearch" to employer navigation. Visible only when `userRole === 'employer'`.

### Task 3.3 — Create `/talent-search` Page

**File:** `artifacts/talentlock/src/pages/TalentSearch.tsx` (create new)

Mirrors the structure of `CruiseMode.tsx` exactly, with employer context:
- Three tabs: Setup, Activity, Stats
- `<TalentSearchStatusBar />` — top right
- Employer-only — 403/redirect for freelancers

### Task 3.4 — Create `<TalentSearchStatusBar />`

**File:** `artifacts/talentlock/src/components/talent-search/TalentSearchStatusBar.tsx`

Two states — Active and Inactive. Manual toggle only.

```
Inactive:  [○ TalentSearch is off]     [Turn On]  [Dry Run]
Active:    [● Active — 2 sent today]   [Turn Off]
           Hours used: 1.2h / 6h today
```

### Task 3.5 — Create `<TalentSearchRuleBuilder />`

**File:** `artifacts/talentlock/src/components/talent-search/TalentSearchRuleBuilder.tsx`

Two input modes: structured form OR free-form text/file. Form fields per the rule schema from `features.md` Module 1. AI parses text into the form with warnings preview.

### Task 3.6 — Create `<TalentSearchActivityFeed />`

**File:** `artifacts/talentlock/src/components/talent-search/TalentSearchActivityFeed.tsx`

Mirrors `CruiseModeActivityFeed`. Each entry shows: score badge, decision pill, freelancer name + sub-type badge, match reasons, collapsible message sent, "Send follow-up" button.

---

## Acceptance Criteria

- [ ] `talent_search_configs` and `talent_search_activity` tables created
- [ ] UNIQUE constraint on `talent_search_configs.employerId`
- [ ] Indexes on `talent_search_activity` (`employerId`, `freelancerId`, composite)
- [ ] `talentSearchNotificationsToday` and `talentSearchNotificationsResetAt` on `freelancer_profiles`
- [ ] `talent_search_parse` and `talent_search_evaluation` in `TokenFeature`
- [ ] `talentSearchPreFilter()` correctly rejects profession mismatch, rate mismatch, missing skills, excluded keywords, DBS requirement
- [ ] `isInBlackoutWindow()` reused from `cruiseModeUtils.ts` without modification
- [ ] Evaluation fires AFTER `PUT /api/freelancers/me` response — confirmed via response time test (<300ms)
- [ ] Evaluation does NOT fire when `completenessScore < 60`
- [ ] 30-day duplicate check prevents re-notifying the same freelancer within 30 days
- [ ] Freelancer receives max 3 TalentSearch notifications per day across all employers
- [ ] `isActive` is NEVER changed automatically — only via `/activate` and `/deactivate`
- [ ] `daily_limit_reached` logged when employer's `hoursUsedToday >= dailyLimitHours`
- [ ] `daily_freelancer_limit_reached` logged when freelancer has received 3 notifications today
- [ ] Freelancer notification has `isTalentSearch: true` metadata
- [ ] Dry Run: evaluates and logs `dry_run_would_send` but sends NO freelancer notifications
- [ ] All `/api/talent-search/*` routes return 403 for `userRole === 'freelancer'`
- [ ] All `/api/talent-search/*` routes return 401 for unauthenticated requests
- [ ] `PUT /api/freelancers/me` response time unaffected — TalentSearch hook is fire-and-forget
- [ ] `pnpm run typecheck` passes with zero errors
- [ ] `/talent-search` page renders for employers, 403/redirect for freelancers
- [ ] Status bar shows Active / Inactive — manual toggle only
- [ ] Activity feed shows freelancer name, score, decision, message, follow-up button

---

## Dependencies & Order

```
Task 1.1 (inspect) -> 1.2 -> 1.3 -> 1.4 -> 1.5 -> 1.6 (verify migration)
Task 2.1 -> 2.2 -> 2.3 -> 2.4 -> 2.5 -> 2.6 -> 2.7 (codegen + typecheck)
Task 3.1 (verify hooks) -> 3.2 -> 3.3 -> 3.4 -> 3.5 -> 3.6
```

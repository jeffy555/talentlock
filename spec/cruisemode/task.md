# TalentLock — Task Breakdown: Cruise Mode

---

## Phase 1 — Database

### Task 1.1 — Codebase Inspection

Run all inspection commands from `plan.md`. Document:
- Exact `job_requirements` column names for skills, rate, duration, fieldOfWork
- Exact `freelancer_profiles` column names for skills, rate, bio, fieldOfWork
- Whether Redis / BullMQ is in the stack
- How `createNotification()` is called (fire-and-forget pattern)
- Confirm `freelancer_free` plan definition in `plans.ts` (for testing — no plan gate)

### Task 1.2 — Create `cruise_mode_configs` Table

**File:** `lib/db/src/schema/` — new table

```ts
export const cruiseModeConfigs = pgTable('cruise_mode_configs', {
  id:                text('id').primaryKey(),
  freelancerId:      text('freelancer_id').notNull()
                       .references(() => freelancerProfiles.id),
  isActive:          boolean('is_active').notNull().default(false),
  // isActive is ONLY changed by the freelancer manually via /activate or /deactivate
  // It is NEVER changed automatically by the system (no auto-shutoff)
  isDryRun:          boolean('is_dry_run').notNull().default(false),
  rules:             jsonb('rules').notNull().$type<CruiseModeRules>(),
  rulesVersion:      integer('rules_version').notNull().default(1),
  rawRulesText:      text('raw_rules_text'),
  // Daily time tracking — replaces message count quota
  hoursUsedToday:    decimal('hours_used_today', { precision: 4, scale: 2 })
                       .notNull().default('0'),
  dailyLimitHours:   decimal('daily_limit_hours', { precision: 4, scale: 2 })
                       .notNull().default('6'),   // 6.0 hours per day
  hoursResetAt:      timestamp('hours_reset_at', { withTimezone: true })
                       .notNull().$defaultFn(() => getNextMidnightUTC()),
  activatedAt:       timestamp('activated_at',   { withTimezone: true }),
  deactivatedAt:     timestamp('deactivated_at', { withTimezone: true }),
  deletedAt:         timestamp('deleted_at',     { withTimezone: true }),
  createdAt:         timestamp('created_at',     { withTimezone: true }).defaultNow().notNull(),
  updatedAt:         timestamp('updated_at',     { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqFreelancer: unique().on(t.freelancerId), // One config per freelancer
}));
```

### Task 1.3 — Create `cruise_mode_activity` Table

```ts
export const cruiseModeActivity = pgTable('cruise_mode_activity', {
  id:                      text('id').primaryKey(),
  freelancerId:            text('freelancer_id').notNull()
                             .references(() => freelancerProfiles.id),
  jobRequirementId:        text('job_requirement_id').notNull()
                             .references(() => jobRequirements.id),
  rulesVersion:            integer('rules_version').notNull(),
  score:                   integer('score').notNull(),
  decision:                text('decision').notNull(),
  // Valid decision values:
  // sent                — message sent to employer
  // skipped             — score below threshold or blocker found
  // dry_run_would_send  — dry run: would have sent
  // dry_run_skipped     — dry run: would have skipped
  // blackout            — skipped due to blackout window
  // duplicate           — already sent for this job
  // daily_limit_reached — 6h daily budget exhausted (isActive unchanged)
  // cruise_mode_off     — isActive was false when job was posted (should not normally appear)
  matchReasons:            jsonb('match_reasons').notNull().$type<MatchReasons>(),
  proposedMessage:         text('proposed_message'),
  sentAt:                  timestamp('sent_at',      { withTimezone: true }),
  skippedReason:           text('skipped_reason'),
  freelancerFollowUpSent:  boolean('freelancer_follow_up_sent').notNull().default(false),
  createdAt:               timestamp('created_at',   { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  freelancerIdx:    index().on(t.freelancerId),
  freelancerJobIdx: index().on(t.freelancerId, t.jobRequirementId),
}));
```

### Task 1.4 — Export Types

**File:** `lib/db/src/schema/` (or a dedicated types file)

```ts
export interface CruiseModeRules {
  requiredSkills:   string[];
  preferredSkills:  string[];
  minRate:          number | null;
  maxRate:          number | null;
  availableFrom:    string | null;
  availableTo:      string | null;
  maxDurationWeeks: number | null;
  minDurationWeeks: number | null;
  excludedKeywords: string[];
  preferredFields:  string[];
  matchThreshold:   number; // 0-100, default 70
  messageTone:      'professional' | 'friendly' | 'concise';
  blackoutWindows:  { timezone: string; windows: BlackoutWindow[] } | null;
  dailyDigest:      boolean;
  version:          number;
}

export interface BlackoutWindow {
  start: string; // "HH:MM"
  end:   string; // "HH:MM"
  days:  number[]; // 0=Sun ... 6=Sat, empty=all days
}

export interface MatchReasons {
  matched:  string[];
  concerns: string[];
  blockers: string[];
}
```

### Task 1.5 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('cruise_mode_configs', 'cruise_mode_activity');

-- Verify daily time tracking columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'cruise_mode_configs'
AND column_name IN ('hours_used_today', 'daily_limit_hours', 'hours_reset_at');
```

---

## Phase 2 — Backend

### Task 2.1 — Add Token Features

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

```ts
| 'cruise_mode_parse'        // Rule parsing from free-form text
| 'cruise_mode_evaluation'   // Per-job Stage 2 AI evaluation
```

### Task 2.2 — Create `cruiseModeUtils.ts`

**File:** `artifacts/api-server/src/lib/cruiseModeUtils.ts` (create new)

Implement:
1. `preFilter(rules, job): boolean` — Stage 1 filter (from `plan.md` Q6) — no AI, no time cost
2. `isInBlackoutWindow(rules): boolean` — timezone-aware check (from `plan.md` Q4)
3. `normaliseJob(jobRow): NormalisedJob` — maps actual DB columns to standard interface
4. `buildEvaluationPrompt(freelancer, rules, job): string` — verbatim from `plan.md` system prompt
5. `validateEvaluationResponse(parsed): boolean` — checks score, decision, reasons, proposedMessage
6. `getNextMidnightUTC(): Date` — returns next midnight at 00:00:00 UTC

```ts
export function getNextMidnightUTC(): Date {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d;
}
```

### Task 2.3 — Create `cruiseModeEvaluator.ts`

**File:** `artifacts/api-server/src/lib/cruiseModeEvaluator.ts` (create new)

Main evaluation pipeline. Key changes from old quota model — time tracking replaces message counting:

```ts
export async function evaluateCruiseModeForNewJob(db: DB, jobId: string, log: Logger) {
  const job = await db.query.jobRequirements.findFirst({
    where: eq(jobRequirements.id, jobId),
  });
  if (!job) return;

  const configs = await db.query.cruiseModeConfigs.findMany({
    where: and(
      eq(cruiseModeConfigs.isActive, true),
      isNull(cruiseModeConfigs.deletedAt)
    ),
  });
  if (configs.length === 0) return;

  const normalJob = normaliseJob(job);
  const candidates = configs.filter(c => preFilter(c.rules, normalJob));
  const batch = candidates.slice(0, 50);

  await Promise.allSettled(
    batch.map(config => evaluateSingleCandidate(db, config, job, normalJob, log))
  );
}

async function evaluateSingleCandidate(db, config, job, normalJob, log) {
  try {
    // 1. Blackout check
    if (isInBlackoutWindow(config.rules)) {
      await logActivity(db, config, job.id, {
        decision: 'blackout', score: 0,
        matchReasons: { matched: [], concerns: [], blockers: ['Blackout window active'] },
        proposedMessage: null, skippedReason: 'Blackout window',
      });
      return;
    }

    // 2. Duplicate check
    const alreadySent = await db.query.cruiseModeActivity.findFirst({
      where: and(
        eq(cruiseModeActivity.freelancerId, config.freelancerId),
        eq(cruiseModeActivity.jobRequirementId, job.id),
        eq(cruiseModeActivity.decision, 'sent'),
      ),
    });
    if (alreadySent) return; // Silent skip — no log entry needed

    // 3. Daily limit check — reset counter if past midnight UTC
    const now = new Date();
    let currentConfig = config;
    if (new Date(config.hoursResetAt) < now) {
      await db.update(cruiseModeConfigs).set({
        hoursUsedToday: 0,
        hoursResetAt: getNextMidnightUTC(),
      }).where(eq(cruiseModeConfigs.id, config.id));
      currentConfig = { ...config, hoursUsedToday: 0 };
    }

    if (Number(currentConfig.hoursUsedToday) >= Number(currentConfig.dailyLimitHours)) {
      // Daily limit reached — log it but DO NOT change isActive
      await logActivity(db, config, job.id, {
        decision: 'daily_limit_reached', score: 0,
        matchReasons: { matched: [], concerns: [], blockers: ['Daily 6h limit reached'] },
        proposedMessage: null,
        skippedReason: `Daily limit of ${currentConfig.dailyLimitHours}h reached`,
      });
      // Notify freelancer once (check if already notified today to avoid spam)
      // Only notify if this is the first daily_limit_reached entry today
      return;
    }

    // 4. Fetch freelancer data
    const [freelancerProfile, freelancerUser] = await Promise.all([
      db.query.freelancerProfiles.findFirst({ where: eq(freelancerProfiles.id, config.freelancerId) }),
      db.query.users.findFirst({ where: eq(users.id, config.freelancerId) }),
    ]);
    if (!freelancerProfile) return;

    // 5. Build prompt and call OpenAI — measure duration for time tracking
    const prompt = buildEvaluationPrompt(
      { name: `${freelancerUser?.firstName} ${freelancerUser?.lastName}`.trim(), ...freelancerProfile },
      config.rules, normalJob
    );

    const evalStart = Date.now();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o', temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    });

    const evalDurationHours = (Date.now() - evalStart) / 3_600_000; // ms → fractional hours
    const responseText = response.choices[0]?.message?.content ?? '';
    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // 6. Deduct time from daily budget
    await db.update(cruiseModeConfigs)
      .set({ hoursUsedToday: sql`${cruiseModeConfigs.hours_used_today} + ${evalDurationHours}` })
      .where(eq(cruiseModeConfigs.id, config.id));

    // 7. Log tokens (fire-and-forget — never blocks evaluation)
    logTokenUsage(db, config.freelancerId, 'cruise_mode_evaluation', {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    }).catch(err => log.warn({ err }, 'cruise mode token log failed'));

    // 8. Parse response
    let evaluation: EvaluationResult;
    try {
      const cleaned = responseText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!validateEvaluationResponse(parsed)) throw new Error('invalid shape');
      evaluation = parsed;
    } catch {
      log.warn({ freelancerId: config.freelancerId, jobId: job.id }, 'cruise mode parse failed');
      return;
    }

    // 9. Determine final decision
    const hasBlocker = evaluation.reasons.blockers.length > 0;
    const meetsThreshold = evaluation.score >= (config.rules.matchThreshold ?? 70);
    const willSend = !hasBlocker && meetsThreshold;

    const decision = config.isDryRun
      ? (willSend ? 'dry_run_would_send' : 'dry_run_skipped')
      : (willSend ? 'sent' : 'skipped');

    // 10. Log activity
    const activityId = generateId();
    await db.insert(cruiseModeActivity).values({
      id: activityId,
      freelancerId: config.freelancerId,
      jobRequirementId: job.id,
      rulesVersion: config.rulesVersion,
      score: evaluation.score,
      decision,
      matchReasons: evaluation.reasons,
      proposedMessage: evaluation.proposedMessage ?? null,
      sentAt: (decision === 'sent') ? new Date() : null,
      skippedReason: (decision === 'skipped')
        ? `Score ${evaluation.score} below threshold ${config.rules.matchThreshold}`
        : null,
      createdAt: new Date(),
    });

    // 11. Notify both parties if sent
    if (decision === 'sent') {
      // Employer notification — isCruiseMode: true drives the "Cruise Mode ✦" badge in the UI
      createNotification(db, {
        userId: job.employerId,
        type: 'cruise_mode_interest',
        title: `${freelancerUser?.firstName} is interested in your job`,
        body: `${freelancerUser?.firstName} ${freelancerUser?.lastName} expressed interest in "${job.title}"`,
        metadata: {
          freelancerId: config.freelancerId,
          jobId: job.id,
          activityId,
          isCruiseMode: true,
        },
      }).catch(err => log.warn({ err }, 'cruise mode employer notification failed'));

      // Freelancer notification
      createNotification(db, {
        userId: config.freelancerId,
        type: 'cruise_mode_sent',
        title: 'Cruise Mode sent a message',
        body: `Your AI assistant expressed interest in "${job.title}" (match score: ${evaluation.score}/100)`,
        metadata: { activityId, jobId: job.id, score: evaluation.score },
      }).catch(err => log.warn({ err }, 'cruise mode freelancer notification failed'));

      // Email freelancer on every send
      sendNotificationEmail(db, config.freelancerId, {
        subject: `Cruise Mode expressed interest in "${job.title}"`,
        body: `Your TalentLock Cruise Mode sent an interest message for "${job.title}". Match score: ${evaluation.score}/100. View your activity feed to see what was sent.`,
      }).catch(() => {});
    }

  } catch (err) {
    log.error({ err, freelancerId: config.freelancerId, jobId: job.id }, 'cruise mode single evaluation failed');
  }
}
```

### Task 2.4 — Hook Into `POST /api/job-requirements`

**File:** `artifacts/api-server/src/routes/jobRequirements.ts`

After `db.insert(jobRequirements)` returns:

```ts
import { evaluateCruiseModeForNewJob } from '../lib/cruiseModeEvaluator';

// After insert — fire-and-forget, never awaited, never delays the response:
evaluateCruiseModeForNewJob(db, newJob.id, req.log)
  .catch(err => req.log.warn({ err, jobId: newJob.id }, 'cruise-mode evaluation hook failed'));

return res.status(201).json(newJob);
```

### Task 2.5 — Create `routes/cruiseMode.ts`

**File:** `artifacts/api-server/src/routes/cruiseMode.ts` (create new)

All routes require `userRole === 'freelancer'` — employers get 403.

**`GET /api/cruise-mode`** — Return config or null:
```ts
router.get('/', requireFreelancerAuth, async (req, res) => {
  const config = await db.query.cruiseModeConfigs.findFirst({
    where: and(
      eq(cruiseModeConfigs.freelancerId, internalUserId),
      isNull(cruiseModeConfigs.deletedAt)
    ),
  });
  res.json(config ?? null);
});
```

**`POST /api/cruise-mode`** — Create or update config. Increment `rulesVersion` on rule change.

**`PATCH /api/cruise-mode/activate`** — Manual ON:
```ts
// Sets isActive: true, isDryRun: false, activatedAt: now()
// NO plan check during testing — any freelancer plan can activate
// NEVER auto-deactivates — only manual /deactivate can turn it off
```

**`PATCH /api/cruise-mode/dry-run`** — Sets `isActive: true`, `isDryRun: true`

**`PATCH /api/cruise-mode/deactivate`** — Manual OFF:
```ts
// Sets isActive: false, deactivatedAt: now()
// This is the ONLY way Cruise Mode turns off — no automatic deactivation
```

**`POST /api/cruise-mode/parse-rules`** — AI parses free-form text:
```ts
// Body: { rawText: string }
// Returns: { rules: CruiseModeRules, warnings: string[] }
// Logs token usage as 'cruise_mode_parse'
```

**`GET /api/cruise-mode/activity`** — Paginated activity feed (newest first):
```ts
// Returns { data, total, page, pageSize, totalPages }
// Each item: score, decision, matchReasons, proposedMessage, jobTitle, createdAt
```

**`POST /api/cruise-mode/activity/:id/follow-up`** — Sets `freelancerFollowUpSent: true`

**`GET /api/cruise-mode/stats`** — Today's stats:
```ts
// Returns:
// {
//   evaluatedToday: number,
//   sentToday: number,
//   skippedToday: number,
//   dryRunToday: number,
//   hoursUsedToday: number,     // e.g. 2.4
//   dailyLimitHours: number,    // 6.0
//   hoursRemainingToday: number // e.g. 3.6
//   hoursResetAt: string,       // ISO timestamp of next midnight UTC
// }
```

### Task 2.6 — Register Routes

**File:** `artifacts/api-server/src/routes/index.ts`

```ts
import cruiseModeRouter from './cruiseMode';
app.use('/api/cruise-mode', cruiseModeRouter);
```

### Task 2.7 — OpenAPI + Codegen

Add all 9 routes to `lib/api-spec/openapi.yaml`. Run:
```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen checks: `indexFiles: false`, index exports, `pnpm run typecheck`.

---

## Phase 3 — Frontend

### Task 3.1 — Add `/cruise-mode` Route

**File:** `artifacts/talentlock/src/App.tsx`

```tsx
<Route path="/cruise-mode" component={CruiseMode} />
```

Add "Cruise Mode" to the freelancer navigation (visible only when `userRole === 'freelancer'`).

### Task 3.2 — Create `/cruise-mode` Page

**File:** `artifacts/talentlock/src/pages/CruiseMode.tsx` (create new)

Three tabs:
1. **Setup** — Rule builder form / text parser
2. **Activity** — Paginated activity feed
3. **Stats** — Today's hours used, hours remaining, activity counts

### Task 3.3 — Create `<CruiseModeRuleBuilder />`

**File:** `artifacts/talentlock/src/components/cruise-mode/CruiseModeRuleBuilder.tsx`

Two input modes: structured form OR text paste/upload. AI parses text into the form. Preview shows parsed rules with warnings.

### Task 3.4 — Create `<CruiseModeActivityFeed />`

**File:** `artifacts/talentlock/src/components/cruise-mode/CruiseModeActivityFeed.tsx`

Paginated list. Each entry shows score badge, decision pill, job title, match reasons, and collapsible proposed message. "Send follow-up" on sent entries.

### Task 3.5 — Create `<CruiseModeStatusBar />`

**File:** `artifacts/talentlock/src/components/cruise-mode/CruiseModeStatusBar.tsx`

Two states only — **Active** and **Inactive** — controlled entirely by the freelancer manually.

```
Inactive:  [○ Cruise Mode is off]    [Turn On]  [Dry Run]
Active:    [● Active]                [Turn Off]
```

No auto-shutoff states. No "paused" state. The freelancer turns it on and turns it off.

The status bar also shows daily usage when active:
```
[● Active]    2.4h / 6h used today    [Turn Off]
```

---

## Acceptance Criteria

- [ ] `cruise_mode_configs` and `cruise_mode_activity` tables created
- [ ] UNIQUE constraint on `cruise_mode_configs.freelancerId`
- [ ] `hoursUsedToday`, `dailyLimitHours`, `hoursResetAt` columns on `cruise_mode_configs`
- [ ] `cruise_mode_parse` and `cruise_mode_evaluation` in `TokenFeature`
- [ ] `preFilter()` correctly rejects excluded keywords, rate mismatches, missing skills
- [ ] `isInBlackoutWindow()` returns true during configured windows
- [ ] Stage 1 pre-filter rejections do NOT deduct from `hoursUsedToday`
- [ ] Stage 2 AI evaluation duration IS deducted from `hoursUsedToday`
- [ ] `hoursUsedToday` resets to 0 at midnight UTC (not when freelancer manually deactivates)
- [ ] `isActive` is NEVER changed automatically — only by `/activate` and `/deactivate` routes
- [ ] `daily_limit_reached` logged when `hoursUsedToday >= dailyLimitHours` — isActive unchanged
- [ ] Evaluation fires fire-and-forget after `POST /api/job-requirements`
- [ ] `POST /api/job-requirements` response time unaffected (< 500ms)
- [ ] Evaluation skips blackout window with `decision: 'blackout'`
- [ ] Evaluation skips duplicates silently (no log entry)
- [ ] ALL freelancer plans can activate Cruise Mode (no plan gate during testing)
- [ ] Employers get 403 on all `/api/cruise-mode/*` routes
- [ ] Employer notification created with `isCruiseMode: true` metadata on `decision: 'sent'`
- [ ] Freelancer notification created on `decision: 'sent'`
- [ ] Dry Run: evaluates and logs `dry_run_would_send` but sends NO employer notifications
- [ ] Parse-rules endpoint returns structured rules + warnings from free-form text
- [ ] Activity feed paginated correctly
- [ ] Stats endpoint returns `hoursUsedToday`, `dailyLimitHours`, `hoursRemainingToday`
- [ ] `/cruise-mode` page renders for freelancers, 403/redirect for employers
- [ ] Status bar shows only Active / Inactive — manual toggle only
- [ ] Status bar shows hours used when active (e.g. "2.4h / 6h used today")
- [ ] Rule builder form saves to config
- [ ] Text parser calls AI and populates form with parsed rules + warnings
- [ ] Activation dialog shown before going live
- [ ] `pnpm run typecheck` passes

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 → 1.4 → 1.5 (migration)
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 (codegen + typecheck)
Task 3.1 → 3.2 → 3.3 → 3.4 → 3.5
```
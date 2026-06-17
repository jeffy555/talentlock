# TalentLock — Implementation Plan: Cruise Mode

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

```bash
# 1. job_requirements schema — exact column names for skills, rate, duration
grep -A 40 "jobRequirements\s*=" lib/db/src/schema/*.ts | head -50

# 2. Check for Redis / BullMQ / any queue library
grep -r "redis\|bull\|queue\|worker" package.json artifacts/api-server/package.json 2>/dev/null | head -5

# 3. Check date/timezone library availability
grep -r "luxon\|dayjs\|date-fns\|moment" package.json artifacts/api-server/package.json 2>/dev/null | head -5

# 4. Check how notifications are created (fire-and-forget pattern)
grep -n "createNotification\|notification" artifacts/api-server/src/routes/bookings.ts | head -10

# 5. Check cruise_mode_evaluation in TokenFeature
grep "cruise_mode" artifacts/api-server/src/lib/tokenLogger.ts

# 6. Check existing freelancer profile column names (skills, fieldOfWork, rate, bio)
grep -A 30 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | head -35

# 7. Confirm POST /api/job-requirements handler location
grep -n "router.post\|app.post" artifacts/api-server/src/routes/jobRequirements.ts | head -5
```

---

## Resolved Questions

---

### Q1 — Background Job Mechanism

**Decision: Fire-and-forget with `Promise.allSettled()` for Phase 1. Pre-filter first.**

```ts
// In POST /api/job-requirements handler — AFTER db.insert() returns:
evaluateCruiseModeForNewJob(db, newJob.id, req.log).catch(err =>
  req.log.warn({ err, jobId: newJob.id }, 'cruise-mode evaluation failed')
);
// Route returns 201 immediately — evaluation runs asynchronously
```

The evaluation function:
```ts
async function evaluateCruiseModeForNewJob(db, jobId, log) {
  const job = await db.query.jobRequirements.findFirst({
    where: eq(jobRequirements.id, jobId),
  });
  if (!job) return;

  // 1. Fetch all active cruise mode configs (isActive = true only)
  const configs = await db.query.cruiseModeConfigs.findMany({
    where: and(
      eq(cruiseModeConfigs.isActive, true),
      isNull(cruiseModeConfigs.deletedAt)
    ),
  });
  if (configs.length === 0) return;

  // 2. Pre-filter (no AI call) — eliminates non-matches cheaply
  const normalJob = normaliseJob(job);
  const candidates = configs.filter(c => preFilter(c.rules, normalJob));

  // 3. Cap at 50 concurrent AI evaluations
  const batch = candidates.slice(0, 50);

  // 4. Evaluate all in parallel, never let one failure stop others
  await Promise.allSettled(
    batch.map(config => evaluateSingleCandidate(db, config, job, normalJob, log))
  );
}
```

**TODO comment to add:** `// TODO: Migrate to BullMQ when Redis is available — see specs/cruise-mode/plan.md Q1`

---

### Q2 — `job_requirements` Column Names

**Decision: Inspect first. Map actual column names in the pre-filter and prompt builder.**

After inspection, document confirmed column names. The evaluation engine uses:
- Job title (likely `title`)
- Job description (likely `description`)
- Required skills (likely `skills` as text[] or jsonb)
- Rate/budget (likely `budget`, `minRate`, `maxRate`, or `hourlyRate`)
- Duration (likely `durationWeeks` or `estimatedDuration`)
- Field of work (likely `fieldOfWork` or `category`)

Build a `normaliseJob(job)` function that maps actual column names to a standard interface:
```ts
interface NormalisedJob {
  title: string;
  description: string;
  skills: string[];
  minRate: number | null;
  maxRate: number | null;
  durationWeeks: number | null;
  fieldOfWork: string;
}
```

---

### Q3 — Interest Expression Mechanics

**Decision: Option B — `cruise_mode_activity` row + employer notification. No booking created.**

```ts
// After AI decides to send:
const activityId = generateId();
await db.insert(cruiseModeActivity).values({
  id: activityId,
  freelancerId: config.freelancerId,
  jobRequirementId: job.id,
  rulesVersion: config.rulesVersion,
  score: evaluation.score,
  decision: config.isDryRun ? 'dry_run_would_send' : 'sent',
  matchReasons: evaluation.reasons,
  proposedMessage: evaluation.proposedMessage ?? null,
  sentAt: config.isDryRun ? null : new Date(),
  createdAt: new Date(),
});

if (!config.isDryRun) {
  // Notify employer — with isCruiseMode: true so the UI shows "Cruise Mode ✦" badge
  createNotification(db, {
    userId: job.employerId,
    type: 'cruise_mode_interest',
    title: `${freelancerName} is interested in your job`,
    body: `${freelancerName} expressed interest in "${job.title}"`,
    metadata: {
      freelancerId: config.freelancerId,
      jobId: job.id,
      activityId,
      isCruiseMode: true,  // This flag drives the "Cruise Mode ✦" badge on the employer notification card
    },
  }).catch(err => log.warn({ err }, 'cruise mode employer notification failed'));

  // Notify freelancer
  createNotification(db, {
    userId: config.freelancerId,
    type: 'cruise_mode_sent',
    title: 'Cruise Mode sent a message',
    body: `Your AI assistant expressed interest in "${job.title}" (match score: ${evaluation.score}/100)`,
    metadata: { activityId, jobId: job.id, score: evaluation.score },
  }).catch(err => log.warn({ err }, 'cruise mode freelancer notification failed'));

  // Email the freelancer on first send (trust-building)
  sendNotificationEmail(db, config.freelancerId, {
    subject: `Cruise Mode expressed interest in "${job.title}"`,
    body: `Your TalentLock Cruise Mode sent an interest message for the job "${job.title}". Match score: ${evaluation.score}/100. View your activity feed to see what was sent.`,
  }).catch(() => {});
}
```

---

### Q4 — Timezone / Blackout Windows

**Decision: Use native `Intl.DateTimeFormat` — no library dependency.**

```ts
export function isInBlackoutWindow(rules: CruiseModeRules): boolean {
  if (!rules.blackoutWindows?.windows?.length) return false;
  const { timezone, windows } = rules.blackoutWindows;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric', minute: 'numeric',
    weekday: 'short', hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const dayIndex = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekday ?? '');
  const currentMinutes = hour * 60 + minute;

  return windows.some(w => {
    if (w.days.length > 0 && !w.days.includes(dayIndex)) return false;
    const [startH, startM] = w.start.split(':').map(Number);
    const [endH, endM] = w.end.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    if (endMins > startMins) return currentMinutes >= startMins && currentMinutes < endMins;
    // Handles overnight windows (e.g. 22:00–06:00)
    return currentMinutes >= startMins || currentMinutes < endMins;
  });
}
```

---

### Q5 — Employer Transparency

**Decision: "Cruise Mode ✦" badge on the employer notification card. Message body reads naturally.**

The `isCruiseMode: true` metadata flag on the notification drives a small `Cruise Mode ✦` pill badge rendered on the employer's notification card in the frontend. The message body is written in the freelancer's voice — no disclaimer sentence inside the message text itself.

---

### Q6 — Rate Limiting AI Evaluations

**Decision: Two-stage filtering.**

**Stage 1 — Pre-filter (no AI, instant, does NOT count against daily limit):**
```ts
function preFilter(rules: CruiseModeRules, job: NormalisedJob): boolean {
  // Hard blockers — if any fail, skip immediately (no AI call, no time consumed)
  if (rules.excludedKeywords?.some(kw =>
    (job.title + ' ' + job.description).toLowerCase().includes(kw.toLowerCase())
  )) return false;

  if (rules.minRate && job.maxRate && job.maxRate < rules.minRate) return false;
  if (rules.maxRate && job.minRate && job.minRate > rules.maxRate) return false;

  // At least 1 required skill must appear in job text
  const jobText = (job.title + ' ' + job.description + ' ' + job.skills.join(' ')).toLowerCase();
  if (rules.requiredSkills?.length > 0) {
    const hasAnySkill = rules.requiredSkills.some(skill =>
      jobText.includes(skill.toLowerCase())
    );
    if (!hasAnySkill) return false;
  }

  return true;
}
```

**Stage 2 — Full AI evaluation (counts against daily limit):**
Only candidates passing Stage 1 reach here. The time from OpenAI call start to return is measured and added to `hoursUsedToday`.

---

### Q7 — Daily Usage Limit (Replaces Message Count)

**Decision: Track elapsed AI evaluation time per day in `hoursUsedToday`. Manual ON/OFF always. No auto-shutoff.**

#### How daily limit is tracked

```ts
// Before each Stage 2 AI evaluation:
const now = new Date();

// Reset daily counter if past midnight UTC
if (config.hoursResetAt < now) {
  await db.update(cruiseModeConfigs).set({
    hoursUsedToday: 0,
    hoursResetAt: getNextMidnightUTC(),
  }).where(eq(cruiseModeConfigs.id, config.id));
  config.hoursUsedToday = 0;
}

// Check if daily limit is reached
if (config.hoursUsedToday >= config.dailyLimitHours) {
  // Log as daily_limit_reached — do NOT change isActive
  await logActivity(db, config, job.id, {
    decision: 'daily_limit_reached',
    score: 0,
    matchReasons: { matched: [], concerns: [], blockers: ['Daily usage limit reached'] },
    proposedMessage: null,
    skippedReason: `Daily limit of ${config.dailyLimitHours}h reached`,
  });
  // Notify freelancer once per day (not on every skipped job)
  return;
}

// Measure the AI call duration
const evalStart = Date.now();
// ... make OpenAI call ...
const evalDurationHours = (Date.now() - evalStart) / 3_600_000; // ms → hours

// Deduct time AFTER the call completes
await db.update(cruiseModeConfigs)
  .set({ hoursUsedToday: sql`${cruiseModeConfigs.hoursUsedToday} + ${evalDurationHours}` })
  .where(eq(cruiseModeConfigs.id, config.id));
```

#### Key rules
- `isActive` is **never changed automatically** — always under manual freelancer control
- `hoursUsedToday` resets to `0` at midnight UTC every day
- `dailyLimitHours` defaults to `6.0` — applies to all plans during testing
- Pre-filter rejections (Stage 1) cost zero time — only Stage 2 GPT calls count
- After daily limit is reached, new jobs are logged as `daily_limit_reached` and skipped — no message sent, no employer notification
- Freelancer receives a single notification when daily limit is first reached (not per-job)

#### `getNextMidnightUTC()` implementation
```ts
export function getNextMidnightUTC(): Date {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0); // next midnight UTC
  return d;
}
```

---

### Q8 — Plan Gating

**Decision: Available to ALL freelancer plans during testing. `freelancer_free` included.**

```ts
// In PATCH /api/cruise-mode/activate:
// During testing: no plan check — any authenticated freelancer can activate
// Production (future): check userPlan === 'freelancer_pro' || userPlan === 'freelancer_enterprise'

// For now:
if (userRole !== 'freelancer') {
  return res.status(403).json({ error: 'Cruise Mode is for freelancers only' });
}
// No plan gate during testing phase
```

The `dailyLimitHours` column allows per-user limit overrides without a schema change. When production plan gating is added, different plan tiers can have different daily limits.

---

### Q9 (formerly Q8) — Config Deletion

**Decision: Soft delete only. `deactivate` sets `isActive: false`, never touches `deletedAt`.**

On GDPR account deletion: set `cruise_mode_configs.deletedAt = now()`. Activity rows are anonymised but not deleted (platform integrity — employers were notified on behalf of this freelancer).

---

## Pre-Filter + AI Evaluation System Prompt (Use Verbatim)

```
You are an AI assistant for a freelance marketplace, evaluating job fit on behalf of a freelancer.

FREELANCER PROFILE:
Name: ${freelancerName}
Field: ${fieldOfWork}
Skills: ${skills.join(', ')}
Current rate: $${rate}/hr
Bio summary: ${bio?.slice(0, 300)}

FREELANCER CRUISE MODE RULES:
Required skills: ${rules.requiredSkills.join(', ') || 'any'}
Preferred skills: ${rules.preferredSkills.join(', ') || 'none specified'}
Rate range: $${rules.minRate ?? 0}–$${rules.maxRate ?? '∞'}/hr
Max project duration: ${rules.maxDurationWeeks ? `${rules.maxDurationWeeks} weeks` : 'any'}
Excluded keywords: ${rules.excludedKeywords.join(', ') || 'none'}
Preferred fields: ${rules.preferredFields.join(', ') || 'any'}

JOB POSTING:
Title: ${job.title}
Description: ${job.description}
Required skills: ${job.skills.join(', ')}
Rate: ${job.minRate ? `$${job.minRate}` : 'not specified'}${job.maxRate ? `–$${job.maxRate}/hr` : ''}
Duration: ${job.durationWeeks ? `${job.durationWeeks} weeks` : 'not specified'}
Field: ${job.fieldOfWork}

Evaluate this job for the freelancer. Return ONLY a JSON object — no preamble, no markdown:
{
  "score": <0-100>,
  "decision": "send" | "skip",
  "reasons": {
    "matched": ["<reason>", ...],
    "concerns": ["<concern>", ...],
    "blockers": ["<blocker>", ...]
  },
  "proposedMessage": "<personalised 100-150 word interest message in ${rules.messageTone} tone, written in first person as if the freelancer is writing it, referencing specific skills that match the job>"
}

Decision rules:
- score >= ${rules.matchThreshold}: decision = "send"
- score < ${rules.matchThreshold}: decision = "skip"
- If ANY blocker exists: decision = "skip" regardless of score
- proposedMessage must be non-null only when decision = "send"
- The proposedMessage must NOT mention that it was AI-generated
- Write proposedMessage in ${rules.messageTone} tone
```

Temperature: `0.4` (slight variation for natural-sounding messages).

---

## Duplicate Prevention

```ts
// Has this freelancer already sent an interest for this exact job?
const alreadySent = await db.query.cruiseModeActivity.findFirst({
  where: and(
    eq(cruiseModeActivity.freelancerId, config.freelancerId),
    eq(cruiseModeActivity.jobRequirementId, job.id),
    eq(cruiseModeActivity.decision, 'sent'),
  ),
});
if (alreadySent) return; // Skip silently — no activity log entry needed
```

---

## `TokenFeature` Additions

```ts
export type TokenFeature =
  | /* existing */
  | 'cruise_mode_parse'        // Rule parsing from free-form text
  | 'cruise_mode_evaluation'   // Per-job AI evaluation (Stage 2 only)
```

Token logging happens after every Stage 2 OpenAI call regardless of whether the message was sent or skipped. Tokens are attributed to the freelancer's userId.

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full
- [ ] All 6 spec files read
- [ ] Codebase inspection complete — Q1, Q2, Q4 findings documented
- [ ] `cruise_mode_parse` and `cruise_mode_evaluation` added to `TokenFeature`
- [ ] `preFilter()` tested against 10 sample jobs before Phase 2

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Schema — 2 new tables with daily time tracking columns | ⬜ Not started |
| Phase 2 | Backend — evaluation engine + all API routes | ⬜ Not started |
| Phase 3 | Frontend — `/cruise-mode` page + rule builder + activity feed | ⬜ Not started |
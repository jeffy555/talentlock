# TalentLock — Clarification & Verification: Cruise Mode

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `job_requirements` table exists with title, description, skills, rate fields | Confirmed in `project.md` |
| `POST /api/job-requirements` is the job creation route — fire-and-forget hook can attach here | Confirmed |
| `freelancer_profiles` table exists with `skills`, `fieldOfWork`, `rate`, `bio` | Confirmed |
| `notifications` table + `createNotification()` fire-and-forget pattern established | Confirmed — 15 event triggers already |
| `sendNotificationEmail()` available for email alerts | Confirmed — emailService.ts |
| OpenAI client available server-side | Confirmed |
| `logTokenUsage()` + `TokenFeature` union exists | Confirmed |
| `availability_blocks` can be queried to check freelancer availability at job posting time | Confirmed |
| Freelancer plans: `freelancer_free` (no AI), `freelancer_pro` (has AI features) | Confirmed |
| `sanitiseText()` for all free-text input | Confirmed |
| `canAccessBooking`/access control pattern from `accessControl.ts` | Confirmed — reuse for Cruise Mode routes |
| Paginated response shape `{ data, total, page, pageSize, totalPages }` | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Background Job Execution: How Does the Platform Handle Async Work?

**Question:** The job evaluation engine must run for potentially many freelancers when a job is posted. What background job mechanism is available?

**Options:**
- **(A)** Fire-and-forget in the same Express process — `setImmediate()` or `process.nextTick()` after the job is saved
- **(B)** A job queue (BullMQ + Redis)
- **(C)** A separate cron/worker process
- **(D)** Database polling — a separate process checks for unprocessed jobs

**Impact:** This is the most critical architectural decision in the entire spec. Option A is simplest but has no retry, no parallelism limit, and will block the Node.js event loop if many freelancers have Cruise Mode active. Option B is the correct production approach but requires Redis.

**Recommendation:** **Option A for Phase 1 (MVP)** — fire-and-forget `Promise.allSettled()` after job creation. Each freelancer evaluation is independent. Cap at 50 concurrent evaluations per job post. If > 50 freelancers have Cruise Mode active, batch in chunks. Add a TODO comment to migrate to BullMQ when Redis is available.

```bash
# Check if Redis or any queue library is already in the stack
grep -r "redis\|bull\|queue\|worker" package.json artifacts/api-server/package.json 2>/dev/null
```

---

### Q2 — What Does `job_requirements` Contain? Exact Column Names for Skills and Rate?

**Question:** The evaluation engine needs to read the job's skills, rate, duration, and description. What are the exact column names?

**Recommendation:**
```bash
grep -A 30 "jobRequirements\s*=" lib/db/src/schema/*.ts | head -40
```

Specifically looking for: skills (array or text?), budget/rate (min/max or single value?), duration, description, fieldOfWork.

---

### Q3 — How Should "Interest Expression" Work Mechanically?

**Question:** When Cruise Mode sends an interest message, what actually happens in the database? Options:

- **(A)** Creates a `bookings` row with `status: 'ai_initiated'` — maps to existing booking flow
- **(B)** Creates only a `cruise_mode_activity` row + a notification to the employer — no booking record
- **(C)** Creates a special `job_interests` record (new table, lighter than a booking)

**Impact:** Option A would entangle Cruise Mode with the booking system and trigger availability locks. Option B is cleanest — a Cruise Mode interest is not a booking yet. It is a signal.

**Recommendation:** Option B. A `cruise_mode_activity` row is created. The employer gets a notification with a "View freelancer profile" link. The freelancer appears in the employer's radar without a formal booking being created. The employer must still initiate a booking.

---

### Q4 — How Are Blackout Windows Evaluated Server-Side?

**Question:** The blackout window check requires knowing the freelancer's timezone and current time. What timezone library is available?

**Recommendation:**
```bash
grep -r "luxon\|dayjs\|date-fns\|moment" package.json artifacts/api-server/package.json 2>/dev/null
```

If no date library: use native `Intl.DateTimeFormat` to check if the current UTC time falls within any blackout window in the freelancer's configured timezone.

---

### Q5 — Should the Employer Know Cruise Mode Sent the Message?

**Question:** The transparency flag in `features.md` says to include a disclosure in the interest message. Is this the right UX? Options:

- **(A)** Full disclosure in the message body: "This was sent automatically by Sarah's AI assistant on TalentLock Cruise Mode"
- **(B)** Subtle metadata: employer sees a small "AI-assisted" badge on the notification, not in the message body
- **(C)** No disclosure to employer — the message reads as if Sarah sent it herself

**Impact:** Option C risks platform trust issues. Option A might deter some employers. Option B is the best balance.

**Recommendation:** Option B — a small "Cruise Mode ✦" badge on the employer's notification. The message body reads naturally (in the freelancer's voice) without a disclaimer. The badge is transparent enough for platform integrity without undermining the message.

---

### Q6 — Rate Limit on AI Evaluations Per Job Post

**Question:** If 200 freelancers have Cruise Mode active and a job is posted, 200 AI evaluations would fire. At ~500 tokens each, that is 100,000 tokens per job post. This is expensive and slow.

**Options:**
- **(A)** Cap evaluations at 50 per job post (first 50 active Cruise Mode freelancers)
- **(B)** Pre-filter using simple keyword/rate matching before calling AI — only run full AI evaluation for freelancers who pass the pre-filter
- **(C)** Batch evaluations with a 100ms delay between each

**Recommendation:** Option B is correct for production. Pre-filter eliminates obviously non-matching freelancers (wrong field, rate way outside range, excluded keywords present) without an AI call. Only remaining candidates get the full AI evaluation. This reduces AI calls by 60–80% in practice.

---

### Q7 — What Token Quota Applies to Freelancer Pro?

**Question:** `freelancer_pro` plan has `monthlyTokenLimit: null` (no quota). Cruise Mode evaluations could consume significant tokens. Does the 10 messages/month limit (from `features.md`) need to be enforced at the DB level or just counted in `cruise_mode_configs`?

**Recommendation:** Track `messagesThisMonth` and `messagesResetAt` on `cruise_mode_configs`. Check before each send. No separate quota table needed — the config row tracks usage.

---

### Q8 — What Happens If the Freelancer Deletes Their Cruise Mode Config?

**Question:** The activity log references the rule version that was active. If the config is deleted, the history becomes orphaned.

**Recommendation:** Never hard-delete cruise mode configs. `deactivate` sets `isActive: false`. A separate `deletedAt` soft-delete column can be added, but activity log rows always retain their snapshot of `rulesVersion` and the full `proposedMessage` — no foreign key dependency needed for the historical record.

---

## ⚠️ Risks & Notes

### Risk 1 — Fire-and-Forget at Scale

If 500 freelancers have Cruise Mode active, a single job post triggers 500 async tasks. With pre-filtering (Q6 Option B) this becomes ~50–100 AI calls. The fire-and-forget chain must use `Promise.allSettled()` — a single evaluation failure must never cancel others.

```ts
// In job creation handler — after db.insert:
evaluateCruiseModeForJob(newJob.id).catch(err =>
  req.log.warn({ err, jobId: newJob.id }, 'cruise mode evaluation failed')
);
// Route returns immediately — evaluation runs in background
```

### Risk 2 — Sending Messages to Employers Without Explicit Freelancer Action

This is the highest-trust ask in TalentLock's entire feature set. The freelancer is explicitly authorising the AI to act on their behalf. The consent model must be crystal clear:
- The freelancer reads and confirms their rules
- The freelancer explicitly activates Cruise Mode with a clear "I authorise TalentLock AI to send interest messages on my behalf" confirmation
- Every sent message is immediately visible in the activity feed
- The freelancer can pause at any time
- The first time Cruise Mode sends a message, an email is sent to the freelancer confirming what was sent

### Risk 3 — Duplicate Interest Messages

If a freelancer has Cruise Mode active and manually sends an interest too, the employer gets two messages from the same freelancer. The evaluation engine must check whether the freelancer has already interacted with a job (via existing bookings or prior activity records) before sending.

### Risk 4 — AI Hallucinating Job Fit

The AI may score a job 80/100 and send a message for a job that is clearly not a match to a human reader. The transparent activity feed and the explanation ("why it sent") allows the freelancer to calibrate their threshold. The pre-filter (Q6) is the primary safeguard.

### Risk 5 — Token Cost for `freelancer_pro` Platform

Each full evaluation costs ~500 tokens. At 10 sends/month and 4× the evaluations needed to produce those 10 sends, each active `freelancer_pro` user costs ~20,000 tokens/month in Cruise Mode alone. At scale (1,000 pro users) this is 20M tokens/month. Must be monitored via the admin token-usage dashboard.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Background job mechanism | Task 2.1 (evaluation engine) |
| Q2 | `job_requirements` exact column names | Task 2.1 (pre-filter and AI prompt) |
| Q3 | Interest expression mechanics | Task 2.2 (what to write to DB) |
| Q4 | Timezone library available | Task 2.1 (blackout window check) |

# TalentLock — Implementation Plan: Employer Analytics Dashboard

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Run all of these before writing any code. Report every finding.

```bash
# 1. Confirm booking status strings
grep -r "'completed'\|'cancelled'\|'active'\|'in_progress'\|status" \
  artifacts/api-server/src/routes/bookings.ts | head -30

# 2. Check job_requirements for createdAt and skills columns
grep -A 40 "jobRequirements\s*=" lib/db/src/schema/*.ts

# 3. Check agreements for bookingId foreign key
grep -A 40 "agreements\s*=" lib/db/src/schema/*.ts

# 4. Check how "fully signed" is captured on agreements
grep -n "fully_signed\|fullySignedAt\|both.*sign\|status.*sign" \
  artifacts/api-server/src/routes/agreements.ts | head -20

# 5. Check normaliseSkills exists
grep "normaliseSkills" artifacts/api-server/src/lib/skillsUtils.ts

# 6. Check earningsUtils exists and what it exports
cat artifacts/api-server/src/lib/earningsUtils.ts 2>/dev/null | head -20

# 7. Reuse prior inspection answers for fieldOfWork and active booking status
# (from Earnings Intelligence and Spend Analytics plan.md notes)
```

Document all findings in a comment block at top of the new route file.

---

## Resolved Questions

---

### Q1 — Booking Status Values

**Decision: Inspect first. Define constants at top of route file.**

```ts
// Confirmed from codebase inspection (Task 1.1)
const BOOKING_COMPLETED_STATUS   = '/* confirmed */';
const BOOKING_CANCELLED_STATUS   = '/* confirmed */';
const BOOKING_IN_PROGRESS_STATUS = '/* confirmed — active or in_progress */';
```

The "other" bucket in outcomes = any status not matching the above three.

---

### Q2 — `job_requirements.createdAt`

**Decision: Inspect first. Adapt funnel query based on result.**

**If `createdAt` EXISTS:**
```ts
// Time-window the funnel — count jobs created within the window
.where(and(
  eq(jobRequirements.employerId, internalUserId),
  gte(jobRequirements.createdAt, windowStart)
))
```

**If `createdAt` DOES NOT EXIST:**
- Jobs Posted count shows all-time total (no time window)
- A note is added to the response: `funnelNote: 'jobsPosted count is all-time — no timestamp on job requirements'`
- Frontend renders this note below the funnel module
- Do NOT block implementation — adapt gracefully

---

### Q3 — Booking-to-Agreement Link

**Decision: Inspect first. Use direct bookingId if it exists; approximate if not.**

**If `agreements.bookingId` EXISTS (direct FK):**
```ts
// Clean join
.innerJoin(agreements, eq(agreements.bookingId, bookings.id))
```

**If NO direct link:**
The lifecycle "booking to signed" duration cannot be reliably computed. Return:
```ts
bookingToSigned: null,
trends: { bookingToSigned: null }
```

Frontend renders "Data not available" for this specific metric only. Other lifecycle metrics still show. Document in a comment why this is null.

---

### Q4 — Fully-Signed Timestamp

**Decision: Inspect first. Use the correct signal.**

Priority order after inspection:
1. If `agreements.fullySignedAt` column exists → use it directly
2. If `agreements.status = 'fully_signed'` + `updatedAt` → use `updatedAt` when status changed to `fully_signed`
3. If only signature image URLs → use `GREATEST(freelancerSignedAt, employerSignedAt)` — the later of the two

Define a constant:
```ts
// Confirmed fully-signed timestamp approach (Task 1.1):
// APPROACH: [document what was found]
```

---

### Q5 — `job_requirements` Skills Column

**Decision: Inspect first. Fall back gracefully if missing.**

**If skills column EXISTS:**
- Use `normaliseSkills(jobReq.skills)` to extract skill tags per job requirement
- Count frequency across all job requirements in the window

**If NO skills column:**
- `skillsGap.demand` returns empty array
- `skillsGap.gaps` returns empty array
- `skillsGap.supply` still returns top skills from booked freelancers
- Frontend renders "Skills Hired" (supply only) with a note: "Job skills data not available"

---

### Q6 — Skills Gap Definition

**Decision: Option C — top 5 skills from demand with zero or low supply.**

```ts
// A skill is a "gap" if:
// - It appears in demand (job requirements)
// - Its supply count < 30% of its demand count
// Return top 5 gaps ordered by demand count descending

const gaps = demand
  .filter(d => {
    const s = supply.find(s => s.skill === d.skill);
    return !s || (s.count / d.count) < 0.3;
  })
  .slice(0, 5)
  .map(d => d.skill);
```

---

### Q7 — Retention Window

**Decision: Option A — all-time.**

```ts
// Count all completed bookings, regardless of date
// Group by freelancerId to identify repeats
const bookingsByFreelancer = await db
  .select({ freelancerId: bookings.freelancerId, count: count() })
  .from(bookings)
  .where(and(
    eq(bookings.employerId, internalUserId),
    eq(bookings.status, BOOKING_COMPLETED_STATUS)
  ))
  .groupBy(bookings.freelancerId);

const repeatCount = bookingsByFreelancer.filter(b => Number(b.count) > 1).length;
const totalFreelancers = bookingsByFreelancer.length;
const repeatRate = totalFreelancers > 0
  ? Math.round((repeatCount / totalFreelancers) * 100)
  : 0;
```

---

### Q8 — Previous Period for Lifecycle Trends

**Decision: Same-length window immediately preceding the selected window.**

```ts
function getWindowDates(window: '30d' | '90d' | '12m') {
  const now = new Date();
  const days = window === '30d' ? 30 : window === '90d' ? 90 : 365;
  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);
  return { currentStart, previousStart, currentEnd: now, previousEnd: currentStart };
}
```

Trend logic:
```ts
function getTrend(
  current: number | null,
  previous: number | null
): 'faster' | 'slower' | 'same' | null {
  if (current === null || previous === null || previous === 0) return null;
  const diff = ((current - previous) / previous) * 100;
  if (diff > 5) return 'slower';   // more days = slower
  if (diff < -5) return 'faster';  // fewer days = faster
  return 'same';
}
```

---

### Q9 — Shared Time Window

**Decision: One dropdown controls both funnel and lifecycle.**

The frontend sends a single `?window=90d` query param. The endpoint applies it to both the funnel and lifecycle modules. The `window` value is echoed back in the response so the frontend knows what was applied.

---

## Resolved Risks

---

### Risk 1 — Missing Booking-Agreement Link

**Resolution: Covered in Q3. Return `null` for `bookingToSigned` duration. Frontend renders "Data not available" for that specific metric only.**

---

### Risk 2 — Missing Skills Column on `job_requirements`

**Resolution: Covered in Q5. Return empty `demand` and `gaps` arrays. Frontend renders supply-only view with a note.**

---

### Risk 3 — Insufficient Data for Lifecycle Averages

**Resolution: Return `null` per metric when fewer than 3 data points exist.**

```ts
function safeAverage(values: number[]): number | null {
  if (values.length < 3) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
```

---

### Risk 4 — `normaliseSkills()` Import

**Resolution: Confirm file path before import.**

```bash
grep "export.*normaliseSkills" artifacts/api-server/src/lib/skillsUtils.ts
```

If the function exists, import it:
```ts
import { normaliseSkills } from '../lib/skillsUtils';
```

If not found, define inline in the route file and add a TODO to extract to skillsUtils.

---

### Risk 5 — Codegen Export Rules

**Resolution: Same mandatory post-codegen checks as all previous features.**

After `pnpm --filter @workspace/api-spec run codegen`:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 2

---

## Window Helper Utility

Add to `earningsUtils.ts` (or inline if that file does not yet exist):

```ts
export type AnalyticsWindow = '30d' | '90d' | '12m';

export function getWindowDates(window: AnalyticsWindow) {
  const now = new Date();
  const days = window === '30d' ? 30 : window === '90d' ? 90 : 365;
  const msPerDay = 24 * 60 * 60 * 1000;
  const currentStart  = new Date(now.getTime() - days * msPerDay);
  const previousStart = new Date(currentStart.getTime() - days * msPerDay);
  return {
    currentStart,
    currentEnd: now,
    previousStart,
    previousEnd: currentStart,
  };
}
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/employer-analytics-dashboard/features.md` read
- [ ] `specs/employer-analytics-dashboard/clarify.md` read
- [ ] This `plan.md` read — all 9 questions and 5 risks resolved
- [ ] `specs/employer-analytics-dashboard/task.md` read — phase order understood
- [ ] `specs/employer-analytics-dashboard/UI.md` read — all widget states understood
- [ ] Codebase inspection complete — Q1–Q5 confirmed from actual files
- [ ] `normaliseSkills()` confirmed available
- [ ] `earningsUtils.ts` confirmed available (or will be created)

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Backend — endpoint + window utility + OpenAPI + codegen | ⬜ Not started |
| Phase 2 | Frontend — widgets, charts, dashboard integration | ⬜ Not started |

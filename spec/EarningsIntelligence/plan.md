# TalentLock — Implementation Plan: Earnings Intelligence

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Run these before writing any code and report findings:

```bash
# 1. Check bookings schema — columns and types
grep -A 50 "bookings\s*=" lib/db/src/schema/*.ts

# 2. Check milestone storage — separate table or JSONB on bookings?
grep -r "milestone\|Milestone" lib/db/src/schema/*.ts | head -20

# 3. Check freelancer_profiles for fieldOfWork and skills columns
grep -A 50 "freelancerProfiles\s*=" lib/db/src/schema/*.ts

# 4. Check actual booking status strings used in codebase
grep -r "'active'\|'completed'\|'in_progress'\|'ongoing'\|status" \
  artifacts/api-server/src/routes/bookings.ts | head -20

# 5. Check job_requirements for skills/requiredSkills column
grep -A 30 "jobRequirements\s*=" lib/db/src/schema/*.ts | grep -i "skill\|require"

# 6. Check if dashboard/stats route exists and what it returns
cat artifacts/api-server/src/routes/dashboard.ts
```

Report all findings. Document the exact column names found — use them throughout, never assume.

---

## Resolved Questions

---

### Q1 — Bookings Column Names

**Decision: Inspect first. Use exact column names found.**

After inspection, document:
- The column name for the freelancer reference (`freelancerId` or similar)
- The column name for booking status
- Whether `jobRequirementId` exists as a direct column

Add a comment block at the top of the earnings intelligence route file:

```ts
// Confirmed column names from schema inspection (task.md Task 1.1):
// bookings.freelancerId = [confirmed name]
// bookings.status = [confirmed name]
// bookings.jobRequirementId = [confirmed name]
```

---

### Q2 — Milestone Storage Structure

**Decision: Inspect first. Adapt queries to the actual structure.**

**If milestones are a SEPARATE TABLE (`milestones`):**

```ts
// Standard Drizzle join
const earnings = await db
  .select({ month: sql`...`, total: sum(milestones.amount) })
  .from(milestones)
  .innerJoin(bookings, eq(milestones.bookingId, bookings.id))
  .where(and(
    eq(bookings.freelancerId, freelancerId),
    eq(milestones.status, MILESTONE_APPROVED_STATUS)
  ))
  .groupBy(sql`date_trunc('month', milestones.created_at)`);
```

**If milestones are JSONB on `bookings`:**

```ts
// Postgres JSON aggregation
const earnings = await db.execute(sql`
  SELECT
    date_trunc('month', b.created_at) as month,
    SUM((m->>'amount')::numeric) as total
  FROM bookings b,
    jsonb_array_elements(b.milestones) as m
  WHERE b.freelancer_id = ${freelancerId}
    AND m->>'status' = ${MILESTONE_APPROVED_STATUS}
  GROUP BY 1
  ORDER BY 1
`);
```

The agent must inspect and use the correct pattern. Document which pattern was used in a comment.

---

### Q3 — `fieldOfWork` Column Name

**Decision: Inspect first. Use the actual column name found.**

Likely candidates: `fieldOfWork`, `field_of_work`, `field`, `category`, `specialty`.

After inspection, store as a constant:
```ts
// In the route file, after inspection
const FIELD_COLUMN = freelancerProfiles.fieldOfWork; // use actual column
```

---

### Q4 — Active Booking Status Values

**Decision: Inspect first. Define constants.**

After inspection, create status constants at the top of the route file:

```ts
// Confirmed from schema inspection
const BOOKING_ACTIVE_STATUSES = ['active']; // update with actual values
const BOOKING_COMPLETED_STATUS = 'completed'; // update with actual value
const MILESTONE_APPROVED_STATUS = 'approved'; // update with actual value
const MILESTONE_PENDING_STATUS = 'pending';   // update with actual value
```

Use these constants throughout — never hardcode status strings inline.

---

### Q5 — Milestone Status Values

**Decision: Inspect alongside Q2. Use the actual string values found.**

Covered in Q4 constants above.

---

### Q6 — Separate Endpoint vs Extending Stats

**Decision: Option B — separate endpoint `GET /api/dashboard/earnings-intelligence`.**

Reasons:
- The earnings intelligence queries are complex aggregations — keeping them separate avoids making `GET /api/dashboard/stats` slow for all users
- The frontend can fetch earnings intelligence lazily (only when the section is visible)
- Existing stats endpoint consumers are unaffected

---

### Q7 — Skills Storage Format

**Decision: Inspect first. Use `normaliseSkills()` from smarter-matching feature.**

The `normaliseSkills()` utility already exists in `artifacts/api-server/src/lib/skillsUtils.ts` (created in the smarter-matching feature). Use it to parse skills regardless of storage format (array, JSON string, or CSV).

For top skills attribution:
```ts
const freelancerSkills = normaliseSkills(freelancerProfile.skills);
```

---

### Q8 — `job_requirements` Skills Column

**Decision: Inspect first. Use attribution method based on what exists.**

**If `job_requirements` has a skills column:**
- Match freelancer skills against job requirement skills
- Attribute milestone earnings to skills that appear in both sets
- Split earnings equally among matched skills

**If `job_requirements` has NO skills column:**
- Fall back to booking count per skill
- Display as "N bookings" instead of "$X earned"
- Frontend displays whichever attribution method was used

---

### Q9 — Caching

**Decision: Option A — compute fresh on every request.**

No caching infrastructure in the current stack. For performance, ensure these indexes exist:

```sql
-- Add if not already present
CREATE INDEX IF NOT EXISTS idx_bookings_freelancer_id ON bookings(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
```

Or add via Drizzle in the schema file:

```ts
// In the bookings table definition
}, (t) => ({
  freelancerIdx: index('idx_bookings_freelancer_id').on(t.freelancerId),
  statusIdx: index('idx_bookings_status').on(t.status),
}));
```

Add only if indexes do not already exist — check first.

---

## Resolved Risks

---

### Risk 1 — Milestone Structure Unknown

**Resolution: Covered by Q2 — inspect first, adapt queries. Two code paths documented. Use the correct one.**

---

### Risk 2 — Platform Average With Small Sample

**Resolution: Minimum 5 freelancers with data required to show platform average line.**

```ts
// In the trend query
const platformFreelancerCount = platformEarnings.filter(e => e.total > 0).length;
if (platformFreelancerCount < 5) {
  // Return empty array for platformAverage — frontend shows single-line chart
  trendData.platformAverage = new Array(6).fill(null);
}
```

Frontend: when `platformAverage` contains all nulls, render single freelancer line with a note: `"Platform average not available — insufficient data in your field"`.

---

### Risk 3 — Rate Benchmarking Null Case

**Resolution: Already in features.md. `rateBenchmark` returns `null` when < 3 freelancers in field. Frontend shows "Not enough data yet" card.**

```ts
const fieldFreelancers = await getFreelancersInField(db, fieldOfWork);
if (fieldFreelancers.length < 3) {
  return { rateBenchmark: null };
}
```

---

### Risk 4 — Zero-Earnings Months Must Show $0

**Resolution: Generate a complete 6-month date series, then left-join earnings data.**

```ts
// Generate last 6 months as a series
function getLast6Months(): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7); // "2025-01"
  });
}

// Fill zeros for months with no data
const monthSeries = getLast6Months();
const earningsMap = new Map(dbRows.map(r => [r.month, r.total]));
const freelancerEarnings = monthSeries.map(m => earningsMap.get(m) ?? 0);
```

---

### Risk 5 — Codegen Export Rules

**Resolution: Same mandatory post-codegen checks as all features.**

After `pnpm --filter @workspace/api-spec run codegen`:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 2

---

## Month Label Helper

```ts
// artifacts/api-server/src/lib/earningsUtils.ts
export function getMonthLabel(isoMonth: string): string {
  const [year, month] = isoMonth.split('-');
  return new Date(parseInt(year), parseInt(month) - 1, 1)
    .toLocaleString('en', { month: 'short' });
  // "2025-01" → "Jan"
}

export function getLast6Months(): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1); // first of month
    d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
}

export function formatCurrency(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toLocaleString()}`;
}
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/earnings-intelligence/features.md` read
- [ ] `specs/earnings-intelligence/clarify.md` read
- [ ] This `plan.md` read — all 9 questions and 5 risks resolved
- [ ] `specs/earnings-intelligence/task.md` read — phase order understood
- [ ] `specs/earnings-intelligence/UI.md` read — all widget states understood
- [ ] Codebase inspection complete — Q1–Q5, Q7–Q8 confirmed from actual schema files
- [ ] Milestone storage structure (Q2) confirmed — correct query pattern selected

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Backend — endpoint + utility + OpenAPI + codegen | ✅ Complete |
| Phase 2 | Frontend — widgets, chart, integration into dashboard | ✅ Complete |

# TalentLock — Task Breakdown: Earnings Intelligence

## Summary

Add an Earnings Intelligence panel to the freelancer dashboard. Two phases: Backend (endpoint + queries + codegen) → Frontend (widgets + chart integration). No schema migration — uses only existing tables.

---

## Phase 1 — Backend

### Task 1.1 — Codebase Inspection

Before writing any code, run all inspection commands from `plan.md`. Document:
- Exact column names for bookings (freelancerId, status, jobRequirementId)
- Milestone storage: separate table or JSONB — **this determines all query patterns**
- `fieldOfWork` exact column name on `freelancer_profiles`
- Actual status string values for active bookings and approved/pending milestones
- Whether skills column exists on `job_requirements`
- Whether indexes on `bookings.freelancerId` and `bookings.status` already exist

Add a comment block at top of the new route file documenting all confirmed values.

### Task 1.2 — Create `earningsUtils.ts`

**File:** `artifacts/api-server/src/lib/earningsUtils.ts` (create new)

Implement the three utility functions from `plan.md`:
- `getLast6Months(): string[]`
- `getMonthLabel(isoMonth: string): string`
- `formatCurrency(amount: number): string`

Also add:
```ts
export function fillZeroMonths(
  months: string[],
  earningsRows: { month: string; total: number }[]
): number[] {
  const map = new Map(earningsRows.map(r => [r.month, Number(r.total)]));
  return months.map(m => map.get(m) ?? 0);
}
```

### Task 1.3 — Create Earnings Intelligence Endpoint

**File:** `artifacts/api-server/src/routes/dashboard.ts` (modify existing)
OR create `artifacts/api-server/src/routes/earningsIntelligence.ts` (new file if cleaner)

Add `GET /api/dashboard/earnings-intelligence`

**Guard:** Require Clerk auth + `userRole === 'freelancer'` → 403 for employers

**Use status constants from plan.md Q4** — define at top of file after inspection.

#### Query A — Summary Stats

```ts
// This month and last month: sum of approved milestone amounts
const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

// Adapt query based on milestone storage structure (plan.md Q2)
// If separate table: JOIN milestones ON milestones.bookingId = bookings.id
// If JSONB: use jsonb_array_elements as shown in plan.md
```

Return `{ thisMonth, lastMonth, allTime, monthOverMonthChange }`.

`monthOverMonthChange` = `((thisMonth - lastMonth) / lastMonth) * 100` — null when `lastMonth === 0`.

#### Query B — Earnings Trend (6 months)

Use `getLast6Months()` to generate the month series.

Run two sub-queries:
1. Freelancer's own monthly earnings (approved milestones, grouped by month)
2. Platform average for freelancers in same `fieldOfWork` (approved milestones per freelancer per month, then average)

Apply `fillZeroMonths()` to both results.

Apply the minimum 5 freelancer check from `plan.md` Risk 2:
```ts
if (platformDataPoints < 5) {
  platformAverage = new Array(6).fill(null);
}
```

Return `{ months: string[], freelancerEarnings: number[], platformAverage: (number|null)[] }`.

#### Query C — Rate Benchmarking

```ts
// Get all freelancers in same fieldOfWork with at least 1 completed booking
const fieldFreelancers = await db
  .select({ rate: freelancerProfiles.rate })
  .from(freelancerProfiles)
  .innerJoin(bookings, eq(bookings.freelancerId, freelancerProfiles.id))
  .where(and(
    eq(freelancerProfiles.fieldOfWork, myFieldOfWork), // use actual column name
    eq(bookings.status, BOOKING_COMPLETED_STATUS)
  ))
  .groupBy(freelancerProfiles.id, freelancerProfiles.rate);

if (fieldFreelancers.length < 3) return null; // plan.md Risk 3

const rates = fieldFreelancers.map(f => Number(f.rate)).sort((a, b) => a - b);
const myRate = Number(myProfile.rate);
const below = rates.filter(r => r < myRate).length;
const percentile = Math.round((below / rates.length) * 100);
const median = rates[Math.floor(rates.length / 2)];

return {
  myRate,
  fieldOfWork: myFieldOfWork,
  percentile,
  fieldMin: rates[0],
  fieldMedian: median,
  fieldMax: rates[rates.length - 1],
  freelancerCount: rates.length
};
```

#### Query D — Projection

Sum milestone `amount` values where:
- Booking belongs to current freelancer
- Booking status is active (use `BOOKING_ACTIVE_STATUSES` constant)
- Milestone status is pending (use `MILESTONE_PENDING_STATUS`)
- Milestone `dueDate` falls within the current calendar month

Adapt query to milestone storage structure.

Return `{ projectedAmount, milestoneCount, currency: 'USD' }`.

#### Query E — Top Skills

```ts
// Use normaliseSkills() from lib/skillsUtils.ts
const mySkills = normaliseSkills(myProfile.skills);

// If job_requirements has skills column: match and attribute
// If not: use booking count per skill as fallback (see plan.md Q8)
```

For each skill, calculate total approved milestone earnings from bookings where the linked job requirement mentions that skill. Return top 5 by total earned.

### Task 1.4 — Register Route

**File:** `artifacts/api-server/src/index.ts`

Register the new endpoint (or confirm dashboard router already registered if added to existing file).

### Task 1.5 — OpenAPI Spec + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add `GET /api/dashboard/earnings-intelligence` with full response schema matching the shape in `features.md`.

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 2

---

## Phase 2 — Frontend

### Task 2.1 — Verify Generated Hook

```bash
grep -r "useGetDashboardEarningsIntelligence" lib/api-client-react/src/
```

If missing, re-run codegen before continuing.

### Task 2.2 — Create `<EarningsSummaryCards />`

**File:** `artifacts/talentlock/src/components/earnings/EarningsSummaryCards.tsx` (create new)

Three stat cards in a row. See `UI.md` Component 1.

Props:
```ts
interface EarningsSummaryCardsProps {
  thisMonth: number;
  lastMonth: number;
  allTime: number;
  monthOverMonthChange: number | null;
}
```

### Task 2.3 — Create `<EarningsTrendChart />`

**File:** `artifacts/talentlock/src/components/earnings/EarningsTrendChart.tsx` (create new)

recharts `LineChart` with two lines (freelancer + platform average). See `UI.md` Component 2.

Props:
```ts
interface EarningsTrendChartProps {
  months: string[];
  freelancerEarnings: number[];
  platformAverage: (number | null)[];
  fieldOfWork: string;
}
```

### Task 2.4 — Create `<RateBenchmarkCard />`

**File:** `artifacts/talentlock/src/components/earnings/RateBenchmarkCard.tsx` (create new)

Percentile display with field range. See `UI.md` Component 3.

Props:
```ts
interface RateBenchmarkCardProps {
  data: {
    myRate: number;
    fieldOfWork: string;
    percentile: number;
    fieldMin: number;
    fieldMedian: number;
    fieldMax: number;
    freelancerCount: number;
  } | null;
}
```

### Task 2.5 — Create `<ProjectionCard />`

**File:** `artifacts/talentlock/src/components/earnings/ProjectionCard.tsx` (create new)

Projected earnings for current month. See `UI.md` Component 4.

Props:
```ts
interface ProjectionCardProps {
  projectedAmount: number;
  milestoneCount: number;
}
```

### Task 2.6 — Create `<TopSkillsCard />`

**File:** `artifacts/talentlock/src/components/earnings/TopSkillsCard.tsx` (create new)

Ranked list of up to 5 skills. See `UI.md` Component 5.

Props:
```ts
interface TopSkillsCardProps {
  skills: { skill: string; totalEarned: number; bookingCount: number }[];
}
```

### Task 2.7 — Create `<EarningsIntelligencePanel />`

**File:** `artifacts/talentlock/src/components/earnings/EarningsIntelligencePanel.tsx` (create new)

Orchestrator component. Calls `useGetDashboardEarningsIntelligence()` and renders all sub-components with shared loading/error/empty states.

See `UI.md` Component 6 for full spec.

### Task 2.8 — Integrate Into `/dashboard`

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`

Add `<EarningsIntelligencePanel />` below the existing stats grid and bar chart.

Render only when `userRole === 'freelancer'`:

```tsx
{userRole === 'freelancer' && (
  <EarningsIntelligencePanel />
)}
```

---

## Acceptance Criteria

- [x] Codebase inspection complete — all column names and status values documented
- [x] `earningsUtils.ts` created with `getLast6Months`, `getMonthLabel`, `formatCurrency`, `fillZeroMonths`
- [x] `GET /api/dashboard/earnings-intelligence` returns `403` for employers
- [x] Summary stats return correct `thisMonth`, `lastMonth`, `allTime` values
- [x] `monthOverMonthChange` is `null` when `lastMonth === 0`
- [x] Trend data covers exactly 6 months
- [x] Zero-earnings months appear as `0` not missing
- [x] Platform average is `null` when fewer than 5 freelancers have data
- [x] Rate benchmarking returns `null` when fewer than 3 freelancers in field
- [x] Projection only includes pending milestones due this calendar month
- [x] Top skills returns up to 5 items, sorted by total earned descending
- [x] All codegen hooks confirmed
- [x] `<EarningsIntelligencePanel />` renders all 5 sub-components
- [x] Panel visible on dashboard for freelancer role only
- [x] All empty states render correctly when data is zero/null
- [x] Trend chart renders with recharts, formatted Y-axis (`$k` abbreviation)
- [x] Rate benchmarking `null` state shows "Not enough data" card
- [x] Platform average `null` shows single line + disclaimer note
- [x] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 → 1.4 → 1.5 (codegen + typecheck)
Task 2.1 (after 1.5 confirmed) → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8
```

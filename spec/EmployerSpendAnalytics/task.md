# TalentLock — Task Breakdown: Employer Spend Analytics

## Summary

Add an Employer Spend Analytics panel to the employer dashboard. Two phases: Backend (endpoint + codegen) → Frontend (widgets + chart integration). No schema migration. Reuses utilities from Earnings Intelligence where available.

---

## Phase 1 — Backend

### Task 1.1 — Codebase Inspection

Before writing any code, run all inspection commands from `plan.md`. Document:
- Exact `employerId` column name on `bookings`
- `proposedRate` behaviour when `negotiationStatus = 'agreed'` — confirm it holds the final rate
- Milestone storage structure — separate table or JSONB (reuse Earnings Intelligence answer if available)
- `fieldOfWork` exact column name on `freelancer_profiles`
- Freelancer display name field (for Top Freelancers list)
- Whether `earningsUtils.ts` already exists
- Whether existing `GET /api/dashboard/stats` overlaps with spend trend data

Add a comment block at the top of the route file documenting all confirmed column names and constants.

### Task 1.2 — Ensure `earningsUtils.ts` Exists

**File:** `artifacts/api-server/src/lib/earningsUtils.ts`

Check:
```bash
ls artifacts/api-server/src/lib/earningsUtils.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

If EXISTS — confirm it exports `getLast6Months`, `fillZeroMonths`, `formatCurrency`. Import from it in the spend analytics route.

If MISSING — create it with these three functions (same spec as in Earnings Intelligence plan.md). This file will be shared by both features.

### Task 1.3 — Create Spend Analytics Endpoint

**File:** `artifacts/api-server/src/routes/dashboard.ts` (modify existing) OR `artifacts/api-server/src/routes/spendAnalytics.ts` (new file — use whichever keeps the codebase consistent)

Add `GET /api/dashboard/spend-analytics`

**Guard:** Require Clerk auth + `userRole === 'employer'` → 403 for freelancers

**Define status constants** at top of file (or import from earningsUtils if already defined):
```ts
const BOOKING_ACTIVE_STATUSES = [/* confirmed values */];
const BOOKING_COMPLETED_STATUS = '/* confirmed value */';
const MILESTONE_APPROVED_STATUS = '/* confirmed value */';
const MILESTONE_PENDING_STATUS = '/* confirmed value */';
```

#### Query A — Summary Stats

Sum approved milestone amounts for: this month, last month, all time.

Use date boundaries:
```ts
const now = new Date();
const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
```

Adapt query to milestone storage structure (plan.md Q3).

`monthOverMonthChange`:
- `((thisMonth - lastMonth) / lastMonth) * 100`
- Return `null` when `lastMonth === 0` — no division by zero

#### Query B — Spend Trend (6 months)

```ts
const months = getLast6Months();
// Query: sum approved milestones per month for this employer
// GROUP BY date_trunc('month', ...)
// Adapt to milestone storage structure
const spendRows = await getMonthlySpend(db, internalUserId);
const spend = fillZeroMonths(months, spendRows);
```

Return `{ months: monthLabels, spend }` where `monthLabels` maps ISO months to abbreviations using `getMonthLabel()`.

#### Query C — Spend by Field

```ts
// Join bookings → freelancer_profiles → fieldOfWork
// Sum approved milestone amounts per field
// Order by total spend DESC, limit 6
// Calculate percentageOfTotal = (fieldTotal / grandTotal) * 100
```

Return up to 6 fields. If only one field, return it with `percentageOfTotal = 100`.

#### Query D — Top Freelancers by Spend

```ts
// Join bookings → freelancer_profiles → users
// Sum approved milestone amounts per freelancerId
// Also: countDistinct(bookings.id) for booking count
// Also: join reviews where reviews.employerId = internalUserId AND reviews.freelancerId = freelancerId
//        → avg(reviews.rating) as averageRatingGiven
// Order by totalPaid DESC, limit 5
```

Resolve display name using confirmed field from inspection (Task 1.1).

#### Query E — Committed Spend

```ts
// Sum pending milestone amounts due this calendar month
// Where: booking.employerId = internalUserId
//        AND booking.status IN BOOKING_ACTIVE_STATUSES
//        AND milestone.status = MILESTONE_PENDING_STATUS
//        AND milestone.dueDate >= thisMonthStart
//        AND milestone.dueDate <= thisMonthEnd
```

Return `{ committedAmount, milestoneCount }`.

#### Query F — Rate Benchmark

For each field the employer has hired from (from Query C):

```ts
const fields = spendByField.map(f => f.field);
const benchmarks = await Promise.all(fields.map(async (field) => {
  const marketMedian = await getMarketRate(db, field); // from plan.md
  if (!marketMedian) return null;

  const avgPaid = /* weighted average of COALESCE(proposedRate, freelancerProfile.rate)
                    for bookings in this field where negotiationStatus = 'agreed' */;

  const differencePercent = ((avgPaid - marketMedian) / marketMedian) * 100;

  return { field, avgPaid, marketMedian, differencePercent: Math.round(differencePercent) };
}));

const validBenchmarks = benchmarks.filter(Boolean);
if (validBenchmarks.length === 0) return null;

const overallAvgPaid = /* weighted average across all fields */;
const overallMarketMedian = /* weighted average of market medians */;

return {
  averageRatePaid: overallAvgPaid,
  marketMedian: overallMarketMedian,
  fields: validBenchmarks
};
```

Return `null` when no valid benchmarks (all fields have < 3 market data points).

### Task 1.4 — Register Route

**File:** `artifacts/api-server/src/index.ts`

Register the spend analytics router if added as a new file.

### Task 1.5 — OpenAPI Spec + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add `GET /api/dashboard/spend-analytics` with full response schema matching `features.md`.

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
grep -r "useGetDashboardSpendAnalytics" lib/api-client-react/src/
```

If missing, re-run codegen before continuing.

### Task 2.2 — Create `<SpendSummaryCards />`

**File:** `artifacts/talentlock/src/components/spend/SpendSummaryCards.tsx` (create new)

Three stat cards in a row — same layout pattern as `<EarningsSummaryCards />`. See `UI.md` Component 1.

Props:
```ts
interface SpendSummaryCardsProps {
  thisMonth: number;
  lastMonth: number;
  allTime: number;
  monthOverMonthChange: number | null;
}
```

### Task 2.3 — Create `<SpendTrendChart />`

**File:** `artifacts/talentlock/src/components/spend/SpendTrendChart.tsx` (create new)

recharts `BarChart` — consistent with existing dashboard bar chart style. See `UI.md` Component 2.

Props:
```ts
interface SpendTrendChartProps {
  months: string[];
  spend: number[];
}
```

### Task 2.4 — Create `<SpendByFieldChart />`

**File:** `artifacts/talentlock/src/components/spend/SpendByFieldChart.tsx` (create new)

Horizontal bar chart showing spend by field. See `UI.md` Component 3.

Props:
```ts
interface SpendByFieldChartProps {
  data: { field: string; totalSpend: number; percentageOfTotal: number }[];
}
```

### Task 2.5 — Create `<TopFreelancersCard />`

**File:** `artifacts/talentlock/src/components/spend/TopFreelancersCard.tsx` (create new)

Ranked list of up to 5 freelancers. See `UI.md` Component 4.

Props:
```ts
interface TopFreelancersCardProps {
  freelancers: {
    freelancerId: string;
    name: string;
    fieldOfWork: string;
    totalPaid: number;
    bookingCount: number;
    averageRatingGiven: number | null;
  }[];
}
```

### Task 2.6 — Create `<CommittedSpendCard />`

**File:** `artifacts/talentlock/src/components/spend/CommittedSpendCard.tsx` (create new)

See `UI.md` Component 5.

Props:
```ts
interface CommittedSpendCardProps {
  committedAmount: number;
  milestoneCount: number;
}
```

### Task 2.7 — Create `<RateBenchmarkCard />`

**File:** `artifacts/talentlock/src/components/spend/RateBenchmarkCard.tsx` (create new)

**Note:** This is the employer version of `RateBenchmarkCard` from Earnings Intelligence. It shows what the employer pays vs what the market charges — not what a freelancer earns vs what the market pays. Different framing, similar visual. See `UI.md` Component 6.

Props:
```ts
interface RateBenchmarkCardProps {
  data: {
    averageRatePaid: number;
    marketMedian: number;
    fields: {
      field: string;
      avgPaid: number;
      marketMedian: number;
      differencePercent: number;
    }[];
  } | null;
}
```

### Task 2.8 — Create `<SpendAnalyticsPanel />`

**File:** `artifacts/talentlock/src/components/spend/SpendAnalyticsPanel.tsx` (create new)

Orchestrator component. Calls `useGetDashboardSpendAnalytics()` and renders all sub-components. See `UI.md` Component 7.

### Task 2.9 — Integrate Into `/dashboard`

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`

Add `<SpendAnalyticsPanel />` below the existing employer stats section:

```tsx
{userRole === 'employer' && (
  <SpendAnalyticsPanel />
)}
```

Freelancer dashboard is completely unchanged.

---

## Acceptance Criteria

- [ ] Codebase inspection complete — all column names and constants documented
- [ ] `earningsUtils.ts` exists with `getLast6Months`, `fillZeroMonths`, `formatCurrency`
- [ ] `GET /api/dashboard/spend-analytics` returns `403` for freelancers
- [ ] Summary stats return correct `thisMonth`, `lastMonth`, `allTime` values
- [ ] `monthOverMonthChange` is `null` when `lastMonth === 0`
- [ ] Spend trend covers exactly 6 months with no missing entries
- [ ] Zero-spend months show as `0` not missing
- [ ] Spend by field ordered by total spend descending, max 6 fields
- [ ] `percentageOfTotal` sums to approximately 100% across all fields
- [ ] Top freelancers ordered by `totalPaid` descending, max 5 items
- [ ] `averageRatingGiven` is `null` when no review submitted for that freelancer
- [ ] Committed spend filters on active bookings + pending milestones + current month only
- [ ] Rate benchmark returns `null` when all fields have < 3 market data points
- [ ] `proposedRate` null handled with COALESCE to freelancer's listed rate
- [ ] `differencePercent` positive = above market, negative = below market
- [ ] All codegen hooks confirmed
- [ ] `<SpendAnalyticsPanel />` renders all sub-components correctly
- [ ] Panel visible on dashboard for employer role only
- [ ] Freelancer dashboard unchanged
- [ ] All empty states render correctly
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 (ensure utils) → 1.3 → 1.4 → 1.5 (codegen + typecheck)
Task 2.1 (after 1.5 confirmed) → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8 → 2.9
```

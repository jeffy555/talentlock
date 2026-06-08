# TalentLock — Validation Guide: Employer Spend Analytics

> **Purpose:** Verify the Employer Spend Analytics feature is correctly implemented before it is considered complete.
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix failures before marking a phase complete.

---

## Phase 1 Validation — Backend

### V1.1 — Endpoint Exists and Is Registered

```bash
grep -r "spend-analytics" artifacts/api-server/src/routes/
grep -r "spend-analytics" artifacts/api-server/src/index.ts
```

- [ ] Route handler exists
- [ ] Route registered in `index.ts`

### V1.2 — Freelancer Blocked

```bash
curl http://localhost:8080/api/dashboard/spend-analytics \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns `HTTP 403`

### V1.3 — Unauthenticated Blocked

```bash
curl http://localhost:8080/api/dashboard/spend-analytics
```

- [ ] Returns `HTTP 401`

### V1.4 — Response Shape Correct

```bash
curl http://localhost:8080/api/dashboard/spend-analytics \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 200`
- [ ] Response has: `summary`, `trend`, `spendByField`, `topFreelancers`, `committed`, `rateBenchmark`
- [ ] `trend.months` has exactly 6 strings
- [ ] `trend.spend` has exactly 6 numbers
- [ ] `spendByField` is an array of 0–6 items
- [ ] `topFreelancers` is an array of 0–5 items

### V1.5 — Summary Stats Accuracy

Set up an employer with known milestone data:
- 2 approved milestones this month: $3,000 + $1,400 = $4,400
- 1 approved milestone last month: $2,800

```bash
curl http://localhost:8080/api/dashboard/spend-analytics \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] `summary.thisMonth` = `4400`
- [ ] `summary.lastMonth` = `2800`
- [ ] `summary.monthOverMonthChange` = `57` (approximately 57% increase)
- [ ] `summary.allTime` includes all historical approved milestones

### V1.6 — `monthOverMonthChange` Null When Last Month Is Zero

For a new employer with only this month's spend:

- [ ] `summary.lastMonth` = `0`
- [ ] `summary.monthOverMonthChange` = `null`

### V1.7 — Spend Trend Has 6 Months With No Gaps

- [ ] `trend.months` always has exactly 6 elements
- [ ] `trend.spend` always has exactly 6 elements
- [ ] Months with no spend show `0`, not `undefined` or missing

### V1.8 — Spend by Field Correct

With bookings spread across multiple freelancer fields:

- [ ] `spendByField` ordered by `totalSpend` descending
- [ ] `percentageOfTotal` values across all fields sum to approximately 100
- [ ] Maximum 6 fields returned

### V1.9 — Top Freelancers Correct

- [ ] Ordered by `totalPaid` descending
- [ ] Maximum 5 items
- [ ] `averageRatingGiven` matches the employer's actual review ratings for that freelancer
- [ ] `averageRatingGiven` is `null` when no review was submitted

### V1.10 — Committed Spend Filters Correctly

With pending milestones due:
- 2 milestones due THIS month on active bookings: $1,200 + $800
- 1 milestone due NEXT month: $2,000
- 1 milestone on a COMPLETED booking: $500

- [ ] `committed.committedAmount` = `2000` (only current month, active bookings)
- [ ] `committed.milestoneCount` = `2`

### V1.11 — Rate Benchmark Accuracy

With known test data (employer paid $88/hr for React, market median $78/hr):

- [ ] `rateBenchmark.fields[0].avgPaid` ≈ `88`
- [ ] `rateBenchmark.fields[0].marketMedian` ≈ `78`
- [ ] `rateBenchmark.fields[0].differencePercent` ≈ `13` (positive = above market)

### V1.12 — Rate Benchmark Null When Insufficient Data

When market has < 3 freelancers in employer's fields:

- [ ] `rateBenchmark` is `null`
- [ ] No error thrown

### V1.13 — `proposedRate` Null Handled Gracefully

For a booking where `proposedRate` is null:

- [ ] No error in rate calculations
- [ ] Falls back to freelancer's listed rate (`COALESCE` applied)
- [ ] If both are null: booking excluded from rate calculations

### V1.14 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 2 Validation — Frontend

### V2.1 — Panel Visible on Employer Dashboard

Log in as an employer and navigate to `/dashboard`:

- [ ] `"Spend Analytics"` heading visible below the existing dashboard content
- [ ] `<SpendAnalyticsPanel />` renders with all sub-components

### V2.2 — Panel Not Visible on Freelancer Dashboard

Log in as a freelancer:

- [ ] No `"Spend Analytics"` section
- [ ] No panel rendered at all

### V2.3 — Summary Cards

- [ ] Three cards: "This Month", "Last Month", "All Time"
- [ ] `▲` in red when spend increased month-over-month
- [ ] `▼` in emerald when spend decreased (savings)
- [ ] `"First month of spend"` when `monthOverMonthChange` is null

### V2.4 — Trend Chart

- [ ] Bar chart renders with 6 bars
- [ ] X-axis shows 6 month abbreviations
- [ ] Y-axis shows `$k` for values ≥ $1,000
- [ ] Zero-spend months render as short `$0` bars (not missing)
- [ ] Bars are indigo coloured with rounded top corners

### V2.5 — Spend by Field Chart

- [ ] Horizontal bars ordered by spend (highest first)
- [ ] Amount and percentage shown per field
- [ ] Bars proportional to percentage
- [ ] Maximum 6 fields shown

### V2.6 — Top Freelancers Card

- [ ] Up to 5 freelancers shown in spend order
- [ ] `"View Profile →"` link navigates to `/freelancers/:id`
- [ ] Star rating shown when review exists
- [ ] `"No review"` shown when no review was given

### V2.7 — Committed Spend Card

- [ ] Shows projected amount and milestone count
- [ ] `ⓘ` tooltip shows disclaimer on hover
- [ ] `"No milestones due this month."` shown when none

### V2.8 — Rate Benchmark Card

**When data available:**
- [ ] "Rate Analysis" heading
- [ ] Shows average paid, market median, difference percentage
- [ ] Per-field breakdown shows
- [ ] Above market → red `▲`
- [ ] Below market → emerald `▼`
- [ ] At market (within 5%) → slate `─`

**When null:**
- [ ] `"Not enough data yet."` shown

### V2.9 — Loading States

On slow network (throttle DevTools):

- [ ] All sub-components show skeleton placeholders
- [ ] Skeletons match the approximate size of the loaded content

### V2.10 — Error State

Break the endpoint temporarily:

- [ ] `"Could not load spend analytics."` error card shown
- [ ] `[Retry]` button re-fires the query
- [ ] Rest of dashboard (existing stats, bar chart) still renders normally

---

## Security Validation

### S1 — Employer Cannot See Another Employer's Data

```bash
curl http://localhost:8080/api/dashboard/spend-analytics \
  -H "Authorization: Bearer <employer_A_token>"
```

Inspect response:
- [ ] `summary.thisMonth` reflects only Employer A's own milestone payments
- [ ] `topFreelancers` only includes freelancers Employer A has hired
- [ ] No data from Employer B appears

### S2 — Freelancer Cannot Access

- [ ] V1.2 above — returns `403`

### S3 — Rate Benchmark Does Not Expose Individual Employer Rates

Inspect the `rateBenchmark` response:
- [ ] Only `averageRatePaid`, `marketMedian`, `differencePercent` returned per field
- [ ] No individual employer IDs or specific booking rates exposed

---

## Regression Validation

### R1 — Freelancer Earnings Intelligence Unchanged

If Earnings Intelligence is deployed, verify it still works:

```bash
curl http://localhost:8080/api/dashboard/earnings-intelligence \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns correct data
- [ ] `earningsUtils.ts` functions still work correctly (shared with spend analytics)

### R2 — Existing Dashboard Stats Unchanged

```bash
curl http://localhost:8080/api/dashboard/stats \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns correct data unchanged
- [ ] Spend analytics is additive — no interference

### R3 — Freelancer Dashboard Unchanged

Log in as freelancer, navigate to `/dashboard`:

- [ ] Existing freelancer dashboard renders correctly
- [ ] No spend analytics section visible
- [ ] No errors

### R4 — TypeCheck and Build Pass

```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero TypeScript errors
- [ ] Both builds complete without errors

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Backend | ⬜ | | |
| Phase 2 — Frontend | ⬜ | | |
| Security Checks | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

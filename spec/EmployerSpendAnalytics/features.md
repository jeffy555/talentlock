# TalentLock — Features Specification: Employer Spend Analytics

## Overview

TalentLock's employer dashboard currently shows raw booking counts and a basic spend total. Employers managing multiple freelancers across multiple projects have no visibility into their spending patterns — which freelancers are costing the most, whether their spend is trending up or down, how their current rates compare to market, or what their committed spend for the current month looks like based on active milestones. An employer who spent $18,000 in Q1 has no context for whether that was efficient, how it breaks down, or what to expect next month.

This feature adds an Employer Spend Analytics panel to the employer dashboard — the direct counterpart to the Earnings Intelligence feature built for freelancers. It surfaces five data-driven widgets over existing `bookings`, `milestones`, `freelancer_profiles`, and `job_requirements` data. No new database tables are required. No AI calls are made. Available to all employer plans.

---

## Feature Modules

### Module 1 — Spend Summary Stats

Three summary stat cards at the top of the panel:

- **This Month** — total approved milestone amounts paid out in the current calendar month by this employer
- **Last Month** — same for the previous calendar month
- **All Time** — total approved milestone amounts across all bookings ever created by this employer

Each card shows a trend indicator (▲ or ▼) comparing this month vs last month with the percentage change.

---

### Module 2 — Spend Trend (Last 6 Months)

A bar chart (consistent with the existing dashboard aesthetic) showing total spend per calendar month for the past 6 months. Each bar represents the sum of approved milestone amounts for that month across all of the employer's bookings.

- X-axis: last 6 calendar months (abbreviated)
- Y-axis: dollar amounts with `$` prefix and `k` abbreviation above $1,000
- Uses recharts `BarChart` (consistent with the existing monthly earnings bar chart already on the dashboard)
- Zero-spend months render as $0 bars, not missing bars

---

### Module 3 — Spend by Field of Work

A horizontal bar chart showing total spend broken down by the `fieldOfWork` of the freelancers hired. Helps employers understand where their budget is concentrated.

- Top 6 fields by total spend
- Each bar shows field name + total amount + percentage of total spend
- Ordered by total spend descending
- When an employer has bookings in only one field: show a single bar with a note

---

### Module 4 — Top Freelancers by Spend

A ranked list of up to 5 freelancers the employer has spent the most with, showing:

- Freelancer name and field of work
- Total amount paid (approved milestones)
- Number of completed bookings with that freelancer
- Average rating given to that freelancer (from the `reviews` table)
- Link to the freelancer's profile (`/freelancers/:id`)

---

### Module 5 — Committed Spend (Projection)

Forward-looking estimate of spend for the current calendar month based on active bookings:

- Sum of milestone `amount` values where:
  - The booking belongs to this employer
  - The booking status is active
  - The milestone status is pending (not yet approved)
  - The milestone `dueDate` falls within the current calendar month
- Displayed as: "Committed this month: $4,800"
- Clearly labelled as committed — not actual spend until milestones are approved

---

### Module 6 — Average Rate Paid vs Market

A single insight card comparing the employer's average paid rate against the market:

- **Average rate paid** — weighted average of `proposedRate` (the agreed rate) across all confirmed bookings, weighted by booking duration or milestone count
- **Market median** — median rate across all freelancers on TalentLock in the fields the employer hires from
- Insight: "You're paying 12% above market median for React developers"
- When insufficient market data (< 3 freelancers in a field): omit that field from the comparison

---

## API Endpoint

One new endpoint: `GET /api/dashboard/spend-analytics`

Returns all six modules' data in a single response. Employer-only — returns `403` for freelancers.

Response shape:
```ts
{
  summary: {
    thisMonth: number,
    lastMonth: number,
    allTime: number,
    monthOverMonthChange: number | null
  },
  trend: {
    months: string[],          // ["Jan", "Feb", ..., "Jun"]
    spend: number[]            // one value per month, always 6 items
  },
  spendByField: {
    field: string,
    totalSpend: number,
    percentageOfTotal: number
  }[],                         // up to 6 items
  topFreelancers: {
    freelancerId: string,
    name: string,
    fieldOfWork: string,
    totalPaid: number,
    bookingCount: number,
    averageRatingGiven: number | null
  }[],                         // up to 5 items
  committed: {
    committedAmount: number,
    milestoneCount: number
  },
  rateBenchmark: {
    averageRatePaid: number,
    marketMedian: number,
    fields: {
      field: string,
      avgPaid: number,
      marketMedian: number,
      differencePercent: number  // positive = above market, negative = below
    }[]
  } | null
}
```

---

## Plan Gating

Available on all employer plans. No token consumption. No plan gate.

| Plan | Available |
|---|---|
| `employer_starter` | ✅ |
| `employer_growth` | ✅ |
| `employer_enterprise` | ✅ |

Freelancer plans — not applicable. Freelancers do not see this feature.

---

## Data Requirements

Like Earnings Intelligence, this feature is most useful with 3+ months of real booking and milestone data. On a fresh account with no bookings, all values will be zero. The UI handles this gracefully with per-module empty states.

Rate benchmarking requires at least 3 freelancers per field across the platform. Below this threshold, `rateBenchmark` returns `null`.

---

## Non-Goals (Out of Scope for This Feature)

- Invoice generation or export to accounting software
- Budget setting and overspend alerts
- Per-project budget tracking (project budgets are a future feature)
- Tax calculations or VAT/GST handling
- Currency conversion (USD only)
- Spend forecasting beyond the current calendar month
- Comparison against industry benchmarks outside TalentLock
- Team/department spend breakdown (enterprise feature, future phase)
- Cost-per-hire calculation including platform fees

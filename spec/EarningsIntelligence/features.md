# TalentLock — Features Specification: Earnings Intelligence

## Overview

TalentLock's freelancer dashboard currently shows raw monthly totals — a bar chart and a few numbers. Freelancers have no visibility into whether their earnings are trending up or down, how their rate compares to similar freelancers on the platform, which of their skills generate the most booking value, or what they are likely to earn next month based on active work. A freelancer making $4,200 in June has no context for whether that is good, improving, or falling behind their own recent baseline.

This feature adds an Earnings Intelligence panel to the freelancer dashboard — a set of four data-driven widgets that turn raw booking and milestone data into actionable insight. No AI calls are made — this is pure data aggregation over existing tables (`bookings`, `milestones`, `freelancer_profiles`, `reviews`). No new database tables are required. The feature is available to all freelancer plans.

---

## Feature Modules

### Module 1 — Earnings Trend (Last 6 Months)

A line chart showing the freelancer's total confirmed earnings per calendar month for the past 6 months, compared to the platform average for freelancers in the same field of work.

- **Freelancer line** — sum of approved milestone amounts per month where `booking.freelancerId = currentUser`
- **Platform average line** — average monthly earnings across all freelancers with the same `fieldOfWork` who have at least one completed booking in the period
- Both lines plotted on the same chart using recharts
- X-axis: last 6 calendar months (abbreviated: "Jan", "Feb", etc.)
- Y-axis: dollar amounts formatted with `$` prefix and `k` abbreviation above $1,000

---

### Module 2 — Rate Benchmarking

A single insight card showing where the freelancer's hourly rate sits relative to others in their field.

- **Freelancer's rate** — `freelancer_profiles.rate` for the current user
- **Field percentile** — "Your rate ($85/hr) is in the top 30% for React developers on TalentLock"
- **Field range** — min, median, max rate for freelancers in the same `fieldOfWork` who have at least one completed booking
- Calculated server-side as a percentile rank: count of freelancers in the same field with a lower rate, divided by total freelancers in that field

---

### Module 3 — Projected Monthly Earnings

A forward-looking estimate based on active bookings and upcoming milestones.

- Sum of milestone `amount` values where:
  - The milestone's booking belongs to the current freelancer
  - The booking `status` is `active` or equivalent active state
  - The milestone `status` is `pending` (not yet completed or approved)
  - The milestone `dueDate` falls within the current calendar month
- Displayed as: "Projected this month: $3,200"
- When no upcoming milestones: "No milestones due this month"
- Clearly labelled as a projection — not a guarantee

---

### Module 4 — Top Earning Skills

A ranked list of up to 5 skills by total booking value earned.

- For each skill tag on the freelancer's profile (`freelancer_profiles.skills`):
  - Sum all approved milestone amounts from bookings where the booking's `jobRequirementId` links to a job requirement that mentions that skill
  - Or, if no job requirement link, attribute to the freelancer's skill set proportionally
- Display as a simple ranked list: rank, skill name, total earned
- Skills with zero attributed earnings are excluded
- Fallback: if no skill-level attribution is possible, show top 5 skills by booking count instead

---

### Module 5 — Earnings Summary Stats

Three summary numbers displayed as stat cards at the top of the Earnings Intelligence section:

- **This month** — total approved milestone amounts in the current calendar month
- **Last month** — total approved milestone amounts in the previous calendar month
- **All time** — total approved milestone amounts across all completed bookings

Each stat card shows a trend indicator (▲ or ▼) comparing this month vs last month, with the percentage change.

---

## API Endpoint

One new endpoint: `GET /api/dashboard/earnings-intelligence`

Returns all five modules' data in a single response. Freelancer-only — returns `403` for employers.

Response shape:
```ts
{
  summary: {
    thisMonth: number,
    lastMonth: number,
    allTime: number,
    monthOverMonthChange: number   // percentage, positive or negative
  },
  trend: {
    months: string[],              // ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    freelancerEarnings: number[],  // one value per month
    platformAverage: number[]      // one value per month
  },
  rateBenchmark: {
    myRate: number,
    fieldOfWork: string,
    percentile: number,            // 0–100
    fieldMin: number,
    fieldMedian: number,
    fieldMax: number,
    freelancerCount: number        // how many freelancers in the field
  } | null,                        // null if insufficient data (< 3 freelancers in field)
  projection: {
    projectedAmount: number,
    milestoneCount: number,
    currency: 'USD'
  },
  topSkills: {
    skill: string,
    totalEarned: number,
    bookingCount: number
  }[]                              // up to 5 items
}
```

---

## Plan Gating

Available on all freelancer plans. No token consumption. No plan gate.

| Plan | Available |
|---|---|
| `freelancer_free` | ✅ |
| `freelancer_pro` | ✅ |

Employer plans — not applicable. Employers do not see this feature.

---

## Data Requirements

This feature needs 3+ months of real booking and milestone data to be statistically useful. On a fresh install with no bookings, all values will be zero or null. The UI handles this gracefully with empty states per module.

Rate benchmarking requires at least 3 freelancers in the same `fieldOfWork` with completed bookings to compute a meaningful percentile. Below this threshold, `rateBenchmark` returns `null` and the UI shows a "Not enough data" state.

---

## Non-Goals (Out of Scope for This Feature)

- Employer-facing earnings intelligence (spend analytics are a separate feature)
- Currency conversion (USD only)
- Export to CSV or PDF
- Tax estimation or invoice generation
- Earnings forecasting beyond the current calendar month
- Historical rate comparison (how the freelancer's own rate has changed over time)
- Skill-level earnings attribution requiring ML (simple join-based attribution only)
- Comparison against freelancers on external platforms
- Earnings alerts or threshold notifications

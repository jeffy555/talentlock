# TalentLock — Features Specification: Employer Analytics Dashboard

## Overview

TalentLock's employer dashboard shows spend totals and basic booking counts. The Spend Analytics feature (already specced) addresses the financial dimension. But employers have a second equally important blind spot — their hiring efficiency. How quickly do jobs turn into bookings? How many bookings actually complete? Are they building a reliable talent pool or constantly finding new freelancers? Which skills do they keep hiring for vs which remain unfilled? How long does it take from posting a job to a signed agreement?

None of these questions are answerable from the current platform. This feature adds an Employer Analytics Dashboard panel with five hiring-pattern widgets — a hiring funnel, skills demand vs supply comparison, freelancer retention rate, booking lifecycle duration, and booking outcome breakdown. No AI calls. No new database tables. Available to all employer plans.

---

## Feature Modules

### Module 1 — Hiring Funnel

Shows how many jobs moved through each stage of the hiring pipeline over a configurable time window (default: last 90 days).

```
Jobs Posted  →  Bookings Created  →  Agreements Signed  →  Completed
     12               8                      6                  4
               67% conversion          75% to signed       67% completed
```

Each stage shows:
- Count of entities at that stage
- Conversion rate from the previous stage (percentage)

Surfaced insight: where in the funnel is the biggest drop-off? If 12 jobs were posted but only 4 completed, is the bottleneck at booking creation, agreement signing, or completion?

Time window: last 30 days / last 90 days / last 12 months (user-selectable dropdown).

---

### Module 2 — Skills Demand vs Supply

A side-by-side comparison showing:
- **Demand** — the top 8 skills extracted from the employer's `job_requirements` over the last 90 days
- **Supply** — the top 8 skills from the `freelancer_profiles` of freelancers the employer has actually booked

Surfaced insight: a skill that appears frequently in demand but rarely in supply signals a gap in the employer's hiring strategy — they are posting for it but not successfully booking freelancers with it.

Skills are normalised using the existing `normaliseSkills()` utility from `lib/skillsUtils.ts`.

---

### Module 3 — Freelancer Retention Rate

Two metrics displayed as a donut chart split:

- **Repeat freelancers** — bookings with a freelancer the employer has booked before
- **New freelancers** — bookings with a first-time freelancer

```
Repeat freelancers:  42%
New freelancers:     58%
```

Also shows: top 3 repeat freelancers by booking count with name, field of work, total bookings, and a link to their profile.

Surfaced insight: a high repeat rate means a reliable talent pool is being built. A low repeat rate (always new) signals constant onboarding overhead.

Calculated over all-time completed bookings (not time-windowed — retention is a long-term metric).

---

### Module 4 — Booking Lifecycle Duration

Average number of days between key milestones in the hiring flow, calculated over the last 90 days:

```
Job posted  →  First booking:      3.2 days avg
Booking     →  Agreement signed:   1.8 days avg
Signed      →  Completed:         24.6 days avg
Total time from post to complete:  29.6 days avg
```

Each duration shows:
- Average days
- Trend vs the previous 90-day period (▲ slower / ▼ faster)

Surfaced insight: if "booking to agreement" is averaging 4 days, the rate negotiation phase is causing delays.

---

### Module 5 — Booking Outcome Breakdown

A donut chart showing the distribution of booking statuses across all bookings ever created by this employer:

```
Completed     58%  ●  indigo
Cancelled     22%  ●  red
In Progress   14%  ●  amber
Other          6%  ●  slate
```

"Other" covers any statuses not in the above three buckets.

Surfaced insight: a high cancellation rate signals a problem — either at rate negotiation, at agreement signing, or post-signing. Employers can investigate further by clicking through to their bookings list filtered by `status = cancelled`.

---

## API Endpoint

One new endpoint: `GET /api/dashboard/hiring-analytics`

Returns all five modules' data in a single response. Employer-only — returns `403` for freelancers.

Query params:
- `window` — `30d` | `90d` | `12m` (default: `90d`) — applies to funnel and lifecycle only; retention and outcomes are all-time

Response shape:
```ts
{
  funnel: {
    window: '30d' | '90d' | '12m',
    jobsPosted: number,
    bookingsCreated: number,
    agreementsSigned: number,
    completed: number,
    conversionRates: {
      jobToBooking: number | null,     // percentage
      bookingToSigned: number | null,
      signedToCompleted: number | null
    }
  },
  skillsGap: {
    demand: { skill: string; count: number }[],   // up to 8
    supply: { skill: string; count: number }[],   // up to 8
    gaps: string[]                                 // skills in demand but not in supply
  },
  retention: {
    repeatRate: number,          // percentage 0–100
    newRate: number,             // percentage 0–100
    totalBookings: number,
    repeatFreelancers: {
      freelancerId: string,
      name: string,
      fieldOfWork: string,
      bookingCount: number
    }[]                          // top 3
  },
  lifecycle: {
    window: '30d' | '90d' | '12m',
    jobToFirstBooking: number | null,     // avg days, null if insufficient data
    bookingToSigned: number | null,
    signedToCompleted: number | null,
    totalDuration: number | null,
    trends: {
      jobToFirstBooking: 'faster' | 'slower' | 'same' | null,
      bookingToSigned: 'faster' | 'slower' | 'same' | null,
      signedToCompleted: 'faster' | 'slower' | 'same' | null
    }
  },
  outcomes: {
    completed: number,
    cancelled: number,
    inProgress: number,
    other: number,
    total: number,
    completedPct: number,
    cancelledPct: number,
    inProgressPct: number,
    otherPct: number
  }
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

Freelancer dashboard is completely unchanged.

---

## Data Requirements

Most meaningful with 3+ months of booking history. On a fresh account with no bookings, all values are zero or null. Every module handles this gracefully with a specific empty state.

Lifecycle duration requires at least 3 completed bookings in the selected window to compute a statistically meaningful average.

---

## Non-Goals (Out of Scope for This Feature)

- Per-freelancer performance scoring
- Predictive hiring recommendations (e.g. "you should hire more React developers")
- Comparison against other employers on the platform
- Team/department-level analytics (enterprise future feature)
- Export to CSV or PDF
- Hiring forecasting or capacity planning
- Applicant tracking system (ATS) features
- SLA tracking or contractual deadline monitoring

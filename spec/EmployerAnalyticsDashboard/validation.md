# TalentLock — Validation Guide: Employer Analytics Dashboard

> **Purpose:** Verify the Employer Analytics Dashboard feature is correctly implemented before it is considered complete.
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix failures before marking a phase complete.

**Last validated:** 2026-06-06 — automated code/build checks + static review. Live API curls and browser checks marked ⬜ pending manual sign-off.

---

## Phase 1 Validation — Backend

### V1.1 — Endpoint Exists and Is Registered

```bash
grep -r "hiring-analytics" artifacts/api-server/src/routes/
grep -r "hiring-analytics" artifacts/api-server/src/index.ts
```

- [x] Route handler exists — `artifacts/api-server/src/routes/dashboard.ts`
- [x] Route registered — via `dashboardRouter` in `artifacts/api-server/src/routes/index.ts` (not `src/index.ts` directly; matches existing dashboard pattern)

### V1.2 — Freelancer Blocked

```bash
curl "http://localhost:8080/api/dashboard/hiring-analytics?window=90d" \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns `HTTP 403` — ⬜ requires running API + freelancer token

### V1.3 — Unauthenticated Blocked

```bash
curl "http://localhost:8080/api/dashboard/hiring-analytics"
```

- [ ] Returns `HTTP 401` — ⬜ requires running API

### V1.4 — Default Window Is 90d

```bash
curl "http://localhost:8080/api/dashboard/hiring-analytics" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 200` — ⬜ requires running API + employer token
- [x] `funnel.window` defaults to `"90d"` — confirmed in route handler (`dashboard.ts`)

### V1.5 — Window Param Accepted

```bash
curl "http://localhost:8080/api/dashboard/hiring-analytics?window=30d" \
  -H "Authorization: Bearer <employer_token>"
```

- [x] Window param parsed — `30d` / `90d` / `12m` accepted; echoed in `funnel.window` and `lifecycle.window` (code review)

### V1.6 — Invalid Window Defaults to 90d

```bash
curl "http://localhost:8080/api/dashboard/hiring-analytics?window=invalid" \
  -H "Authorization: Bearer <employer_token>"
```

- [x] Invalid window falls back to `"90d"` — confirmed in route handler

### V1.7 — Response Shape Complete

- [x] Response has: `funnel`, `skillsGap`, `retention`, `lifecycle`, `outcomes`
- [x] `funnel.conversionRates` has `jobToBooking`, `bookingToSigned`, `signedToCompleted`
- [x] `skillsGap` has `demand`, `supply`, `gaps` arrays
- [x] `retention` has `repeatRate`, `newRate`, `totalBookings`, `repeatFreelancers`
- [x] `lifecycle` has all four duration fields + `trends`
- [x] `outcomes` has all four buckets + percentages + total
- [x] OpenAPI schema + codegen hook `useGetDashboardHiringAnalytics` confirmed

### V1.8 — Funnel Accuracy

Set up test data: 5 job postings, 3 bookings created, 2 agreements signed, 1 completed — all within the last 90 days.

- [ ] `funnel.jobsPosted` = `5` — ⬜ requires seeded test data
- [ ] `funnel.bookingsCreated` = `3`
- [ ] `funnel.agreementsSigned` = `2`
- [ ] `funnel.completed` = `1`
- [ ] `funnel.conversionRates.jobToBooking` = `60`
- [ ] `funnel.conversionRates.bookingToSigned` = `67`
- [ ] `funnel.conversionRates.signedToCompleted` = `50`

### V1.9 — Conversion Rate Null When Denominator Is Zero

For a new employer with zero bookings:

- [x] `conversionRate()` returns `null` when denominator is 0 — `hiringIntelligence.ts`
- [ ] `funnel.jobsPosted` may be > 0 — ⬜ live data test
- [ ] `funnel.conversionRates.jobToBooking` = `null` when `bookingsCreated = 0` — ⬜ live data test

### V1.10 — Skills Gap Accuracy

With known test data where employer hired React developers but also posted for AWS (no AWS hires):

- [ ] `skillsGap.demand` contains `"AWS"` — ⬜ requires test data
- [ ] `skillsGap.supply` does not contain `"AWS"` (or has very low count)
- [ ] `skillsGap.gaps` contains `"AWS"`
- [x] Gap logic: supply < 30% of demand — confirmed in `buildSkillsGap()`

### V1.11 — Retention Rate Accuracy

With 5 completed bookings: 2 with Freelancer A (repeat), 1 each with Freelancers B, C, D (new):

- [ ] `retention.totalBookings` = `5` — ⬜ requires test data
- [ ] `retention.repeatRate` = `25` (1 of 4 unique freelancers is a repeat)
- [ ] `retention.newRate` = `75`
- [ ] `retention.repeatFreelancers[0].bookingCount` = `2`
- [x] Retention formula matches spec — `buildRetention()` in `hiringIntelligence.ts`

### V1.12 — Lifecycle Null When Fewer Than 3 Data Points

With only 2 completed bookings:

- [x] `safeAverage()` returns `null` when `values.length < 3`
- [ ] All `lifecycle` duration fields are `null` — ⬜ live data test
- [x] No error thrown — graceful null response (code path confirmed)

### V1.13 — Lifecycle Trends Direction

With current period avg = 5 days and previous period avg = 8 days for `jobToFirstBooking`:

- [x] `getLifecycleTrend(5, 8)` = `"faster"` — unit logic confirmed
- [x] `getLifecycleTrend(10, 6)` = `"slower"` — unit logic confirmed

### V1.14 — Outcomes Percentages Sum to 100

- [x] `completed + cancelled + inProgress + other` = `total` — `buildOutcomes()`
- [x] Percentages computed via `pct()` from same bucket counts
- [ ] Live response sums to 100 — ⬜ rounding edge cases need live data

### V1.15 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors — ❌ pre-existing errors in `scripts`, `api-server` (admin, resumeParser), `talentlock` (DocumentUploader, Onboarding). **No errors in hiring analytics files.**

---

## Phase 2 Validation — Frontend

### V2.1 — Panel Visible on Employer Dashboard

Log in as employer, navigate to `/dashboard`:

- [x] `"Hiring Analytics"` heading in `Dashboard.tsx` (employer-only)
- [x] `<HiringAnalyticsPanel />` with all 5 sub-components (code review)
- [x] Window selector dropdown in panel top-right

### V2.2 — Panel Not Visible on Freelancer Dashboard

Log in as freelancer:

- [x] No `"Hiring Analytics"` section — gated by `{isEmployer && ...}`
- [x] No panel rendered for freelancers (code review)

### V2.3 — Window Selector Changes Both Funnel and Lifecycle

Switch from "Last 90 days" to "Last 30 days":

- [x] `useGetDashboardHiringAnalytics({ window })` refetches on window change
- [x] `HiringFunnel` shows window label from `funnel.window`
- [x] `LifecycleDuration` shows window label from `lifecycle.window`
- [x] `RetentionCard` / `OutcomesDonut` are all-time (no window in headings)

### V2.4 — Hiring Funnel Renders

- [x] Four stage boxes in a row (responsive wrap)
- [x] Counts shown in each box
- [x] Conversion percentages between stages (`converted` / `to signed` / `completed`)
- [x] `—` shown where conversion rate is null
- [x] `funnelNote` banner — N/A (`job_requirements.createdAt` exists; banner not required)

### V2.5 — Skills Gap Chart Renders

**With both demand and supply:**
- [x] Two columns of horizontal bars
- [x] Demand bars indigo, supply bars emerald
- [x] Gap rows highlighted `bg-red-50` + `Gap` badge
- [x] Gaps summary text below chart

**Supply-only (no job skills column):**
- [x] Supply-only fallback when `demand` is empty (note shown)

### V2.6 — Retention Donut Renders

- [x] Donut chart with two slices
- [x] Repeat percentage in centre
- [x] Repeat/New legend values
- [x] Top repeat freelancers with `View →` links to `/freelancers/:id`

### V2.7 — Lifecycle Duration Renders

- [x] Four duration rows + total row
- [x] `▼ faster` / `▲ slower` / `─ same` / `─` trend indicators
- [x] `—` when duration is null

### V2.8 — Outcomes Donut Renders

- [x] Donut chart with coloured slices
- [x] Legend with percentage and count per category
- [x] High cancellation warning when `cancelledPct > 30`

### V2.9 — Empty States Per Module

For a brand new employer with no data:

- [x] Funnel: `"No hiring activity in the selected period."`
- [x] Skills: `"No skill data available yet."`
- [x] Retention: `"No completed bookings yet..."`
- [x] Lifecycle: `"No completed bookings in this period..."`
- [x] Outcomes: `"No bookings yet..."`

### V2.10 — Loading Skeletons

On slow network:

- [x] Each sub-component accepts `isLoading` and renders skeletons
- [ ] No layout shift — ⬜ manual DevTools throttle check

### V2.11 — Error State

Break the endpoint temporarily:

- [x] Error card with `"Could not load hiring analytics."` + Retry (`refetch()`)
- [ ] Rest of dashboard still renders — ⬜ manual browser check

---

## Security Validation

### S1 — Employer Cannot See Another Employer's Data

- [x] All queries filter by `employer.id` (employer profile id) — code review
- [ ] Live multi-account test — ⬜ pending

### S2 — Freelancer Cannot Access

- [ ] V1.2 above — returns `403` — ⬜ pending live API test

---

## Regression Validation

### R1 — Spend Analytics Unchanged (if deployed)

- [x] `GET /api/dashboard/spend-analytics` route unchanged in `dashboard.ts`
- [x] `buildSpendAnalytics` / `spendIntelligence.ts` untouched by hiring work
- [ ] Live curl — ⬜ pending

### R2 — Earnings Intelligence Unchanged (if deployed)

- [x] `GET /api/dashboard/earnings-intelligence` route unchanged
- [x] `earningsUtils.ts` extended additively (`getWindowDates`, `safeAverage`, `getLifecycleTrend`)
- [ ] Live curl — ⬜ pending

### R3 — Existing Dashboard Stats Unchanged

- [x] `GET /api/dashboard/stats` handler unchanged
- [ ] Live curl — ⬜ pending

### R4 — Freelancer Dashboard Unchanged

- [x] Hiring panel employer-only; Earnings Intelligence freelancer-only (code review)
- [ ] Manual freelancer login — ⬜ pending

### R5 — TypeCheck and Build Pass

```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero TypeScript errors — ❌ pre-existing workspace errors (not in hiring files)
- [x] Both builds complete without errors — verified 2026-06-06

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Backend | ⚠️ Code complete; live API/data tests pending | Agent | 2026-06-06 |
| Phase 2 — Frontend | ⚠️ Code complete; manual browser tests pending | Agent | 2026-06-06 |
| Security Checks | ⚠️ Code review pass; live tests pending | Agent | 2026-06-06 |
| Regression Checks | ⚠️ Builds pass; full typecheck fails (pre-existing) | Agent | 2026-06-06 |
| **Feature Complete** | ⚠️ Implementation complete — pending manual sign-off | | 2026-06-06 |

### Remaining manual steps before full sign-off

1. Start API + frontend; curl V1.2–V1.4 with employer/freelancer tokens
2. Seed or use account with known booking/job data; verify V1.8–V1.11
3. Browser: employer `/dashboard` — window selector, all widgets, error/retry
4. Browser: freelancer `/dashboard` — confirm no Hiring Analytics section

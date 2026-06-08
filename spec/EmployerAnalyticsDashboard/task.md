# TalentLock — Task Breakdown: Employer Analytics Dashboard

## Summary

Add an Employer Analytics Dashboard panel to the employer dashboard. Two phases: Backend (endpoint + codegen) → Frontend (widgets + integration). No schema migration. Builds on utilities from prior analytics features.

---

## Phase 1 — Backend

### Task 1.1 — Codebase Inspection

Before writing any code, run all inspection commands from `plan.md`. Document and resolve:
- Exact booking status strings for completed, cancelled, in-progress
- Whether `job_requirements.createdAt` exists
- Whether `agreements.bookingId` FK exists (direct link to bookings)
- How "fully signed" is captured on agreements (column, status, or timestamps)
- Whether `job_requirements` has a skills column
- Whether `normaliseSkills()` is exported from `skillsUtils.ts`
- Whether `earningsUtils.ts` exists and exports `getWindowDates` (or add it)

Add a comment block at top of the new route file:
```ts
// Hiring Analytics — Codebase inspection results (Task 1.1):
// booking status completed   = [confirmed]
// booking status cancelled   = [confirmed]
// booking status in_progress = [confirmed]
// job_requirements.createdAt = EXISTS / MISSING
// agreements.bookingId       = EXISTS / MISSING
// fully_signed captured via  = [confirmed approach]
// job_requirements skills    = EXISTS as [column name] / MISSING
```

### Task 1.2 — Add `getWindowDates` to `earningsUtils.ts`

**File:** `artifacts/api-server/src/lib/earningsUtils.ts`

Add if not already present (from plan.md window helper):

```ts
export type AnalyticsWindow = '30d' | '90d' | '12m';

export function getWindowDates(window: AnalyticsWindow) {
  const now = new Date();
  const days = window === '30d' ? 30 : window === '90d' ? 90 : 365;
  const msPerDay = 24 * 60 * 60 * 1000;
  const currentStart  = new Date(now.getTime() - days * msPerDay);
  const previousStart = new Date(currentStart.getTime() - days * msPerDay);
  return { currentStart, currentEnd: now, previousStart, previousEnd: currentStart };
}
```

Also add `safeAverage` helper:
```ts
export function safeAverage(values: number[]): number | null {
  if (values.length < 3) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10;
}
```

### Task 1.3 — Create Hiring Analytics Endpoint

**File:** `artifacts/api-server/src/routes/dashboard.ts` (add to existing) OR `artifacts/api-server/src/routes/hiringAnalytics.ts` (new file)

Add `GET /api/dashboard/hiring-analytics`

**Guard:** Require Clerk auth + `userRole === 'employer'` → 403 for freelancers

**Query param:** `window: '30d' | '90d' | '12m'` (default `'90d'`)

Parse and validate:
```ts
const window = (['30d', '90d', '12m'].includes(req.query.window as string)
  ? req.query.window
  : '90d') as AnalyticsWindow;

const { currentStart, currentEnd, previousStart, previousEnd } = getWindowDates(window);
```

#### Query A — Hiring Funnel

Jobs posted in window (adapt based on Q2 inspection result):
```ts
// If createdAt EXISTS on job_requirements:
const jobsPosted = await db.select({ count: count() })
  .from(jobRequirements)
  .where(and(
    eq(jobRequirements.employerId, internalUserId),
    gte(jobRequirements.createdAt, currentStart)
  ));

// If MISSING: count all jobs (all-time), set funnelNote
```

Bookings created in window:
```ts
const bookingsCreated = await db.select({ count: count() })
  .from(bookings)
  .where(and(
    eq(bookings.employerId, internalUserId),
    gte(bookings.createdAt, currentStart)
  ));
```

Agreements signed (fully signed) in window — adapt based on Q4 inspection:
```ts
// Using confirmed approach from inspection
```

Completed bookings in window:
```ts
const completed = await db.select({ count: count() })
  .from(bookings)
  .where(and(
    eq(bookings.employerId, internalUserId),
    eq(bookings.status, BOOKING_COMPLETED_STATUS),
    gte(bookings.updatedAt, currentStart) // or createdAt, confirm
  ));
```

Conversion rates (null-safe):
```ts
const conversionRates = {
  jobToBooking: jobs > 0 ? Math.round((bkgs / jobs) * 100) : null,
  bookingToSigned: bkgs > 0 ? Math.round((signed / bkgs) * 100) : null,
  signedToCompleted: signed > 0 ? Math.round((comp / signed) * 100) : null,
};
```

#### Query B — Skills Gap

```ts
// Demand: extract skills from job requirements in window
const jobsInWindow = await db.select({ skills: jobRequirements.skills })
  .from(jobRequirements)
  .where(and(eq(jobRequirements.employerId, internalUserId), /* window filter */));

const demandSkillCounts = new Map<string, number>();
jobsInWindow.forEach(j => {
  normaliseSkills(j.skills).forEach(skill => {
    demandSkillCounts.set(skill, (demandSkillCounts.get(skill) ?? 0) + 1);
  });
});

const demand = [...demandSkillCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([skill, count]) => ({ skill, count }));

// Supply: extract skills from booked freelancers' profiles
const bookedFreelancers = await db
  .select({ skills: freelancerProfiles.skills })
  .from(bookings)
  .innerJoin(freelancerProfiles, eq(freelancerProfiles.id, bookings.freelancerId))
  .where(eq(bookings.employerId, internalUserId));

const supplySkillCounts = new Map<string, number>();
bookedFreelancers.forEach(f => {
  normaliseSkills(f.skills).forEach(skill => {
    supplySkillCounts.set(skill, (supplySkillCounts.get(skill) ?? 0) + 1);
  });
});

const supply = [...supplySkillCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([skill, count]) => ({ skill, count }));

// Gaps: top 5 demand skills with supply < 30% of demand
const gaps = demand
  .filter(d => {
    const s = supplySkillCounts.get(d.skill) ?? 0;
    return (s / d.count) < 0.3;
  })
  .slice(0, 5)
  .map(d => d.skill);
```

If `job_requirements` has no skills column — return `{ demand: [], supply, gaps: [] }`.

#### Query C — Retention Rate

```ts
const bookingsByFreelancer = await db
  .select({ freelancerId: bookings.freelancerId, count: count() })
  .from(bookings)
  .where(and(
    eq(bookings.employerId, internalUserId),
    eq(bookings.status, BOOKING_COMPLETED_STATUS)
  ))
  .groupBy(bookings.freelancerId);

const totalFreelancers = bookingsByFreelancer.length;
const repeatFreelancerIds = bookingsByFreelancer
  .filter(b => Number(b.count) > 1)
  .sort((a, b) => Number(b.count) - Number(a.count));

const repeatRate = totalFreelancers > 0
  ? Math.round((repeatFreelancerIds.length / totalFreelancers) * 100)
  : 0;

// Top 3 repeat freelancers — resolve names
const top3 = await Promise.all(
  repeatFreelancerIds.slice(0, 3).map(async r => {
    const profile = await db.query.freelancerProfiles.findFirst({
      where: eq(freelancerProfiles.id, r.freelancerId)
    });
    const user = await db.query.users.findFirst({
      where: eq(users.id, r.freelancerId)
    });
    return {
      freelancerId: r.freelancerId,
      name: /* confirmed display name field */,
      fieldOfWork: profile?.fieldOfWork ?? '',
      bookingCount: Number(r.count)
    };
  })
);
```

#### Query D — Lifecycle Duration

For each completed booking in the current window, compute:
- `jobToFirstBooking`: `bookings.createdAt - jobRequirements.createdAt` (if linked and Q2 exists)
- `bookingToSigned`: `agreement fully_signed timestamp - bookings.createdAt` (if Q3 link exists)
- `signedToCompleted`: `bookings.updatedAt (when completed) - agreement fully_signed timestamp`

Use `safeAverage()` — returns null if < 3 values.

Compute same metrics for previous window → derive trends using `getTrend()` from plan.md Q8.

Return `null` for any metric where the required data link does not exist.

#### Query E — Booking Outcomes

```ts
const allBookings = await db
  .select({ status: bookings.status, count: count() })
  .from(bookings)
  .where(eq(bookings.employerId, internalUserId))
  .groupBy(bookings.status);

const total = allBookings.reduce((s, b) => s + Number(b.count), 0);
const get = (status: string) =>
  Number(allBookings.find(b => b.status === status)?.count ?? 0);

const completed  = get(BOOKING_COMPLETED_STATUS);
const cancelled  = get(BOOKING_CANCELLED_STATUS);
const inProgress = get(BOOKING_IN_PROGRESS_STATUS);
const other      = total - completed - cancelled - inProgress;

const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
```

### Task 1.4 — Register Route

**File:** `artifacts/api-server/src/index.ts`

Register `hiringAnalyticsRouter` if added as a new file.

### Task 1.5 — OpenAPI Spec + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add `GET /api/dashboard/hiring-analytics` with `window` query param and full response schema.

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
grep -r "useGetDashboardHiringAnalytics" lib/api-client-react/src/
```

If missing, re-run codegen before continuing.

### Task 2.2 — Create `<HiringFunnel />`

**File:** `artifacts/talentlock/src/components/hiring/HiringFunnel.tsx`

Props: `{ funnel: FunnelData, onWindowChange: (w: AnalyticsWindow) => void }`
See `UI.md` Component 1.

### Task 2.3 — Create `<SkillsGapChart />`

**File:** `artifacts/talentlock/src/components/hiring/SkillsGapChart.tsx`

Props: `{ demand: SkillCount[], supply: SkillCount[], gaps: string[] }`
See `UI.md` Component 2.

### Task 2.4 — Create `<RetentionCard />`

**File:** `artifacts/talentlock/src/components/hiring/RetentionCard.tsx`

Props: `{ retention: RetentionData }`
See `UI.md` Component 3.

### Task 2.5 — Create `<LifecycleDuration />`

**File:** `artifacts/talentlock/src/components/hiring/LifecycleDuration.tsx`

Props: `{ lifecycle: LifecycleData }`
See `UI.md` Component 4.

### Task 2.6 — Create `<OutcomesDonut />`

**File:** `artifacts/talentlock/src/components/hiring/OutcomesDonut.tsx`

Props: `{ outcomes: OutcomesData }`
See `UI.md` Component 5.

### Task 2.7 — Create `<HiringAnalyticsPanel />`

**File:** `artifacts/talentlock/src/components/hiring/HiringAnalyticsPanel.tsx`

Orchestrator. Manages `window` state, calls `useGetDashboardHiringAnalytics({ window })`.
See `UI.md` Component 6.

### Task 2.8 — Integrate Into `/dashboard`

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`

Add below Spend Analytics panel:

```tsx
{userRole === 'employer' && (
  <>
    <h2 className="text-lg font-semibold text-slate-800 mt-8 mb-4">
      Hiring Analytics
    </h2>
    <HiringAnalyticsPanel />
  </>
)}
```

---

## Acceptance Criteria

- [ ] Codebase inspection complete — all column names and status values documented
- [ ] `getWindowDates()` and `safeAverage()` added to `earningsUtils.ts`
- [ ] `GET /api/dashboard/hiring-analytics` returns `403` for freelancers
- [ ] Endpoint accepts `window` param — defaults to `90d`
- [ ] Funnel counts are time-windowed (or all-time with note if `createdAt` missing)
- [ ] Conversion rates are null when denominator is zero
- [ ] Skills demand populated from `job_requirements` skills (or empty if column missing)
- [ ] Skills supply populated from booked freelancers' `freelancer_profiles`
- [ ] Gaps = top 5 demand skills with supply < 30% of demand
- [ ] Retention rate calculated over all-time completed bookings
- [ ] Top 3 repeat freelancers returned with name, field, booking count
- [ ] Lifecycle durations return null when < 3 data points
- [ ] `bookingToSigned` null when no booking-agreement link
- [ ] Trends compare current vs previous same-length window
- [ ] Outcomes cover completed, cancelled, in-progress, other
- [ ] Outcome percentages sum to 100
- [ ] All codegen hooks confirmed
- [ ] Window dropdown changes funnel AND lifecycle simultaneously
- [ ] All empty states render per module
- [ ] Freelancer dashboard unchanged
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 → 1.4 → 1.5 (codegen + typecheck)
Task 2.1 (after 1.5 confirmed) → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8
```

# TalentLock — Implementation Plan: Employer Spend Analytics

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Run these before writing any code and report all findings:

```bash
# 1. Check bookings schema — employer column and proposedRate
grep -A 60 "bookings\s*=" lib/db/src/schema/*.ts

# 2. Confirm milestone storage (reuse Earnings Intelligence answer if available)
grep -r "milestone\|Milestone" lib/db/src/schema/*.ts | head -20

# 3. Check how proposedRate is set when negotiation is agreed
grep -n "proposedRate\|negotiationStatus\|agreed" \
  artifacts/api-server/src/routes/bookings.ts | head -20

# 4. Check dashboard.ts for existing spend data
cat artifacts/api-server/src/routes/dashboard.ts

# 5. Check if earningsUtils.ts exists (from Earnings Intelligence)
ls artifacts/api-server/src/lib/earningsUtils.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"

# 6. Check fieldOfWork column name on freelancer_profiles
grep -A 50 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "field\|work\|category"
```

Document all findings in a comment block at the top of the new route file before writing any query.

---

## Resolved Questions

---

### Q1 — `employerId` Column Name

**Decision: Inspect first. Use the exact column name found.**

After inspection, define a constant at the top of the route file:
```ts
// Confirmed from schema inspection (Task 1.1)
// bookings.employerId = [actual column name found]
const EMPLOYER_ID_COL = bookings.employerId; // replace with actual
```

---

### Q2 — Agreed Rate Column

**Decision: Use `proposedRate` when `negotiationStatus = 'agreed'`, with COALESCE fallback to `freelancerProfile.rate`.**

The `proposedRate` column holds the most recently proposed rate. When `negotiationStatus = 'agreed'` this is the final agreed rate. When `proposedRate` is null (no negotiation occurred), fall back to the freelancer's listed rate:

```ts
// In the rate benchmark query
const agreedRate = sql`COALESCE(${bookings.proposedRate}, ${freelancerProfiles.rate})`;
```

Apply this COALESCE everywhere `proposedRate` is used in rate calculations.

---

### Q3 — Milestone Storage Structure

**Decision: Reuse the answer from Earnings Intelligence codebase inspection.**

Check the note documented in `earningsUtils.ts` or the Earnings Intelligence route file. If Earnings Intelligence has not yet been executed:

```bash
grep -r "milestone\|Milestone" lib/db/src/schema/*.ts | head -20
```

Use the same query pattern (JOIN or JSONB) established in Earnings Intelligence. Never duplicate the pattern — import and reuse.

---

### Q4 — `fieldOfWork` Column Name

**Decision: Reuse the confirmed column name from Earnings Intelligence.**

Check the constant defined in the Earnings Intelligence route file. If not yet executed, inspect:
```bash
grep -A 50 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "field"
```

---

### Q5 — Freelancer JOIN Path

**Decision: Join `bookings → freelancer_profiles` directly using the freelancerId column.**

After confirming the `freelancerId` column name on `bookings`:

```ts
// Top freelancers query
const topFreelancers = await db
  .select({
    freelancerId: bookings.freelancerId,
    name: users.firstName,        // or freelancerProfiles.displayName — confirm from inspection
    fieldOfWork: freelancerProfiles.fieldOfWork,
    totalPaid: sum(milestones.amount),
    bookingCount: countDistinct(bookings.id),
  })
  .from(bookings)
  .innerJoin(freelancerProfiles, eq(freelancerProfiles.id, bookings.freelancerId))
  .innerJoin(users, eq(users.id, bookings.freelancerId))
  // Add milestone join based on storage structure (Q3)
  .where(eq(bookings.employerId, internalUserId))
  .groupBy(bookings.freelancerId, users.firstName, freelancerProfiles.fieldOfWork)
  .orderBy(desc(sum(milestones.amount)))
  .limit(5);
```

Confirm the freelancer display name field from inspection — it may be `users.firstName + users.lastName`, `freelancerProfiles.displayName`, or similar.

---

### Q6 — Active/Completed Booking Status Values

**Decision: Reuse the constants already defined in Earnings Intelligence.**

```ts
// Import from earningsUtils.ts (or re-define if that file doesn't exist yet)
import { BOOKING_ACTIVE_STATUSES, BOOKING_COMPLETED_STATUS, MILESTONE_APPROVED_STATUS, MILESTONE_PENDING_STATUS } from '../lib/earningsUtils';
```

If Earnings Intelligence has not yet been executed, define these constants from the schema inspection results.

---

### Q7 — Overlap With Existing Dashboard Stats

**Decision: New endpoint — additive, not overlapping.**

After inspecting `dashboard.ts`, if the existing `GET /api/dashboard/stats` already returns a basic spend total for the current month — that is fine. The new endpoint provides richer breakdown data (by field, by freelancer, trend, rate benchmark) that the existing endpoint does not return. No changes to `GET /api/dashboard/stats` are needed.

---

### Q8 — `proposedRate` Null Handling

**Decision: COALESCE to freelancer's listed rate. Covered in Q2 above.**

Additionally: if both `proposedRate` AND `freelancerProfile.rate` are null for a booking (rare but possible), exclude that booking from rate calculations entirely — do not include a $0 rate in the average.

```ts
// Exclude bookings where rate cannot be determined
.where(and(
  eq(bookings.employerId, internalUserId),
  or(
    isNotNull(bookings.proposedRate),
    isNotNull(freelancerProfiles.rate)
  )
))
```

---

### Q9 — Shared vs Separate Utils

**Decision: Option A — import from existing `earningsUtils.ts`.**

```ts
import {
  getLast6Months,
  fillZeroMonths,
  formatCurrency,
} from '../lib/earningsUtils';
```

If `earningsUtils.ts` does not exist yet (Earnings Intelligence not executed), create it as Task 1.2 of this feature — it will be used by both features.

---

## Resolved Risks

---

### Risk 1 — Milestone Structure

**Resolution: Reuse pattern from Earnings Intelligence. If not yet available, inspect and document.**

---

### Risk 2 — `proposedRate` Null

**Resolution: COALESCE pattern defined in Q2. Applied to all rate calculations.**

---

### Risk 3 — Spend by Field JOIN Path

**Resolution: Two-hop join confirmed.**

```ts
// bookings → freelancer_profiles (via freelancerId) → fieldOfWork
.innerJoin(freelancerProfiles, eq(freelancerProfiles.id, bookings.freelancerId))
```

Grouping by `freelancerProfiles.fieldOfWork` gives spend per field.

---

### Risk 4 — Zero-Spend Months

**Resolution: Same as Earnings Intelligence — use `getLast6Months()` + `fillZeroMonths()`.**

```ts
const months = getLast6Months();
const spendRows = await getMonthlySpend(db, internalUserId);
const spend = fillZeroMonths(months, spendRows);
```

---

### Risk 5 — Market Rate Query Performance

**Resolution: Ensure index exists on `freelancer_profiles.fieldOfWork`.**

Check during Task 1.1 inspection:
```sql
-- Check existing indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'freelancer_profiles';
```

If no index on `fieldOfWork` (or equivalent column): add via Drizzle schema — consistent with Earnings Intelligence Risk 5 resolution.

---

### Risk 6 — Codegen Export Rules

**Resolution: Same mandatory post-codegen checks as all features.**

After `pnpm --filter @workspace/api-spec run codegen`:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 2

---

## Month Label and Currency Helpers

**Reuse from `earningsUtils.ts`:**

```ts
import { getLast6Months, fillZeroMonths, formatCurrency } from '../lib/earningsUtils';
```

No new utility functions needed for spend analytics — all helpers already exist.

---

## Rate Benchmark Query Pattern

```ts
// For each field the employer hires from:
async function getMarketRate(db: DB, fieldOfWork: string): Promise<number | null> {
  const result = await db
    .select({ rate: freelancerProfiles.rate })
    .from(freelancerProfiles)
    .where(and(
      eq(freelancerProfiles.fieldOfWork, fieldOfWork),
      isNotNull(freelancerProfiles.rate)
    ));

  if (result.length < 3) return null; // insufficient data

  const rates = result.map(r => Number(r.rate)).sort((a, b) => a - b);
  return rates[Math.floor(rates.length / 2)]; // median
}
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/employer-spend-analytics/features.md` read
- [ ] `specs/employer-spend-analytics/clarify.md` read
- [ ] This `plan.md` read — all 9 questions and 6 risks resolved
- [ ] `specs/employer-spend-analytics/task.md` read — phase order understood
- [ ] `specs/employer-spend-analytics/UI.md` read — all widget states understood
- [ ] Codebase inspection complete — Q1, Q2, Q3, Q5, Q8 confirmed from actual files
- [ ] Earnings Intelligence Phase 1 execution status checked — reuse utils if available

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Backend — endpoint + utils (if needed) + OpenAPI + codegen | ⬜ Not started |
| Phase 2 | Frontend — widgets, charts, dashboard integration | ⬜ Not started |

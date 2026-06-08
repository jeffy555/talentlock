# TalentLock — Clarification & Verification: Employer Spend Analytics

This file audits `features.md` against `project.md` and the completed Earnings Intelligence feature to surface gaps, architectural risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `bookings` table exists with `employerId`, `status`, `proposedRate` | Confirmed in `project.md` — `proposedRate` is a negotiation column |
| `freelancer_profiles` table exists with `fieldOfWork`, `rate` | Confirmed — used in Earnings Intelligence |
| `reviews` table exists with `rating`, `employerId`, `freelancerId` | Confirmed — built in reviews-ratings feature |
| `job_requirements` table exists | Confirmed in `project.md` |
| `GET /api/dashboard/stats` already exists | Confirmed |
| `GET /api/dashboard/earnings-intelligence` established the pattern | Earnings Intelligence spec |
| `/dashboard` frontend route exists | Confirmed |
| recharts `BarChart` already used on dashboard | Confirmed — existing monthly bar chart uses recharts |
| `earningsUtils.ts` — `getLast6Months()`, `fillZeroMonths()`, `formatCurrency()` | Created in Earnings Intelligence Phase 1 |
| Employer-only endpoint pattern (`403` for freelancers) | Consistent with existing routes |
| No new DB tables required | Confirmed — pure aggregation |
| Orval codegen → React Query hooks | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — What Column Holds the Employer Reference on `bookings`?

**Question:** The spend queries filter bookings by employer. Is the column `employerId`, `employer_id`, or something else? Same question answered in Earnings Intelligence for `freelancerId` — confirm the employer side.

**Recommendation:**
```bash
grep -A 50 "bookings\s*=" lib/db/src/schema/*.ts | grep -i "employer"
```

---

### Q2 — What Is the Agreed Rate Column on `bookings`?

**Question:** Module 6 (rate benchmark) needs the agreed rate per booking. `project.md` lists `proposedRate` as a negotiation column. Is `proposedRate` the final agreed rate once `negotiationStatus = 'agreed'`, or is there a separate `agreedRate` column?

**Impact:** The average rate paid calculation uses whichever column holds the final agreed rate. Using the wrong column could return mid-negotiation proposed rates rather than final agreed rates.

**Recommendation:**
```bash
grep -A 10 "proposedRate\|agreedRate\|negotiationStatus" lib/db/src/schema/*.ts
```

---

### Q3 — Milestone Storage Structure (Same as Earnings Intelligence Q2)

**Question:** Are milestones a separate table or JSONB on `bookings`?

**Impact:** All spend aggregation queries depend on this. This was the critical unknown in Earnings Intelligence — confirm the answer found during that feature's implementation.

**Recommendation:** Check the codebase inspection notes from Earnings Intelligence Phase 1 (Task 1.1) — the answer was documented there. If not yet executed, run:
```bash
grep -r "milestone\|Milestone" lib/db/src/schema/*.ts | head -20
```

---

### Q4 — How Is `fieldOfWork` Stored on `freelancer_profiles`?

**Question:** Same as Earnings Intelligence Q3. What is the exact column name? Confirmed during Earnings Intelligence implementation — reuse that finding.

**Recommendation:** Check the confirmed column name from Earnings Intelligence plan.md codebase inspection notes.

---

### Q5 — Does `bookings` Have a Direct `freelancerId` Column With Freelancer Profile Data?

**Question:** Module 4 (Top Freelancers by Spend) needs to resolve freelancer name and field of work from a booking. Can this be done via a direct JOIN from `bookings` to `freelancer_profiles`, or does it require going through `users` first?

**Impact:** The JOIN path determines query complexity for the top freelancers query.

**Recommendation:**
```bash
grep -A 50 "bookings\s*=" lib/db/src/schema/*.ts | grep -i "freelancer"
```

---

### Q6 — What Are the Active and Completed Booking Status Values?

**Question:** Same as Earnings Intelligence Q4. Confirmed during that feature — reuse. Committed spend filters on active bookings with pending milestones.

**Recommendation:** Reuse constants from `earningsUtils.ts` if already defined, or confirm from the same schema inspection.

---

### Q7 — Does the Employer Dashboard Already Show Any Spend Data?

**Question:** `GET /api/dashboard/stats` already exists and likely returns some spend data for employers. Does it already return monthly spend totals that would overlap with Module 2 (Spend Trend)?

**Impact:** If spend trend data already exists in the dashboard stats, the new endpoint should not duplicate it — either extend the existing response or clearly differentiate the new endpoint's purpose (richer breakdown vs simple totals).

**Recommendation:**
```bash
cat artifacts/api-server/src/routes/dashboard.ts
```

---

### Q8 — What Does `proposedRate` Represent When `negotiationStatus = 'agreed'`?

**Question:** Following Q2 — when a booking reaches `negotiationStatus = 'agreed'`, is `proposedRate` the final agreed hourly rate that both parties accepted? Or could it have been set to null/reset at any point in the negotiation flow?

**Impact:** If `proposedRate` is null for some agreed bookings, the rate benchmark calculation must handle null rates gracefully.

**Recommendation:**
```bash
# Check booking update handler to see how proposedRate is set
grep -n "proposedRate\|negotiationStatus.*agreed" artifacts/api-server/src/routes/bookings.ts | head -20
```

---

### Q9 — Should `earningsUtils.ts` Be Shared or Duplicated?

**Question:** The Earnings Intelligence feature created `artifacts/api-server/src/lib/earningsUtils.ts` with `getLast6Months()`, `fillZeroMonths()`, `formatCurrency()`. Should Employer Spend Analytics:
- **(A)** Import from the existing `earningsUtils.ts` — shared utilities
- **(B)** Create a separate `spendUtils.ts` with its own copies

**Impact:** Option A is cleaner and avoids duplication. The utilities are generic enough to be shared.

**Recommendation:** Option A — import from `earningsUtils.ts`. If Earnings Intelligence has not yet been executed and `earningsUtils.ts` does not exist, create it as part of this feature's Phase 1.

---

## ⚠️ Risks & Notes

### Risk 1 — Milestone Structure (Same as Earnings Intelligence Risk 1)

Critical unknown if not already resolved. All spend aggregation changes completely depending on whether milestones are a separate table or JSONB. Reuse the answer from Earnings Intelligence.

### Risk 2 — `proposedRate` May Be Null for Some Bookings

If the employer skipped negotiation (accepted the freelancer's default rate), `proposedRate` may be null. The rate benchmark query must use `COALESCE(proposedRate, freelancerProfile.rate)` — fall back to the freelancer's listed rate when `proposedRate` is null.

### Risk 3 — Spend by Field Requires JOIN Through Freelancer Profile

The employer's bookings link to freelancers. The freelancer's `fieldOfWork` is on `freelancer_profiles`. The spend-by-field query requires: `bookings → freelancer_profiles → fieldOfWork`. This is a two-hop join. Confirm the join path during inspection.

### Risk 4 — Zero-Spend Months Must Show as $0

Same as Earnings Intelligence Risk 4. Use `getLast6Months()` + `fillZeroMonths()` to ensure all 6 months are represented.

### Risk 5 — Market Rate Comparison Requires Platform-Wide Data

The rate benchmark compares the employer's average paid rate against all freelancers on the platform in the same fields. This query scans all `freelancer_profiles` — not just the employer's bookings. On a large dataset this could be slow. The same caching recommendation from Earnings Intelligence applies: add indexes on `freelancer_profiles.fieldOfWork` if not already present.

### Risk 6 — Codegen Export Rules

After adding the new endpoint to the OpenAPI spec:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 2

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | `employerId` column name on `bookings` | Task 1.1 (all queries) |
| Q2 | `proposedRate` vs `agreedRate` | Task 1.1 (rate benchmark query) |
| Q3 | Milestone storage structure | Task 1.1 (spend + committed queries) |
| Q5 | Freelancer JOIN path from bookings | Task 1.1 (top freelancers query) |
| Q8 | `proposedRate` null behaviour | Task 1.1 (COALESCE pattern) |

Questions Q4, Q6, Q7, Q9 are resolved in `plan.md`.

# TalentLock — Clarification & Verification: Earnings Intelligence

This file audits `features.md` against `project.md` to surface gaps, architectural risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `bookings` table exists with `freelancerId`, `status`, `jobRequirementId` | Confirmed in `project.md` |
| `freelancer_profiles` table exists with `skills`, `rate`, `fieldOfWork` (likely) | Confirmed — skills and rate referenced throughout specs |
| `reviews` table exists with `rating` and `freelancerId` | Confirmed — built in reviews-ratings feature |
| `GET /api/dashboard/stats` already exists | Confirmed in `project.md` API routes |
| `/dashboard` frontend route exists | Confirmed in `project.md` |
| recharts already available in frontend | Confirmed — used in existing dashboard bar chart |
| `dashboard/stats` already returns some earnings data | Confirmed — "monthly booking + earnings/spend bar charts on Dashboard" |
| No new DB tables required | Confirmed — feature uses only existing tables |
| Freelancer-only endpoint pattern (`403` for employers) | Consistent with existing freelancer-only routes |
| Orval codegen → React Query hooks | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — What Columns Does the `bookings` Table Actually Have?

**Question:** The feature relies on `bookings.freelancerId`, `bookings.status`, `bookings.jobRequirementId`, and milestone data. Do these columns exist under these exact names?

**Impact:** Every query in the endpoint depends on the correct column names. Getting one wrong silently returns empty results.

**Recommendation:**
```bash
grep -A 40 "bookings\s*=" lib/db/src/schema/*.ts
```

---

### Q2 — How Are Milestones Stored?

**Question:** Milestones are described as having `title`, `amount`, `dueDate`, `status` on bookings. Are milestones:
- **(A)** A separate `milestones` table with a `bookingId` foreign key
- **(B)** A JSON column on `bookings` (e.g. `milestones: jsonb`)
- **(C)** Individual columns on `bookings` (unlikely for multiple milestones)

**Impact:** The projection query and top skills query both need to sum milestone `amount` values. The query structure is completely different depending on the answer.

**Recommendation:**
```bash
grep -r "milestone\|Milestone" lib/db/src/schema/*.ts | head -20
```

---

### Q3 — Does `freelancer_profiles` Have a `fieldOfWork` Column?

**Question:** The earnings trend and rate benchmarking both group by `fieldOfWork`. Does this column exist under this exact name, or is it called something else (`field`, `category`, `specialty`)?

**Impact:** The platform average and percentile queries JOIN on this field. Wrong column name = broken queries.

**Recommendation:**
```bash
grep -A 40 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "field\|work\|category\|specialty"
```

---

### Q4 — What Are the Actual Booking Status Values?

**Question:** The projection module filters on `booking.status` being an "active" state. What exact string values does the codebase use for active, completed, and other booking states?

**Impact:** Using the wrong status string means the projection shows $0 for all active bookings.

**Recommendation:**
```bash
grep -r "status.*booking\|booking.*status\|'active'\|'completed'\|'in_progress'" \
  artifacts/api-server/src/routes/bookings.ts | head -20
```

---

### Q5 — What Are the Milestone Status Values?

**Question:** The projection filters milestones where `status = 'pending'`. What is the actual string used for a milestone that has not yet been completed?

**Impact:** Same as Q4 — wrong string = $0 projection.

**Recommendation:** Inspect the same schema file as Q2.

---

### Q6 — Does `GET /api/dashboard/stats` Already Return Any Earnings Data?

**Question:** `project.md` confirms `GET /api/dashboard/stats` exists and returns metrics. Could the earnings intelligence data be added to this existing endpoint, or does it need a separate endpoint?

**Options:**
- **(A)** Extend `GET /api/dashboard/stats` with earnings intelligence fields
- **(B)** New separate endpoint `GET /api/dashboard/earnings-intelligence`

**Impact:** Option A is simpler but makes the endpoint heavier and harder to cache. Option B is cleaner — the frontend can fetch only what it needs.

**Recommendation:** Option B — separate endpoint. The earnings intelligence queries are complex aggregations that should be independently cacheable. The existing stats endpoint is likely already used in many places and should not be modified.

---

### Q7 — How Are Skills Stored on `freelancer_profiles`?

**Question:** Top Earning Skills needs to match booking job requirements against the freelancer's skill tags. How are skills stored on `freelancer_profiles`? Text array, JSON, or comma-separated? (Same question as in the smarter-matching clarify.md — confirm the actual format.)

**Impact:** The top skills attribution query depends on being able to iterate over individual skill values.

**Recommendation:**
```bash
grep "skills" lib/db/src/schema/*.ts
```

---

### Q8 — Does `job_requirements` Have a `skills` or `requiredSkills` Column?

**Question:** For top earning skills attribution, the feature tries to match the freelancer's skills against the job requirement's required skills. Does `job_requirements` have a skills column, and what is it called?

**Impact:** Without this, top skills falls back to the "booking count" attribution method (which is still valid but less precise).

**Recommendation:**
```bash
grep -A 30 "jobRequirements\s*=" lib/db/src/schema/*.ts | grep -i "skill\|require"
```

---

### Q9 — Should the Endpoint Be Cached?

**Question:** The earnings intelligence endpoint runs 4–5 aggregation queries on `bookings` and milestones. For a freelancer with many bookings, this could be slow. Should the response be:
- **(A)** Computed fresh on every request (simple, always accurate)
- **(B)** Cached in Redis or similar (not in the current stack)
- **(C)** Cached in a DB column (e.g. `freelancer_profiles.earningsCacheJson`) with a TTL

**Impact:** The current stack has no Redis or cache layer. Option C adds complexity. Option A is fine for the current scale.

**Recommendation:** Option A — compute fresh. Add a database index on `bookings.freelancerId` and `bookings.status` if they don't already exist to keep queries fast.

---

## ⚠️ Risks & Notes

### Risk 1 — Milestone Data Structure Unknown

This is the most critical unknown. If milestones are stored as JSONB on the `bookings` row, all SQL aggregation must use Postgres JSON operators. If they are a separate table, standard Drizzle joins apply. The entire query structure of the endpoint changes based on the answer to Q2.

### Risk 2 — Platform Average May Be Misleading With Small Sample

If only 5 freelancers share the same `fieldOfWork`, the "platform average" line is statistically meaningless. Minimum threshold: only compute and display the platform average line when there are at least 5 freelancers with earnings data in that field for the given month.

### Risk 3 — Rate Benchmarking Requires Sufficient Data

Already handled in `features.md` — `rateBenchmark` returns `null` when fewer than 3 freelancers are in the field. The UI must handle `null` gracefully.

### Risk 4 — Zero-Earnings Months Must Show as $0, Not Missing

If a freelancer had no approved milestones in a given month, the trend chart must show $0 for that month — not skip the month. The query must use a date series that fills in zeros for months with no data.

### Risk 5 — Codegen Export Rules

After adding the new endpoint to the OpenAPI spec:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 2 (frontend)

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Bookings column names | Task 1.1 (endpoint queries) |
| Q2 | Milestone storage structure | Task 1.1 (projection + top skills queries) |
| Q3 | `fieldOfWork` column name | Task 1.1 (trend + benchmark queries) |
| Q4 | Active booking status values | Task 1.1 (projection query) |
| Q5 | Pending milestone status value | Task 1.1 (projection query) |
| Q7 | Skills storage format | Task 1.1 (top skills query) |

Questions Q6, Q8, Q9 are resolved in `plan.md`.

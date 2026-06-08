# TalentLock — Clarification & Verification: Employer Analytics Dashboard

This file audits `features.md` against `project.md` to surface gaps, risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `bookings` table exists with `employerId`, `status`, `createdAt` | Confirmed in `project.md` |
| `job_requirements` table exists with `createdAt` | Confirmed in `project.md` |
| `agreements` table exists with `status`, signing timestamps | Confirmed — `status` added in agreement-templates-redlining feature |
| `freelancer_profiles` table exists with `skills`, `fieldOfWork` | Confirmed throughout specs |
| `normaliseSkills()` utility exists in `lib/skillsUtils.ts` | Confirmed — created in smarter-matching feature |
| `GET /api/dashboard/stats` already exists | Confirmed in `project.md` |
| `GET /api/dashboard/earnings-intelligence` pattern established | Earnings Intelligence spec |
| `GET /api/dashboard/spend-analytics` pattern established | Employer Spend Analytics spec |
| `/dashboard` frontend route exists | Confirmed |
| recharts available in frontend | Confirmed — used across all analytics features |
| `earningsUtils.ts` with `getLast6Months`, `formatCurrency` | Created/confirmed in analytics features |
| Employer-only endpoint pattern (`403` for freelancers) | Confirmed |
| No new DB tables required | Confirmed — pure aggregation |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — What Are the Exact Booking Status Values?

**Question:** The outcomes module categorises bookings into `completed`, `cancelled`, `in_progress`, and `other`. What are the exact string values used in the codebase for each? This was investigated in Earnings Intelligence and Spend Analytics — reuse those findings if available.

**Impact:** Wrong status strings = wrong percentages in the outcomes chart.

**Recommendation:**
```bash
grep -r "'completed'\|'cancelled'\|'active'\|'in_progress'\|'ongoing'" \
  artifacts/api-server/src/routes/bookings.ts | head -20
```

---

### Q2 — Does `job_requirements` Have a `createdAt` Timestamp?

**Question:** The hiring funnel counts jobs posted within the selected time window. This requires `job_requirements.createdAt`. Does this column exist?

**Impact:** Without a timestamp on job requirements, the funnel's "Jobs Posted" count cannot be time-windowed — it would have to show all-time totals only.

**Recommendation:**
```bash
grep -A 30 "jobRequirements\s*=" lib/db/src/schema/*.ts | grep -i "created\|timestamp"
```

---

### Q3 — How Is the Booking-to-Agreement Link Established?

**Question:** The lifecycle module measures "booking → agreement signed." This requires linking a booking to its agreement. Is there a direct `bookingId` foreign key on the `agreements` table, or is the link indirect?

**Impact:** The lifecycle query must join bookings and agreements. If the link is indirect (e.g. through a shared `freelancerId` + `employerId` pair), the query is significantly more complex.

**Recommendation:**
```bash
grep -A 30 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "booking"
```

---

### Q4 — What Timestamp Marks an Agreement as "Signed" by Both Parties?

**Question:** The lifecycle module measures time from booking creation to agreement fully signed. The `agreements` table has `freelancerSignatureImageUrl` and `employerSignatureImageUrl` and a `status` column. Is the "fully signed" moment captured by:
- **(A)** `agreements.status = 'fully_signed'` + the later of the two signed timestamps
- **(B)** A dedicated `fullySignedAt` timestamp column
- **(C)** Both signed image URLs being non-null

**Impact:** The lifecycle query uses this timestamp as the end point of the "booking to signed" duration.

**Recommendation:**
```bash
grep -A 40 "agreements\s*=" lib/db/src/schema/*.ts
```

---

### Q5 — Does `job_requirements` Have a `skills` or `requiredSkills` Column?

**Question:** The skills demand analysis extracts required skills from job postings. Does `job_requirements` have a skills column, and what is it called? (Same question from smarter-matching Q5 and spend-analytics Q8 — reuse the confirmed answer.)

**Recommendation:** Check the answer documented in prior feature inspections, or:
```bash
grep -A 30 "jobRequirements\s*=" lib/db/src/schema/*.ts | grep -i "skill\|require"
```

---

### Q6 — How Should "Gaps" Be Defined in Skills Demand vs Supply?

**Question:** The `skillsGap.gaps` array in the response should contain skills that appear in demand but not in supply. What threshold defines "in demand" vs "not in supply"?

**Options:**
- **(A)** Any skill that appears ≥ 1 time in job requirements but 0 times in booked freelancer profiles
- **(B)** Skills where demand count > supply count by more than 2 (relative gap)
- **(C)** Top 5 skills from demand that have zero supply representation

**Impact:** Option A could produce many trivial gaps. Option C is the most actionable for the employer.

**Recommendation:** Option C — top 5 skills from demand that have zero or very low supply representation (supply count < 30% of demand count).

---

### Q7 — What Window Does "Repeat Freelancer" Use?

**Question:** Retention rate is described as "all-time completed bookings." Does this mean:
- **(A)** Any two completed bookings with the same freelancer, ever
- **(B)** Only completed bookings in the last 12 months

**Impact:** Option A gives true all-time retention. Option B gives a more recent and actionable picture.

**Recommendation:** Option A — all-time. Retention is a long-term metric and showing it over all history gives the most stable and meaningful signal.

---

### Q8 — What Is the "Previous Period" for Lifecycle Trends?

**Question:** Lifecycle duration shows trends vs the previous period (▲ slower / ▼ faster). For the `90d` window:
- The current period is the last 90 days
- The previous period should be the 90 days before that (days 91–180 ago)

Should this always be the same-length window immediately preceding the selected window?

**Recommendation:** Yes — always the same-length window immediately before the selected window. For `30d`: compare against days 31–60. For `90d`: compare against days 91–180. For `12m`: compare against the 12 months before that.

---

### Q9 — Should the Funnel and Lifecycle Use the Same Time Window?

**Question:** Both the funnel and lifecycle duration have a `window` parameter. Should they share the same user-selected value, or should they be independently configurable?

**Impact:** Sharing is simpler — one dropdown controls both. Independent would be more flexible but adds UI complexity.

**Recommendation:** Share — one dropdown at the top of the analytics section controls both the funnel and lifecycle window simultaneously.

---

## ⚠️ Risks & Notes

### Risk 1 — Lifecycle Requires Booking-Agreement Link (Q3)

If agreements are not directly linked to bookings by a `bookingId` foreign key, the lifecycle "booking to signed" duration cannot be accurately computed. The query would need to approximate using freelancerId + employerId + date proximity — unreliable. If the link is missing, this duration must be omitted from the response and the UI must show a specific "data not available" state for that metric.

### Risk 2 — Skills Demand With No Job Skills Column (Q5)

If `job_requirements` has no skills column, the demand side of the skills gap analysis cannot be computed. Fall back to showing only supply (skills of booked freelancers) as a "Your most-hired skills" list, without the demand comparison.

### Risk 3 — Insufficient Data for Lifecycle Averages

With fewer than 3 completed bookings in the selected window, averages are statistically meaningless. Return `null` for all lifecycle durations below this threshold. The UI shows "Not enough data" per metric, not a global empty state.

### Risk 4 — `normaliseSkills()` Import Path

The `normaliseSkills()` utility lives in `artifacts/api-server/src/lib/skillsUtils.ts`. Confirm this file exists and exports the function before using it in the hiring analytics route.

```bash
grep "normaliseSkills" artifacts/api-server/src/lib/skillsUtils.ts
```

### Risk 5 — Codegen Export Rules

After adding the new endpoint to the OpenAPI spec:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 2

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Exact booking status strings | Task 1.1 (outcomes query) |
| Q2 | `job_requirements.createdAt` exists? | Task 1.1 (funnel query) |
| Q3 | Booking-to-agreement link | Task 1.1 (lifecycle query) |
| Q4 | Fully-signed timestamp | Task 1.1 (lifecycle query) |
| Q5 | `job_requirements` skills column | Task 1.1 (skills gap query) |

Questions Q6, Q7, Q8, Q9 are resolved in `plan.md`.

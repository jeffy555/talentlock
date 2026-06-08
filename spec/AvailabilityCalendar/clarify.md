# TalentLock — Clarification & Verification: Availability Calendar (Visual)

This file audits `features.md` against `project.md` to surface gaps, risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `freelancer_profiles` table exists with `isAvailable`, `availableFrom` | Confirmed in `project.md` Key Feature #13 |
| `bookings` table exists with `status`, `freelancerId` | Confirmed in `project.md` |
| `GET /api/freelancers` already accepts filter params | Confirmed — existing field/rate/availability filters |
| `GET /api/freelancers/:id` already returns freelancer profile | Confirmed |
| `/profile` authenticated route exists | Confirmed in `project.md` |
| `/freelancers/:id` employer route exists | Confirmed |
| `/f/:id` public profile route exists | Confirmed |
| `/freelancers` Talent Vault route exists | Confirmed |
| `VerificationBadge` and `StarRating` components already on FreelancerCard | Confirmed from prior features |
| shadcn/ui available | Confirmed |
| Notifications Centre already built | Confirmed — can trigger `availability_updated` notification |
| Drizzle ORM for all DB | Confirmed |
| Schema in `lib/db/src/schema/` | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — What Are the Current `isAvailable` and `availableFrom` Column Names?

**Question:** The existing availability fields on `freelancer_profiles` are described as `isAvailable` (boolean) and `availableFrom` (date). What are the exact column names in the Drizzle schema?

**Impact:** Every query and the profile update logic references these columns. Wrong names = silent failures.

**Recommendation:**
```bash
grep -A 50 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "avail"
```

---

### Q2 — Does a Booking Have a Start Date and End Date?

**Question:** Module 2 auto-creates a block covering the booking's "start date to end date." Does the `bookings` table have explicit `startDate` and `endDate` columns, or must the date range be inferred from milestone due dates?

**Options:**
- **(A)** `bookings.startDate` + `bookings.endDate` columns exist → use directly
- **(B)** No dates on bookings → infer from `MIN(milestone.dueDate)` to `MAX(milestone.dueDate)`
- **(C)** Only `startDate` exists → end date inferred from max milestone due date

**Impact:** The auto-block creation logic in the booking confirmation handler depends entirely on this.

**Recommendation:**
```bash
grep -A 60 "bookings\s*=" lib/db/src/schema/*.ts | grep -i "date\|start\|end"
```

---

### Q3 — What Booking Status Values Trigger Auto-Block Creation and Removal?

**Question:** Module 2 says auto-blocks are created when a booking is "confirmed" and removed when "cancelled or completed." What are the exact status strings?

**Impact:** The trigger hook in the bookings route handler uses these exact strings.

**Recommendation:** Reuse confirmed values from prior feature inspections (Earnings Intelligence, Spend Analytics). Check `artifacts/api-server/src/routes/bookings.ts`.

---

### Q4 — How Should the `nextAvailableDate` Handle Overlapping Blocks?

**Question:** Module 4 describes consecutive block merging. If a freelancer has blocks Jun 1–15 and Jun 14–30 (overlapping), should `nextAvailableDate` be July 1 (merge overlapping blocks first)?

**Impact:** The calculation algorithm must handle overlapping and adjacent blocks correctly.

**Recommendation:** Yes — merge overlapping and adjacent blocks before calculating the first gap. Define "adjacent" as blocks where `blockA.endDate + 1 = blockB.startDate` (no gap between them).

---

### Q5 — Should Employers See Block Labels?

**Question:** Blocks have an optional `label` field (e.g. "Client project — TechCorp"). Should employers and public visitors see these labels on the calendar, or are they freelancer-private?

**Options:**
- **(A)** Show label to everyone — full transparency
- **(B)** Show reason category only (booked/holiday/unavailable) to employers, no label
- **(C)** Hide labels completely from employers — just show coloured blocks

**Impact:** The `GET /api/availability/:freelancerId` public endpoint response shape depends on this.

**Recommendation:** Option B — show reason category (so employers understand the colour coding) but do not expose the label text. Labels are freelancer-private.

---

### Q6 — What Calendar Library Should Be Used?

**Question:** The visual calendar needs to render a monthly grid with date-range block highlighting. Options:

- **(A)** Build a custom calendar grid in pure Tailwind/React — full control, no dependency
- **(B)** Use `react-calendar` — lightweight, minimal styling
- **(C)** Use `react-day-picker` — commonly paired with shadcn/ui, good range support
- **(D)** Use recharts or d3 — inappropriate for calendar UI

**Impact:** The library determines how blocks are rendered, how date ranges are highlighted, and how month navigation works.

**Recommendation:** Option C — `react-day-picker`. It integrates naturally with shadcn/ui's date picker component pattern and supports multi-range date highlighting out of the box.

---

### Q7 — Can a Freelancer Have Overlapping Manual Blocks?

**Question:** Should the backend allow a freelancer to create a block that overlaps with an existing block?

**Options:**
- **(A)** Allow overlaps — calendar renders them layered
- **(B)** Reject overlaps — return 409 if the new block overlaps any existing block
- **(C)** Auto-merge — extend the existing block to cover the new range

**Impact:** Option A creates complexity in the `nextAvailableDate` calculation (handled by merging before calculation). Option B is simpler but may frustrate freelancers. Option C is invisible to the user but hard to implement correctly.

**Recommendation:** Option A — allow overlaps. The `nextAvailableDate` calculation already merges overlapping blocks before computing the first gap (Q4). The calendar renders all blocks independently.

---

### Q8 — How Far Into the Future Should Blocks Be Allowed?

**Question:** Should there be a maximum future date for creating blocks?

**Options:**
- **(A)** No limit
- **(B)** Maximum 1 year into the future
- **(C)** Maximum 2 years

**Impact:** Without a limit, freelancers could create blocks far into the future, polluting the calendar. Option B is a reasonable professional constraint.

**Recommendation:** Option B — maximum 365 days from today. Backend validation returns 400 if `endDate > today + 365`.

---

### Q9 — What Happens to Auto-Blocks When a Booking Has No Dates?

**Question:** If Q2 reveals that bookings have no date columns and milestones have no due dates set, there is no date range for the auto-block. Should the auto-block creation:

- **(A)** Skip silently — no block created when dates cannot be determined
- **(B)** Create a block from today for a default duration (e.g. 30 days)
- **(C)** Block from today to an open-ended "indefinite" state

**Impact:** Option A is safest — no guessed data. The freelancer can manually create blocks.

**Recommendation:** Option A — skip auto-block creation silently when no date range can be determined. Log a Pino warn. The freelancer's `isAvailable` flag still gets set to `false` when a booking is confirmed (existing behaviour).

---

## ⚠️ Risks & Notes

### Risk 1 — Auto-Block Must Be Fire-and-Forget

Same pattern as the Notifications Centre. Auto-block creation on booking confirmation must never block the primary booking action. Use `.catch(err => req.log.warn(err, 'auto-block creation failed'))` — never `await`.

### Risk 2 — `nextAvailableDate` Performance

The `nextAvailableDate` calculation requires fetching all future blocks for a freelancer and merging them. For the Talent Vault endpoint (`GET /api/freelancers`), this calculation runs for every freelancer in the results — potentially 20+ freelancers per page. This must be done efficiently:

- Add an index on `availability_blocks.freelancerId`
- Add an index on `availability_blocks.endDate` to quickly filter out past blocks
- Consider caching `nextAvailableDate` as a column on `freelancer_profiles` (updated whenever blocks change) to avoid per-request calculation

### Risk 3 — `availableFrom` vs Calendar Blocks Conflict

A freelancer may have `availableFrom = July 1` (existing field) but no calendar blocks covering today through June 30. These two signals would be inconsistent. The `nextAvailableDate` calculation must use the LATER of: `availableFrom` and the first date after all current blocks end.

### Risk 4 — Auto-Block Deletion on Booking Cancellation

When a booking is cancelled, the corresponding `availability_blocks` row (identified by `bookingId`) must be deleted. This must also be fire-and-forget and must not break the cancellation action.

### Risk 5 — `react-day-picker` Not Currently in the Frontend Bundle

If `react-day-picker` is not already installed, it must be added as a dependency. Confirm before Phase 3:
```bash
cat artifacts/talentlock/package.json | grep -i "day-picker\|calendar\|react-day"
```

### Risk 6 — Codegen Export Rules

After adding new endpoints to the OpenAPI spec:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 3

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Exact `isAvailable`/`availableFrom` column names | Task 1.1 |
| Q2 | Booking start/end date columns | Task 1.3 (auto-block trigger) |
| Q3 | Booking status strings for confirmed/cancelled | Task 1.3 (trigger logic) |
| Q5 | Employer label visibility | Task 2.1 (public endpoint response) |

Questions Q4, Q6, Q7, Q8, Q9 are resolved in `plan.md`.

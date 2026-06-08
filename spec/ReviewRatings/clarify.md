# TalentLock — Clarification & Verification: Reviews & Ratings

This file audits `features.md` against `project.md` to surface gaps, architectural risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `bookings` table exists with `status` column | Confirmed in `project.md` |
| `users` table exists with `id` as primary key | Confirmed in `project.md` |
| `freelancer_profiles` table exists | Confirmed in `project.md` |
| `GET /api/bookings/:id` already exists | Confirmed in `project.md` API routes |
| `PATCH /api/bookings/:id` already exists | Confirmed — status changes flow through here |
| `/bookings/:id` frontend route exists | Confirmed in `project.md` frontend routes |
| `/freelancers/:id` frontend route exists | Confirmed — employer-only |
| `/f/:id` public profile route exists | Confirmed in `project.md` |
| `/profile` authenticated route exists | Confirmed in `project.md` |
| `/dashboard` route exists | Confirmed — activity feed already present |
| shadcn/ui, React Query, Wouter routing | Confirmed tech stack |
| Orval codegen → React Query hooks | Confirmed `lib/api-client-react/` pattern |
| Drizzle ORM for all DB operations | Confirmed — never raw SQL |
| Schema files in `lib/db/src/schema/` | Confirmed in updated `project.md` |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Does `freelancer_profiles` Already Have `averageRating` and `reviewCount` Columns?

**Question:** `features.md` proposes caching `averageRating` and `reviewCount` on `freelancer_profiles` to avoid recalculating on every query. Do these columns already exist from any previous partial implementation?

**Impact:** If they exist with different names or types, the migration must be careful. If absent, two new columns need adding.

**Recommendation:**
```bash
grep -A 40 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "rating\|review"
```

---

### Q2 — What Value Does `bookings.status` Use for Completed?

**Question:** The review prompt appears when `bookings.status === 'completed'`. What is the exact string value used for a completed booking in the existing codebase? It could be `'completed'`, `'complete'`, `'done'`, or something else.

**Impact:** The review prompt render condition and the backend review creation guard both depend on this exact value.

**Recommendation:**
```bash
grep -r "completed\|complete\|status" artifacts/api-server/src/routes/bookings.ts | head -20
```

---

### Q3 — How Is `freelancerId` Resolved From a Booking?

**Question:** When an employer submits a review via `POST /api/reviews`, the request body contains `bookingId`. The backend needs to resolve the `freelancerId` from that booking to store it on the review. Is `bookings.freelancerId` a direct column on the `bookings` table, or does it require a join through another table?

**Impact:** The review creation endpoint needs to fetch the booking first to get the freelancer ID before inserting the review.

**Recommendation:**
```bash
grep -A 30 "bookings\s*=" lib/db/src/schema/*.ts | head -40
```

---

### Q4 — Should the Review Prompt Be Dismissible? Where Is Dismiss State Stored?

**Question:** `features.md` proposes storing dismiss state in `localStorage` keyed by `bookingId`. However, `talentlock.mdc` explicitly says "do not use localStorage in React components — use sessionStorage or React state." There is a conflict.

**Options:**
- **(A)** `sessionStorage` keyed by booking ID — dismissed until tab close
- **(B)** Backend flag — add `reviewPromptDismissedAt` column to `bookings`
- **(C)** Do not persist dismiss at all — prompt reappears on reload but disappears once a review exists

**Impact:** Option A is the simplest and consistent with the `.mdc` rules. Option B adds a schema change. Option C is the least disruptive.

**Recommendation:** Option A — `sessionStorage`. Consistent with the existing `tl_token_banner_dismissed` pattern used in the token-consumption feature.

---

### Q5 — What Is an Employer's "Display Name" for the Review Card?

**Question:** Each review card shows the employer's display name. Where does this come from? Options:
- `users.firstName + users.lastName`
- `employer_profiles.companyName`
- `users.email` (fallback only)

**Impact:** The review list endpoint needs to JOIN the right table to get the display name. The field name must be confirmed from the actual schema.

**Recommendation:**
```bash
grep -A 20 "users\s*=" lib/db/src/schema/*.ts
grep -A 20 "employerProfiles\s*=" lib/db/src/schema/*.ts
```

---

### Q6 — Is `bookings.status = 'completed'` Set Automatically or Manually?

**Question:** When does a booking reach `completed` status? Is it:
- **(A)** Set manually by the employer clicking a "Mark Complete" button
- **(B)** Set automatically when all milestones are approved
- **(C)** Set by the freelancer when they deliver work

**Impact:** The review prompt must appear at the right moment. If completion is manual (Option A), the prompt appears immediately after the status change on the same page. If automatic (Option B), the prompt appears on next page load.

**Recommendation:** Inspect `PATCH /api/bookings/:id` to understand what triggers `status = 'completed'`.

---

### Q7 — Does the Existing `GET /api/bookings/:id` Response Need Extending?

**Question:** `features.md` says to add a `review` object to the `GET /api/bookings/:id` response. This is a breaking change if the response shape is used in many places. Should:
- **(A)** Add `review: ReviewObject | null` directly to the existing response
- **(B)** Add a separate `GET /api/bookings/:id/review` endpoint instead

**Impact:** Option A is cleaner for the frontend — one fetch gets everything. Option B avoids any risk of breaking existing consumers.

**Recommendation:** Option A — add `review: ReviewObject | null` to the existing response. The field is additive and backward-compatible.

---

### Q8 — Pagination: How Many Reviews Per Page?

**Question:** `features.md` says 10 per page. Should the pagination use:
- **(A)** Page-based: `?page=1&pageSize=10`
- **(B)** Cursor-based: `?cursor=<last_id>`

**Impact:** Page-based is simpler and consistent with the admin console pattern. Cursor-based is more efficient for large datasets.

**Recommendation:** Option A — page-based, consistent with `GET /api/admin/documents` pagination pattern.

---

### Q9 — Star Display: Numeric or Visual?

**Question:** Should the star rating be displayed as:
- **(A)** Visual star icons (filled/half/empty) using SVG or lucide-react
- **(B)** Numeric with a star icon: `⭐ 4.2`
- **(C)** Both: visual stars + numeric average

**Impact:** Pure UI decision. Option C is the richest but requires a custom star component. Option B is simplest.

**Recommendation:** Option C on detail pages (visual stars + numeric), Option B (compact badge) on Talent Vault cards.

---

## ⚠️ Risks & Notes

### Risk 1 — One Review Per Booking Uniqueness

The `reviews` table must have a UNIQUE constraint on `bookingId` to prevent duplicate reviews. The backend insert must use `onConflictDoUpdate` or check existence first. Using `onConflictDoUpdate` is atomic and the correct pattern.

### Risk 2 — Average Rating Staleness

`averageRating` and `reviewCount` are cached on `freelancer_profiles`. They must be updated atomically after every review insert and every reply (reply doesn't change rating but `reviewCount` should not be updated on reply). Use a utility function `updateFreelancerRating(db, freelancerId)` that recalculates from the `reviews` table and updates in a transaction.

### Risk 3 — Review Submission Guard

The backend must verify:
1. The requesting user is an employer (`userRole === 'employer'`)
2. The booking belongs to this employer (`booking.employerId === internalUserId`)
3. The booking status is `completed`
4. No review already exists for this booking

All four checks must happen before the insert. A race condition on check 4 is handled by the UNIQUE constraint — the constraint catches concurrent duplicate inserts.

### Risk 4 — Reply Submission Guard

The backend must verify:
1. The requesting user is a freelancer (`userRole === 'freelancer'`)
2. The review's `freelancerId` matches the requesting user's internal ID
3. No reply already exists (`reply === null`)

### Risk 5 — Public Profile Exposes Review Data

The `/f/:id` route is unauthenticated and public. The review list endpoint `GET /api/reviews/freelancer/:freelancerId` must work without authentication for public profile use. However it must not expose employer email addresses or internal IDs — only display names.

### Risk 6 — Codegen Export Rules

After adding new endpoints to the OpenAPI spec:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 3

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | `averageRating`/`reviewCount` column existence | Task 1.1 |
| Q2 | Exact value of `bookings.status` for completed | Task 1.3 + Task 2.1 |
| Q3 | How `freelancerId` is resolved from a booking | Task 2.1 |
| Q5 | Employer display name field and table | Task 2.2 |
| Q6 | How/when booking reaches completed status | Task 3.4 (prompt placement) |

Questions Q4, Q7, Q8, Q9 are resolved in `plan.md`.

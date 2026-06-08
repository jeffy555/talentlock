# TalentLock — Implementation Plan: Reviews & Ratings

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Run these before writing any code and report findings:

```bash
# 1. Check freelancer_profiles for existing rating columns
grep -A 40 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "rating\|review"

# 2. Check bookings schema for status values and freelancerId column
grep -A 40 "bookings\s*=" lib/db/src/schema/*.ts

# 3. Check exact status string used for completed bookings
grep -r "completed\|'complete'" artifacts/api-server/src/routes/bookings.ts | head -20

# 4. Check users table for name fields
grep -A 20 "users\s*=" lib/db/src/schema/*.ts

# 5. Check employer_profiles for company name
grep -A 20 "employerProfiles\s*=" lib/db/src/schema/*.ts

# 6. Check if reviews table already exists
grep -r "reviews" lib/db/src/schema/*.ts
```

Report all findings before any implementation.

---

## Resolved Questions

---

### Q1 — `averageRating` and `reviewCount` Columns

**Decision: Inspect first. Add if missing.**

If columns do not exist on `freelancer_profiles`:

```ts
// Add to freelancerProfiles table in lib/db/src/schema/
averageRating: numeric('average_rating', { precision: 3, scale: 2 }),
// e.g. 4.25 — null when no reviews yet
reviewCount: integer('review_count').notNull().default(0),
```

Both nullable-friendly: `averageRating` is null when `reviewCount === 0`. Display as "No reviews yet" when null.

---

### Q2 — Completed Booking Status Value

**Decision: Inspect first. Use the exact string found in the codebase.**

After running the inspection:
- If `'completed'` is used → use `'completed'` throughout
- If a different value is found → use that value and document it in a comment

The review creation endpoint must reject requests where `booking.status !== '<confirmed_value>'` with:
```ts
return res.status(400).json({
  error: 'Reviews can only be submitted for completed bookings',
  code: 'BOOKING_NOT_COMPLETED'
});
```

---

### Q3 — Resolving `freelancerId` From a Booking

**Decision: Inspect schema. Use `bookings.freelancerId` if it exists as a direct column.**

After inspection, the likely pattern is:
```ts
const booking = await db.query.bookings.findFirst({
  where: eq(bookings.id, bookingId),
});
const freelancerId = booking.freelancerId; // use actual column name found
```

If `freelancerId` is not a direct column (e.g. resolved via a join to `freelancer_profiles`), document the join in a comment and use the correct query.

---

### Q4 — Dismiss State Storage

**Decision: Option A — `sessionStorage`. Consistent with `tl_token_banner_dismissed`.**

```ts
// Key pattern: tl_review_prompt_dismissed_{bookingId}
const key = `tl_review_prompt_dismissed_${bookingId}`;

// On dismiss
sessionStorage.setItem(key, 'true');

// On render check
const isDismissed = sessionStorage.getItem(key) === 'true';
```

The prompt disappears permanently once a review is submitted (backend returns `review` on `GET /api/bookings/:id`). Session dismiss is a secondary mechanism for skipping without submitting.

---

### Q5 — Employer Display Name

**Decision: Inspect schema. Use the most descriptive available field.**

Priority order for display name:
1. `employer_profiles.companyName` (if it exists and is non-null)
2. `users.firstName + ' ' + users.lastName` (if name fields exist)
3. `users.email` with domain stripped: `alice@company.com` → `alice` (fallback only)

The review list endpoint JOINs the correct table based on what inspection finds. Document the actual field used in a comment at the top of the route file.

For privacy on the public `/f/:id` page — never expose employer email addresses. Only display names.

---

### Q6 — When Booking Reaches Completed Status

**Decision: Inspect the bookings route. Adapt prompt placement accordingly.**

After inspecting `PATCH /api/bookings/:id`:
- If completion is **manual** (employer action) → show prompt immediately after status change on the same `/bookings/:id` page. React Query will refetch the booking and the `review: null` field will trigger the prompt to appear.
- If completion is **automatic** (all milestones approved) → prompt appears on next load of `/bookings/:id` when `status === completed && review === null`.

Either way the prompt renders when: `booking.status === completedValue && booking.review === null && !isDismissed`.

---

### Q7 — Review Object on Booking Response

**Decision: Option A — add `review: ReviewObject | null` to existing `GET /api/bookings/:id` response.**

Additive — no existing field is changed. The review object shape:

```ts
type ReviewObject = {
  id: number;
  rating: number;          // 1–5
  comment: string | null;
  reply: string | null;
  createdAt: string;       // ISO
  repliedAt: string | null;
  employerDisplayName: string;
} | null
```

---

### Q8 — Pagination

**Decision: Option A — page-based pagination.**

```
GET /api/reviews/freelancer/:freelancerId?page=1&pageSize=10
```

Response:
```ts
{
  data: ReviewObject[],
  total: number,
  page: number,
  pageSize: number,
  totalPages: number
}
```

Default `pageSize: 10`. Max `pageSize: 50`. Ordered by `createdAt DESC`.

---

### Q9 — Star Display

**Decision: Option C — visual stars + numeric on detail pages, compact badge on cards.**

**Detail pages** (`/freelancers/:id`, `/f/:id`, `/profile`):
```
★★★★☆  4.2  (18 reviews)
```
Visual stars rendered as filled/empty SVG icons. Numeric average to 1 decimal place. Review count in parentheses.

**Talent Vault cards** (`/freelancers`):
```
⭐ 4.2
```
Single star emoji + numeric. No count on card (space-constrained).

**No reviews yet:**
```
No reviews yet
```
`text-sm text-muted-foreground` — never show 0 stars or a 0.0 rating.

---

## Resolved Risks

---

### Risk 1 — One Review Per Booking Uniqueness

**Resolution: UNIQUE constraint on `bookingId` + Drizzle insert with conflict handling.**

```ts
// In schema
}, (t) => ({
  uniqBooking: unique().on(t.bookingId),
}));

// In route — check existence first for a clean error message
const existing = await db.query.reviews.findFirst({
  where: eq(reviews.bookingId, bookingId)
});
if (existing) {
  return res.status(409).json({
    error: 'A review already exists for this booking',
    code: 'REVIEW_ALREADY_EXISTS'
  });
}
// Then insert — UNIQUE constraint is the final safety net
```

---

### Risk 2 — Average Rating Staleness

**Resolution: `updateFreelancerRating()` utility called after every review insert.**

```ts
// artifacts/api-server/src/lib/reviewUtils.ts
export async function updateFreelancerRating(db: DB, freelancerId: string) {
  const result = await db
    .select({
      avg: sql<string>`AVG(${reviews.rating})`,
      count: count(),
    })
    .from(reviews)
    .where(eq(reviews.freelancerId, freelancerId));

  const avg = result[0]?.avg ? parseFloat(result[0].avg) : null;
  const reviewCount = result[0]?.count ?? 0;

  await db.update(freelancerProfiles)
    .set({
      averageRating: avg ? avg.toFixed(2) : null,
      reviewCount,
    })
    .where(eq(freelancerProfiles.id, freelancerId));
  // Note: use correct column name for freelancerProfiles.id from schema inspection
}
```

Called only after review insert — NOT after reply (reply doesn't change rating).

---

### Risk 3 — Review Submission Guards

**Resolution: Four sequential guards before any insert.**

```ts
// POST /api/reviews
// Guard 1: employer only
if (userRole !== 'employer') return res.status(403).json({ error: 'Forbidden' });

// Guard 2: booking belongs to this employer
const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
if (!booking) return res.status(404).json({ error: 'Booking not found' });
if (booking.employerId !== internalUserId) return res.status(403).json({ error: 'Forbidden' });

// Guard 3: booking is completed
if (booking.status !== COMPLETED_STATUS) {
  return res.status(400).json({ error: 'Reviews can only be submitted for completed bookings', code: 'BOOKING_NOT_COMPLETED' });
}

// Guard 4: no existing review
const existing = await db.query.reviews.findFirst({ where: eq(reviews.bookingId, bookingId) });
if (existing) return res.status(409).json({ error: 'Review already exists', code: 'REVIEW_ALREADY_EXISTS' });
```

---

### Risk 4 — Reply Submission Guards

**Resolution: Three sequential guards.**

```ts
// POST /api/reviews/:id/reply
// Guard 1: freelancer only
if (userRole !== 'freelancer') return res.status(403).json({ error: 'Forbidden' });

// Guard 2: review belongs to this freelancer
const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
if (!review) return res.status(404).json({ error: 'Review not found' });
if (review.freelancerId !== internalUserId) return res.status(403).json({ error: 'Forbidden' });

// Guard 3: no existing reply
if (review.reply !== null) {
  return res.status(409).json({ error: 'Reply already exists', code: 'REPLY_ALREADY_EXISTS' });
}
```

---

### Risk 5 — Public Endpoint Privacy

**Resolution: `GET /api/reviews/freelancer/:freelancerId` is unauthenticated but returns display names only.**

The endpoint does NOT require Clerk auth — it must work for the public `/f/:id` page. However:
- Never return `employer.email`
- Never return `employer.clerkId`
- Never return internal `employerId` in the public response
- Only return `employerDisplayName` (the resolved display name string)

---

### Risk 6 — Codegen Export Rules

**Resolution: Same mandatory post-codegen checks as all previous features.**

After `pnpm --filter @workspace/api-spec run codegen`:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 3

---

## Rating Display Helper

```ts
// artifacts/talentlock/src/lib/ratingUtils.ts

export function formatRating(avg: number | null, count: number): string {
  if (avg === null || count === 0) return 'No reviews yet';
  return `${avg.toFixed(1)}`;
}

export function formatReviewCount(count: number): string {
  if (count === 0) return '';
  return `(${count} ${count === 1 ? 'review' : 'reviews'})`;
}

// Star array for rendering
export function getStarArray(rating: number): ('full' | 'half' | 'empty')[] {
  return [1, 2, 3, 4, 5].map(i => {
    if (rating >= i) return 'full';
    if (rating >= i - 0.5) return 'half';
    return 'empty';
  });
}
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/reviews-ratings/features.md` read
- [ ] `specs/reviews-ratings/clarify.md` read
- [ ] This `plan.md` read — all 9 questions and 6 risks resolved
- [ ] `specs/reviews-ratings/task.md` read — phase order understood
- [ ] `specs/reviews-ratings/UI.md` read — all component states understood
- [ ] Codebase inspection complete — Q1, Q2, Q3, Q5, Q6 confirmed from actual schema files
- [ ] No existing `reviews` table — confirmed before starting Phase 1

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Database — `reviews` table + rating columns on `freelancer_profiles` | ⬜ Not started |
| Phase 2 | Backend — endpoints, rating utility, OpenAPI, codegen | ⬜ Not started |
| Phase 3 | Frontend — review prompt, star display, review list, reply | ⬜ Not started |
| Phase 4 | Admin — reviews visible in bookings tab | ⬜ Not started |

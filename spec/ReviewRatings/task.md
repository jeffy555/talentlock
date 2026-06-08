# TalentLock — Task Breakdown: Reviews & Ratings

## Summary

Build the complete reviews and ratings system: schema, API endpoints, frontend UI across four pages, and admin visibility. Four phases: Database → Backend → Frontend → Admin.

---

## Phase 1 — Database

### Task 1.1 — Inspect Existing Schema

Run codebase checks from `plan.md` before any schema changes. Document:
- Whether `averageRating`/`reviewCount` columns already exist on `freelancer_profiles`
- Exact `bookings.status` value for completed bookings
- Whether `bookings.freelancerId` is a direct column
- Employer display name field and table
- Whether a `reviews` table already exists

### Task 1.2 — Create `reviews` Table

**File:** `lib/db/src/schema/` — add to the appropriate schema file

```ts
export const reviews = pgTable('reviews', {
  id:                  serial('id').primaryKey(),
  bookingId:           text('booking_id').notNull().references(() => bookings.id),
  employerId:          text('employer_id').notNull().references(() => users.id),
  freelancerId:        text('freelancer_id').notNull().references(() => users.id),
  rating:              integer('rating').notNull(), // 1–5
  comment:             text('comment'),
  reply:               text('reply'),
  repliedAt:           timestamp('replied_at', { withTimezone: true }),
  createdAt:           timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqBooking: unique().on(t.bookingId),
}));
```

### Task 1.3 — Add Rating Columns to `freelancer_profiles`

**File:** `lib/db/src/schema/` — same file as `freelancerProfiles` table

Add only if columns do not already exist:
```ts
averageRating: numeric('average_rating', { precision: 3, scale: 2 }),
reviewCount:   integer('review_count').notNull().default(0),
```

### Task 1.4 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify in Neon:
- `reviews` table exists with UNIQUE constraint on `booking_id`
- `freelancer_profiles` has `average_rating` and `review_count`

---

## Phase 2 — Backend API

### Task 2.1 — Create `reviewUtils.ts`

**File:** `artifacts/api-server/src/lib/reviewUtils.ts` (create new)

Implement `updateFreelancerRating(db, freelancerId)` using the exact function from `plan.md` Risk 2.

Also export constants:
```ts
export const REVIEW_MIN_RATING = 1;
export const REVIEW_MAX_RATING = 5;
export const REVIEW_MAX_COMMENT_LENGTH = 1000;
export const REVIEW_MAX_REPLY_LENGTH = 1000;
```

### Task 2.2 — Create Reviews Route File

**File:** `artifacts/api-server/src/routes/reviews.ts` (create new)

#### `POST /api/reviews`

Request body: `{ bookingId: string, rating: number, comment?: string }`

Validation:
- `rating` must be integer 1–5 → 400
- `comment` max 1000 chars → 400
- All four guards from `plan.md` Risk 3 in order → 403/404/400/409

On success:
1. Insert review row
2. Call `updateFreelancerRating(db, freelancerId)`
3. Return `HTTP 201` with the created review object

#### `GET /api/reviews/freelancer/:freelancerId`

No auth required — public endpoint (needed for `/f/:id`).

Query params: `?page=1&pageSize=10`

Returns paginated review list. Each item includes `employerDisplayName` (resolved per `plan.md` Q5 decision — use actual field found in schema inspection). Never return `employerId`, `employer.email`, or `employer.clerkId`.

Response:
```ts
{
  data: {
    id: number,
    rating: number,
    comment: string | null,
    reply: string | null,
    createdAt: string,
    repliedAt: string | null,
    employerDisplayName: string
  }[],
  total: number,
  page: number,
  pageSize: number,
  totalPages: number
}
```

#### `POST /api/reviews/:id/reply`

Request body: `{ reply: string }`

Validation:
- `reply` required, max 1000 chars → 400
- All three guards from `plan.md` Risk 4 in order → 403/404/409

On success:
1. Update `reviews.reply` and `reviews.repliedAt`
2. Return `HTTP 200` with updated review object

### Task 2.3 — Extend `GET /api/bookings/:id`

**File:** `artifacts/api-server/src/routes/bookings.ts`

Add `review: ReviewObject | null` to the existing response by joining the `reviews` table on `bookingId`. Use the shape from `plan.md` Q7.

### Task 2.4 — Register Routes

**File:** `artifacts/api-server/src/index.ts`

Import and register `reviewsRouter` from `./routes/reviews`.

### Task 2.5 — OpenAPI Spec Update + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add:
- `POST /api/reviews`
- `GET /api/reviews/freelancer/{freelancerId}`
- `POST /api/reviews/{id}/reply`
- Update `GET /api/bookings/{id}` response to include `review` field

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 3

---

## Phase 3 — Frontend

### Task 3.1 — Verify Generated Hooks

Confirm codegen produced:
- `usePostReviews()`
- `useGetReviewsFreelancerId()`
- `usePostReviewsIdReply()`

If missing, re-run codegen.

### Task 3.2 — Create `ratingUtils.ts`

**File:** `artifacts/talentlock/src/lib/ratingUtils.ts` (create new)

Use the exact `formatRating`, `formatReviewCount`, and `getStarArray` functions from `plan.md`.

### Task 3.3 — Create `<StarRating />` Component

**File:** `artifacts/talentlock/src/components/StarRating.tsx` (create new)

See `UI.md` Component 1 for full spec — interactive (input) and display-only (read-only) variants.

### Task 3.4 — Create `<ReviewCard />` Component

**File:** `artifacts/talentlock/src/components/ReviewCard.tsx` (create new)

See `UI.md` Component 2 for full spec — shows rating, comment, employer name, date, and reply.

### Task 3.5 — Create `<ReviewList />` Component

**File:** `artifacts/talentlock/src/components/ReviewList.tsx` (create new)

See `UI.md` Component 3 for full spec — paginated list of `<ReviewCard />` items with loading/empty/error states.

### Task 3.6 — Create `<ReviewPrompt />` Component

**File:** `artifacts/talentlock/src/components/ReviewPrompt.tsx` (create new)

See `UI.md` Component 4 for full spec — review submission form with star input, comment textarea, submit and dismiss actions.

### Task 3.7 — Integrate into `/bookings/:id`

**File:** `artifacts/talentlock/src/pages/BookingDetail.tsx` (or equivalent)

Add `<ReviewPrompt />` below the booking status section when:
```ts
booking.status === COMPLETED_STATUS &&
booking.review === null &&
userRole === 'employer' &&
!isDismissed
```

When `booking.review` is not null — render `<ReviewCard review={booking.review} />` instead of the prompt.

### Task 3.8 — Integrate into `/freelancers/:id`

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

Add below the bio section:
- `<StarRating value={freelancer.averageRating} readonly />` with numeric + count (detail format)
- `<ReviewList freelancerId={freelancer.id} />` section headed "Reviews"

### Task 3.9 — Integrate into `/f/:id` (Public Profile)

**File:** `artifacts/talentlock/src/pages/PublicProfile.tsx`

Same as Task 3.8 — `<StarRating />` below name + `<ReviewList />` section.

### Task 3.10 — Integrate into `/freelancers` (Talent Vault Cards)

**File:** `artifacts/talentlock/src/components/FreelancerCard.tsx` (or equivalent)

Add compact badge to each card:
```tsx
{freelancer.averageRating && (
  <span className="text-xs text-slate-600">
    ⭐ {parseFloat(freelancer.averageRating).toFixed(1)}
  </span>
)}
```

### Task 3.11 — Integrate into `/profile` (Freelancer)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

Add "Reviews Received" section (freelancer-role only):
- Overall `<StarRating readonly />` with average and count
- List of reviews with inline reply textarea for unreplied reviews
- Uses `useGetReviewsFreelancerId(currentFreelancerId)`

### Task 3.12 — Dashboard Activity Prompt

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`

In the activity feed section, for completed bookings with no review within the last 30 days, add a prompt item:
```
Leave a review for [Freelancer Name] →
```
Links to `/bookings/:id`. Employer-role only.

---

## Phase 4 — Admin Console

### Task 4.1 — Show Reviews in Bookings Tab

**File:** Admin dashboard bookings tab

In the existing `GET /api/admin/bookings` response, include the review for each booking (if any). Display in the expanded booking row: star rating + comment truncated to 100 chars + "Has reply" indicator if reply exists.

No CRUD operations — read-only.

---

## Acceptance Criteria

- [ ] `reviews` table exists with UNIQUE constraint on `booking_id`
- [ ] `average_rating` and `review_count` columns exist on `freelancer_profiles`
- [ ] `reviewUtils.ts` created with `updateFreelancerRating()`
- [ ] `POST /api/reviews` returns 403 for non-employers
- [ ] `POST /api/reviews` returns 400 for invalid rating (< 1 or > 5)
- [ ] `POST /api/reviews` returns 400 for booking not completed
- [ ] `POST /api/reviews` returns 409 for duplicate review
- [ ] `POST /api/reviews` returns 403 when booking belongs to different employer
- [ ] `POST /api/reviews` updates `averageRating` and `reviewCount` on `freelancer_profiles`
- [ ] `GET /api/reviews/freelancer/:id` works without auth (public)
- [ ] `GET /api/reviews/freelancer/:id` never returns employer email or internal ID
- [ ] `GET /api/reviews/freelancer/:id` pagination works correctly
- [ ] `POST /api/reviews/:id/reply` returns 403 for non-freelancers
- [ ] `POST /api/reviews/:id/reply` returns 403 when review belongs to different freelancer
- [ ] `POST /api/reviews/:id/reply` returns 409 for duplicate reply
- [ ] `GET /api/bookings/:id` includes `review: null` or `review: ReviewObject`
- [ ] All three codegen hooks confirmed
- [ ] `<StarRating />` renders correctly in both interactive and read-only modes
- [ ] `<ReviewPrompt />` submits correctly and disappears after submission
- [ ] `<ReviewPrompt />` dismiss stored in sessionStorage
- [ ] `<ReviewList />` renders with pagination
- [ ] Review prompt visible on completed booking with no review (employer only)
- [ ] Review card replaces prompt after submission
- [ ] Star rating visible on Talent Vault cards (compact)
- [ ] Star rating visible on freelancer detail and public profile (full)
- [ ] "No reviews yet" shown when `reviewCount === 0`
- [ ] Freelancer can reply from `/profile` Reviews Received section
- [ ] Reply textarea hidden after reply is submitted
- [ ] Dashboard activity prompt shown for reviewable bookings
- [ ] Admin bookings tab shows review data (read-only)
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 → 1.4
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 (codegen + typecheck)
Task 3.1 (after 2.5 confirmed) → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8 → 3.9 → 3.10 → 3.11 → 3.12
Task 4.1 (after 3.12)
```

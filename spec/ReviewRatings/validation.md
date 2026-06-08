# TalentLock — Validation Guide: Reviews & Ratings

> **Purpose:** Verify the Reviews & Ratings feature is correctly implemented before it is considered complete. Run after all phases of `task.md` are marked done.
>
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix failures before marking a phase complete.

---

## Phase 1 Validation — Database

### V1.1 — `reviews` Table Exists With Correct Columns

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'reviews'
ORDER BY ordinal_position;
```

Expected columns: `id`, `booking_id`, `employer_id`, `freelancer_id`, `rating`, `comment`, `reply`, `replied_at`, `created_at`

- [ ] All 9 columns present with correct types
- [ ] `rating` is integer, not nullable
- [ ] `comment`, `reply`, `replied_at` are nullable

### V1.2 — UNIQUE Constraint on `booking_id`

```sql
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'reviews';
```

- [ ] A UNIQUE constraint exists on `booking_id`

### V1.3 — `average_rating` and `review_count` on `freelancer_profiles`

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
AND column_name IN ('average_rating', 'review_count');
```

- [ ] `average_rating` exists, type `numeric`, nullable
- [ ] `review_count` exists, type `integer`, default `0`

---

## Phase 2 Validation — Backend API

### V2.1 — Submit Review: Happy Path

Create a completed booking in the DB, then:

```bash
curl -X POST http://localhost:8080/api/reviews \
  -H "Authorization: Bearer <employer_token>" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"<completed_booking_id>","rating":4,"comment":"Great work on the project."}'
```

- [ ] Returns `HTTP 201`
- [ ] Response contains `id`, `rating`, `comment`, `createdAt`
- [ ] `reviews` table has one new row

### V2.2 — Average Rating Updated After Submission

```sql
SELECT average_rating, review_count
FROM freelancer_profiles
WHERE id = '<freelancer_id>';
```

- [ ] `review_count` incremented by 1
- [ ] `average_rating` reflects the submitted rating (or correct average if multiple reviews)

### V2.3 — Duplicate Review Blocked

Submit a second review for the same booking:

```bash
curl -X POST http://localhost:8080/api/reviews \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"bookingId":"<same_booking_id>","rating":5}'
```

- [ ] Returns `HTTP 409`
- [ ] Response: `{ "code": "REVIEW_ALREADY_EXISTS" }`

### V2.4 — Booking Not Completed Blocked

```bash
# Use a booking with status !== 'completed'
curl -X POST http://localhost:8080/api/reviews \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"bookingId":"<active_booking_id>","rating":4}'
```

- [ ] Returns `HTTP 400`
- [ ] Response: `{ "code": "BOOKING_NOT_COMPLETED" }`

### V2.5 — Wrong Employer Blocked

```bash
# Employer B tries to review Employer A's booking
curl -X POST http://localhost:8080/api/reviews \
  -H "Authorization: Bearer <employer_B_token>" \
  -d '{"bookingId":"<employer_A_booking_id>","rating":4}'
```

- [ ] Returns `HTTP 403`

### V2.6 — Freelancer Cannot Submit Review

```bash
curl -X POST http://localhost:8080/api/reviews \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"bookingId":"<booking_id>","rating":4}'
```

- [ ] Returns `HTTP 403`

### V2.7 — Invalid Rating Blocked

```bash
curl -X POST http://localhost:8080/api/reviews \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"bookingId":"<booking_id>","rating":6}'
```

- [ ] Returns `HTTP 400`

### V2.8 — Review List: Public (No Auth Required)

```bash
# No Authorization header
curl http://localhost:8080/api/reviews/freelancer/<freelancer_id>
```

- [ ] Returns `HTTP 200`
- [ ] Response contains `data`, `total`, `page`, `pageSize`, `totalPages`
- [ ] Each item has `rating`, `comment`, `reply`, `createdAt`, `employerDisplayName`

### V2.9 — Review List: No Employer PII Exposed

Inspect the response from V2.8:

- [ ] No `employerId` field in any review object
- [ ] No `email` field in any review object
- [ ] No `clerkId` field in any review object
- [ ] Only `employerDisplayName` string is present

### V2.10 — Pagination Works

```bash
curl "http://localhost:8080/api/reviews/freelancer/<freelancer_id>?page=1&pageSize=2"
```

With 5+ reviews in DB:

- [ ] Returns exactly 2 items
- [ ] `totalPages` is correct (`Math.ceil(total/2)`)
- [ ] `page` is `1`

### V2.11 — Reply: Happy Path

```bash
curl -X POST http://localhost:8080/api/reviews/<review_id>/reply \
  -H "Authorization: Bearer <freelancer_token>" \
  -H "Content-Type: application/json" \
  -d '{"reply":"Thank you for the kind words!"}'
```

- [ ] Returns `HTTP 200`
- [ ] `reviews.reply` updated in DB
- [ ] `reviews.replied_at` populated

### V2.12 — Duplicate Reply Blocked

```bash
# Submit same reply again
curl -X POST http://localhost:8080/api/reviews/<review_id>/reply \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"reply":"Another reply attempt"}'
```

- [ ] Returns `HTTP 409`
- [ ] Response: `{ "code": "REPLY_ALREADY_EXISTS" }`

### V2.13 — Wrong Freelancer Reply Blocked

```bash
# Freelancer B tries to reply to Freelancer A's review
curl -X POST http://localhost:8080/api/reviews/<review_id>/reply \
  -H "Authorization: Bearer <freelancer_B_token>" \
  -d '{"reply":"Not my review"}'
```

- [ ] Returns `HTTP 403`

### V2.14 — Employer Cannot Reply

```bash
curl -X POST http://localhost:8080/api/reviews/<review_id>/reply \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"reply":"Employer trying to reply"}'
```

- [ ] Returns `HTTP 403`

### V2.15 — Booking Detail Includes Review

```bash
curl http://localhost:8080/api/bookings/<booking_with_review_id> \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Response includes `review` field
- [ ] When no review: `review: null`
- [ ] When review exists: `review` contains `id`, `rating`, `comment`, `reply`, `createdAt`, `employerDisplayName`

### V2.16 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — `<StarRating />` Interactive Mode

Navigate to `/bookings/:id` for a completed booking as an employer:

- [ ] Five star icons rendered, all empty initially
- [ ] Hovering star N highlights all stars 1 to N in amber
- [ ] Clicking star N sets rating to N
- [ ] Clicking a different star updates the selection
- [ ] Submit button disabled until a star is clicked

### V3.2 — `<StarRating />` Read-Only Mode

Navigate to `/freelancers/:id` for a freelancer with reviews:

- [ ] Stars render filled/empty correctly matching the average rating
- [ ] Numeric average shown to 1 decimal place
- [ ] Review count shown in parentheses
- [ ] No hover/click interaction

### V3.3 — "No Reviews Yet" State

Navigate to `/freelancers/:id` for a freelancer with zero reviews:

- [ ] `"No reviews yet"` text shown instead of stars
- [ ] No star icons rendered
- [ ] No `"0.0"` or `"0 reviews"` shown

### V3.4 — Review Prompt on Completed Booking

Navigate to `/bookings/:id` for a completed booking with no review as employer:

- [ ] Amber-bordered prompt card visible
- [ ] `"How was your experience with {name}?"` heading
- [ ] Interactive `<StarRating />` present
- [ ] Optional comment textarea present
- [ ] `"Skip for now"` and `"Submit Review"` buttons present
- [ ] Submit disabled until rating selected
- [ ] Prompt NOT shown for freelancer viewing same booking

### V3.5 — Review Submission Flow

Select 4 stars and submit a review:

- [ ] Submit button shows spinner + `"Submitting..."`
- [ ] After success: prompt replaced by `<ReviewCard />`
- [ ] Toast: `"Review submitted. Thank you for your feedback!"`
- [ ] Refreshing the page still shows the review card (not the prompt)

### V3.6 — Prompt Dismiss

Click `"Skip for now"`:

- [ ] Prompt disappears
- [ ] Refreshing the page: prompt does NOT reappear (sessionStorage dismiss preserved)
- [ ] Opening a new tab and navigating to same booking: prompt DOES reappear (new session)

### V3.7 — `<ReviewCard />` Display

Find a booking with a submitted review:

- [ ] Star rating shown correctly
- [ ] Employer display name shown (no email address visible)
- [ ] Comment shown (when present)
- [ ] Date formatted correctly

With a freelancer reply on the review:

- [ ] Reply block shown with left border + `"Freelancer's reply:"` label
- [ ] Reply text and `"Replied {date}"` shown

### V3.8 — `<ReviewList />` on Freelancer Detail

Navigate to `/freelancers/:id`:

- [ ] "Reviews (18)" section heading with count
- [ ] Review cards rendered
- [ ] Pagination controls visible when `totalPages > 1`
- [ ] Clicking Next loads page 2
- [ ] Prev disabled on page 1, Next disabled on last page
- [ ] Loading skeleton shown while fetching
- [ ] Error state shown when API fails (with Retry)

### V3.9 — Public Profile `/f/:id` (No Auth)

Open `/f/:id` in an incognito window:

- [ ] Star rating visible without being logged in
- [ ] `<ReviewList />` loads without auth
- [ ] No employer emails or internal IDs visible in the UI

### V3.10 — Talent Vault Card Badge

Navigate to `/freelancers`:

- [ ] Freelancers with reviews show `⭐ 4.2` compact badge
- [ ] Freelancers with zero reviews show NO badge (no "⭐ 0.0")

### V3.11 — Freelancer Profile Reviews Received

Log in as a freelancer and navigate to `/profile`:

- [ ] "Reviews Received" section visible
- [ ] Overall star rating + count shown
- [ ] Review cards listed
- [ ] Unreplied reviews show reply textarea
- [ ] After submitting a reply: textarea replaced by reply block inline

### V3.12 — Dashboard Activity Prompt

Log in as an employer with completed bookings that have no review (within 30 days):

- [ ] `"⭐ Leave a review for {name}"` prompt in activity feed
- [ ] `"Write Review →"` link navigates to the correct `/bookings/:id`
- [ ] Prompt absent for bookings older than 30 days
- [ ] Max 3 prompts shown

---

## Security Validation

### S1 — Freelancer Cannot Submit Review

```bash
curl -X POST http://localhost:8080/api/reviews \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"bookingId":"<id>","rating":5}'
```

- [ ] Returns `HTTP 403`

### S2 — Employer Cannot Reply

```bash
curl -X POST http://localhost:8080/api/reviews/<id>/reply \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"reply":"test"}'
```

- [ ] Returns `HTTP 403`

### S3 — Cross-Employer Review Blocked

- [ ] Employer B cannot submit a review for Employer A's booking (V2.5 above)

### S4 — Cross-Freelancer Reply Blocked

- [ ] Freelancer B cannot reply to Freelancer A's review (V2.13 above)

### S5 — Public Review List Exposes No PII

Verify the public `GET /api/reviews/freelancer/:id` response:

- [ ] No `employerId`, `email`, or `clerkId` in any response field
- [ ] Only `employerDisplayName` string present

### S6 — Review Cannot Be Submitted for Incomplete Booking

- [ ] Blocked at API level (V2.4 above)
- [ ] Cannot be bypassed by modifying request body

---

## Regression Validation

### R1 — Existing Bookings Unaffected

Fetch an existing booking that has no review:

- [ ] `GET /api/bookings/:id` returns correctly with `review: null`
- [ ] No error due to missing review data
- [ ] All existing booking fields intact

### R2 — Freelancer Talent Vault Unchanged

Navigate to `/freelancers`:

- [ ] All existing freelancer cards render correctly
- [ ] New rating badge is additive — does not break layout
- [ ] Filters still work

### R3 — Public Profile Still Works Without Auth

Navigate to `/f/:id` without logging in:

- [ ] Full profile renders
- [ ] Existing sections (bio, skills, portfolio) intact

### R4 — TypeCheck and Build Pass

```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero TypeScript errors
- [ ] Both builds complete without errors

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Database | ⬜ | | |
| Phase 2 — Backend API | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| Phase 4 — Admin | ⬜ | | |
| Security Checks | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

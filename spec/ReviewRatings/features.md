# TalentLock — Features Specification: Reviews & Ratings

## Overview

TalentLock lists "Reviews & Ratings — Employers rate completed bookings; average shown on profiles" as Key Feature #10 in `project.md`. However there is currently zero implementation behind it — no `reviews` table in the database schema, no API routes, and no UI. Employers have no way to leave feedback after a completed engagement, and freelancers have no visible track record of quality. This creates a trust gap: employers browsing the Talent Vault see profiles with no signal of how well a freelancer has actually performed on past work.

This feature closes that gap end-to-end: employers submit a star rating and optional written review after a booking is marked completed, freelancers accumulate an average rating that is visible on their profile, Talent Vault cards, and public profile page, and freelancers can reply to reviews they receive.

---

## Feature Modules

### Module 1 — Review Submission (Employer)

After a booking reaches `status = 'completed'`, the employer sees a review prompt card on `/bookings/:id`. The prompt asks for:

- A star rating: 1–5 stars (required)
- A written comment (optional, max 1000 characters)

Each booking can receive at most one review. Once submitted the review is permanent — employers cannot edit or delete it. The prompt disappears after submission and is replaced by the submitted review.

---

### Module 2 — `reviews` Table

A new `reviews` table stores all review data:

- `id` — serial primary key
- `bookingId` — references `bookings.id`, unique (one review per booking)
- `employerId` — references `users.id`
- `freelancerId` — references `users.id`
- `rating` — integer 1–5
- `comment` — text, nullable
- `reply` — text, nullable (freelancer's response)
- `createdAt` — timestamptz
- `repliedAt` — timestamptz, nullable

---

### Module 3 — Average Rating on Freelancer Profile

After any review is submitted or updated, the `freelancer_profiles.averageRating` and `freelancer_profiles.reviewCount` columns are updated. These are computed-cache columns — not calculated on every query.

The average is displayed as a star rating display (filled/half/empty stars) on:
- `/freelancers` — Talent Vault cards
- `/freelancers/:id` — Freelancer detail page
- `/f/:id` — Public profile page
- `/profile` — Freelancer's own profile (read-only view of their rating)

---

### Module 4 — Review List on Freelancer Detail

On `/freelancers/:id` (employer view) and `/f/:id` (public view), a "Reviews" section below the portfolio shows all reviews for that freelancer, paginated (10 per page), most recent first. Each review card shows:

- Star rating
- Comment (if present)
- Employer's display name and date
- Freelancer's reply (if present)

---

### Module 5 — Freelancer Reply

Freelancers can post one reply per review. On their `/profile` page, a "Reviews Received" section lists all their reviews with a reply textarea below any unreplied review. The reply is permanent once submitted — no editing or deletion.

---

### Module 6 — Review Prompt on Booking Completion

When a booking's status changes to `completed` on `/bookings/:id`, a review prompt card appears for the employer. The prompt is dismissible (employer can skip it). A dismissed prompt does not reappear on page reload — the dismiss state is stored in `localStorage` keyed by `bookingId`.

A secondary prompt appears on the `/dashboard` activity feed for bookings completed in the last 30 days with no review yet: "Leave a review for [Freelancer Name]" with a link to the booking.

---

### Module 7 — Admin Visibility

The existing admin console gets a read-only view of all reviews in the "Bookings" tab — each booking row expands to show its review (if any). No admin moderation capability in this phase.

---

## API Routes

- `POST /api/reviews` — employer submits review (requires `bookingId`, `rating`, optional `comment`)
- `GET /api/reviews/freelancer/:freelancerId` — paginated review list for a freelancer
- `POST /api/reviews/:id/reply` — freelancer replies to a review
- `GET /api/bookings/:id` — already exists, add `review` object to response

---

## Plan Gating

Reviews and Ratings are available on all plans for both employers and freelancers. No token consumption. No plan gate.

| Plan | Can submit review | Can reply to review |
|---|---|---|
| `employer_starter` | ✅ | N/A |
| `employer_growth` | ✅ | N/A |
| `employer_enterprise` | ✅ | N/A |
| `freelancer_free` | N/A | ✅ |
| `freelancer_pro` | N/A | ✅ |

---

## Non-Goals (Out of Scope for This Feature)

- Employer-facing reviews (freelancers rating employers)
- Review editing or deletion by either party
- Admin moderation (flagging, hiding, or removing reviews)
- Verified review badges or trust scores
- Review responses from employers (only freelancers reply)
- Weighted rating algorithms (simple arithmetic mean only)
- Review reminders via email or push notification
- Rating filters on the Talent Vault (filter by minimum rating)
- Review import from external platforms

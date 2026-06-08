# TalentLock — UI Specification: Reviews & Ratings

## Overview

This document specifies the complete UI for the Reviews & Ratings feature. Four new components, six page integrations, all states, all copy strings, and all interactions are defined here.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter routing.
**Dual-role:** Employers submit reviews. Freelancers receive reviews and reply. Both see ratings on profiles.

---

## Design Tokens

| Semantic | Tailwind Classes | Used for |
|---|---|---|
| Star filled | `text-amber-400` | Filled star icon |
| Star empty | `text-slate-200` | Empty star icon |
| Star half | `text-amber-400` (half-clip) | Half star |
| Rating badge compact | `text-xs text-slate-600` | Talent Vault card |
| Rating display | `text-sm font-medium text-slate-700` | Detail pages |
| Review count | `text-sm text-muted-foreground` | Count in parens |
| No reviews | `text-sm text-muted-foreground` | Unrated state |
| Reply container | `bg-slate-50 border-l-2 border-slate-200 pl-3` | Freelancer reply |
| Prompt container | `rounded-md border border-amber-200 bg-amber-50 p-4` | Review prompt card |

---

## Component 1 — `<StarRating />`

**File:** `artifacts/talentlock/src/components/StarRating.tsx`

### Props

```ts
interface StarRatingProps {
  value: number | null;        // current rating value
  onChange?: (v: number) => void; // if provided → interactive mode
  readonly?: boolean;          // true → display only, no hover/click
  size?: 'sm' | 'md' | 'lg';  // default: 'md'
}
```

### Interactive Mode (onChange provided)

Five clickable star icons. Hover previews the rating. Click sets it.

```
☆ ☆ ☆ ☆ ☆   ← no selection
★ ★ ★ ☆ ☆   ← 3 stars selected (hover on 3rd)
```

Each star: `<Star className="cursor-pointer transition-colors" />`
- Filled: `className="text-amber-400 fill-amber-400"`
- Empty: `className="text-slate-300"`
- Hover preview: all stars up to hovered index show amber

Size classes:
- `sm`: `h-4 w-4`
- `md`: `h-5 w-5`
- `lg`: `h-6 w-6`

Accessibility: `role="radiogroup"` wrapper, each star has `aria-label="Rate {N} stars"`.

### Read-Only Mode (readonly prop or no onChange)

Stars rendered as static icons based on `value`. Half-star for `.5` increments using CSS clip-path or overlapping icons.

```
★★★★☆  4.2  (18 reviews)
```

Layout: `flex items-center gap-1`

Numeric average: `<span className="text-sm font-medium text-slate-700 ml-1">{avg}</span>`
Count: `<span className="text-sm text-muted-foreground">(18 reviews)</span>`

When `value === null` or `count === 0`:
```
No reviews yet
```
`className="text-sm text-muted-foreground"`

---

## Component 2 — `<ReviewCard />`

**File:** `artifacts/talentlock/src/components/ReviewCard.tsx`

### Props

```ts
interface ReviewCardProps {
  review: {
    id: number;
    rating: number;
    comment: string | null;
    reply: string | null;
    createdAt: string;
    repliedAt: string | null;
    employerDisplayName: string;
  };
  showReplyInput?: boolean;    // true on freelancer's own /profile page
  onReplySubmit?: (reviewId: number, reply: string) => void;
}
```

### Rendered Card

```
┌────────────────────────────────────────────────────────┐
│  ★★★★☆   Alice at TechCorp          Jun 4, 2025        │
│                                                        │
│  "Excellent work on the dashboard. Delivered on time   │
│   and communicated clearly throughout the project."    │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  border-l-2 border-slate-200 bg-slate-50 pl-3    │  │
│  │  Freelancer's reply:                             │  │
│  │  "Thank you! It was a great project to work on." │  │
│  │  Replied Jun 5, 2025                             │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

**Header row:** `flex items-center justify-between`
- Stars: `<StarRating value={review.rating} readonly size="sm" />`
- Employer name: `text-sm font-medium text-slate-700`
- Date: `text-xs text-muted-foreground` — formatted as `"MMM D, YYYY"`

**Comment:** `text-sm text-slate-600 mt-2` — shown only when non-null. No quotes in the rendered text — plain paragraph.

**Reply block:** shown when `review.reply !== null`
```tsx
<div className="mt-3 border-l-2 border-slate-200 bg-slate-50 pl-3 py-2 rounded-sm">
  <p className="text-xs font-medium text-slate-500 mb-1">Freelancer's reply:</p>
  <p className="text-sm text-slate-600">{review.reply}</p>
  <p className="text-xs text-muted-foreground mt-1">
    Replied {formatDate(review.repliedAt)}
  </p>
</div>
```

**Reply input** (when `showReplyInput && review.reply === null`):

```
┌──────────────────────────────────────────────────────┐
│  Write a reply...                          0/1000    │
│                                                      │
└──────────────────────────────────────────────────────┘
                                        [Submit Reply]
```

Textarea: `rows={3}`, max 1000 chars, character counter top-right.
Submit button: `<Button size="sm">` — disabled when empty or submitting.
On submit success: reply textarea is replaced by the reply block above.
On submit error: inline error below textarea.

---

## Component 3 — `<ReviewList />`

**File:** `artifacts/talentlock/src/components/ReviewList.tsx`

### Props

```ts
interface ReviewListProps {
  freelancerId: string;
  showReplyInput?: boolean;  // true on freelancer's own profile
}
```

### State 1 — Loading

```
[Skeleton card]   h-24 w-full rounded-md
[Skeleton card]   h-24 w-full rounded-md
[Skeleton card]   h-24 w-full rounded-md
```

Three skeleton placeholders.

### State 2 — Empty

```
No reviews yet.
Be the first to work with this freelancer and leave a review.
```

`text-sm text-muted-foreground text-center py-8`

### State 3 — Loaded

```
Reviews  (18)
────────────────────────────────────────────────────────

[ReviewCard]
[ReviewCard]
[ReviewCard]
...

                    [← Prev]  Page 1 of 2  [Next →]
```

Section heading: `<h3 className="text-base font-semibold text-slate-800 mb-3">Reviews <span className="text-muted-foreground font-normal text-sm">({total})</span></h3>`

Pagination controls: bottom-right, `text-sm`. Prev/Next buttons disabled at boundaries.

### State 4 — Error

```
Could not load reviews.   [Retry]
```

`text-sm text-muted-foreground`. Retry re-fetches the query.

---

## Component 4 — `<ReviewPrompt />`

**File:** `artifacts/talentlock/src/components/ReviewPrompt.tsx`

### Props

```ts
interface ReviewPromptProps {
  bookingId: string;
  freelancerName: string;
  onSubmit: (rating: number, comment: string) => void;
  onDismiss: () => void;
  isSubmitting: boolean;
}
```

### Default State

```
┌────────────────────────────────────────────────────────┐
│  bg-amber-50 border border-amber-200 rounded-md p-4    │
│                                                        │
│  ⭐ How was your experience with Sarah Chen?            │
│                                                        │
│  ☆ ☆ ☆ ☆ ☆   ← interactive stars (required)           │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Share more about your experience (optional)     │  │
│  │                                      0/1000      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  [Skip for now]                    [Submit Review]     │
└────────────────────────────────────────────────────────┘
```

Heading: `text-sm font-semibold text-amber-900`
`<StarRating value={rating} onChange={setRating} size="lg" />`
Textarea: optional, `rows={3}`, max 1000 chars.
"Skip for now": `<Button variant="ghost" size="sm">` — calls `onDismiss()`
"Submit Review": `<Button size="sm">` — disabled until a star rating is selected.

### Submitting State

Submit button shows `<Loader2 className="h-4 w-4 animate-spin mr-1" />` + `"Submitting..."` and is disabled. "Skip for now" also disabled.

### Validation Error

When Submit clicked with no star selected:
```
Please select a star rating before submitting.
```
`text-sm text-red-500 mt-1` below the stars.

### Success (component unmounts, replaced by ReviewCard)

The parent page replaces `<ReviewPrompt />` with `<ReviewCard review={submittedReview} />` after successful submission. A toast fires:
```
Review submitted. Thank you for your feedback!
```

---

## Page Integration 1 — `/bookings/:id`

**File:** `artifacts/talentlock/src/pages/BookingDetail.tsx`

### DOM Placement

```
[Booking header — title, status, parties]    ← existing
[Milestone tracker]                          ← existing
[Rate negotiation section]                   ← existing
[Review section]                             ← NEW
[Agreement section]                          ← existing
```

### Review Section Logic

```tsx
{userRole === 'employer' && booking.status === COMPLETED_STATUS && (
  <>
    {booking.review === null && !isDismissed && (
      <ReviewPrompt
        bookingId={booking.id}
        freelancerName={booking.freelancerName}
        onSubmit={handleReviewSubmit}
        onDismiss={handleDismiss}
        isSubmitting={isSubmitting}
      />
    )}
    {booking.review !== null && (
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Your Review</h3>
        <ReviewCard review={booking.review} />
      </div>
    )}
  </>
)}
```

`isDismissed` read from `sessionStorage.getItem(`tl_review_prompt_dismissed_${booking.id}`) === 'true'`

---

## Page Integration 2 — `/freelancers/:id`

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

### DOM Placement

```
[FreelancerHero — name, role, rate]
[VerificationBadge]                          ← from document-verification feature
[StarRating readonly + count]                ← NEW — below bio
[FreelancerBio]
[SkillsSection]
[PortfolioSection]
[ReviewList freelancerId={id} ]              ← NEW — bottom of page
```

Star rating placement (below hero, above bio):
```tsx
<div className="flex items-center gap-2 mt-2">
  <StarRating value={parseFloat(freelancer.averageRating)} readonly size="md" />
  <span className="text-sm text-muted-foreground">
    {formatReviewCount(freelancer.reviewCount)}
  </span>
</div>
```

When `reviewCount === 0`:
```
No reviews yet
```

---

## Page Integration 3 — `/f/:id` (Public Profile)

**File:** `artifacts/talentlock/src/pages/PublicProfile.tsx`

Identical placement to Integration 2. No auth required — `<ReviewList />` calls the public endpoint.

---

## Page Integration 4 — `/freelancers` (Talent Vault Cards)

**File:** `artifacts/talentlock/src/components/FreelancerCard.tsx`

Compact badge below the freelancer's name/role line:

```
Sarah Chen
Senior React Developer
⭐ 4.2  ·  $85/hr  ·  Available
```

```tsx
{freelancer.averageRating && freelancer.reviewCount > 0 && (
  <span className="text-xs text-slate-600 flex items-center gap-0.5">
    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
    {parseFloat(freelancer.averageRating).toFixed(1)}
  </span>
)}
```

No star badge shown when `reviewCount === 0`.

---

## Page Integration 5 — `/profile` (Freelancer)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

Add "Reviews Received" section below the Verification section (freelancer-role only):

```
Reviews Received
─────────────────────────────────────────────────────────

★★★★☆  4.2  (18 reviews)

[ReviewList freelancerId={currentFreelancerId} showReplyInput={true} ]
```

Section heading: `<h2 className="text-lg font-semibold">Reviews Received</h2>`
Overall rating display: `<StarRating value={profile.averageRating} readonly size="md" />`
`<ReviewList showReplyInput={true} />` — enables reply textarea on unreplied reviews.

---

## Page Integration 6 — `/dashboard` (Activity Feed)

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`

In the activity feed, for employer-role users, add prompt items for completed bookings within the last 30 days with no review:

```
┌──────────────────────────────────────────────────────┐
│  ⭐ Leave a review for Sarah Chen                     │
│     Booking completed Jun 4 · [Write Review →]       │
└──────────────────────────────────────────────────────┘
```

`<Link to={`/bookings/${bookingId}`}>Write Review →</Link>`

Data source: filter `GET /api/dashboard/activity` results for completed bookings without reviews. Or add a separate query. Employer-role only. Max 3 items shown in the feed (avoid overwhelming the dashboard).

---

## Copy Reference

| Location | String |
|---|---|
| Prompt heading | `⭐ How was your experience with {name}?` |
| Prompt skip | `Skip for now` |
| Prompt submit | `Submit Review` |
| Prompt submitting | `Submitting...` |
| Prompt validation | `Please select a star rating before submitting.` |
| Prompt success toast | `Review submitted. Thank you for your feedback!` |
| Review section heading (booking) | `Your Review` |
| Reviews list heading | `Reviews` |
| Reviews empty | `No reviews yet.` |
| Reviews empty subtitle | `Be the first to work with this freelancer and leave a review.` |
| Reviews error | `Could not load reviews.` |
| Reviews retry | `Retry` |
| Reply section label | `Freelancer's reply:` |
| Reply placeholder | `Write a reply...` |
| Reply submit | `Submit Reply` |
| Reply success | reply textarea replaced by reply block inline |
| Reply duplicate error | `You have already replied to this review.` |
| No reviews yet (star display) | `No reviews yet` |
| Dashboard prompt | `⭐ Leave a review for {name}` |
| Dashboard prompt link | `Write Review →` |
| Pagination prev | `← Prev` |
| Pagination next | `Next →` |
| Page indicator | `Page {N} of {total}` |
| Talent Vault — no badge | (nothing rendered) |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| `StarRating` (read-only) | `<Skeleton className="h-5 w-24" />` | Render "No reviews yet" |
| `ReviewCard` | Not applicable (parent handles) | N/A |
| `ReviewList` | 3 skeleton cards | `"Could not load reviews."` + Retry |
| `ReviewPrompt` | Spinner on Submit button | Inline below stars |
| Reply submission | Spinner on Submit Reply | Inline below textarea |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/StarRating.tsx` | **New** | 3.3 |
| `src/components/ReviewCard.tsx` | **New** | 3.4 |
| `src/components/ReviewList.tsx` | **New** | 3.5 |
| `src/components/ReviewPrompt.tsx` | **New** | 3.6 |
| `src/lib/ratingUtils.ts` | **New** | 3.2 |
| `src/pages/BookingDetail.tsx` | Modified | 3.7 |
| `src/pages/FreelancerDetail.tsx` | Modified | 3.8 |
| `src/pages/PublicProfile.tsx` | Modified | 3.9 |
| `src/components/FreelancerCard.tsx` | Modified | 3.10 |
| `src/pages/Profile.tsx` | Modified | 3.11 |
| `src/pages/Dashboard.tsx` | Modified | 3.12 |

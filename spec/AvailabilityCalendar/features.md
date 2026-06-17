# TalentLock — Features Specification: Availability Calendar (Visual)

## Overview

TalentLock currently gives freelancers three availability fields — an `isAvailable` boolean toggle, an `availableFrom` date, and a free-text availability note. Employers browsing the Talent Vault see these as static text ("Available from June 10") with no visual context. There is no way for a freelancer to block specific date ranges (holidays, other commitments, overlapping projects), and there is no way for employers to visually understand when a freelancer will be free relative to their own project timeline.

This feature adds a proper visual availability calendar to TalentLock. Freelancers manage their availability by creating date-range blocks (booked, holiday, unavailable). Active bookings automatically create blocks. Employers see a compact read-only calendar on the freelancer detail and public profile pages. The Talent Vault gains an "available from" date filter. A "next available" date is calculated and surfaced on Talent Vault cards.

---

## Feature Modules

### Module 1 — `availability_blocks` Table

A new `availability_blocks` table stores date-range unavailability for each freelancer:

- `id` — serial primary key
- `freelancerId` — references `freelancer_profiles.id`
- `startDate` — date (inclusive)
- `endDate` — date (inclusive)
- `reason` — enum: `booked` | `holiday` | `unavailable`
- `label` — optional text, max 100 chars (e.g. "Client project — TechCorp")
- `bookingId` — nullable reference to `bookings.id` — set when auto-created from a confirmed booking
- `createdAt` — timestamptz

---

### Module 2 — Auto-Block From Confirmed Bookings

When a booking is confirmed (status changes to active/confirmed), a `booked` block is automatically created in `availability_blocks` for the freelancer. The block covers the booking's start date to its expected end date (derived from milestone due dates or a booking end date column).

When a booking is cancelled or completed, the auto-created block is automatically removed.

This means the Talent Vault "Lock" badge (freelancer is booked) and the calendar blocks are always in sync.

---

### Module 3 — Freelancer Calendar Management (`/profile`)

On the freelancer's `/profile` page, a new "Availability" section replaces the existing `isAvailable` toggle + `availableFrom` date fields. It shows:

- A monthly calendar view with blocked date ranges highlighted
- An "Add Block" button to create a new unavailability range
- Each existing block shows as a coloured band across the dates it covers
- Clicking a block shows its details and an option to delete it (manual blocks only — auto booking blocks cannot be manually deleted)

Block colours:
- `booked` — indigo (auto-created from bookings)
- `holiday` — amber (manually created)
- `unavailable` — red (manually created)

The existing `isAvailable` toggle and `availableFrom` date are retained and shown above the calendar as quick controls. The calendar provides the detailed view.

---

### Module 4 — `nextAvailableDate` Calculation

A computed field returned on freelancer profile responses. Calculated as:

- If `isAvailable = false` → `null` (not available, no date)
- If `isAvailable = true` and no future blocks → `today` (available now)
- If `isAvailable = true` but today is covered by a block → first date after all consecutive blocks end

Example: if a freelancer has blocks from Jun 1–15 and Jun 20–30, and today is Jun 5, `nextAvailableDate` = Jun 16 (the gap between blocks).

---

### Module 5 — Read-Only Calendar on Employer Views

A compact read-only calendar appears on:
- `/freelancers/:id` — employer view of a freelancer's detail page
- `/f/:id` — public profile page

Shows the current month and next month as a two-month compact calendar. Blocked dates are highlighted in the block's colour. Employers can navigate month-by-month using prev/next arrows.

---

### Module 6 — "Available From" Filter on Talent Vault

The Talent Vault (`/freelancers`) gains a new filter: "Available from [date picker]". When set, only freelancers whose `nextAvailableDate` is on or before the selected date are returned.

---

### Module 7 — "Next Available" on Talent Vault Cards

Each Talent Vault card shows a "Next available" date calculated from the `nextAvailableDate` field:

- Available now → `Available now` (green)
- Available in the future → `Available Jun 16` (amber)
- Not available → `Not available` (slate) — replaces existing Lock badge for availability context

---

## API Routes

- `GET /api/availability/:freelancerId` — public, returns blocks for a freelancer (used by employer views and public profile)
- `GET /api/availability/me` — authenticated freelancer, returns their own blocks
- `POST /api/availability/me` — freelancer creates a new block
- `DELETE /api/availability/me/:id` — freelancer deletes a manual block (not auto booking blocks)
- `GET /api/freelancers` — updated to accept `?availableFrom=YYYY-MM-DD` filter param
- `GET /api/freelancers/:id` — updated to include `nextAvailableDate` in response

---

## Plan Gating

Available on all freelancer plans. No token consumption. No plan gate.

| Role | Can Manage | Can View |
|---|---|---|
| Freelancer | ✅ Own blocks | ✅ Own calendar |
| Employer | ❌ | ✅ Read-only calendar |
| Public | ❌ | ✅ Read-only calendar on `/f/:id` |

---

## Non-Goals (Out of Scope for This Feature)

- Time-of-day availability (date-level granularity only, not hour-level)
- Google Calendar or iCal sync
- Recurring availability patterns (e.g. "available every Monday")
- Employer booking-request calendar (employers cannot propose specific dates in this phase)
- Freelancer working hours or timezone settings
- Automatic notifications when a freelancer becomes available
- Calendar export to PDF or image

---

# P1 Follow-Up Addendum — Premature Availability Lock (added 2026-06-09)

> Source: TalentLock Security & Production Readiness review (P1). This addendum is appended after the original feature shipped. It is scoped, additive, and does not change any module above.

## Problem

`POST /api/bookings` sets `isAvailable: false` (and `currentBookingId` / `bookingEndDate`) on the freelancer's profile **immediately when the booking is created in `pending` status** (`artifacts/api-server/src/routes/bookings.ts`, in the create transaction). A booking request is not an acceptance — the freelancer has not agreed to anything yet (rate negotiation may still be in progress, `negotiationStatus = 'negotiating'`). The effect is that simply *requesting* a freelancer removes them from the Talent Vault and flips their availability, even if they later decline or the negotiation collapses.

This contradicts Module 2 of this spec ("Auto-Block From Confirmed Bookings"), which correctly creates the `booked` availability block only when a booking becomes `active`/confirmed (handled in `PATCH /api/bookings/:id`). The `isAvailable` flag should follow the same rule as the auto-block.

## Module 8 — Defer Availability Lock to Confirmation

**Fix:** Move the `isAvailable = false` / `currentBookingId` / `bookingEndDate` mutation out of `POST /api/bookings` (pending creation) and into the booking-confirmation path in `PATCH /api/bookings/:id` (status → `active`), alongside the existing auto-block creation. On `pending` creation, the freelancer remains available and visible in the Vault. On confirmation, availability flips false and the auto-block is created (existing behaviour). On `cancelled`/`completed`, availability is restored (existing behaviour at the `isAvailable: true` reset).

**Result:** Availability state and the calendar auto-block become fully consistent — both driven by the `active` transition, never by a pending request.

## Non-Goals (Addendum)

- No change to the rate-negotiation flow itself (`POST /bookings/:id/negotiate`).
- No new "freelancer accept/decline" booking state machine — that is a separate `booking-acceptance` spec (P2). This addendum only fixes *when* the availability flag flips.
- No schema change.

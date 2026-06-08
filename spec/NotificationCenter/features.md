# TalentLock — Features Specification: Notifications Centre

## Overview

TalentLock has zero notification infrastructure. Users who are waiting on a booking status change, a rate counter-proposal, an agreement ready to sign, a meeting request, or a milestone approval have no way of knowing something needs their attention without manually checking every page. This creates friction at every step of the employer–freelancer engagement loop and increases the likelihood of delayed responses and abandoned bookings.

This feature builds a complete in-app notification system from scratch: a `notifications` table, server-side triggers that write notification rows when key platform events occur, a bell icon in the navigation with an unread count badge, and a dropdown panel where users read and dismiss their notifications. The system is available to both employers and freelancers. No external services (email, push, SMS) are used in this phase — all notifications are in-app only.

---

## Feature Modules

### Module 1 — `notifications` Table

A new `notifications` table stores all notification rows:

- `id` — serial primary key
- `userId` — references `users.id` — the recipient
- `type` — enum string identifying the event type (see Event Types below)
- `entityType` — which resource this notification is about (`booking`, `agreement`, `meeting`, `review`, `document`, `milestone`)
- `entityId` — the ID of the specific resource
- `message` — pre-rendered plain-English string (e.g. "Sarah Chen accepted your booking")
- `read` — boolean, default `false`
- `createdAt` — timestamptz

---

### Module 2 — Event Types and Triggers

Notifications are written server-side when these events occur. Each event creates a notification for the specified recipient:

| Event Type | Trigger | Recipient |
|---|---|---|
| `booking_created` | Employer creates a booking | Freelancer |
| `booking_status_changed` | Booking status changes (accepted, rejected, completed, cancelled) | The other party |
| `rate_counter_proposed` | Freelancer or employer proposes a counter-rate | The other party |
| `rate_agreed` | Both parties agree on rate | Both parties |
| `agreement_ready` | Agreement generated and ready to sign | Both parties |
| `agreement_signed` | One party signs the agreement | The other party |
| `agreement_fully_signed` | Both parties sign | Both parties |
| `meeting_requested` | Employer requests a discovery meeting | Freelancer |
| `meeting_status_changed` | Meeting accepted, declined, or rescheduled | The other party |
| `milestone_completed` | Freelancer marks milestone complete | Employer |
| `milestone_approved` | Employer approves milestone | Freelancer |
| `review_received` | Employer submits a review | Freelancer |
| `review_replied` | Freelancer replies to a review | Employer |
| `document_verified` | AI or admin verifies a document | Freelancer |
| `document_rejected` | AI or admin rejects a document | Freelancer |

---

### Module 3 — Bell Icon + Unread Count Badge

A bell icon (`<Bell />` from lucide-react) is added to the main navigation bar (visible to all authenticated users). When the user has unread notifications, a red count badge appears over the bell:

```
🔔 3
```

The unread count is fetched via `GET /api/notifications/unread-count` and polled every 30 seconds. The badge disappears when unread count reaches 0.

---

### Module 4 — Notification Dropdown Panel

Clicking the bell opens a dropdown panel anchored to the bell icon. The panel shows:

- A header: "Notifications" with a "Mark all read" button
- A list of the 20 most recent notifications, grouped by Today / Earlier
- Each notification item: icon, message text, relative timestamp, and a dot indicator for unread status
- Clicking a notification item marks it as read and navigates to the relevant entity page
- A "View all" link at the bottom (deferred — see Non-Goals)

---

### Module 5 — API Endpoints

- `GET /api/notifications` — paginated list of the authenticated user's notifications, most recent first
- `GET /api/notifications/unread-count` — integer count of unread notifications
- `PATCH /api/notifications/:id/read` — mark a single notification as read
- `PATCH /api/notifications/read-all` — mark all as read for the current user

---

### Module 6 — `createNotification()` Server Utility

A reusable server-side utility `createNotification(db, { userId, type, entityType, entityId, message })` that inserts a row into `notifications`. Called by existing route handlers at the point where the triggering event occurs. The call is fire-and-forget (non-blocking) — a failed notification write must never block the primary action.

---

## Available to All Plans

Notifications are available on all plans for both employers and freelancers. No token consumption. No plan gate.

---

## Non-Goals (Out of Scope for This Feature)

- Email notifications
- Push notifications (mobile or browser)
- SMS notifications
- A dedicated `/notifications` full page (dropdown only in this phase)
- Notification preferences or mute settings
- Notification grouping (e.g. "3 new messages from Sarah Chen")
- Real-time websocket delivery (polling only — 30 second interval)
- Admin-sent broadcast notifications
- "View all" paginated notifications page
- Notification archiving or deletion by the user
- Read receipts visible to the sender

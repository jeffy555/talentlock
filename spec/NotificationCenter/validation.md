# TalentLock — Validation Guide: Notifications Centre

> **Purpose:** Verify the Notifications Centre is correctly implemented before it is considered complete. Run after all phases of `task.md` are marked done.
>
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix failures before marking a phase complete.

---

## Phase 1 Validation — Database

### V1.1 — `notifications` Table Exists With Correct Columns

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;
```

Expected columns: `id`, `user_id`, `type`, `entity_type`, `entity_id`, `message`, `read`, `created_at`

- [ ] All 8 columns present
- [ ] `read` has default `false`
- [ ] `created_at` has default `now()`
- [ ] `user_id` references `users.id`

---

## Phase 2 Validation — Backend Infrastructure

### V2.1 — Endpoints Registered

```bash
grep -r "notifications" artifacts/api-server/src/index.ts
```

- [ ] Notifications router is registered

### V2.2 — Route Order: `read-all` Before `/:id/read`

```bash
grep -n "read-all\|:id.*read\|read.*:id" artifacts/api-server/src/routes/notifications.ts
```

- [ ] `read-all` route appears on a LOWER line number than `/:id/read`

### V2.3 — Unread Count Endpoint

```bash
curl http://localhost:8080/api/notifications/unread-count \
  -H "Authorization: Bearer <user_token>"
```

- [ ] Returns `HTTP 200`
- [ ] Response: `{ "count": <integer> }`
- [ ] Returns `HTTP 401` without auth

### V2.4 — Get Notifications: Paginated, Auth-Gated

```bash
curl "http://localhost:8080/api/notifications?page=1&pageSize=5" \
  -H "Authorization: Bearer <user_token>"
```

- [ ] Returns `HTTP 200` with `{ data, total, unreadCount, page, pageSize }`
- [ ] `data` contains only notifications belonging to this user
- [ ] Returns `HTTP 401` without auth

### V2.5 — Mark Single Read

Submit a notification trigger (e.g. create a booking), then:

```bash
# Get a notification ID first
curl http://localhost:8080/api/notifications \
  -H "Authorization: Bearer <user_token>"
# Use an unread notification's id
curl -X PATCH http://localhost:8080/api/notifications/<id>/read \
  -H "Authorization: Bearer <user_token>"
```

- [ ] Returns `HTTP 200 { "success": true }`
- [ ] `notifications.read` is now `true` in DB
- [ ] Returns `HTTP 403` when notification belongs to a different user

### V2.6 — Mark All Read

```bash
curl -X PATCH http://localhost:8080/api/notifications/read-all \
  -H "Authorization: Bearer <user_token>"
```

- [ ] Returns `HTTP 200 { "success": true }`
- [ ] All notifications for this user are `read = true` in DB
- [ ] Notifications for OTHER users are NOT affected

```sql
-- Verify isolation
SELECT COUNT(*) FROM notifications
WHERE user_id != '<test_user_id>'
AND read = false;
-- Should be > 0 if other users have unread notifications
```

- [ ] Other users' unread count unchanged

### V2.7 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Backend Triggers

For each trigger, perform the action that fires it and verify a notification row was created.

### V3.1 — Booking Created → Freelancer Notified

Create a booking as an employer:

```sql
SELECT * FROM notifications
WHERE type = 'booking_created'
ORDER BY created_at DESC LIMIT 1;
```

- [ ] Row exists with `type = 'booking_created'`
- [ ] `user_id` is the freelancer's internal ID (not the employer's)
- [ ] `entity_type = 'booking'`, `entity_id` matches the booking
- [ ] `message` contains the employer's display name

### V3.2 — Booking Status Changed → Other Party Notified

Change a booking status (e.g. to accepted):

- [ ] Notification created with `type = 'booking_status_changed'`
- [ ] Recipient is the other party (not the actor)
- [ ] Message contains the new status

### V3.3 — Rate Counter-Proposed → Other Party Notified

Submit a counter-proposal on a booking rate:

- [ ] Notification with `type = 'rate_counter_proposed'`
- [ ] Message contains the proposed rate

### V3.4 — Rate Agreed → Both Parties Notified

Mark rate as agreed:

- [ ] Two notifications created with `type = 'rate_agreed'`
- [ ] One per party (employer + freelancer)

### V3.5 — Agreement Ready → Both Parties Notified

Generate an agreement:

- [ ] Two notifications with `type = 'agreement_ready'`
- [ ] Both the employer and freelancer receive one

### V3.6 — Agreement Signed → Other Party Notified

Sign an agreement as one party:

- [ ] Notification with `type = 'agreement_signed'` for the other party
- [ ] When fully signed: `type = 'agreement_fully_signed'` for both parties

### V3.7 — Meeting Requested → Freelancer Notified

Request a meeting:

- [ ] Notification with `type = 'meeting_requested'` for the freelancer

### V3.8 — Meeting Status Changed → Other Party Notified

Accept/decline/reschedule a meeting:

- [ ] Notification with `type = 'meeting_status_changed'`

### V3.9 — Milestone Completed → Employer Notified

Mark a milestone as complete:

- [ ] Notification with `type = 'milestone_completed'` for the employer
- [ ] Message contains the milestone name

### V3.10 — Milestone Approved → Freelancer Notified

Approve a milestone:

- [ ] Notification with `type = 'milestone_approved'` for the freelancer

### V3.11 — Review Received → Freelancer Notified

Submit a review:

- [ ] Notification with `type = 'review_received'` for the freelancer
- [ ] Message contains the star rating

### V3.12 — Review Replied → Employer Notified

Submit a review reply:

- [ ] Notification with `type = 'review_replied'` for the employer

### V3.13 — Document Verified → Freelancer Notified

Complete a document verification (AI or admin):

- [ ] Notification with `type = 'document_verified'` for the freelancer

### V3.14 — Document Rejected → Freelancer Notified

Reject a document:

- [ ] Notification with `type = 'document_rejected'` for the freelancer

### V3.15 — Fire-and-Forget: Primary Action Never Blocked

Simulate a notification DB failure (temporarily break the notifications table) and perform a booking creation:

```sql
-- Temporarily rename table to simulate failure
ALTER TABLE notifications RENAME TO notifications_disabled;
```

Create a booking. Then:

- [ ] Booking creation still returns `HTTP 201` — not blocked by notification failure
- [ ] Pino logs show a `warn` entry for the failed notification

```sql
ALTER TABLE notifications_disabled RENAME TO notifications;
```

---

## Phase 4 Validation — Frontend

### V4.1 — Bell Visible in Nav for Authenticated Users

Log in as any user:

- [ ] Bell icon visible in the nav bar
- [ ] Positioned before the user avatar/dropdown
- [ ] Not visible on `/sign-in`, `/sign-up`, `/onboarding`
- [ ] Not visible on `/f/:id` (public profile)

### V4.2 — Unread Count Badge

With unread notifications in the DB:

- [ ] Red badge with count visible over the bell
- [ ] Shows `99+` when count > 99
- [ ] Badge disappears when count reaches 0

### V4.3 — Bell Opens Dropdown

Click the bell:

- [ ] Panel opens, anchored to the right edge of the bell
- [ ] Panel width approximately 380px on desktop
- [ ] Panel closes when clicking outside

### V4.4 — Notifications Grouped

With notifications from today and earlier dates:

- [ ] `TODAY` group label appears for today's notifications
- [ ] `EARLIER` group label appears for older notifications
- [ ] Notifications ordered most recent first within each group

### V4.5 — Unread vs Read Styling

With a mix of read and unread notifications:

- [ ] Unread items have blue-50 background
- [ ] Unread items show blue dot on the left
- [ ] Read items have white background, no dot

### V4.6 — Click Notification: Mark Read + Navigate

Click an unread notification:

- [ ] Notification immediately changes to read styling (optimistic or after refetch)
- [ ] Browser navigates to the correct entity page
- [ ] `GET /api/notifications/{id}/read` is called (check Network tab)

Check entity routing:
- [ ] Booking notification → `/bookings/:id`
- [ ] Agreement notification → `/agreements/:id`
- [ ] Meeting notification → `/bookings/:entityId` (booking's page)
- [ ] Document notification → `/profile`
- [ ] Review notification → `/bookings/:entityId`

### V4.7 — Mark All Read

With unread notifications, click "Mark all read":

- [ ] All notifications immediately change to read styling
- [ ] Bell badge disappears
- [ ] `PATCH /api/notifications/read-all` called
- [ ] "Mark all read" button disappears (no unread left)

### V4.8 — Empty State

For a user with zero notifications:

- [ ] Bell icon renders (no badge)
- [ ] Clicking bell shows empty state: `"No notifications yet."`
- [ ] Subtitle text visible

### V4.9 — Loading State

On a slow connection (throttle in DevTools):

- [ ] 3 skeleton items shown while panel loads
- [ ] Badge absent while unread count is loading

### V4.10 — Polling

Open the browser Network tab while on any authenticated page:

- [ ] `GET /api/notifications/unread-count` fires every 30 seconds
- [ ] Polling stops when you switch to a different browser tab (background polling disabled)
- [ ] Polling resumes when you return to the tab

### V4.11 — Error Boundary

Temporarily break the `NotificationBell` component (add a `throw new Error()` at the top):

- [ ] The nav bar still renders correctly
- [ ] Other nav items (logo, links, user avatar) are unaffected
- [ ] No red error screen or broken layout

Remove the thrown error after this test.

---

## Security Validation

### S1 — User Cannot Read Another User's Notifications

```bash
# Get notification ID belonging to User B
# Try to mark it read as User A
curl -X PATCH http://localhost:8080/api/notifications/<user_B_notification_id>/read \
  -H "Authorization: Bearer <user_A_token>"
```

- [ ] Returns `HTTP 403`

### S2 — Notification List Only Returns Own Notifications

```bash
curl http://localhost:8080/api/notifications \
  -H "Authorization: Bearer <user_A_token>"
```

Inspect all returned notification `user_id` values:

- [ ] Every notification in the response belongs to User A
- [ ] No notifications from other users are returned

### S3 — Unauthenticated Access Blocked

```bash
curl http://localhost:8080/api/notifications
curl http://localhost:8080/api/notifications/unread-count
curl -X PATCH http://localhost:8080/api/notifications/read-all
```

- [ ] All three return `HTTP 401`

---

## Regression Validation

### R1 — Existing Booking Operations Unaffected

Create a booking, update its status, add a milestone — verify all work correctly with the notification triggers added:

- [ ] `POST /api/bookings` still returns `HTTP 201`
- [ ] `PATCH /api/bookings/:id` still returns `HTTP 200`
- [ ] Booking detail page still loads correctly

### R2 — Agreement Operations Unaffected

Generate and sign an agreement:

- [ ] `POST /api/agreements` still works
- [ ] `POST /api/agreements/:id/sign` still works

### R3 — Meeting Operations Unaffected

Create and update a meeting:

- [ ] `POST /api/meetings` still returns `HTTP 201`
- [ ] `PATCH /api/meetings/:id` still works

### R4 — Review Operations Unaffected

Submit a review and reply:

- [ ] `POST /api/reviews` still returns `HTTP 201`
- [ ] `POST /api/reviews/:id/reply` still works

### R5 — Document Verification Unaffected

Trigger a document verification:

- [ ] `POST /api/documents/confirm` still returns `HTTP 201`
- [ ] AI review still fires
- [ ] Document status still updates

### R6 — TypeCheck and Build Pass

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
| Phase 1 — Database | ✅ | Cursor Agent | 2026-06-05 |
| Phase 2 — Backend Infrastructure | ✅ | Cursor Agent | 2026-06-05 |
| Phase 3 — Backend Triggers | ✅ | Cursor Agent | 2026-06-05 |
| Phase 4 — Frontend | ✅ | Cursor Agent | 2026-06-05 |
| Security Checks | ✅ | Cursor Agent | 2026-06-05 |
| Regression Checks | ✅ | Cursor Agent | 2026-06-05 |
| **Feature Complete** | ✅ | Cursor Agent | 2026-06-05 |

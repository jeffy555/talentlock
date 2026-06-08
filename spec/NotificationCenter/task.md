# TalentLock — Task Breakdown: Notifications Centre

## Summary

Build a complete in-app notification system. Four phases: Database → Backend Infrastructure → Backend Triggers → Frontend. Phases 2 and 3 are deliberately separated because Phase 3 touches 15 existing route files and should be verified independently.

---

## Phase 1 — Database

### Task 1.1 — Inspect for Existing Notifications Table

```bash
grep -r "notifications" lib/db/src/schema/*.ts
```

If a `notifications` table already exists — confirm its shape and skip Task 1.2.

### Task 1.2 — Create `notifications` Table

**File:** `lib/db/src/schema/` — add to the appropriate schema file

```ts
export const notifications = pgTable('notifications', {
  id:         serial('id').primaryKey(),
  userId:     text('user_id').notNull().references(() => users.id),
  type:       text('type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId:   text('entity_id').notNull(),
  message:    text('message').notNull(),
  read:       boolean('read').notNull().default(false),
  createdAt:  timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### Task 1.3 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify in Neon: `notifications` table exists with all 8 columns before proceeding.

---

## Phase 2 — Backend Infrastructure

### Task 2.1 — Create `createNotification()` Utility

**File:** `artifacts/api-server/src/lib/createNotification.ts` (create new)

```ts
/**
 * IMPORTANT: Never await this function from route handlers.
 * Always use: createNotification(...).catch(err => req.log.warn(err, 'notification write failed'))
 * A failed notification must never block the primary action.
 */
export async function createNotification(
  db: DB,
  params: {
    userId: string;
    type: string;
    entityType: string;
    entityId: string;
    message: string;
  }
): Promise<void> {
  await db.insert(notifications).values({
    userId: params.userId,
    type: params.type,
    entityType: params.entityType,
    entityId: params.entityId,
    message: params.message,
    read: false,
    createdAt: new Date(),
  });
}
```

Also export the `NotificationType` constant map:

```ts
export const NotificationType = {
  BOOKING_CREATED:          'booking_created',
  BOOKING_STATUS_CHANGED:   'booking_status_changed',
  RATE_COUNTER_PROPOSED:    'rate_counter_proposed',
  RATE_AGREED:              'rate_agreed',
  AGREEMENT_READY:          'agreement_ready',
  AGREEMENT_SIGNED:         'agreement_signed',
  AGREEMENT_FULLY_SIGNED:   'agreement_fully_signed',
  MEETING_REQUESTED:        'meeting_requested',
  MEETING_STATUS_CHANGED:   'meeting_status_changed',
  MILESTONE_COMPLETED:      'milestone_completed',
  MILESTONE_APPROVED:       'milestone_approved',
  REVIEW_RECEIVED:          'review_received',
  REVIEW_REPLIED:           'review_replied',
  DOCUMENT_VERIFIED:        'document_verified',
  DOCUMENT_REJECTED:        'document_rejected',
} as const;
```

### Task 2.2 — Create Notifications Route File

**File:** `artifacts/api-server/src/routes/notifications.ts` (create new)

Implement four endpoints. **CRITICAL: register `read-all` BEFORE `/:id/read`** (Risk 4 from plan.md).

#### `GET /api/notifications`

Requires Clerk auth. Returns paginated notifications for the current user, ordered by `createdAt DESC`.

Query params: `?page=1&pageSize=20`

Response:
```ts
{
  data: {
    id: number,
    type: string,
    entityType: string,
    entityId: string,
    message: string,
    read: boolean,
    createdAt: string
  }[],
  total: number,
  unreadCount: number,
  page: number,
  pageSize: number
}
```

#### `GET /api/notifications/unread-count`

Requires Clerk auth. Returns `{ count: number }` only. Lightweight — polled every 30 seconds.

```ts
const result = await db
  .select({ count: count() })
  .from(notifications)
  .where(and(
    eq(notifications.userId, internalUserId),
    eq(notifications.read, false)
  ));
return res.json({ count: result[0]?.count ?? 0 });
```

#### `PATCH /api/notifications/read-all` ← register FIRST

Requires Clerk auth. Marks all notifications as read for the current user.

```ts
await db.update(notifications)
  .set({ read: true })
  .where(eq(notifications.userId, internalUserId));
return res.json({ success: true });
```

#### `PATCH /api/notifications/:id/read` ← register SECOND

Requires Clerk auth. Marks a single notification as read. Verifies the notification belongs to the current user.

```ts
const notification = await db.query.notifications.findFirst({
  where: eq(notifications.id, parseInt(id))
});
if (!notification) return res.status(404).json({ error: 'Not found' });
if (notification.userId !== internalUserId) return res.status(403).json({ error: 'Forbidden' });
await db.update(notifications).set({ read: true }).where(eq(notifications.id, parseInt(id)));
return res.json({ success: true });
```

### Task 2.3 — Register Route

**File:** `artifacts/api-server/src/index.ts`

Register `notificationsRouter` from `./routes/notifications`. Also register `GET /api/notifications/unread-count` — confirm it does not conflict with the router prefix.

### Task 2.4 — OpenAPI Spec + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add:
- `GET /api/notifications`
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/read-all`
- `PATCH /api/notifications/{id}/read`

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 3

---

## Phase 3 — Backend Triggers

> This phase modifies 15 existing route handler files. Read `plan.md` Q3 and Risk 1 before starting. Every single trigger call must use the fire-and-forget `.catch()` pattern — no `await`.

Import `createNotification` and `NotificationType` at the top of each modified file:

```ts
import { createNotification, NotificationType } from '../lib/createNotification';
```

Use message templates from `plan.md` — resolve `{name}` placeholders by fetching the relevant user's display name before the call.

### Task 3.1 — `bookings.ts` — Booking Created

When `POST /api/bookings` succeeds: notify the freelancer.

```ts
createNotification(db, {
  userId: booking.freelancerId,
  type: NotificationType.BOOKING_CREATED,
  entityType: 'booking',
  entityId: booking.id,
  message: `"${employerDisplayName}" has sent you a booking request`,
}).catch(err => req.log.warn({ err }, 'notification write failed'));
```

### Task 3.2 — `bookings.ts` — Booking Status Changed

When `PATCH /api/bookings/:id` changes `status`: notify the other party.

```ts
if (newStatus && newStatus !== oldStatus) {
  const recipientId = isEmployer ? booking.freelancerId : booking.employerId;
  createNotification(db, {
    userId: recipientId,
    type: NotificationType.BOOKING_STATUS_CHANGED,
    entityType: 'booking',
    entityId: bookingId,
    message: `Your booking with ${otherPartyName} is now ${newStatus}`,
  }).catch(err => req.log.warn({ err }, 'notification write failed'));
}
```

### Task 3.3 — `bookings.ts` — Rate Counter-Proposed

When `PATCH /api/bookings/:id` sets `negotiationStatus = 'negotiating'` with a new `proposedRate`: notify the other party.

```ts
createNotification(db, {
  userId: recipientId,
  type: NotificationType.RATE_COUNTER_PROPOSED,
  entityType: 'booking',
  entityId: bookingId,
  message: `${proposerName} proposed a new rate of $${proposedRate}/hr`,
}).catch(err => req.log.warn({ err }, 'notification write failed'));
```

### Task 3.4 — `bookings.ts` — Rate Agreed

When `PATCH /api/bookings/:id` sets `negotiationStatus = 'agreed'`: notify BOTH parties.

```ts
// Notify employer
createNotification(db, { userId: booking.employerId, type: NotificationType.RATE_AGREED, entityType: 'booking', entityId: bookingId, message: `Both parties agreed on a rate of $${rate}/hr` })
  .catch(err => req.log.warn({ err }, 'notification write failed'));
// Notify freelancer
createNotification(db, { userId: booking.freelancerId, type: NotificationType.RATE_AGREED, entityType: 'booking', entityId: bookingId, message: `Both parties agreed on a rate of $${rate}/hr` })
  .catch(err => req.log.warn({ err }, 'notification write failed'));
```

### Task 3.5 — `agreements.ts` — Agreement Ready

When `POST /api/agreements` succeeds: notify BOTH parties.

```ts
// Notify both employer and freelancer
[booking.employerId, booking.freelancerId].forEach(userId => {
  createNotification(db, { userId, type: NotificationType.AGREEMENT_READY, entityType: 'agreement', entityId: agreement.id, message: 'An agreement is ready for your signature' })
    .catch(err => req.log.warn({ err }, 'notification write failed'));
});
```

### Task 3.6 — `agreements.ts` — Agreement Signed / Fully Signed

When `POST /api/agreements/:id/sign` succeeds:

- If only one party has now signed → `AGREEMENT_SIGNED` to the other party
- If both parties have now signed → `AGREEMENT_FULLY_SIGNED` to both parties

```ts
const updatedAgreement = /* fetch after sign */;
if (updatedAgreement.freelancerSignedAt && updatedAgreement.employerSignedAt) {
  // Fully signed
  [booking.employerId, booking.freelancerId].forEach(userId => {
    createNotification(db, { userId, type: NotificationType.AGREEMENT_FULLY_SIGNED, entityType: 'agreement', entityId: agreementId, message: 'Agreement fully signed — your document is ready to download' })
      .catch(err => req.log.warn({ err }, 'notification write failed'));
  });
} else {
  // Partially signed — notify the other party
  createNotification(db, { userId: otherPartyId, type: NotificationType.AGREEMENT_SIGNED, entityType: 'agreement', entityId: agreementId, message: `${signerName} signed the agreement` })
    .catch(err => req.log.warn({ err }, 'notification write failed'));
}
```

### Task 3.7 — `meetings.ts` — Meeting Requested

When `POST /api/meetings` succeeds: notify the freelancer.

```ts
createNotification(db, {
  userId: meeting.freelancerId,
  type: NotificationType.MEETING_REQUESTED,
  entityType: 'meeting',
  entityId: meeting.id,
  message: `${employerName} requested a discovery meeting`,
}).catch(err => req.log.warn({ err }, 'notification write failed'));
```

### Task 3.8 — `meetings.ts` — Meeting Status Changed

When `PATCH /api/meetings/:id` changes status: notify the other party.

```ts
createNotification(db, {
  userId: recipientId,
  type: NotificationType.MEETING_STATUS_CHANGED,
  entityType: 'meeting',
  entityId: meetingId,
  message: `Your meeting with ${otherPartyName} has been ${newStatus}`,
}).catch(err => req.log.warn({ err }, 'notification write failed'));
```

### Task 3.9 — `bookings.ts` — Milestone Completed

When `PATCH /api/bookings/:id` sets a milestone to `completed`: notify the employer.

```ts
createNotification(db, {
  userId: booking.employerId,
  type: NotificationType.MILESTONE_COMPLETED,
  entityType: 'milestone',
  entityId: bookingId,
  message: `${freelancerName} marked milestone '${milestoneName}' as complete`,
}).catch(err => req.log.warn({ err }, 'notification write failed'));
```

### Task 3.10 — `bookings.ts` — Milestone Approved

When `PATCH /api/bookings/:id` sets a milestone to `approved`: notify the freelancer.

```ts
createNotification(db, {
  userId: booking.freelancerId,
  type: NotificationType.MILESTONE_APPROVED,
  entityType: 'milestone',
  entityId: bookingId,
  message: `Milestone '${milestoneName}' has been approved`,
}).catch(err => req.log.warn({ err }, 'notification write failed'));
```

### Task 3.11 — `reviews.ts` — Review Received

When `POST /api/reviews` succeeds: notify the freelancer.

```ts
createNotification(db, {
  userId: review.freelancerId,
  type: NotificationType.REVIEW_RECEIVED,
  entityType: 'review',
  entityId: bookingId,
  message: `You received a ${rating}-star review from ${employerName}`,
}).catch(err => req.log.warn({ err }, 'notification write failed'));
```

### Task 3.12 — `reviews.ts` — Review Replied

When `POST /api/reviews/:id/reply` succeeds: notify the employer.

```ts
createNotification(db, {
  userId: review.employerId,
  type: NotificationType.REVIEW_REPLIED,
  entityType: 'review',
  entityId: review.bookingId,
  message: `${freelancerName} replied to your review`,
}).catch(err => req.log.warn({ err }, 'notification write failed'));
```

### Task 3.13 — `documents.ts` — Document Verified

When `triggerDocumentReview()` sets `status = 'verified'`: notify the freelancer.

**File:** `artifacts/api-server/src/lib/documentReview.ts`

```ts
createNotification(db, {
  userId: freelancerId,
  type: NotificationType.DOCUMENT_VERIFIED,
  entityType: 'document',
  entityId: freelancerId,
  message: `Your ${documentType.replace('_', ' ')} has been verified ✓`,
}).catch(err => logger.warn({ err }, 'notification write failed'));
// Note: use logger (not req.log) since this is a utility, not a route handler
```

### Task 3.14 — `documents.ts` — Document Rejected

When `triggerDocumentReview()` sets `status = 'rejected'` OR when admin PATCH sets `status = 'rejected'`:

```ts
createNotification(db, {
  userId: freelancerId,
  type: NotificationType.DOCUMENT_REJECTED,
  entityType: 'document',
  entityId: freelancerId,
  message: `Your ${documentType.replace('_', ' ')} was not verified — please re-upload`,
}).catch(err => logger.warn({ err }, 'notification write failed'));
```

Also add to `PATCH /api/admin/documents/:id` when `verdict = 'rejected'`.

---

## Phase 4 — Frontend

### Task 4.1 — Inspect Nav Component

```bash
find artifacts/talentlock/src -name "*.tsx" | xargs grep -l "nav\|Nav\|header\|Header" | head -10
```

Read the confirmed nav file. Document exact file path. Understand where auth state is accessed.

### Task 4.2 — Create `notificationRoutes.ts` Utility

**File:** `artifacts/talentlock/src/lib/notificationRoutes.ts` (create new)

Use the exact `getNotificationRoute()` function from `plan.md` Q7.

### Task 4.3 — Verify Generated Hooks

Confirm codegen produced:
- `useGetNotifications()`
- `useGetNotificationsUnreadCount()`
- `usePatchNotificationsReadAll()`
- `usePatchNotificationsIdRead()`

If missing, re-run codegen.

### Task 4.4 — Create `<UnreadBadge />` Component

**File:** `artifacts/talentlock/src/components/UnreadBadge.tsx` (create new)

See `UI.md` Component 1 for full spec.

### Task 4.5 — Create `<NotificationItem />` Component

**File:** `artifacts/talentlock/src/components/NotificationItem.tsx` (create new)

See `UI.md` Component 2 for full spec.

### Task 4.6 — Create `<NotificationPanel />` Component

**File:** `artifacts/talentlock/src/components/NotificationPanel.tsx` (create new)

See `UI.md` Component 3 for full spec — list, groups, mark all read, empty state, error state.

### Task 4.7 — Create `<NotificationBell />` Component

**File:** `artifacts/talentlock/src/components/NotificationBell.tsx` (create new)

See `UI.md` Component 4 for full spec — Popover trigger with bell icon, badge, and panel. Includes error boundary wrapping.

### Task 4.8 — Add Bell to Navigation

**File:** Nav component (path confirmed in Task 4.1)

Add `<NotificationBell />` to the right side of the nav, before the user avatar:

```tsx
// Render only when user is authenticated
{isAuthenticated && <NotificationBell />}
```

Wrap with `<ErrorBoundary fallback={null}>` as per plan.md Risk 3.

---

## Acceptance Criteria

- [x] `notifications` table exists with all 8 columns
- [x] `createNotification()` utility created with `NotificationType` constants
- [x] `createNotification()` JSDoc comment warns against awaiting
- [x] `GET /api/notifications` returns paginated list for current user
- [x] `GET /api/notifications/unread-count` returns `{ count: number }`
- [x] `PATCH /api/notifications/read-all` registered BEFORE `/:id/read`
- [x] `PATCH /api/notifications/read-all` marks all read for current user only
- [x] `PATCH /api/notifications/:id/read` returns 403 when notification belongs to different user
- [x] All 4 codegen hooks confirmed
- [x] All 14 trigger points added to existing route handlers
- [x] Every trigger uses fire-and-forget `.catch()` — no `await`
- [x] `booking_created` → freelancer notified
- [x] `booking_status_changed` → other party notified
- [x] `rate_counter_proposed` → other party notified
- [x] `rate_agreed` → both parties notified
- [x] `agreement_ready` → both parties notified
- [x] `agreement_signed` → other party notified
- [x] `agreement_fully_signed` → both parties notified
- [x] `meeting_requested` → freelancer notified
- [x] `meeting_status_changed` → other party notified
- [x] `milestone_completed` → employer notified
- [x] `milestone_approved` → freelancer notified
- [x] `review_received` → freelancer notified
- [x] `review_replied` → employer notified
- [x] `document_verified` → freelancer notified
- [x] `document_rejected` → freelancer notified
- [x] Bell icon visible in nav for all authenticated users
- [x] Red count badge shown when unread count > 0
- [x] Badge hidden when count is 0
- [x] Unread count polls every 30 seconds, stops when tab is hidden
- [x] Dropdown opens on bell click, closes on outside click
- [x] Notifications grouped by Today / Earlier
- [x] Unread items show blue dot indicator
- [x] Clicking notification marks it read and navigates to correct page
- [x] "Mark all read" button marks all read and clears badge
- [x] Empty state shown when no notifications
- [x] Error boundary prevents bell crash from breaking the nav
- [x] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 → 1.2 → 1.3
Task 2.1 → 2.2 → 2.3 → 2.4 (codegen + typecheck)
Task 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8 → 3.9 → 3.10 → 3.11 → 3.12 → 3.13 → 3.14
Task 4.1 (inspect) → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.8
```

# TalentLock — Implementation Plan: Notifications Centre

> **Status: READY FOR IMPLEMENTATION (revised after codebase audit — June 2026)**
> Read this file alongside `task.md` and `UI.md` before writing any code.
> If this file and `task.md` conflict on architecture decisions, **this file wins**.

---

## Executive Summary

TalentLock already has a **partial** notification system. The Notifications Centre spec is not greenfield — it is a **upgrade and completion** effort:

| Layer | Current state | Target (spec) |
|-------|---------------|---------------|
| Database | `notifications` table with `title`, `link`, legacy `type` values | `entityType` + `entityId`, 15 typed events, no `title`/`link` |
| API | 3 endpoints; no pagination; no `unread-count`; `POST read-all` | 4 endpoints; paginated list; lightweight unread count; `PATCH read-all` |
| Triggers | 2 inline inserts (`booking_update`, `job_interest`) | 15 events via shared `createNotification()` utility |
| Frontend | Bell + Popover embedded in `AppLayout.tsx` | Extracted components; Today/Earlier groups; entity-based routing |

**Recommended approach:** Four phases (Database → Backend infra → Triggers → Frontend), matching `task.md`. Phase 1 is a **schema migration**, not table creation.

---

## Pre-Implementation Audit (Completed)

Run results from the live codebase (June 2026):

### A1 — Navigation component

**Confirmed:** `artifacts/talentlock/src/components/layout/AppLayout.tsx`

- Bell already lives in the right-side header cluster (before avatar dropdown)
- Uses shadcn `<Popover>` — matches spec Q6
- Renders only when `dbUser` is present (authenticated)
- **Action:** Refactor in place — extract bell UI into `<NotificationBell />`; do not add a second bell elsewhere

### A2 — `userId` resolution pattern

**Confirmed:** `artifacts/api-server/src/routes/notifications.ts`

```ts
async function resolveUserId(clerkId: string): Promise<number | null> {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return u?.id ?? null;
}
```

- `users.id` is `serial` (integer) — **keep `userId` as integer**, not `text` as written in an early task draft
- Recipient resolution: fetch entity → resolve profile → map to `users.id` via `clerkId` or `userId` column on profile tables
- Bookings store **profile IDs** in `employerId`/`freelancerId` — same pattern as Reviews & Ratings

### A3 — Meetings frontend routes

**Confirmed:** `artifacts/talentlock/src/App.tsx` has standalone meeting pages:

- `/meetings` — list
- `/meetings/:id` — detail

**Decision (updates Q7):** `meeting` notifications navigate to `/meetings/${entityId}`.

### A4 — Existing `notifications` table

**Confirmed:** `lib/db/src/schema/notifications.ts`

Current columns:

```
id, user_id (integer), type, title, message, link, read, created_at
```

Index: `notifications_user_idx` on `(user_id, read, created_at)`.

### A5 — Existing API routes

**Confirmed:** `artifacts/api-server/src/routes/notifications.ts` + registered in `artifacts/api-server/src/routes/index.ts`

| Endpoint | Current | Spec target |
|----------|---------|-------------|
| List | `GET /notifications` → flat array, limit 50 | Paginated `{ data, total, page, pageSize, unreadCount }` |
| Unread count | ❌ missing (derived client-side from full list) | `GET /notifications/unread-count` → `{ count }` |
| Mark one read | `PATCH /notifications/:id/read` | Same |
| Mark all read | `POST /notifications/read-all` | `PATCH /notifications/read-all` (register **before** `/:id/read`) |

OpenAPI (`lib/api-spec/openapi.yaml`) matches the **legacy** shape (`title`, `link`, array response).

### A6 — Existing triggers (inline, not utility)

| File | Event | Type string | Recipient |
|------|-------|-------------|-----------|
| `routes/bookings.ts` | `POST /bookings` success | `booking_update` | Freelancer |
| `routes/jobInterests.ts` | Interest expressed | `job_interest` | Employer |

Both use `await db.insert(notificationsTable)` inside try/catch — acceptable pattern but must migrate to fire-and-forget `createNotification().catch()`.

**`job_interest` is out of spec scope** — keep it working after schema migration (map to `entityType: 'job'`, `entityId: jobId`) or document as additive.

### A7 — Frontend bell (partial)

**Confirmed:** `AppLayout.tsx` lines ~148–238

- 30s `refetchInterval` on full list ✅
- Gold badge (spec UI wants red `bg-red-500`) — align in Phase 4
- Shows `title` + `message` (spec shows `message` only + entity icon)
- Navigation via `link` field (spec uses `getNotificationRoute(entityType, entityId)`)
- No Today/Earlier grouping
- No error boundary around bell

---

## Gap Analysis

### Must change

1. **Schema** — add `entity_type`, `entity_id`; remove `title`, `link` after backfill
2. **`createNotification()` utility** — centralise all writes
3. **`GET /notifications/unread-count`** — stop polling the full list for badge count
4. **OpenAPI + codegen** — new response shapes and hooks
5. **14 spec trigger points** — agreements, meetings, milestones, reviews, documents, booking status/negotiation
6. **Frontend extraction** — `NotificationBell`, `NotificationPanel`, `NotificationItem`, `UnreadBadge`, `notificationRoutes.ts`

### Can reuse

1. `notifications` table name and index strategy
2. `AppLayout.tsx` bell placement and Popover shell
3. `resolveUserId()` pattern
4. Existing booking-created notification logic (rewrite to utility + new type `booking_created`)
5. Clerk auth on all notification endpoints

### Out of scope (per `features.md`)

- Email / push / SMS
- `/notifications` full page
- User preferences / mute
- WebSockets (30s polling only)
- Admin broadcast notifications

---

## Resolved Questions (Updated)

### Q1 — Navigation component

**Decision:** `artifacts/talentlock/src/components/layout/AppLayout.tsx` — extract bell; do not duplicate.

### Q2 — `userId` resolution

**Decision:** Integer `users.id` via `clerkId` lookup. For recipients on bookings, resolve profile → user:

```ts
// booking.freelancerId is freelancer_profiles.id — NOT users.id
const [fp] = await db.select({ userId: usersTable.id })
  .from(freelancerProfilesTable)
  .innerJoin(usersTable, eq(usersTable.clerkId, freelancerProfilesTable.clerkId))
  .where(eq(freelancerProfilesTable.id, booking.freelancerId));
```

### Q3 — Fire-and-forget

**Decision:** Option B — log via Pino, never throw, never `await`:

```ts
createNotification(db, params).catch(err =>
  req.log.warn({ err, type: params.type, entityId: params.entityId }, 'notification write failed')
);
```

### Q4 — Phase structure

**Decision:** Four phases (unchanged):

| Phase | Scope |
|-------|-------|
| 1 | Schema migration (`entity_type`, `entity_id`; drop `title`, `link`) |
| 2 | `createNotification()` + 4 API endpoints + OpenAPI + codegen |
| 3 | 15 trigger hooks in existing route handlers |
| 4 | Frontend component extraction + UI spec alignment |

### Q5 — Bell position

**Decision:** Already correct in `AppLayout` — right side, before avatar. Keep.

### Q6 — Panel component

**Decision:** shadcn `<Popover>` — already in use. Keep.

### Q7 — Entity navigation mapping (revised)

```ts
// artifacts/talentlock/src/lib/notificationRoutes.ts
export function getNotificationRoute(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'booking':   return `/bookings/${entityId}`;
    case 'agreement': return `/agreements/${entityId}`;
    case 'meeting':   return `/meetings/${entityId}`;  // standalone page confirmed
    case 'review':    return `/bookings/${entityId}`;  // review lives on booking page
    case 'document':  return `/profile`;
    case 'milestone': return `/bookings/${entityId}`;
    case 'job':       return `/jobs/${entityId}`;      // legacy job_interest support
    default:          return `/dashboard`;
  }
}
```

### Q8 — Polling

**Decision:** 30 seconds on `useGetNotificationsUnreadCount` with `refetchIntervalInBackground: false`. Full list fetched only when popover opens (or on open + after mark-read).

### Q9 — Deleted entities

**Decision:** Navigate anyway; destination page handles 404.

---

## Phase 1 — Database Migration

### 1.1 Update schema

**File:** `lib/db/src/schema/notifications.ts`

Target shape:

```ts
export const notificationsTable = pgTable("notifications", {
  id:         serial("id").primaryKey(),
  userId:     integer("user_id").notNull(),           // users.id
  type:       text("type").notNull(),                 // NotificationType enum string
  entityType: text("entity_type").notNull(),
  entityId:   text("entity_id").notNull(),
  message:    text("message").notNull(),
  read:       boolean("read").notNull().default(false),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUser: index("notifications_user_idx").on(t.userId, t.read, t.createdAt),
}));
```

### 1.2 Migration script

**File:** `scripts/migrate-notifications-phase1.mjs`

1. Add nullable `entity_type`, `entity_id`
2. Backfill from existing rows:
   - `link = '/bookings/15'` → `entity_type='booking'`, `entity_id='15'`
   - `link = '/jobs/3'` → `entity_type='job'`, `entity_id='3'`
   - `type='booking_update'` → `type='booking_created'`
3. Drop `title`, `link`
4. Set `entity_type`/`entity_id` NOT NULL

### 1.3 Push schema

```bash
pnpm --filter @workspace/db run push
```

Verify with `spec/NotificationCenter/validation.md` V1.1.

---

## Phase 2 — Backend Infrastructure

### 2.1 `createNotification()` utility

**File:** `artifacts/api-server/src/lib/createNotification.ts`

- Export `createNotification(db, params)` and `NotificationType` constant map (15 types from `features.md`)
- JSDoc: never await from route handlers

### 2.2 Rewrite notifications routes

**File:** `artifacts/api-server/src/routes/notifications.ts`

Route order (hard requirement):

```ts
router.get("/notifications/unread-count", ...);
router.get("/notifications", ...);           // ?page=1&pageSize=20
router.patch("/notifications/read-all", ...); // FIRST
router.patch("/notifications/:id/read", ...); // SECOND
```

Remove `POST /notifications/read-all` (breaking change — update OpenAPI + frontend hook).

### 2.3 OpenAPI + codegen

**File:** `lib/api-spec/openapi.yaml`

Add/update:

- `Notification` schema: drop `title`, `link`; add `entityType`, `entityId`
- `GET /notifications` → paginated `NotificationsListResult`
- `GET /notifications/unread-count` → `{ count: integer }`
- `PATCH /notifications/read-all`
- `PATCH /notifications/{id}/read`

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen: `indexFiles: false`, `index.ts` exports only `./generated/api`, `pnpm run typecheck`.

Expected hooks:

- `useListNotifications` (paginated)
- `useGetNotificationsUnreadCount`
- `usePatchNotificationsReadAll`
- `usePatchNotificationsIdRead`

### 2.4 Migrate existing inline inserts

Replace direct `db.insert(notificationsTable)` in:

- `routes/bookings.ts` → `createNotification` + `NotificationType.BOOKING_CREATED`
- `routes/jobInterests.ts` → `entityType: 'job'` (retain feature, not in spec's 15 types)

---

## Phase 3 — Backend Triggers

Modify existing route handlers only — no new routes. Full trigger list in `task.md` Tasks 3.1–3.14.

| File | Events |
|------|--------|
| `routes/bookings.ts` | created, status changed, rate counter, rate agreed, milestone completed/approved |
| `routes/agreements.ts` | ready, signed, fully signed |
| `routes/meetings.ts` | requested, status changed |
| `routes/reviews.ts` | received, replied |
| `lib/documentReview.ts` + `routes/admin.ts` | verified, rejected |

### Trigger rules

1. **One notification per logical event** — when `rate_agreed` fires, do not also fire `booking_status_changed`
2. **Fire-and-forget only** — `.catch()` + `req.log.warn`, never `await`
3. **Both parties** — `rate_agreed`, `agreement_ready`, `agreement_fully_signed` notify employer AND freelancer (resolve both to `users.id`)
4. **Message templates** — use exact strings from original plan table; resolve `{name}` server-side before insert

---

## Phase 4 — Frontend

### 4.1 Extract components from `AppLayout.tsx`

| Component | File |
|-----------|------|
| `UnreadBadge` | `artifacts/talentlock/src/components/UnreadBadge.tsx` |
| `NotificationItem` | `artifacts/talentlock/src/components/NotificationItem.tsx` |
| `NotificationPanel` | `artifacts/talentlock/src/components/NotificationPanel.tsx` |
| `NotificationBell` | `artifacts/talentlock/src/components/NotificationBell.tsx` |
| Route helper | `artifacts/talentlock/src/lib/notificationRoutes.ts` |

### 4.2 Wire up in `AppLayout.tsx`

```tsx
<ErrorBoundary fallback={null}>
  <NotificationBell />
</ErrorBoundary>
```

### 4.3 Data fetching strategy

| Concern | Hook | When |
|---------|------|------|
| Badge count | `useGetNotificationsUnreadCount` | Poll every 30s, `refetchIntervalInBackground: false` |
| Panel list | `useListNotifications({ page: 1, pageSize: 20 })` | Fetch when popover opens; refetch after mark-read |
| Mark one | `usePatchNotificationsIdRead` | On item click, before navigate |
| Mark all | `usePatchNotificationsReadAll` | Header button |

### 4.4 UI alignment (`UI.md`)

- Red badge (`bg-red-500`) instead of current gold badge
- Today / Earlier grouping via `date-fns` `isToday`
- Entity-type icons (Briefcase, FileText, Calendar, Star, ShieldCheck, CheckSquare)
- Single `message` line (drop separate `title`)
- Navigate via `getNotificationRoute(n.entityType, n.entityId)` — not `link`

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| Schema migration breaks existing notifications | Backfill script + verify row count before/after |
| `read-all` route shadowed by `:id` | Register `read-all` first; add validation script check |
| `await createNotification` blocks primary action | Code review rule; JSDoc on utility |
| Double notifications on status transitions | One trigger per event; document in each handler |
| Bell crash breaks nav | `ErrorBoundary fallback={null}` |
| Booking profile ID vs user ID confusion | Reuse Reviews & Ratings resolution helpers |
| OpenAPI breaking change breaks `AppLayout` | Phase 2 codegen before Phase 4 frontend |

---

## Execution Order

```
Phase 1: schema + migration script + push + V1.1 validation
    ↓
Phase 2: createNotification + routes + OpenAPI + codegen + typecheck
    ↓
Phase 3: 14 trigger points (one file at a time, verify after each)
    ↓
Phase 4: extract components + AppLayout integration + browser validation
```

**Do not start Phase 4 until Phase 2 codegen is confirmed.**

---

## Validation

After each phase, run checks from `spec/NotificationCenter/validation.md`.

Add automation (recommended):

```
scripts/verify-notifications-phase1.mjs   — schema columns
scripts/verify-notifications-phase2.mjs   — endpoints + route order
scripts/verify-notifications-phase3.mjs   — trigger code presence
scripts/verify-notifications-phase4.mjs   — frontend component wiring
scripts/verify-notifications-all.mjs      — runner
```

---

## Phase Sign-Off

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Schema migration (`entity_type`, `entity_id`) | ✅ Complete |
| Phase 2 | `createNotification()` + 4 endpoints + codegen | ✅ Complete |
| Phase 3 | 15 event triggers in existing routes | ✅ Complete |
| Phase 4 | Frontend extraction + UI spec alignment | ✅ Complete |

---

## Pre-Implementation Checklist

- [x] `project.md` read
- [x] `spec/NotificationCenter/features.md` read
- [x] `spec/NotificationCenter/clarify.md` read
- [x] Codebase audit complete (this document)
- [ ] `spec/NotificationCenter/task.md` read before coding
- [ ] `spec/NotificationCenter/UI.md` read before Phase 4
- [ ] `spec/NotificationCenter/validation.md` read before sign-off

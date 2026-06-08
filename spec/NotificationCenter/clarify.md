# TalentLock — Clarification & Verification: Notifications Centre

This file audits `features.md` against `project.md` to surface gaps, architectural risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `users` table exists with `id` as primary key | Confirmed in `project.md` |
| `bookings` table exists with status changes via `PATCH /api/bookings/:id` | Confirmed |
| `agreements` table exists with signing via `POST /api/agreements/:id/sign` | Confirmed |
| `meetings` table exists with `PATCH /api/meetings/:id` | Confirmed |
| `reviews` table + `POST /api/reviews` exists | Confirmed — built in reviews-ratings feature |
| `documents` table + AI review pipeline exists | Confirmed — built in document-verification feature |
| Booking negotiation via `PATCH /api/bookings/:id` | Confirmed — `proposedRate`, `lastProposedBy` columns |
| Agreement generation via `POST /api/agreements` | Confirmed |
| Milestone status via `PATCH /api/bookings/:id` | Confirmed — milestones tracked on bookings |
| Main navigation component exists in frontend | Confirmed — all authenticated pages use shared nav |
| lucide-react `<Bell />` icon available | Confirmed — lucide-react is in the tech stack |
| shadcn/ui `<Popover />` or `<DropdownMenu />` for panel | Confirmed — shadcn/ui available |
| React Query polling (`refetchInterval`) | Confirmed — React Query already used |
| Drizzle ORM for DB operations | Confirmed — all DB via Drizzle |
| Schema files in `lib/db/src/schema/` | Confirmed in `project.md` |
| Orval codegen → React Query hooks | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Where Is the Navigation Component?

**Question:** The bell icon must be added to the main navigation bar. Where does the shared nav component live?

**Impact:** Adding the bell to the wrong file, or discovering the nav is duplicated, means the badge appears inconsistently across pages.

**Recommendation:**
```bash
find artifacts/talentlock/src -name "*.tsx" | xargs grep -l "nav\|Nav\|header\|Header" | head -10
```

---

### Q2 — How Is the Authenticated User's Internal `userId` Accessed in Route Handlers?

**Question:** `createNotification()` needs the `userId` (internal DB ID, not Clerk ID) of both the actor and the recipient. The actor's ID is available from Clerk middleware. But the recipient's ID must be resolved from the entity (e.g. the booking's `freelancerId` or `employerId`).

**Impact:** Every trigger point must be able to resolve the recipient's internal `userId`. The pattern must be confirmed from the existing codebase.

**Recommendation:**
```bash
# Confirm how other routes resolve internal userId from Clerk userId
grep -n "internalUserId\|users.id\|clerkId" artifacts/api-server/src/routes/bookings.ts | head -20
```

---

### Q3 — Should `createNotification()` Be Truly Fire-and-Forget or Logged on Failure?

**Question:** If `createNotification()` fails (DB error, constraint violation), the primary action (booking update, agreement sign, etc.) must still succeed. Options:

- **(A)** Completely silent — catch and discard errors
- **(B)** Log the error via Pino but do not throw — `req.log.warn(err, 'notification write failed')`
- **(C)** Retry once silently

**Impact:** Option A loses visibility into broken notification triggers. Option B is the right balance — the user isn't affected but failures are visible in logs.

**Recommendation:** Option B — log via Pino, never throw.

---

### Q4 — How Many Notification Triggers Are In Scope for Phase 1?

**Question:** `features.md` lists 15 event types. Hooking all 15 into existing route handlers in one phase is a large surface area. Should the triggers be:

- **(A)** All 15 in one phase
- **(B)** Core 8 first (bookings, agreements, meetings), then the remaining 7 in Phase 2
- **(C)** All 15 but in a dedicated Phase 2 (backend triggers separate from the endpoint Phase)

**Impact:** Option A risks introducing bugs across many existing files at once. Option C is cleanest — build the infrastructure (table + utility + endpoints) first, then add triggers to existing routes as a dedicated phase.

**Recommendation:** Option C — separate Phase 2 (infrastructure + endpoints) from Phase 3 (triggers in existing routes).

---

### Q5 — How Is the Navigation Bell Positioned?

**Question:** Where exactly in the nav does the bell icon sit? Options:

- **(A)** Right side of the nav, before the user avatar/menu
- **(B)** Right side, after all nav links, before the user avatar
- **(C)** Inside the user dropdown menu

**Impact:** The bell must be visible at all times without cluttering the nav. Option A/B is standard (GitHub, Slack pattern).

**Recommendation:** Option A — right side of nav, before the user avatar/dropdown.

---

### Q6 — Dropdown Panel: shadcn `<Popover>` or `<DropdownMenu>`?

**Question:** The notification panel is a dropdown anchored to the bell icon. Should it use:

- **(A)** shadcn/ui `<Popover>` — more flexible, custom width and content
- **(B)** shadcn/ui `<DropdownMenu>` — simpler but list-item-oriented
- **(C)** A custom absolutely-positioned `<div>` with click-outside detection

**Impact:** The panel needs a fixed width (~380px), a scrollable list, and a footer link — none of which fit cleanly into `<DropdownMenu>`. Option A is the right choice.

**Recommendation:** Option A — `<Popover>` with custom panel content inside.

---

### Q7 — Entity Navigation: Which Route Does Each Notification Link To?

**Question:** Clicking a notification must navigate to the relevant entity. The mapping needs to be defined:

| Entity Type | Navigate To |
|---|---|
| `booking` | `/bookings/:entityId` |
| `agreement` | `/agreements/:entityId` |
| `meeting` | `/bookings/:entityId` (meetings don't have a standalone page) |
| `review` | `/bookings/:entityId` (review is on the booking page) |
| `document` | `/profile` |
| `milestone` | `/bookings/:entityId` |

**Impact:** The frontend needs a `getNotificationRoute(type, entityType, entityId)` helper that returns the correct Wouter path.

**Recommendation:** Confirm that `/meetings/:id` does NOT have a standalone frontend route (only `/bookings/:id`). If meetings have their own page, update the mapping.

---

### Q8 — Unread Count Polling Interval

**Question:** `features.md` proposes 30-second polling. Is this acceptable given the nature of the app (professional B2B tool, not a real-time chat)?

**Impact:** 30 seconds means a user could wait up to 30 seconds to see a new notification badge. For a professional tool this is acceptable. Shorter intervals increase server load unnecessarily.

**Recommendation:** 30 seconds confirmed. Use React Query `refetchInterval: 30000`.

---

### Q9 — What Happens to Notifications for Deleted Entities?

**Question:** If a booking is deleted/cancelled, notifications referencing that `entityId` should not cause 404 errors when the user clicks them. Should the notification:

- **(A)** Still navigate to the entity page (page shows a "not found" state)
- **(B)** Show a "this item no longer exists" message in the notification item itself
- **(C)** Be soft-deleted when the entity is deleted (CASCADE)

**Impact:** Option C requires updating every entity delete handler to also delete related notifications. Option A is the simplest and most common pattern (the entity page handles the 404).

**Recommendation:** Option A — navigate regardless. Entity pages already handle missing records.

---

## ⚠️ Risks & Notes

### Risk 1 — Fire-and-Forget Must Never Block Primary Actions

The most critical risk. If `createNotification()` is awaited and throws, it will break the route handler that called it. Every trigger call must be wrapped:

```ts
createNotification(db, { ... }).catch(err =>
  req.log.warn({ err, type, entityId }, 'notification write failed')
);
// DO NOT await this call
```

This pattern must be enforced in every trigger point — never `await createNotification(...)`.

### Risk 2 — Double Notifications on Some Events

Some events naturally involve multiple status changes. For example, when a booking moves from `negotiating` to `agreed`, both `rate_agreed` AND a booking status change occur. Care must be taken not to create two notifications for the same logical event. Each trigger point must create exactly one notification per event per recipient.

### Risk 3 — Navigation Component Modification Risk

Adding the bell to the shared nav is high-risk if the nav is used on many pages — any error in the bell component breaks the entire app's navigation. The bell component must be isolated with its own error boundary.

### Risk 4 — `PATCH /api/notifications/read-all` Route Conflict

Express route matching: `PATCH /api/notifications/read-all` must be registered BEFORE `PATCH /api/notifications/:id/read` in the router, otherwise `read-all` is matched as `:id = 'read-all'`.

### Risk 5 — Codegen Export Rules

After adding new endpoints to the OpenAPI spec:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 3

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Nav component file location | Task 3.1 (bell integration) |
| Q2 | `userId` resolution pattern in route handlers | Task 2.2 (triggers) |
| Q4 | Trigger phase structure | task.md phase design |
| Q7 | Entity navigation route mapping | Task 3.3 (notification item) |

Questions Q3, Q5, Q6, Q8, Q9 are resolved in `plan.md`.

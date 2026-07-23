# TalentLock — Task Breakdown: Cruise Mode & TalentSearch DM Delivery

Read `spec/cruise-mode-dm-delivery/plan.md` before executing. Also read `spec/cruisemode/task.md` and `spec/employer-cruisemode/task.md` for evaluator context.

---

## Phase 1 — Database

### Task 1.1 — Activity table columns

**Files:** `lib/db/src/schema/cruiseMode.ts`, `lib/db/src/schema/talentSearch.ts`

Add to both activity tables:
- `conversationId` — integer nullable, FK → `conversations.id`, `onDelete: "set null"`
- `messageId` — integer nullable, FK → `messages.id`, `onDelete: "set null"`

Run: `pnpm --filter @workspace/db run push`

No backfill required — historical rows remain null.

---

## Phase 2 — Backend

### Task 2.1 — Notification override on `sendHumanMessage`

**File:** `artifacts/api-server/src/lib/conversationsUtils.ts`

Add optional third argument or options bag:

```ts
type SendHumanMessageOptions = {
  notificationOverride?: {
    type: NotificationType;
    entityType: string;
    entityId: number | string;
    message: string;
  };
};
```

When `notificationOverride` is provided, skip `NEW_MESSAGE` and use override for `createNotification` + email subject/body still references message content.

### Task 2.2 — `sendAutomatedOutreachMessage`

**File:** `artifacts/api-server/src/lib/automatedOutreachMessaging.ts` (create)

Implement per `features.md` Module 1. Unit-test sanitisation and empty-content guard.

### Task 2.3 — Wire Cruise Mode evaluator

**File:** `artifacts/api-server/src/lib/cruiseModeEvaluator.ts`

In `decision === "sent"` block:
1. Call `sendAutomatedOutreachMessage` with freelancer as sender
2. Update activity row with `conversationId`, `messageId`
3. Remove redundant `CRUISE_MODE_INTEREST` notification if superseded by override
4. On failure → `decision = "dm_failed"`, log, do not count toward monthly quota

### Task 2.4 — Wire TalentSearch evaluator

**File:** `artifacts/api-server/src/lib/talentSearchEvaluator.ts`

Same pattern with employer as sender. Increment freelancer daily cap only when DM succeeds.

### Task 2.5 — OpenAPI activity schemas

**File:** `lib/api-spec/openapi.yaml`

Add optional `conversationId`, `messageId` to:
- `CruiseModeActivityItem`
- `TalentSearchActivityItem`

Add `dm_failed` to decision enum documentation if exposed.

Run codegen + typecheck.

### Task 2.6 — Activity route mappers

**Files:** `artifacts/api-server/src/routes/cruiseMode.ts`, `artifacts/api-server/src/routes/talentSearch.ts`

Return new fields in list responses.

---

## Phase 3 — Frontend

### Task 3.1 — Cruise Mode activity feed

**File:** `artifacts/talentlock/src/components/cruise-mode/CruiseModeActivityFeed.tsx`

- When `item.conversationId` present and `decision === "sent"`: show **Open conversation** → `/messages/${conversationId}`
- When `decision === "dm_failed"`: show inline error state

### Task 3.2 — TalentSearch activity feed

**File:** `artifacts/talentlock/src/components/talent-search/TalentSearchActivityFeed.tsx`

Same as Task 3.1.

### Task 3.3 — Notification routes

**File:** `artifacts/talentlock/src/lib/notificationRoutes.ts`

Confirm `cruise_mode_interest` and `talent_search_interest` with `entityType: "conversation"` route to `/messages/:id`. Update if still pointing to activity-only URLs.

---

## Acceptance Criteria

- [ ] Cruise Mode live send creates `human_direct` message visible to employer in Messages
- [ ] TalentSearch live send creates `human_direct` message visible to freelancer in Messages
- [ ] Dry run creates no conversation rows
- [ ] Activity feed links to conversation when `messageId` set
- [ ] No duplicate `new_message` + feature notification for same send
- [ ] `pnpm run typecheck` passes

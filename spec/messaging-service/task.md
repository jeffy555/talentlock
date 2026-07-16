# TalentLock — Task Breakdown: In-App Direct Messaging

---

## Summary

Three phases: Database (additive columns + indexes on existing tables, no new tables) → Backend (conversation utils, new routes, extension of existing message route, OpenAPI + codegen) → Frontend (inbox page, thread view, inline booking/meeting tabs, profile button, nav badge). No existing routes are modified in a breaking way. AI chat is completely untouched.

Read `specs/in-app-messaging/plan.md` before writing any code.

---

## Phase 1 — Database

### Task 1.1 — Codebase Inspection

Run all pre-implementation checks from `plan.md`. Document and confirm:
- All column names on `conversations` (especially: does `userId` link to employer? is `jobRequirementId` the only FK?)
- All column names on `messages` (especially: `role` vs `senderId`, `content` vs `text`/`body`, presence of any `readAt`-style column)
- Exact registration of conversation routes in `artifacts/api-server/src/routes/index.ts`
- Whether `meetings` has `employerId` and `freelancerId` as direct columns or joins through `bookings`
- GDPR deletion flow in `accountDeletion.ts` — where to insert message anonymisation

Add a comment block to the top of the schema changes summarising findings.

### Task 1.2 — Add Columns to `conversations`

**File:** `lib/db/src/schema/` — conversations table

```ts
// Additive columns — all nullable except type (has default)
type:          text('type').notNull().default('ai_match'),
               // 'ai_match' = existing AI chat (backfilled)
               // 'human_direct' = new human-to-human thread
employerId:    text('employer_id').references(() => employerProfiles.id),
freelancerId:  text('freelancer_id').references(() => freelancerProfiles.id),
bookingId:     text('booking_id').references(() => bookings.id),
meetingId:     text('meeting_id').references(() => meetings.id),
lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
```

Migration note: `type NOT NULL DEFAULT 'ai_match'` backfills all existing rows automatically. No separate UPDATE needed.

### Task 1.3 — Add Columns to `messages`

**File:** `lib/db/src/schema/` — messages table

If inspection (Task 1.1) confirms no existing `readAt`-style column and no conflict with `role`/`senderType`:

```ts
senderType: text('sender_type').notNull().default('ai'),
            // 'ai' = AI chat messages (backfilled)
            // 'human' = human direct messages
readAt:     timestamp('read_at', { withTimezone: true }),
            // null = unread; set when recipient opens the conversation
```

**Important:** If Task 1.1 reveals `messages` already has a `role` column, do NOT add `senderType`. Instead extend the `role` column's valid values and document the decision. If `senderId` is a UUID FK, use it as the human sender ID — do not add a duplicate.

### Task 1.4 — Add Indexes and Unique Constraints

**File:** `lib/db/src/schema/` — migrations or index definitions

```sql
-- Inbox performance (sort by last message per employer/freelancer)
CREATE INDEX CONCURRENTLY conversations_employer_inbox
  ON conversations (employer_id, last_message_at DESC)
  WHERE type = 'human_direct';

CREATE INDEX CONCURRENTLY conversations_freelancer_inbox
  ON conversations (freelancer_id, last_message_at DESC)
  WHERE type = 'human_direct';

-- Unread count performance
CREATE INDEX CONCURRENTLY messages_unread_by_conversation
  ON messages (conversation_id, sender_id)
  WHERE read_at IS NULL AND sender_type = 'human';

-- Rate limit check performance
CREATE INDEX CONCURRENTLY messages_rate_limit
  ON messages (conversation_id, sender_id, created_at DESC)
  WHERE sender_type = 'human';

-- Deduplication: one conversation per employer-freelancer pair per booking
CREATE UNIQUE INDEX conversations_booking_unique
  ON conversations (employer_id, freelancer_id, booking_id)
  WHERE type = 'human_direct' AND booking_id IS NOT NULL;

-- Deduplication: one unscoped conversation per employer-freelancer pair
CREATE UNIQUE INDEX conversations_unscoped_unique
  ON conversations (employer_id, freelancer_id)
  WHERE type = 'human_direct' AND booking_id IS NULL;
```

### Task 1.5 — Run Migration and Verify

```bash
pnpm --filter @workspace/db run push
```

```sql
-- Verify conversations schema
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'conversations'
AND column_name IN ('type', 'employer_id', 'freelancer_id', 'booking_id', 'meeting_id', 'last_message_at');

-- Verify messages schema
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'messages'
AND column_name IN ('sender_type', 'read_at');

-- Verify backfills
SELECT DISTINCT type FROM conversations;                    -- expect: 'ai_match' only
SELECT DISTINCT sender_type FROM messages;                  -- expect: 'ai' only
SELECT COUNT(*) FROM conversations WHERE type IS NULL;      -- expect: 0
SELECT COUNT(*) FROM messages WHERE sender_type IS NULL;    -- expect: 0

-- Verify indexes
SELECT indexname FROM pg_indexes WHERE tablename IN ('conversations', 'messages');
```

- [x] All additive messaging columns present with correct types and defaults
- [x] All existing rows backfilled correctly
- [x] All 4 performance indexes created
- [x] Both unique constraints created

---

## Phase 2 — Backend

### Task 2.1 — Create `conversationsUtils.ts`

**File:** `artifacts/api-server/src/lib/conversationsUtils.ts` (create new)

Implement:
1. `findOrCreateConversation(db, params): Promise<{ conversationId, isNew }>` — full implementation per `plan.md`
2. `sendHumanMessage(db, conversationId, senderId, senderRole, content, log): Promise<MessageRow>` — full implementation per `plan.md`
3. `shouldSuppressEmail(db, conversationId, senderId): Promise<boolean>` — per `plan.md` Q3
4. `markConversationRead(db, conversationId, readerUserId): Promise<number>` — sets `readAt = now()` on all unread messages where `senderId !== readerUserId`
5. `getUnreadConversationCount(db, userId, role): Promise<number>` — counts conversations with at least one unread message for the current user

```ts
export async function markConversationRead(
  db: DB,
  conversationId: string,
  readerUserId: string
): Promise<number> {
  const result = await db.update(messages)
    .set({ readAt: new Date() })
    .where(and(
      eq(messages.conversationId, conversationId),
      ne(messages.senderId, readerUserId),
      isNull(messages.readAt),
      eq(messages.senderType, 'human'),
    ));
  return result.rowCount ?? 0;
}

export async function getUnreadConversationCount(
  db: DB,
  userId: string,
  role: 'employer' | 'freelancer'
): Promise<number> {
  // Count distinct conversations that have at least one unread human message
  // not sent by the current user
  const column = role === 'employer'
    ? conversations.employerId
    : conversations.freelancerId;

  const result = await db
    .selectDistinct({ conversationId: messages.conversationId })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(
      eq(column, userId),
      eq(conversations.type, 'human_direct'),
      eq(messages.senderType, 'human'),
      ne(messages.senderId, userId),
      isNull(messages.readAt),
    ));
  return result.length;
}
```

### Task 2.2 — Create `routes/conversations.ts`

**File:** `artifacts/api-server/src/routes/conversations.ts` (create new)

Implement all 5 routes. All require Clerk authentication. All verify participation before returning data.

**`POST /api/conversations/direct`** — create or retrieve thread:
```ts
router.post('/direct', requireAuth, async (req, res) => {
  const user = await resolveUserByClerkId(db, getAuth(req).userId);
  const employer = await db.query.employerProfiles.findFirst({ where: eq(employerProfiles.userId, user.id) });
  const freelancer = await db.query.freelancerProfiles.findFirst({ where: eq(freelancerProfiles.userId, user.id) });

  const isEmployer = !!employer;
  const isFreelancer = !!freelancer;

  if (!isEmployer && !isFreelancer) return res.status(403).json({ error: 'No profile found' });

  const { employerId, freelancerId, bookingId, meetingId } = req.body;

  // Resolve participant IDs based on role
  const resolvedEmployerId = isEmployer ? employer.id : employerId;
  const resolvedFreelancerId = isFreelancer ? freelancer.id : freelancerId;

  if (!resolvedEmployerId || !resolvedFreelancerId) {
    return res.status(400).json({ error: 'Both employerId and freelancerId are required' });
  }

  const result = await findOrCreateConversation(db, {
    employerId: resolvedEmployerId,
    freelancerId: resolvedFreelancerId,
    bookingId: bookingId ?? null,
    meetingId: meetingId ?? null,
  });

  return res.status(result.isNew ? 201 : 200).json(result);
});
```

**`GET /api/conversations/direct`** — inbox list:
```ts
// Returns paginated list of human_direct conversations for the current user
// Includes: conversationId, otherPartyName, otherPartyAvatar, lastMessage preview,
//           lastMessageAt, unreadCount, bookingTitle (if scoped), meetingId (if scoped)
// Sorted by lastMessageAt DESC
```

**`GET /api/conversations/:id/messages`** — message history (human thread):
```ts
// Paginated — ?page, ?pageSize
// Returns { data, total, page, pageSize, totalPages }
// Filters: WHERE conversation_id = :id AND sender_type = 'human'
// Calls markConversationRead() for the current user after returning results
// 403 if not a participant
```

**`POST /api/conversations/:id/messages`** — send human message:
```ts
// Calls sendHumanMessage() from conversationsUtils.ts
// Body: { content: string }
// Validates: max 2000 chars, not empty, sanitiseText()
// Returns: saved message row
// 403 if not participant
// 429 if rate limit exceeded
// 422 if conversation.type !== 'human_direct'
```

**`PATCH /api/conversations/:id/read`** — mark as read:
```ts
// Calls markConversationRead()
// Returns { markedRead: number }
// 403 if not participant
```

### Task 2.3 — Add `GET /api/messages/unread-count`

**File:** `artifacts/api-server/src/routes/conversations.ts` (add to same file)

```ts
router.get('/unread-count', requireAuth, async (req, res) => {
  // Resolve role and userId
  const count = await getUnreadConversationCount(db, userId, role);
  return res.json({ count });
});
```

Register this at `/api/messages/unread-count` (note: different prefix from `/api/conversations`).

### Task 2.4 — Register Routes

**File:** `artifacts/api-server/src/routes/index.ts`

```ts
import conversationsRouter from './conversations';

// Human messaging routes — separate from /api/openai/conversations
app.use('/api/conversations', conversationsRouter);
app.use('/api/messages', conversationsRouter); // for /api/messages/unread-count
```

**Important:** Register BEFORE any catch-all routes. Existing `/api/openai/conversations` registration is UNCHANGED.

### Task 2.5 — GDPR Anonymisation

**File:** `artifacts/api-server/src/lib/accountDeletion.ts`

Inside the existing Drizzle transaction (after existing anonymisation steps), add:

```ts
// Anonymise human messages sent by deleted user
await db.update(messages)
  .set({ content: '[Message removed]' })
  .where(and(
    eq(messages.senderId, internalUserId),
    eq(messages.senderType, 'human'),
  ));
// Do NOT delete conversations — preserve thread for the other participant
```

### Task 2.6 — Add `new_message` Notification Type

**File:** wherever notification types are defined (check `notifications.ts` or `types.ts`)

Add `'new_message'` to the notification type union.

### Task 2.7 — OpenAPI + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add all 5 new endpoints:
- `POST /api/conversations/direct` — body: `{ freelancerId?, employerId?, bookingId?, meetingId? }`, response: `{ conversationId, isNew }`
- `GET /api/conversations/direct` — paginated conversation list
- `GET /api/conversations/{id}/messages` — paginated message list
- `POST /api/conversations/{id}/messages` — body: `{ content }`, response: message row
- `PATCH /api/conversations/{id}/read` — response: `{ markedRead }`
- `GET /api/messages/unread-count` — response: `{ count }`

Add schemas:
- `DirectConversation` — conversation row with other party details and unread count
- `HumanMessage` — message row with `senderType`, `senderName`, `readAt`
- `UnreadCount` — `{ count: number }`

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen checks:
- `orval.config.ts` still has `indexFiles: false`
- `index.ts` only exports `./generated/api`
- `pnpm run typecheck` — zero errors

---

## Phase 3 — Frontend

### Task 3.1 — Verify Generated Hooks

```bash
grep -r "conversations\|unreadCount\|DirectConversation" lib/api-client-react/src/ | head -10
```

- [x] `usePostConversationsDirect()` hook exists
- [x] `useGetConversationsDirect()` hook exists
- [x] `useGetConversationsIdMessages()` hook exists
- [x] `usePostConversationsIdMessages()` hook exists
- [x] `usePatchConversationsIdRead()` hook exists
- [x] `useGetMessagesUnreadCount()` hook exists

### Task 3.2 — Messages Inbox Deep-Link Shim

**File:** `artifacts/talentlock/src/pages/MessagesInbox.tsx`

On mount: `openInbox()` from ChatBox context, then `setLocation("/dashboard", { replace: true })`. Do not render a full-page inbox as primary UX.

### Task 3.3 — Message Thread Deep-Link Shim

**File:** `artifacts/talentlock/src/pages/MessageThread.tsx`

On mount: `openConversation(conversationId)`, then replace-navigate to `/dashboard`.

### Task 3.4 — Keep Deep-Link Routes in App.tsx

**File:** `artifacts/talentlock/src/App.tsx`

```tsx
<Route path="/messages" component={MessagesInbox} />
<Route path="/messages/:id" component={MessageThread} />
```

These remain for email / notification deep links only.

### Task 3.5 — "Message" Button on Freelancer Detail Page

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

`handleMessage` calls `usePostConversationsDirect()` then `openConversation(conversationId)` — **do not** `navigate(/messages/:id)`.

### Task 3.6 — Messages Tab on Booking Detail Page

Unchanged — `<BookingMessageThread />` compact inline pane.

### Task 3.7 — Messages Section on Meeting Detail Page

Unchanged — `<MeetingMessageThread />`.

### Task 3.8 — Nav Item Opens Chat Box + Unread Badge

**File:** `src/components/layout/AppLayout.tsx`

Messages nav item is a button that calls `openInbox()` (not a Link to `/messages`). Badge from `useGetMessagesUnreadCount()`.

### Task 3.9 — Floating Chat Box (Primary UX)

**Files:**
- `src/components/messages/ChatBoxProvider.tsx` (new)
- `src/components/messages/FloatingChatBox.tsx` (new)
- `src/components/messages/MessagesWorkspace.tsx` (panel variant)

Implement Messanger-style launcher + panel. Mount provider + `FloatingChatBox` inside `AppLayout` for signed-in users.

### Task 3.10 — Employer Freelancer Search-to-Chat

**Files:**
- `src/components/messages/FreelancerChatSearch.tsx` (new)
- `src/components/messages/MessagesWorkspace.tsx` (search at top of panel)
- `artifacts/api-server/src/routes/freelancers.ts` (`q` also matches `name` via ILIKE)

Employer chat box shows a search field. Typing queries freelancers; selecting one calls `POST /conversations/direct` and opens that thread. No default freelancer is pre-selected.

---

## Acceptance Criteria

Implementation note: the existing `messages.role` column was confirmed during Task 1.1, so the approved `plan.md` decision was followed: existing AI rows remain `user`/`assistant`, human rows use `human_employer`/`human_freelancer`, and the additive `senderId` plus nullable `readAt` fields provide sender and read tracking. No duplicate `senderType` column was added.

- [x] `type` (NOT NULL DEFAULT 'ai_match') added to `conversations`
- [x] `employerId`, `freelancerId`, `bookingId`, `meetingId`, `lastMessageAt` added to `conversations` (nullable)
- [x] Existing `messages.role` preserved for AI rows; human role values plus `senderId` and `readAt` added
- [x] All existing `conversations` rows have `type = 'ai_match'`
- [x] All existing messages retain their AI `role` values
- [x] 4 performance indexes created on `conversations` and `messages`
- [x] 2 unique constraints created (booking-scoped and unscoped deduplication)
- [x] `POST /api/conversations/direct` creates a new conversation on first call
- [x] `POST /api/conversations/direct` returns existing conversation ID on duplicate call (no new row)
- [x] `POST /api/conversations/direct` works for both employer and freelancer initiators
- [x] `POST /api/conversations/:id/messages` saves human message, notifies recipient
- [x] `POST /api/conversations/:id/messages` returns 429 after 30 messages in one hour
- [x] `POST /api/conversations/:id/messages` returns 403 for non-participants
- [x] `POST /api/conversations/:id/messages` returns 422 for `type = 'ai_match'` conversations
- [x] `PATCH /api/conversations/:id/read` sets `readAt = now()` on all unread messages from the other party
- [x] `GET /api/messages/unread-count` returns correct count
- [x] New message creates `new_message` in-app notification for recipient
- [x] Email suppression checks whether the recipient read within the last 5 minutes and respects `emailNotificationsEnabled`
- [x] AI chat at `/ai-match` and `POST /api/openai/conversations/:id/messages` COMPLETELY UNCHANGED
- [x] Existing `GET /api/openai/conversations` UNCHANGED
- [x] GDPR deletion anonymises human message content to `[Message removed]`
- [x] Floating chat box is the primary messaging UX (launcher + panel)
- [x] `/messages` and `/messages/:id` are deep-link shims that open the chat box
- [x] "Message" button on freelancer detail opens the chat box (no full-page navigation)
- [x] Messages tab on booking detail shows booking-scoped conversation
- [x] Messages section on meeting detail shows meeting-scoped conversation
- [x] Nav "Messages" opens the chat box; badge shows correct unread count
- [x] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 → 1.4 → 1.5 (verify migration)
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 (codegen + typecheck)
Task 3.1 (verify hooks) → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8
```

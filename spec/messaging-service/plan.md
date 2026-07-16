# TalentLock — Implementation Plan: In-App Direct Messaging

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.
> Read `project.md` before every session.

---

## Pre-Implementation Codebase Checks

```bash
# 1. Exact conversations table schema — all columns
grep -A 25 "conversations\s*=" lib/db/src/schema/*.ts | head -30

# 2. Exact messages table schema — all columns
grep -A 25 "messages\s*=" lib/db/src/schema/*.ts | head -30

# 3. Check router registration for existing conversation routes
grep -n "conversation\|openai" artifacts/api-server/src/routes/index.ts | head -10

# 4. Confirm POST /api/openai/conversations/:id/messages handler location
grep -rln "openai.*conversation\|conversation.*openai" artifacts/api-server/src/routes/ | head -5

# 5. Check if bookings table has employerId and freelancerId columns
grep -A 20 "bookings\s*=" lib/db/src/schema/*.ts | grep -i "employer\|freelancer"

# 6. Confirm meetings table has employerId and freelancerId columns
grep -A 20 "meetings\s*=" lib/db/src/schema/*.ts | grep -i "employer\|freelancer"

# 7. Check existing accountDeletion.ts for GDPR pattern
grep -n "messages\|conversation" artifacts/api-server/src/lib/accountDeletion.ts | head -10

# 8. Check for any existing rate limiting infrastructure
grep -rln "rateLimit\|rate.limit\|429" artifacts/api-server/src/ | head -5
```

---

## Resolved Questions

---

### Q1 — Existing Schema Confirmed by Inspection

**Decision: Inspect first. Map actual column names before adding anything.**

After inspection, document all confirmed column names. The plan assumes:

- `conversations` has: `id`, `userId` (who started the AI chat), `jobRequirementId`, `createdAt`
- `messages` has: `id`, `conversationId`, `role` (or `senderId`), `content` (or `text`/`body`), `createdAt`

If `messages` already has a `role` column (`'user' | 'assistant'`), then `senderType` is NOT added — instead `role` is extended:
```ts
// If role already exists: extend its values
role: 'user' | 'assistant' | 'human_employer' | 'human_freelancer'
// 'human_employer' and 'human_freelancer' are the new human sender types
```

If `messages` has a `senderId` column (UUID), add `senderType` as a separate discriminator. Document the finding and use the correct approach.

---

### Q2 — Who Can Initiate

**Decision: Option B — both parties can initiate.**

The `POST /api/conversations/direct` route works for both employers and freelancers. The server resolves both participant IDs from the authenticated user's role:

```ts
// If initiator is employer:
const employer = await resolveEmployer(req); // from Clerk ID
const conversation = await findOrCreateConversation(db, {
  employerId: employer.id,
  freelancerId: body.freelancerId,
  bookingId: body.bookingId ?? null,
  meetingId: body.meetingId ?? null,
});

// If initiator is freelancer:
const freelancer = await resolveFreelancer(req); // from Clerk ID
const conversation = await findOrCreateConversation(db, {
  employerId: body.employerId,       // freelancer passes the employer's ID
  freelancerId: freelancer.id,
  bookingId: body.bookingId ?? null,
  meetingId: body.meetingId ?? null,
});
```

The `findOrCreateConversation` function handles the deduplication logic (UNIQUE constraint + upsert pattern from Risk 3).

---

### Q3 — Email Suppression (5-Minute Window)

**Decision: Option A — check `messages.readAt` in the last 5 minutes.**

```ts
export async function shouldSuppressEmail(
  db: DB,
  conversationId: string,
  senderId: string    // the person who just sent a message
): Promise<boolean> {
  // Did the RECIPIENT read a message recently? (i.e. are they actively looking at the thread?)
  const recentRead = await db.query.messages.findFirst({
    where: and(
      eq(messages.conversationId, conversationId),
      ne(messages.senderId, senderId),           // messages TO the recipient
      isNotNull(messages.readAt),
      gte(messages.readAt, new Date(Date.now() - 5 * 60 * 1000)),
    ),
  });
  return recentRead !== null;
}
```

If the recipient has read a message in this conversation within the last 5 minutes, they are likely actively viewing the thread — suppress the email. No new columns required.

---

### Q4 — Extend Existing `messages` Table

**Decision: Option A — extend the existing `messages` table.**

Two new columns on `messages`:
```ts
senderType: text('sender_type').notNull().default('ai'),
            // 'ai' | 'human' — backfills all existing rows to 'ai'
readAt:     timestamp('read_at', { withTimezone: true }),
            // null = unread; set when recipient opens the conversation thread
```

If inspection reveals `messages` already has a `role` column, use that to discriminate AI vs human messages instead of adding `senderType`. Document the decision.

---

### Q5 — Router Namespace

**Decision: New `/api/conversations` router, separate from `/api/openai/conversations`.**

After inspection, if the existing routes are under `/api/openai`, the new routes register under `/api/conversations` with no conflict:

```ts
// artifacts/api-server/src/routes/index.ts
import conversationsRouter from './conversations';  // NEW — human messaging
app.use('/api/conversations', conversationsRouter);

// Existing (unchanged):
app.use('/api/openai', openaiRouter); // includes /conversations/:id/messages
```

The `POST /api/conversations/:id/messages` handler (new router) is exclusively for human_direct conversations. It checks `conversation.type === 'human_direct'` and returns 422 if called on an AI chat conversation.

The existing `POST /api/openai/conversations/:id/messages` handler is unchanged.

---

### Q6 — Rate Limiting (30 Messages/Hour)

**Decision: In-DB count query. No Redis required.**

```ts
// In POST /api/conversations/:id/messages handler:
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
const recentCount = await db.$count(messages,
  and(
    eq(messages.conversationId, conversationId),
    eq(messages.senderId, senderId),
    gte(messages.createdAt, oneHourAgo),
  )
);
if (recentCount >= 30) {
  return res.status(429).json({
    error: 'MESSAGE_RATE_LIMIT',
    message: 'You have sent too many messages in the last hour. Please wait before sending more.',
  });
}
```

This query is fast with the index on `(conversation_id, sender_id, created_at)` added in Task 1.3.

---

### Q7 — `/messages` Frontend Route → Floating Chat Box

**Decision (updated 2026-07-14): Primary UX is a floating chat box. `/messages` routes are deep-link shims only.**

```tsx
// App.tsx — keep routes for email / notification deep links
<Route path="/messages" component={MessagesInbox} />
<Route path="/messages/:id" component={MessageThread} />
// Those pages open ChatBoxProvider and redirect into the app shell.

 // Global overlay (inside AppLayout)
 <FloatingChatBox />
```

Nav item "Messages" opens the chat box for both employers and freelancers (does not navigate away). Unread badge from `GET /api/messages/unread-count` appears on the nav item and on the floating launcher bubble.

Freelancer profile "Message" opens `openConversation(conversationId)` on the chat box instead of `navigate(/messages/:id)`.

**Employer search-to-chat (updated 2026-07-15):** The chat box must not default/pre-select a freelancer. Employers start (or find) chats via a search box that queries `GET /api/freelancers?q=` (name + bio + skills), then `POST /api/conversations/direct` on selection. Recent conversations remain listed below when the query is empty. Freelancers see recent conversations only (no employer search in Phase 1).

---

### Q8 — GDPR Deletion

**Decision: Anonymise message content, preserve thread structure.**

```ts
// In accountDeletion.ts GDPR transaction — add after existing anonymisation:
await db.update(messages)
  .set({
    content: '[Message removed]',
    senderId: null,       // or keep for audit — confirm with project GDPR policy
  })
  .where(eq(messages.senderId, internalUserId));

// Conversations where this user was a participant — anonymise but do NOT delete
// The other participant still needs their message history
await db.update(conversations)
  .set({ deletedAt: new Date() })   // soft delete if deletedAt column added
  .where(or(
    eq(conversations.employerId, employerProfileId),
    eq(conversations.freelancerId, freelancerProfileId),
  ));
```

---

## `findOrCreateConversation` Implementation

```ts
export async function findOrCreateConversation(
  db: DB,
  params: {
    employerId: string;
    freelancerId: string;
    bookingId: string | null;
    meetingId: string | null;
  }
): Promise<{ conversationId: string; isNew: boolean }> {
  const { employerId, freelancerId, bookingId, meetingId } = params;

  // Try to find existing conversation
  const existing = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.type, 'human_direct'),
      eq(conversations.employerId, employerId),
      eq(conversations.freelancerId, freelancerId),
      bookingId
        ? eq(conversations.bookingId, bookingId)
        : isNull(conversations.bookingId),
    ),
  });

  if (existing) return { conversationId: existing.id, isNew: false };

  // Create new conversation
  const [created] = await db.insert(conversations).values({
    id: generateId(),
    type: 'human_direct',
    employerId,
    freelancerId,
    bookingId: bookingId ?? null,
    meetingId: meetingId ?? null,
    lastMessageAt: null,
    createdAt: new Date(),
  }).returning();

  return { conversationId: created.id, isNew: true };
}
```

---

## Message Sending Implementation

```ts
// POST /api/conversations/:id/messages — human_direct branch

export async function sendHumanMessage(
  db: DB,
  conversationId: string,
  senderId: string,
  senderRole: 'employer' | 'freelancer',
  content: string,
  log: Logger
): Promise<MessageRow> {
  // 1. Load conversation and verify access
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation || conversation.type !== 'human_direct') {
    throw new AppError(422, 'INVALID_CONVERSATION_TYPE');
  }

  // 2. Verify sender is a participant
  const isParticipant =
    (senderRole === 'employer' && conversation.employerId === senderId) ||
    (senderRole === 'freelancer' && conversation.freelancerId === senderId);
  if (!isParticipant) throw new AppError(403, 'NOT_A_PARTICIPANT');

  // 3. Rate limit check
  const recentCount = await db.$count(messages, and(
    eq(messages.conversationId, conversationId),
    eq(messages.senderId, senderId),
    gte(messages.createdAt, new Date(Date.now() - 3_600_000)),
  ));
  if (recentCount >= 30) throw new AppError(429, 'MESSAGE_RATE_LIMIT');

  // 4. Sanitise and save message
  const sanitised = sanitiseText(content.trim().slice(0, 2000));
  const [saved] = await db.insert(messages).values({
    id: generateId(),
    conversationId,
    senderId,
    senderType: 'human',
    content: sanitised,
    createdAt: new Date(),
  }).returning();

  // 5. Update lastMessageAt on conversation
  await db.update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));

  // 6. Resolve recipient
  const recipientId = senderRole === 'employer'
    ? conversation.freelancerId
    : conversation.employerId;

  // 7. Load sender name for notification
  const sender = await db.query.users.findFirst({
    where: eq(users.id, senderId),
  });
  const senderName = `${sender?.firstName ?? ''} ${sender?.lastName ?? ''}`.trim() || 'Someone';

  // 8. Notify recipient (fire-and-forget)
  createNotification(db, {
    userId: recipientId,
    type: 'new_message',
    title: `New message from ${senderName}`,
    body: sanitised.slice(0, 100) + (sanitised.length > 100 ? '...' : ''),
    metadata: {
      conversationId,
      bookingId: conversation.bookingId,
      meetingId: conversation.meetingId,
    },
  }).catch(err => log.warn({ err, conversationId }, 'message notification failed'));

  // 9. Email recipient if not recently active (fire-and-forget)
  shouldSuppressEmail(db, conversationId, senderId).then(suppress => {
    if (!suppress) {
      sendNotificationEmail(db, recipientId, {
        subject: `New message from ${senderName} on TalentLock`,
        body: `${senderName} sent you a message: "${sanitised.slice(0, 200)}${sanitised.length > 200 ? '...' : ''}"`,
      }).catch(() => {});
    }
  }).catch(() => {});

  return saved;
}
```

---

## Token Feature

No new token labels. Human messaging does not consume OpenAI tokens.

---

## Notification Type

Add `'new_message'` to the existing notification type union in `tokenLogger.ts` or wherever notification types are defined.

---

## Indexes to Add

```sql
-- Fast inbox query (sort by last message)
CREATE INDEX conversations_employer_inbox
  ON conversations (employer_id, last_message_at DESC)
  WHERE type = 'human_direct';

CREATE INDEX conversations_freelancer_inbox
  ON conversations (freelancer_id, last_message_at DESC)
  WHERE type = 'human_direct';

-- Fast unread count
CREATE INDEX messages_unread_by_conversation
  ON messages (conversation_id, sender_id)
  WHERE read_at IS NULL AND sender_type = 'human';

-- Rate limit check
CREATE INDEX messages_rate_limit
  ON messages (conversation_id, sender_id, created_at DESC)
  WHERE sender_type = 'human';
```

---

## Deduplication — UNIQUE Constraint Strategy

Per Risk 3 from `clarify.md` — race condition prevention:

```sql
-- Scoped to a booking
CREATE UNIQUE INDEX conversations_booking_unique
  ON conversations (employer_id, freelancer_id, booking_id)
  WHERE type = 'human_direct' AND booking_id IS NOT NULL;

-- Unscoped (direct, no booking)
CREATE UNIQUE INDEX conversations_unscoped_unique
  ON conversations (employer_id, freelancer_id)
  WHERE type = 'human_direct' AND booking_id IS NULL;
```

The `findOrCreateConversation()` function uses `INSERT ... ON CONFLICT DO NOTHING RETURNING *` to safely handle concurrent creation attempts.

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full
- [ ] All 6 spec files read
- [ ] Codebase inspection complete — Q1 schema confirmed, Q5 router structure confirmed
- [ ] `conversations` and `messages` exact column names documented
- [ ] Router namespace confirmed — `/api/conversations` is clean of conflicts
- [ ] GDPR anonymisation pattern reviewed with existing `accountDeletion.ts`
- [ ] Existing AI chat routes confirmed unaffected by new router

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Schema — 6 new columns across `conversations` + `messages`, 4 indexes, 2 unique constraints | ⬜ Not started |
| Phase 2 | Backend — `conversationsUtils.ts`, `POST /api/conversations/direct`, extended `POST /api/conversations/:id/messages`, `PATCH /api/conversations/:id/read`, `GET /api/messages/unread-count`, OpenAPI + codegen | ⬜ Not started |
| Phase 3 | Frontend — floating chat box (primary), deep-link `/messages` shims, booking + meeting inline tabs, "Message" button opens chat box, nav opens chat box + unread badge | ✅ Implemented (chat-box UX addendum 2026-07-14) |

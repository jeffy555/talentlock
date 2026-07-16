# TalentLock — Clarification & Verification: In-App Direct Messaging

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `conversations` table exists — has `jobRequirementId` column | Confirmed in `project.md` schema |
| `messages` table exists — stores individual chat messages | Confirmed in `project.md` schema |
| `POST /api/openai/conversations/:id/messages` already exists for AI chat | Confirmed in `project.md` API routes |
| `GET /api/openai/conversations` and `GET /api/openai/conversations/:id/messages` already exist | Confirmed |
| `createNotification()` fire-and-forget pattern established — 15+ notification types | Confirmed |
| `sendNotificationEmail()` available, no-op when `RESEND_API_KEY` unset | Confirmed |
| `notifications` table has `type`, `title`, `body`, `metadata` columns | Confirmed |
| `sanitiseText()` from `lib/sanitise.ts` applied to all free-text writes | Confirmed — Cursor notes |
| `accessControl.ts` — per-resource authorization helpers established | Confirmed — `AuthHardening/` spec |
| Paginated response shape `{ data, total, page, pageSize, totalPages }` | Confirmed — Cursor notes |
| `employer_profiles` and `freelancer_profiles` both carry `userId` for join | Confirmed — `AuthHardening/` Cursor notes |
| 30-second notification polling pattern already in use | Confirmed — Key Feature 22 |
| `bookings` table exists with `employerId`, `freelancerId` | Confirmed |
| `meetings` table exists with `status`, `employerId`, `freelancerId` | Confirmed |
| `users` table has `emailNotificationsEnabled` column | Confirmed |
| Fire-and-forget `.catch()` pattern mandatory for `createNotification()`, `sendNotificationEmail()` | Confirmed — Cursor notes |
| `GET /api/notifications/unread-count` already exists for notification badge | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Exact Schema of Existing `conversations` and `messages` Tables

**Question:** Before adding columns, the exact current column names must be confirmed. Specifically:
- Does `conversations` have a `userId` column linking to the employer/user who started the AI chat?
- Does `conversations.jobRequirementId` make `conversations` employer-centric or neutral?
- Does `messages` have a `role` column (`user` / `assistant`) or a `senderId` column?
- Does `messages` have any `content` column or is it `text`/`body`?
- Is there a `createdAt` column on `messages`?

**Recommendation:**
```bash
grep -A 25 "conversations\s*=" lib/db/src/schema/*.ts | head -30
grep -A 25 "messages\s*=" lib/db/src/schema/*.ts | head -30
```

These answers determine:
1. Whether `senderType` ('ai' | 'human') conflicts with an existing `role` column
2. Whether the existing `messages` schema already has a `readAt`-style column
3. How to correctly backfill the `type` column on existing `conversations` rows

---

### Q2 — Who Can Initiate a Conversation?

**Question:** `features.md` states "Employer-only — freelancers cannot initiate." But there is a valid use case where a freelancer who has received a TalentSearch interest notification (from an employer's TalentSearch) wants to reply via messaging rather than just accepting a booking. Should freelancers be able to respond/initiate?

**Options:**
- **(A)** Employer-only initiation — freelancer can only reply to an existing thread
- **(B)** Either party can initiate — `POST /api/conversations/direct` works for both roles
- **(C)** Employer initiates unscoped conversations; freelancer can initiate only when responding to a TalentSearch interest (conversation scoped to `talentSearchActivityId`)

**Recommendation: Option B.** Both parties should be able to open a conversation. A freelancer who received a TalentSearch notification should be able to message the employer directly. The deduplication rule (one conversation per employer–freelancer pair per booking) ensures no duplicate threads are created regardless of who initiates.

**Impact on `POST /api/conversations/direct`:** The body schema changes — the initiating freelancer passes `employerId` instead of `freelancerId`. The server always resolves both participant IDs from the authenticated user's role.

---

### Q3 — How Is the "5-Minute Email Suppression" Implemented?

**Question:** Module 4 states emails are only sent if the recipient has not opened the conversation within the last 5 minutes. How is "opened the conversation" tracked?

**Options:**
- **(A)** Check `messages.readAt` — if any message in this conversation was read in the last 5 minutes by the recipient, suppress email
- **(B)** Store `lastOpenedAt` on the conversation row per participant — requires a join table or jsonb column
- **(C)** Skip email suppression entirely in Phase 1 — always send email, let the user manage via notification preferences

**Recommendation: Option A.** Query the most recent message in the conversation where `senderId = currentSenderId` (not the recipient) and check if `readAt > now() - interval '5 minutes'`. If any such row exists, the recipient has recently read messages — suppress email. No new columns needed.

```ts
const recentlyRead = await db.query.messages.findFirst({
  where: and(
    eq(messages.conversationId, conversationId),
    ne(messages.senderId, senderId),          // messages TO the recipient
    gte(messages.readAt, subMinutes(new Date(), 5))
  ),
});
const suppressEmail = recentlyRead !== null;
```

---

### Q4 — Should `messages` Table Be Extended or a New `direct_messages` Table Created?

**Question:** Extending the existing `messages` table is simpler (no new tables, reuses pagination logic). However, it mixes AI chat messages and human messages in one table. A separate `direct_messages` table would be cleaner but requires more work.

**Options:**
- **(A)** Extend existing `messages` — add `senderType` and `readAt` columns
- **(B)** New `direct_messages` table — clean separation, no impact on AI chat
- **(C)** New `direct_messages` table but keep `messages` purely for AI — new routes for human messages

**Recommendation: Option A.** The existing `messages` table is already the right abstraction. Adding `senderType` ('ai' | 'human') and `readAt` is minimal and keeps the message fetching logic unified. The `GET /api/conversations/:id/messages` endpoint already returns messages — it can return both types.

The only risk is accidental AI-message contamination in the unread count query. This is mitigated by always filtering `WHERE senderType = 'human' AND senderId != currentUserId` in unread count calculations.

---

### Q5 — Does the Existing `/api/openai/conversations` Route Structure Need to Change?

**Question:** The current routes are:
```
GET  /api/openai/conversations
POST /api/openai/conversations/:id/messages
```

The new human conversation routes proposed are:
```
POST /api/conversations/direct
GET  /api/conversations/direct
GET  /api/conversations/:id/messages
POST /api/conversations/:id/messages (extended)
PATCH /api/conversations/:id/read
```

There is a namespace conflict: `/api/openai/conversations` vs `/api/conversations`. Are these in different Express routers? Could a new `/api/conversations` router conflict with existing registered routes?

**Recommendation:** Inspect `artifacts/api-server/src/routes/index.ts` to confirm how existing conversation routes are registered:
```bash
grep -n "conversation\|openai" artifacts/api-server/src/routes/index.ts | head -10
```

If `/api/openai/conversations` is registered under an `/openai` sub-router, a new `/api/conversations` router is clean with no conflict. If they share a router, careful ordering is required.

The new human message handler should be added to the existing `POST /api/openai/conversations/:id/messages` handler — branching on `conversation.type`:
```ts
if (conversation.type === 'human_direct') {
  // handle human message
} else {
  // existing AI chat logic — unchanged
}
```

---

### Q6 — Rate Limiting: 30 Messages Per Hour Per Conversation

**Question:** Module 3 specifies a rate limit of 30 messages per user per hour per conversation. TalentLock currently has no message-level rate limiting. What infrastructure exists?

**Recommendation:** Implement a simple in-DB rate limit check — count messages from `senderId` in this `conversationId` in the last hour:

```ts
const recentCount = await db.$count(messages, and(
  eq(messages.conversationId, conversationId),
  eq(messages.senderId, senderId),
  gte(messages.createdAt, subHours(new Date(), 1)),
));
if (recentCount >= 30) {
  return res.status(429).json({ error: 'Too many messages. Please wait before sending more.' });
}
```

No Redis required. The DB query is fast (indexed on `conversationId` + `senderId` + `createdAt`). The limit is generous enough to not affect normal usage.

---

### Q7 — Should `/messages` Be a Separate Route or Part of an Existing Page?

**Question:** Module 7 proposed a standalone `/messages` page. Users later asked for a chat box, not a separate messaging service.

**Decision (updated 2026-07-14):** Floating chat box is primary. `/messages` routes remain only as deep-link shims that open the chat box. Nav and profile "Message" open the overlay without leaving the current page. Booking/meeting keep compact inline threads.

---

### Q8 — GDPR: What Happens to Messages on Account Deletion?

**Question:** The existing `accountDeletion.ts` handles GDPR deletion. It must also handle conversation messages sent by the deleted user.

**Recommendation:** On account deletion, anonymise the `messages` rows where `senderId = deletedUserId`:
- Set `content = '[Message removed]'` (preserve the conversation thread structure but remove PII)
- Set `senderId = null` (or a sentinel `deleted-user` value)
- Do NOT delete the `conversations` row — the other participant's message history must be preserved

Add this anonymisation to the existing GDPR deletion transaction in `accountDeletion.ts`.

---

## ⚠️ Risks & Notes

### Risk 1 — `senderType` Backfill on Existing `messages` Rows

Adding `senderType text NOT NULL DEFAULT 'ai'` backfills all existing AI chat messages to `senderType = 'ai'`. This is correct. However, if any existing messages were created without explicit role tracking (e.g. if the `role` column already serves this purpose), confirm there is no semantic overlap.

**Mitigation:** After migration, run:
```sql
SELECT DISTINCT sender_type FROM messages;
-- Expected: only 'ai' immediately after migration
```

### Risk 2 — Existing AI Chat Conversations Affected by `employerId`/`freelancerId` Addition

Adding `employerId` and `freelancerId` as nullable columns to `conversations` means existing AI chat conversations will have `NULL` for both. Confirm that no existing query on `conversations` assumes these columns do not exist.

**Mitigation:** All new queries on `conversations` for human_direct threads filter on `type = 'human_direct'`. Existing AI chat queries filter on `type = 'ai_match'` (or `type IS NULL` for backward compatibility if the backfill is not applied). After migration, verify:
```sql
SELECT COUNT(*) FROM conversations WHERE type = 'ai_match';
-- Expected: all pre-existing rows
SELECT COUNT(*) FROM conversations WHERE type IS NULL;
-- Expected: 0
```

### Risk 3 — Deduplication Race Condition

Two simultaneous `POST /api/conversations/direct` requests for the same employer–freelancer pair could both pass the "does conversation exist?" check and both create a row. Use a UNIQUE constraint on `(employerId, freelancerId, bookingId)` to enforce deduplication at the DB level:

```sql
UNIQUE (employer_id, freelancer_id, booking_id)
```

Where `booking_id IS NULL` is treated as a distinct value — use a partial index:
```sql
CREATE UNIQUE INDEX conversations_unscoped_unique
ON conversations (employer_id, freelancer_id)
WHERE booking_id IS NULL AND type = 'human_direct';
```

The API uses an upsert (`INSERT ... ON CONFLICT ... DO NOTHING RETURNING *`) pattern.

### Risk 4 — `POST /api/conversations/:id/messages` Route Already Exists

The existing route `POST /api/openai/conversations/:id/messages` is namespaced under `/api/openai`. If the new human message posting shares the `/api/conversations/:id/messages` route (no `/openai` prefix), they are on different routers and there is no conflict. Confirm the router structure before assuming.

### Risk 5 — Inbox Performance at Scale

`GET /api/conversations/direct` returns all conversations with the last message preview and unread count. This requires a join across `conversations`, `messages`, and potentially `users`/`employer_profiles`/`freelancer_profiles`. At scale (hundreds of conversations per user), this query needs an index on `conversations.last_message_at` for the sort and a subquery for unread count.

**Mitigation:** Add indexes in the migration:
```sql
CREATE INDEX conversations_employer_last_message ON conversations (employer_id, last_message_at DESC) WHERE type = 'human_direct';
CREATE INDEX conversations_freelancer_last_message ON conversations (freelancer_id, last_message_at DESC) WHERE type = 'human_direct';
CREATE INDEX messages_unread ON messages (conversation_id, sender_id) WHERE read_at IS NULL;
```

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Exact `conversations` + `messages` schema | Task 1.1 (schema inspection) and Task 1.2 (column additions) |
| Q2 | Who can initiate conversations | Task 2.1 (`POST /api/conversations/direct` handler) |
| Q4 | Extend messages vs new table | Task 1.2 (schema) |
| Q5 | Router namespace conflict check | Task 2.1 (route registration) |

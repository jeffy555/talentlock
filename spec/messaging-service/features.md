# TalentLock — Features Specification: In-App Direct Messaging

## Overview

Every two-sided marketplace lives or dies on whether the two parties can communicate inside the platform. Right now, TalentLock brings employer and freelancer together through AI matching, rate negotiation, and agreement generation — but the moment they need to have a real conversation ("Can you start Monday?", "Do you have capacity for 3 days a week?", "What does your React experience look like specifically?") they leave the platform. That conversation happens on WhatsApp, email, or LinkedIn. TalentLock loses visibility into the relationship, cannot surface engagement metrics, cannot enable response-time reputation signals, and cannot keep the next booking on-platform.

**In-App Direct Messaging** closes this gap. It gives employers and freelancers a persistent, threaded message channel scoped to their relationship — attached to a booking or meeting where relevant. Messages are delivered in-app and by email when the recipient is offline. The conversation stays on TalentLock from first contact to final delivery.

The implementation is deliberately lightweight for Phase 1: it extends the existing `conversations` and `messages` tables (already present for AI chat) with a new conversation type, uses the existing notification and email pipeline for delivery, and polls for new messages on the existing 30-second interval. WebSockets and read receipts are Phase 2.

---

## UX Decision (2026-07-14) — Chat Box, Not a Separate Messaging App

Primary messaging UX is a **floating chat box** (Messenger / Intercom style), not a full-page messaging app that users leave the current page to use.

| Surface | Role |
|---|---|
| Floating chat launcher (bottom-right) | Primary entry — unread badge on the bubble |
| Expanded chat panel | Conversation list + active thread inside a fixed overlay |
| `/messages` and `/messages/:id` | Deep-link compatibility only (email / notification links) — open the chat box and return the user to the app |
| Booking / Meeting detail | Keep embedded inline threads (compact chat pane on those pages) |
| Freelancer profile "Message" | Opens the floating chat box for that conversation — does **not** navigate away |
| Top-nav "Messages" | Opens the floating chat box — does **not** navigate to a separate Messages page |

Backend, schema, and API routes are unchanged. This addendum changes Phase 3 presentation only.

---

## Feature Modules

### Module 1 — Conversation Types

The existing `conversations` table has one type: AI match chat (`type = 'ai_match'`). This feature adds one new type:

```ts
type ConversationType = 'ai_match' | 'human_direct';
```

When `type = 'human_direct'`, the conversation is a thread between a specific employer and freelancer. No AI is involved. Messages are stored in the existing `messages` table and attributed to the human sender.

**Everything about `type = 'ai_match'` conversations is unchanged.** The AI match chat at `/ai-match` continues to work identically. The new type is additive.

---

### Module 2 — Conversation Creation and Threading

A human_direct conversation is always between exactly one employer and one freelancer. It may optionally be scoped to a booking or meeting for context.

**Deduplication rule:** Only one `human_direct` conversation can exist per employer–freelancer pair per booking. If the employer tries to start a conversation that already exists, the server returns the existing conversation ID — no duplicate thread is created.

**Conversation participants:** Both the `employerId` and `freelancerId` are stored on the conversation row. Both parties can read and write messages. Neither party can delete a conversation — only the admin can.

**Scoping:** A conversation can optionally reference a `bookingId` or `meetingId`. This scopes the thread to a specific engagement and allows the booking/meeting detail page to surface the conversation inline. An unscoped conversation (no booking, no meeting) is also valid — for example when an employer messages a freelancer from their public profile before creating a booking.

---

### Module 3 — Message Sending and Storage

Messages are stored in the existing `messages` table. A human message is identical in structure to an AI message except:
- `senderType: 'human'` (vs `'ai'` for AI messages)
- `content` is the human-typed text (sanitised via `sanitiseText()`)
- No `tokenUsage` or AI metadata

**Message limits:**
- Maximum message length: 2,000 characters
- No attachment support in Phase 1 (text only)
- Rate limit: 30 messages per user per hour per conversation (prevents spam)

**Access control:** Only participants (the employer and freelancer linked to the conversation) can read or send messages. Any other authenticated user attempting to access the conversation gets a 403.

---

### Module 4 — Offline Delivery (Notification + Email)

When a message is sent, the recipient receives:

1. **In-app notification** (existing `notifications` table):
   ```ts
   createNotification(db, {
     userId: recipientId,
     type: 'new_message',
     title: `New message from ${senderName}`,
     body: messageContent.slice(0, 100) + (messageContent.length > 100 ? '...' : ''),
     metadata: { conversationId, bookingId, meetingId },
   })
   ```

2. **Email notification** (existing `sendNotificationEmail()`):
   - Subject: "New message from [Sender Name] on TalentLock"
   - Body: first 200 characters of the message + "Reply on TalentLock: [link to /messages/:id]"
   - Only sent if the recipient has not opened the conversation within the last 5 minutes (prevents email spam during active chat sessions)
   - Respects the recipient's `emailNotificationsEnabled` preference

Both are fire-and-forget `.catch()` — never awaited from the route handler.

---

### Module 5 — Unread Count and Badge

The existing `GET /api/notifications/unread-count` returns unread notification count. Messaging adds a parallel endpoint for unread message count:

```
GET /api/messages/unread-count
```

Returns `{ count: number }` — the number of conversations with at least one unread message for the current user.

This count appears as a badge on the "Messages" nav item. It is distinct from the notification bell badge — messages have their own badge in the navigation.

A message is considered unread when `messages.readAt IS NULL` AND `messages.senderId !== currentUserId`. Reading a conversation (opening `/messages/:id`) marks all messages in that conversation as read via `PATCH /api/conversations/:id/read`.

---

### Module 6 — Message Entry Points

Three places in the UI allow starting or opening a conversation:

**Entry Point 1 — Freelancer Detail Page (`/freelancers/:id`)**
Employers see a "Message" button next to the existing "Book" button. Clicking it creates or retrieves an unscoped human_direct conversation and **opens the floating chat box** on that conversation (no page navigation).

**Entry Point 2 — Booking Detail Page (`/bookings/:id`)**
A "Messages" tab is added to the booking detail page alongside existing tabs (milestones, agreement). The tab shows the conversation scoped to this booking via the compact inline thread.

**Entry Point 3 — Meeting Detail Page (`/meetings/:id`)**
A "Messages" section appears below the meeting details. Shows the conversation scoped to this meeting via the compact inline thread.

**Entry Point 4 — Floating Chat Launcher**
Authenticated users see a circular chat bubble fixed bottom-right (above page chrome). Badge shows unread conversation count. Clicking expands the chat box panel (list + thread). Closing collapses to the bubble. Users can browse Jobs, Vault, Bookings, etc. with the chat box open.

**Entry Point 5 — Top-nav "Messages"**
Opens the floating chat box. Does not route to a full-page inbox.

---

### Module 7 — Chat Box Panel (replaces full-page inbox as primary UX)

The expanded floating panel is a **single-column** chat box (list **or** thread, never both).

**Employer: search-to-chat (primary start flow)**

Employers do **not** get a pre-selected / default freelancer conversation. To start messaging they:

1. Focus the search box at the top of the panel (`Search freelancers to message…`)
2. Type a name or keyword (debounced; queries `GET /api/freelancers?q=…` which matches name, bio, skills)
3. Click a result → `POST /api/conversations/direct` with that `freelancerId` → open that conversation thread in the same chat box

Empty search shows **Recent conversations** only (existing `human_direct` threads). No conversation is auto-opened when the box opens.

**Freelancer:** search is not required (they reply to employers). They see the recent conversations list.

Each recent conversation row shows:
- The other party's name and avatar
- Preview of the last message (first 60 characters)
- Time since last message
- Unread indicator (blue dot) if there are unread messages
- Context chip: "Re: [Booking title]" or "Re: [Meeting]" if scoped

Clicking a conversation (or search result) opens the thread view inside the same panel — messages + input at the bottom. Back returns to search + recent list.

`/messages` and `/messages/:id` remain as deep links (email CTA). Visiting them opens the chat box (and optional conversation) then redirects the user back into the main app shell (e.g. `/dashboard`) so messaging never feels like a separate service.

---

### Module 8 — Polling

Phase 1 uses the existing 30-second polling pattern for new messages. The thread view polls `GET /api/conversations/:id/messages` every 30 seconds. New messages appear automatically.

This is intentionally the same cadence as the notification centre. Real-time delivery (WebSockets or SSE) is a Phase 2 concern.

---

## New Database Columns

### On `conversations` (existing table — additive only)

```ts
type:          text('type').notNull().default('ai_match'),
               // 'ai_match' | 'human_direct'
               // existing rows backfilled to 'ai_match' via NOT NULL DEFAULT
employerId:    text('employer_id').references(() => employerProfiles.id),
               // nullable — null for 'ai_match' conversations
freelancerId:  text('freelancer_id').references(() => freelancerProfiles.id),
               // nullable — null for 'ai_match' conversations
bookingId:     text('booking_id').references(() => bookings.id),
               // nullable — optional scope
meetingId:     text('meeting_id').references(() => meetings.id),
               // nullable — optional scope
lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
               // updated on every new message — drives inbox sort
```

### On `messages` (existing table — additive only)

```ts
senderType:    text('sender_type').notNull().default('ai'),
               // 'ai' | 'human'
               // existing rows backfilled to 'ai' via NOT NULL DEFAULT
readAt:        timestamp('read_at', { withTimezone: true }),
               // null = unread; set when recipient opens the conversation
```

**No new tables.** Everything flows through the existing `conversations` and `messages` tables. This is the minimum schema change required.

---

## New API Routes

```
POST /api/conversations/direct
  Create or retrieve a human_direct conversation between employer and freelancer.
  Body: { freelancerId, bookingId?, meetingId? }
  Returns: { conversationId, isNew: boolean }
  Employer-only — freelancers cannot initiate (they respond)

GET  /api/conversations/direct
  List all human_direct conversations for the current user.
  Paginated: ?page, ?pageSize
  Returns { data, total, page, pageSize, totalPages }
  Each item includes: otherPartyName, lastMessage preview, lastMessageAt, unreadCount, context (booking/meeting title)

GET  /api/conversations/:id/messages
  Paginated message history — works for both ai_match and human_direct.
  Currently exists for AI chat. Extend to human conversations.
  Returns { data, total, page, pageSize, totalPages }
  Each message: id, content, senderType, senderId, senderName, createdAt, readAt

POST /api/conversations/:id/messages  (extended — not new)
  Currently only handles AI chat messages.
  Extended: when conversation.type = 'human_direct', save a human message,
  notify recipient, do NOT call OpenAI.
  Body: { content: string (max 2000 chars) }
  Returns the saved message row

PATCH /api/conversations/:id/read
  Mark all unread messages in this conversation as read (readAt = now()).
  Called when the user opens the conversation thread.
  Returns { markedRead: number }

GET  /api/messages/unread-count
  Returns { count: number } — conversations with unread messages for current user.
```

---

## Plan Gating

In-App Direct Messaging is available on all plans — employer and freelancer alike. It is not a premium feature. Communication between the two parties is a table-stakes platform requirement, not a differentiator worth gating.

| Plan | Available |
|---|---|
| `freelancer_free` | ✅ |
| `freelancer_pro` | ✅ |
| `employer_starter` | ✅ |
| `employer_growth` | ✅ |
| `employer_enterprise` | ✅ |

---

## Non-Goals (Phase 1)

- File/image attachments (text only in Phase 1; GCS upload infrastructure exists for Phase 2)
- Read receipts visible to the sender ("seen at 10:32am") — `readAt` is tracked server-side but not shown to the other party
- Real-time delivery via WebSockets or SSE — Phase 2
- Message editing or deletion by users
- Group conversations (team messaging) — enterprise Phase 2
- Message search
- Typing indicators
- Employer-to-employer or freelancer-to-freelancer conversations
- AI-assisted message suggestions within the human thread
- Message moderation / content flagging (admin can view all messages)
- Push notifications (browser push API) — Phase 2

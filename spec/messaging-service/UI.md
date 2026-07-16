# TalentLock — UI Specification: In-App Direct Messaging

## Overview

**Primary UX (2026-07-14):** a floating **chat box** — bottom-right launcher bubble + expandable overlay panel with conversation list and thread. Users stay on whatever page they were viewing.

**Secondary:** compact inline threads on booking and meeting detail pages.

**Deep links only:** `/messages` and `/messages/:id` open the chat box then redirect into the app shell (email / notification links). They are not the primary messaging surface.

One nav item opens the chat box (with unread badge). One "Message" button on freelancer detail opens the chat box for that conversation.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter.
**Available to all roles.** Both employers and freelancers see the Messages nav item, floating launcher, and can participate in conversations.

---

## Component — Floating Chat Box (Primary)

**Files:**
- `artifacts/talentlock/src/components/messages/ChatBoxProvider.tsx` — context (`isOpen`, `selectedId`, `openInbox`, `openConversation`, `close`)
- `artifacts/talentlock/src/components/messages/FloatingChatBox.tsx` — launcher + panel
- `artifacts/talentlock/src/components/messages/MessagesWorkspace.tsx` — shared list+thread UI (`variant: "panel" | "page"`)

### Collapsed (launcher)

```
                                              ┌────┐
                                              │ 💬 │  ← fixed bottom-right, z-50
                                              │  2 │  ← unread badge when count > 0
                                              └────┘
```

### Expanded (panel) — single column

```
                              ┌─────────────────────────────┐
                              │ Messages                [×] │
                              ├─────────────────────────────┤
                              │ 🔍 Search freelancers…      │  ← employer only
                              ├─────────────────────────────┤
                              │ Results / Recent list…      │
                              │  OR thread (back ←)         │
                              └─────────────────────────────┘
```

- ~380×560px panel anchored bottom-right above the launcher
- Single column: search+list **or** thread (never side-by-side)
- Employer must search/select a freelancer to start a chat — no default person selected
- Closing returns to the launcher bubble; browsing continues underneath

### Deep-link pages

`MessagesInbox` / `MessageThread` call `openInbox()` / `openConversation(id)` on mount, then `replace` navigate to `/dashboard` so the URL never parks users on a separate messaging service.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Own message bubble | `bg-blue-600 text-white` | Messages sent by the current user |
| Other message bubble | `bg-slate-100 text-slate-800` | Messages received from the other party |
| Unread dot | `bg-blue-500` | Unread conversation indicator in inbox |
| Unread badge (nav + launcher) | `bg-blue-500 text-white` | Message count badge |
| Conversation row hover | `bg-slate-50` | Inbox row hover state |
| Conversation row active | `bg-blue-50 border-l-2 border-blue-500` | Currently open conversation |
| Empty state | `text-slate-400` | No messages yet |
| Timestamp | `text-slate-400 text-xs` | Message and conversation timestamps |
| Context chip | `bg-slate-100 text-slate-600 text-xs` | "Re: React Dashboard Contract" booking context |
| Rate limit error | `bg-red-50 text-red-700 border-red-200` | 429 error banner |
| Character counter warning | `text-amber-600` | > 1800 characters |
| Character counter limit | `text-red-600` | = 2000 characters |
| Chat launcher | `bg-primary text-white shadow-lg` | Floating bubble |
| Chat panel | `bg-card border shadow-2xl rounded-2xl` | Expanded overlay |

---

## Page 1 — Messages Inbox (`/messages`) — DEEP LINK ONLY

**File:** `artifacts/talentlock/src/pages/MessagesInbox.tsx`

On mount: open floating inbox → redirect to `/dashboard`. No full-page list is rendered as the primary experience.

---

## Page 2 — Message Thread (`/messages/:id`) — DEEP LINK ONLY

**File:** `artifacts/talentlock/src/pages/MessageThread.tsx`

On mount: open floating chat for `:id` → redirect to `/dashboard`.

---

## Workspace (shared list + thread)

**File:** `artifacts/talentlock/src/components/messages/MessagesWorkspace.tsx`

Used inside the floating panel (`variant="panel"`). Conversation selection calls `onSelectConversation(id)` instead of navigating.

Empty / loading / loaded list and thread bubbles match the existing messaging copy and tokens. Own messages right (blue), received left (slate). No read-receipt double ticks in Phase 1.

---

## Component — `<BookingMessageThread />` / `<MeetingMessageThread />`

Embedded compact chat panes on booking/meeting detail pages. Unchanged from Phase 1 except they remain secondary to the floating chat box.

---

## "Message" Button on Freelancer Detail Page

Opens `openConversation(conversationId)` on the floating chat box — does **not** navigate to `/messages/:id`.

---

## Nav Item

`openInbox()` on click — does **not** use `href="/messages"`. Unread badge from `useGetMessagesUnreadCount()` (30s poll).

---

## Copy Reference

| Location | String |
|---|---|
| Chat box heading | `Messages` |
| Launcher aria-label | `Open messages` / `Close messages` |
| Inbox — empty (employer) | `Browse the Talent Vault and click "Message" on any freelancer profile to start a conversation.` |
| Inbox — empty (freelancer) | `Conversations from employers will appear here.` |
| Inbox — empty CTA | `Browse Talent Vault →` |
| Thread — input placeholder | `Type a message...` |
| Thread — send hint | `Press Enter to send · Shift+Enter for new line` |
| "Message" button on profile | `Message` |
| Nav item | `Messages` |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/messages/ChatBoxProvider.tsx` | New | 3.9 |
| `src/components/messages/FloatingChatBox.tsx` | New | 3.9 |
| `src/components/messages/MessagesWorkspace.tsx` | Modified (panel variant) | 3.9 |
| `src/pages/MessagesInbox.tsx` | Modified (deep-link shim) | 3.2 |
| `src/pages/MessageThread.tsx` | Modified (deep-link shim) | 3.3 |
| `src/pages/FreelancerDetail.tsx` | Message opens chat box | 3.5 |
| `src/components/layout/AppLayout.tsx` | Nav opens chat box; mount FloatingChatBox | 3.8 / 3.9 |

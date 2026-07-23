# TalentLock — UI Specification: Cruise Mode & TalentSearch DM Delivery

Frontend-only changes. Messaging chat UI is unchanged — automated outreach appears as a normal message from the sender.

---

## Notification Cards

Existing badge patterns remain:

| Type | Recipient | Badge | Tap action |
|---|---|---|---|
| `cruise_mode_interest` | Employer | Cruise Mode ✦ | Open `/messages/:conversationId` |
| `talent_search_interest` | Freelancer | TalentSearch ✦ | Open `/messages/:conversationId` |

Preview text: first ~100 chars of DM body (not generic one-liner without message content).

---

## Activity Feed Rows

### Sent (live)

```
┌─────────────────────────────────────────────────────────────┐
│  Sarah Chen · Score 91/100 · Sent                           │
│  "I'm reaching out because your React/TypeScript stack..."  │
│  [Open conversation]  [Send follow-up]                        │
└─────────────────────────────────────────────────────────────┘
```

- **Open conversation** — primary CTA when `conversationId` set
- **Send follow-up** — opens same thread in floating chat / `/messages/:id`

### Dry run

```
┌─────────────────────────────────────────────────────────────┐
│  Would send (dry run) · Score 88/100                        │
│  Preview: "I'm reaching out because..."                     │
│  (no Open conversation button)                              │
└─────────────────────────────────────────────────────────────┘
```

### DM delivery failed

```
┌─────────────────────────────────────────────────────────────┐
│  Score 85/100 · Delivery failed                             │
│  The message could not be delivered. Try Send follow-up.    │
└─────────────────────────────────────────────────────────────┘
```

---

## Messages Inbox

No special bubble styling in Phase 1. Automated messages look like normal human messages from the employer or freelancer — consistent with "on your behalf" product copy.

Optional Phase 2: subtle footer *"Sent via Cruise Mode ✦"* on first automated message in thread.

---

## Floating Chat

Deep links from notifications and activity feed use existing `/messages/:id` → opens chat box behaviour from `spec/messaging-service/UI.md`.

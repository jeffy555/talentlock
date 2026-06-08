# TalentLock — Features Specification: Per-Conversation Token Breakdown

## Overview

TalentLock already shows employers their total monthly token usage via the Token Usage Widget on the Dashboard and Billing pages (completed in the token-consumption feature). However, employers using the AI Talent Matching chat have no visibility into how many tokens any individual conversation consumes. A power user running 10–20 AI conversations a month cannot tell which conversations are expensive, whether a single complex conversation is eating a disproportionate share of their quota, or how each message exchange contributes to their total.

This feature adds per-conversation token visibility directly inside the AI Match chat on `/ai-match`. Each conversation in the sidebar shows its total token cost as a small badge. Selecting a conversation reveals a collapsible breakdown panel showing tokens used per message exchange, a cumulative total, and what percentage of the employer's monthly quota this single conversation represents.

This feature was originally deferred in the token-consumption spec as a non-goal. It is now implemented as a standalone feature targeting Growth and Enterprise plan employers (power users who are most likely to need this level of visibility).

---

## Feature Modules

### Module 1 — Conversation Token Badge (Sidebar)

Each conversation listed in the AI Match sidebar shows a small token count badge to the right of the conversation title:

```
My React Project Search          [1,240 tokens]
Design Freelancer Hunt             [890 tokens]
```

The badge is loaded lazily — it does not block the sidebar rendering. While loading it is simply absent (no skeleton, no placeholder). Once loaded it shows the total token count for that conversation formatted with comma separators.

Available to: Growth and Enterprise plans only. Starter plan employers see no badge.

---

### Module 2 — Breakdown Panel (Chat View)

When an employer selects a conversation, a collapsible toggle appears below the chat messages area:

```
▾ Token usage for this conversation
```

Clicking the toggle expands the breakdown panel showing:
- Heading: `Token Usage — This Conversation`
- Total tokens + percentage of monthly quota (omitted for Enterprise unlimited)
- A table of per-message rows: message number, prompt tokens, completion tokens, total tokens, timestamp

The panel is collapsed by default. The toggle is always visible for Growth/Enterprise employers regardless of whether breakdown data exists.

Available to: Growth and Enterprise plans only.

---

### Module 3 — Locked State (Starter Plan)

Starter plan employers see a locked state in place of the toggle:

```
🔒 Per-conversation breakdown — Growth plan feature
[Upgrade to Growth →]
```

No toggle, no panel, no badges in the sidebar.

---

### Module 4 — Legacy Conversation State

Conversations that existed before this feature was deployed will have no `token_usage` rows with a `conversationId`. For these conversations the breakdown panel shows:

```
Token breakdown is only available for conversations
started after [CONVERSATION_BREAKDOWN_LAUNCH_DATE].
```

The `CONVERSATION_BREAKDOWN_LAUNCH_DATE` constant is set in the frontend to the date this feature is deployed.

---

### Module 5 — API Endpoint

A new endpoint `GET /api/token-usage/conversation/:conversationId` returns all token usage rows for a given conversation, the total, and the percentage of monthly quota.

This endpoint is gated to Growth and Enterprise employers only (`402 PLAN_LIMIT` for Starter). It returns `legacyData: true` when no rows are found for that conversation ID.

---

## Plan Gating

| Plan | Sidebar Badge | Breakdown Panel |
|---|---|---|
| `employer_starter` | ❌ | 🔒 Locked state |
| `employer_growth` | ✅ | ✅ |
| `employer_enterprise` | ✅ | ✅ (no % of quota — unlimited) |

Freelancers do not use the AI Match chat. This feature is employer-only.

---

## Data Source

Uses the existing `token_usage` table. The `conversationId` column (added in ai-enhancements Phase 1, Task 1.1) links token usage rows to specific conversations. No new tables required.

Token logging continues to use the existing `ai_match` feature label. This feature adds no new token consumption — it is purely a display layer over existing data.

---

## Non-Goals (Out of Scope for This Feature)

- Exportable token usage reports per conversation
- Token cost in currency ($) — tokens only
- Per-message token breakdown for agreement generation or redlining (only AI Match)
- Historical breakdown for conversations before the feature launch date
- Token breakdown on the public `/f/:id` profile page
- Freelancer-visible token data of any kind
- Alerting when a single conversation exceeds a threshold
- Token breakdown in the admin console per conversation (admin sees user-level totals only)

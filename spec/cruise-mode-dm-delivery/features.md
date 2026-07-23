# TalentLock — Features Specification: Cruise Mode & TalentSearch Direct Message Delivery

## Overview

Today, when **Cruise Mode** (freelancer) or **TalentSearch** (employer) decides to reach out, the platform stores the AI `proposedMessage` in the activity log and sends a **feature notification only**. The recipient does **not** receive a real message in the **Messages** inbox (`human_direct` conversation).

That breaks the core promise of both features: *"sends a personalised interest message on your behalf."* Employers and freelancers expect to open **Messages** and reply — not hunt for a bell notification with a one-line summary.

This spec closes that gap by delivering the AI `proposedMessage` as a **real direct message (DM)** in the existing messaging system (`spec/messaging-service/`), for **both** bilateral automation features.

---

## Scope

| Feature | Sender (DM author) | Recipient | Trigger |
|---|---|---|---|
| **Cruise Mode** | Freelancer (on behalf of) | Employer | New job post evaluation → `decision = sent` |
| **TalentSearch** | Employer (on behalf of) | Freelancer | Profile create/update evaluation → `decision = sent` |

**In scope**
- Send `proposedMessage` into `human_direct` conversation via existing messaging primitives
- Link activity rows to `conversationId` + `messageId`
- One feature-branded in-app notification per send (✦ badge) linking to the DM thread
- Email offline delivery (same pattern as human DMs)
- Dry run unchanged — **no DM**, no notification to counterparty
- Activity feed "View message" / "Open conversation" links

**Out of scope**
- WebSockets / read receipts (messaging Phase 2)
- Attachments in automated outreach
- Changing AI evaluation rules, quotas, or pre-filters
- Auto-creating bookings or meetings

---

## Relationship to Existing Specs

| Spec | Role |
|---|---|
| `spec/cruisemode/` | Freelancer Cruise Mode — Module 4 updated to require DM delivery |
| `spec/employer-cruisemode/` | Employer TalentSearch — Module 4 updated to require DM delivery |
| `spec/messaging-service/` | Reuses `findOrCreateConversation`, message storage, rate limits, `/messages/:id` deep links |

Both Cruise Mode and TalentSearch **must** call the shared outreach helper defined in this spec — no duplicate DM logic in each evaluator.

---

## Feature Modules

### Module 1 — Shared Automated Outreach Helper

**File:** `artifacts/api-server/src/lib/automatedOutreachMessaging.ts`

```ts
type OutreachSource = "cruise_mode" | "talent_search";

sendAutomatedOutreachMessage(db, {
  source: OutreachSource,
  employerId: number,
  freelancerId: number,
  senderRole: "employer" | "freelancer",  // who the message appears from
  senderUserId: number,
  senderProfileId: number,
  content: string,                          // AI proposedMessage (sanitised, max 2000)
  activityEntityType: "cruise_mode_activity" | "talent_search_activity",
  activityId: string,
  notificationType: NotificationType,       // CRUISE_MODE_INTEREST | TALENT_SEARCH_INTEREST
  notificationMessage: string,              // short preview for bell icon
}, log): Promise<{ conversationId: number; messageId: number }>
```

**Behaviour**
1. `findOrCreateConversation()` — unscoped `human_direct` (`bookingId = null`) between the employer–freelancer pair
2. Insert message with role `human_employer` or `human_freelancer` (same as manual DMs)
3. Update `conversations.lastMessageAt`
4. Send **one** in-app notification to the **recipient**:
   - Type: `cruise_mode_interest` (employer recipient) or `talent_search_interest` (freelancer recipient)
   - `entityType: "conversation"`, `entityId: conversationId` — opens DM thread
   - Body includes ✦ badge in UI (existing `NotificationItem` patterns)
5. Send email to recipient (reuse `sendNotificationEmailAsync`, link `/messages/:conversationId`)
6. **Do not** also fire generic `new_message` — avoids double notifications for the same outreach
7. Return `{ conversationId, messageId }` for activity row update

**Failure handling**
- DM failure must **not** fail the evaluation pipeline — log warning, keep activity row with `decision = sent` but nullable `conversationId`/`messageId` and optional `skippedReason` extension field `"dm_delivery_failed"` in logs only
- If `proposedMessage` is empty after sanitisation → treat as skip (should not happen when AI validation passes)

---

### Module 2 — Cruise Mode DM (Freelancer → Employer)

When `cruiseModeEvaluator` reaches `decision === "sent"`:

1. Keep existing `job_interests` insert (employer job inbox signal)
2. **Replace** notification-only delivery with `sendAutomatedOutreachMessage`:
   - `senderRole: "freelancer"`
   - `content: evaluation.proposedMessage`
   - Recipient: employer user
3. Persist `conversationId` + `messageId` on `cruise_mode_activity`
4. Freelancer confirmation notification (`cruise_mode_sent`) unchanged — links to `/cruise-mode?tab=activity`
5. Remove standalone `CRUISE_MODE_INTEREST` notification that does not link to Messages (superseded by DM + notification pointing to conversation)

**Employer experience**
- Messages inbox shows thread from freelancer with full AI-composed interest text
- Notification: *"[Name] expressed interest in [Job Title] via Cruise Mode ✦"* → opens chat

---

### Module 3 — TalentSearch DM (Employer → Freelancer)

When `talentSearchEvaluator` reaches `decision === "sent"`:

1. **Replace** notification-only delivery with `sendAutomatedOutreachMessage`:
   - `senderRole: "employer"`
   - `content: evaluation.proposedMessage`
   - Recipient: freelancer user
2. Persist `conversationId` + `messageId` on `talent_search_activity`
3. Employer confirmation notification (`talent_search_sent`) unchanged
4. Increment freelancer daily TalentSearch cap **only after DM succeeds** (same as today’s `sent` decision)

**Freelancer experience**
- Messages inbox shows thread from employer with full AI outreach
- Notification: *"[Company] expressed interest in your profile via TalentSearch ✦"* → opens chat

---

### Module 4 — Activity Feed & Follow-Up UX

**Cruise Mode activity row** (`/cruise-mode?tab=activity`)
- Show `proposedMessage` preview (existing)
- New action: **Open conversation** → `/messages/:conversationId` when `messageId` present
- **Send follow-up** (existing) opens same thread — pre-select conversation

**TalentSearch activity row** (`/talent-search?tab=activity`)
- Same pattern for employer viewing freelancer outreach

**Dry run rows**
- Show `proposedMessage` as preview only — label **"Would send (dry run)"** — no conversation link

---

### Module 5 — Database Additions

Additive columns on existing activity tables:

| Table | Column | Type | Purpose |
|---|---|---|---|
| `cruise_mode_activity` | `conversationId` | integer nullable FK → `conversations.id` | DM thread |
| `cruise_mode_activity` | `messageId` | integer nullable FK → `messages.id` | Sent message |
| `talent_search_activity` | `conversationId` | integer nullable FK → `conversations.id` | DM thread |
| `talent_search_activity` | `messageId` | integer nullable FK → `messages.id` | Sent message |

No new tables. No OpenAPI surface change required for MVP (fields returned on existing activity list endpoints — extend OpenAPI in Phase 2 backend task).

---

## Non-Goals

- Marking automated messages visually inside the chat bubble (Phase 2 — optional `messages.source` metadata)
- Re-sending DMs for historical `sent` activity rows (one-time backfill script is optional ops task, not product requirement)
- Changing Cruise Mode monthly message quota semantics — one successful DM = one sent message for quota purposes (unchanged)

---

## Success Criteria

1. Employer receives a **real DM** in Messages when Cruise Mode sends on a matching job
2. Freelancer receives a **real DM** in Messages when TalentSearch sends on a matching profile
3. Notification deep-link opens the **conversation thread**, not only the activity page
4. Dry run never creates conversations or messages
5. Existing manual messaging between the same pair continues in the **same unscoped thread** (deduplication rule unchanged)

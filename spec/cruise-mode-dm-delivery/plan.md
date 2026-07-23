# TalentLock — Implementation Plan: Cruise Mode & TalentSearch DM Delivery

> **Status: APPROVED — Ready for implementation**
> Read alongside `spec/cruisemode/plan.md`, `spec/employer-cruisemode/plan.md`, and `spec/messaging-service/plan.md`.
> If this file and `task.md` conflict, this file wins.

---

## Pre-Implementation Checks

```bash
# Messaging primitives
grep -n "findOrCreateConversation\|sendHumanMessage" artifacts/api-server/src/lib/conversationsUtils.ts

# Current send paths (notification-only today)
grep -n "decision === \"sent\"" artifacts/api-server/src/lib/cruiseModeEvaluator.ts
grep -n "decision === \"sent\"" artifacts/api-server/src/lib/talentSearchEvaluator.ts

# Activity schemas
grep -n "cruiseModeActivity\|talentSearchActivity" lib/db/src/schema/*.ts

# Notification routes for DM deep links
cat artifacts/talentlock/src/lib/notificationRoutes.ts
```

---

## Resolved Questions

### Q1 — Reuse `sendHumanMessage` or new helper?

**Decision: New wrapper `sendAutomatedOutreachMessage()` that shares insert logic but suppresses duplicate `new_message` notification.**

`sendHumanMessage()` always emits `NotificationType.NEW_MESSAGE`. Automated outreach must emit the feature-specific type (`cruise_mode_interest` / `talent_search_interest`) with ✦ badge UX already built. Extract shared insert + `lastMessageAt` update into a private helper or call `sendHumanMessage` with a new optional flag `{ notificationMode: "standard" | "outreach", outreachNotification?: ... }`.

Prefer **single flag on sendHumanMessage** to avoid drift:

```ts
sendHumanMessage(db, params, log, {
  notificationOverride: {
    type: NotificationType.TALENT_SEARCH_INTEREST,
    entityType: "conversation",
    message: "LoavesFlash expressed interest in your profile",
  },
});
```

When `notificationOverride` is set, skip default `NEW_MESSAGE`.

---

### Q2 — Conversation scoping for Cruise Mode job context

**Decision: Unscoped `human_direct` thread** (`bookingId = null`).

The AI `proposedMessage` already references the job title and skills. Job context remains on `cruise_mode_activity.jobRequirementId`. Multiple job matches between the same pair append messages to the **same thread** — matches user expectation for ongoing employer–freelancer dialogue.

Cruise Mode continues to insert `job_interests` for employer job-management UX.

---

### Q3 — TalentSearch conversation when no job exists

**Decision: Unscoped `human_direct` thread** — employer outreach is profile-level, not job-scoped.

---

### Q4 — Dry run

**Decision: Unchanged.** No conversation, no message, no counterparty notification. Activity row stores `proposedMessage` for preview only.

---

### Q5 — Delivery failure vs `decision = sent`

**Decision: `decision = sent` only when DM insert succeeds.**

If DM fails after AI approved send:
- Log error with activity id
- Set `decision = "send_failed"` (new decision value) OR keep `sent` with null `messageId` — **prefer new value `dm_failed`** for activity feed clarity
- Do not increment TalentSearch freelancer daily cap or Cruise Mode monthly quota on `dm_failed`
- Sender-side confirmation notification says delivery failed (optional toast on next activity poll)

**Migration note:** Valid `decision` enum expands by one: `dm_failed`.

---

### Q6 — OpenAPI / activity API

**Decision: Extend existing activity list responses** with optional `conversationId`, `messageId`. Update `lib/api-spec/openapi.yaml` activity item schemas + codegen before frontend links.

---

## Implementation Order

| Phase | Work |
|---|---|
| 1 | Schema — four nullable FK columns + push |
| 2 | Backend — `sendAutomatedOutreachMessage`, wire both evaluators, extend activity mappers, OpenAPI + codegen |
| 3 | Frontend — activity feed "Open conversation", notification routes already support `conversation` entity |
| 4 | Validation — integration tests with mocked OpenAI + real DM insert |

---

## Files Touched

| File | Change |
|---|---|
| `lib/db/src/schema/cruiseMode.ts` | `conversationId`, `messageId` on activity |
| `lib/db/src/schema/talentSearch.ts` | `conversationId`, `messageId` on activity |
| `artifacts/api-server/src/lib/conversationsUtils.ts` | Optional notification override |
| `artifacts/api-server/src/lib/automatedOutreachMessaging.ts` | **New** shared helper |
| `artifacts/api-server/src/lib/cruiseModeEvaluator.ts` | DM on `sent` |
| `artifacts/api-server/src/lib/talentSearchEvaluator.ts` | DM on `sent` |
| `lib/api-spec/openapi.yaml` | Activity item fields |
| `artifacts/talentlock/src/components/cruise-mode/CruiseModeActivityFeed.tsx` | Open conversation link |
| `artifacts/talentlock/src/components/talent-search/TalentSearchActivityFeed.tsx` | Open conversation link |
| `spec/cruisemode/features.md` | Module 4 DM delivery |
| `spec/employer-cruisemode/features.md` | Module 4 DM delivery |

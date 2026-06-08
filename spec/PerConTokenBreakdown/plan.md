# TalentLock — Implementation Plan: Per-Conversation Token Breakdown

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Before writing any code the agent must run these and report findings:

```bash
# 1. Check if conversationId column exists on token_usage
grep -A 30 "tokenUsage\s*=" lib/db/schema.ts | grep -i "conversation"

# 2. Check logTokenUsage signature
grep -A 10 "export.*logTokenUsage" artifacts/api-server/src/lib/tokenLogger.ts

# 3. Check if endpoint already exists
grep -r "conversation/:conversationId\|conversationId" artifacts/api-server/src/routes/tokenUsage.ts

# 4. Check how AiMatch.tsx handles conversations
grep -n "conversationId\|conversation\|activeConversation\|selectedConversation" artifacts/talentlock/src/pages/AiMatch.tsx | head -30

# 5. Check conversation list structure in sidebar
grep -n "conversation\|ConversationItem\|conversations\.map" artifacts/talentlock/src/pages/AiMatch.tsx | head -20
```

Report all findings before any implementation.

---

## Resolved Questions

---

### Q1 — `token_usage.conversationId` Column

**Decision: Inspect first. Add only if missing.**

If the column does NOT exist:
```ts
// Add to tokenUsage table in lib/db/schema.ts
conversationId: text('conversation_id').references(() => conversations.id),
// Nullable — NULL for non-AI-Match feature rows
```

Run migration:
```bash
pnpm --filter @workspace/db run push
```

If the column already exists — confirm and skip migration entirely.

---

### Q2 — `logTokenUsage()` Signature

**Decision: Inspect first. Update only if the `conversationId` param is missing.**

If `conversationId?: string` is NOT already a parameter:

```ts
// Updated signature in artifacts/api-server/src/lib/tokenLogger.ts
export async function logTokenUsage(
  db: DB,
  userId: string | 'system',
  feature: TokenFeature,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
  conversationId?: string  // ← add if not present
)
```

Also update the INSERT inside `logTokenUsage` to include `conversationId`:
```ts
await db.insert(tokenUsage).values({
  userId,
  feature,
  promptTokens: usage.promptTokens,
  completionTokens: usage.completionTokens,
  totalTokens: usage.totalTokens,
  conversationId: conversationId ?? null,  // ← add
  createdAt: new Date(),
});
```

After updating the signature, find every call to `logTokenUsage()` in the AI Match chat route and pass the active `conversationId`:

```ts
// In the AI Match message handler (openai.ts or equivalent)
await logTokenUsage(db, internalUserId, 'ai_match', usage, conversationId);
//                                                          ↑ add this
```

---

### Q3 — Endpoint Already Exists?

**Decision: Inspect first. Skip Phase 2 entirely if already implemented.**

```bash
grep -r "conversation/:conversationId" artifacts/api-server/src/routes/tokenUsage.ts
```

If `GET /api/token-usage/conversation/:conversationId` already exists:
- Confirm the response shape matches what this feature needs
- Confirm the `useGetTokenUsageConversationId()` hook exists in `lib/api-client-react/`
- Skip Phase 2 entirely and proceed to Phase 3

If the endpoint does not exist — implement Phase 2 as specified in `task.md`.

---

### Q4 — `conversationId` Access in Frontend

**Decision: Inspect AiMatch.tsx first. Use the actual state/prop name.**

After reading the file, identify:
- How the currently selected conversation is tracked (state variable name, URL param, or context)
- What shape the conversation object has
- Whether `id` or `conversationId` is used as the identifier field

Document in a comment at the top of the new component file:
```ts
// Conversation ID source: confirmed from AiMatch.tsx inspection
// Active conversation accessed via: [document what you found]
```

---

### Q5 — Sidebar Structure

**Decision: Inspect first. Extract a component if needed.**

After reading AiMatch.tsx:
- If conversations are rendered via a shared `<ConversationItem />` component → add the badge as a prop or inside that component
- If rendered as inline JSX → extract a `<ConversationListItem />` component, then add the badge

Either way, the badge renders only when `userPlan !== 'employer_starter'` and token data is loaded.

---

### Q6 — `percentOfMonthlyQuota` Calculation

**Decision: Option B — frontend calculation using existing `useGetTokenUsageMe()` data.**

The conversation endpoint returns `totalTokens` only. The frontend calculates percentage:

```ts
// In the breakdown panel component
const { data: monthlyUsage } = useGetTokenUsageMe();
const monthlyTokenLimit = monthlyUsage?.monthlyTokenLimit ?? null;

const percentOfQuota = monthlyTokenLimit === null
  ? null  // enterprise — unlimited
  : Math.round((conversationData.totalTokens / monthlyTokenLimit) * 100);
```

The conversation endpoint does NOT need to calculate or return `percentOfMonthlyQuota` — remove it from the response shape. The frontend does this calculation locally.

Updated endpoint response shape:
```ts
{
  conversationId: string,
  totalTokens: number,
  messages: {
    id: number,
    promptTokens: number,
    completionTokens: number,
    totalTokens: number,
    createdAt: string  // ISO timestamp
  }[],
  legacyData: boolean  // true when messages array is empty
}
```

---

### Q7 — Sidebar Badge Loading Strategy

**Decision: Option B — load only the active conversation's breakdown.**

The sidebar badge only shows on the conversation the employer currently has selected. When the employer switches conversations, the hook refetches for the new active conversation.

```ts
// Only fetch when userPlan allows AND a conversation is selected
const { data } = useGetTokenUsageConversationId(activeConversationId, {
  enabled: !!activeConversationId && userPlan !== 'employer_starter',
});
```

The badge in the sidebar is therefore only visible on the active/selected conversation item. Unselected conversations show no badge. This avoids N parallel API calls.

---

### Q8 — Message Timestamp Format

**Decision: Time-only for today, date + time for older conversations.**

```ts
function formatMessageTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
    // → "10:24 AM"
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  // → "Jun 4, 10:24 AM"
}
```

---

## Resolved Risks

---

### Risk 1 — NULL `conversationId` Rows

**Resolution: Covered by Q2 above — `logTokenUsage()` must be updated and AI Match route must pass `conversationId`.**

If this is not done, `legacyData: true` will be returned for all conversations even after deployment. The feature will appear to work (no errors) but show no data. The acceptance criteria in `task.md` includes a check that a NEW conversation created after implementation actually has `conversationId` rows in `token_usage`.

---

### Risk 2 — N+1 API Calls

**Resolution: Covered by Q7 — load only active conversation. No N+1 pattern.**

---

### Risk 3 — Enterprise `null` Monthly Limit

**Resolution: Guard before percentage calculation.**

```ts
const percentOfQuota = monthlyTokenLimit === null
  ? null
  : Math.round((totalTokens / monthlyTokenLimit) * 100);
```

When `percentOfQuota` is null:
- Do NOT render the `"X% of monthly quota"` line
- Do NOT render `"0%"` or any percentage
- The total tokens line still renders: `"Total: 1,240 tokens"`

---

### Risk 4 — Codegen Export Rules

**Resolution: Same mandatory post-codegen checks as all previous features.**

After `pnpm --filter @workspace/api-spec run codegen`:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## `CONVERSATION_BREAKDOWN_LAUNCH_DATE` Constant

Set this constant in the frontend to the actual deployment date of this feature. Used to show the legacy message for conversations that predate the feature.

```ts
// artifacts/talentlock/src/lib/constants.ts (create if not exists, or add to existing)
export const CONVERSATION_BREAKDOWN_LAUNCH_DATE = new Date('2025-XX-XX'); // ← set on deploy
```

The legacy message reads:
```
Token breakdown is only available for conversations
started after {CONVERSATION_BREAKDOWN_LAUNCH_DATE formatted as "MMMM D, YYYY"}.
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/per-conversation-token-breakdown/features.md` read
- [ ] `specs/per-conversation-token-breakdown/clarify.md` read
- [ ] This `plan.md` read — all 8 questions and 4 risks resolved
- [ ] `specs/per-conversation-token-breakdown/task.md` read — phase order understood
- [ ] `specs/per-conversation-token-breakdown/UI.md` read — all states understood
- [ ] Token-consumption feature confirmed deployed
- [ ] Codebase inspections complete — Q1, Q2, Q3, Q4, Q5 confirmed from actual files
- [ ] `CONVERSATION_BREAKDOWN_LAUNCH_DATE` value confirmed for this deployment

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Schema + utility — `conversationId` column and `logTokenUsage()` update | ⬜ Not started |
| Phase 2 | Backend — endpoint + OpenAPI + codegen (skip if already done) | ⬜ Not started |
| Phase 3 | Frontend — badge, breakdown panel, locked/legacy states | ⬜ Not started |

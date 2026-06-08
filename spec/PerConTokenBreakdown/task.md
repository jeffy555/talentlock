# TalentLock — Task Breakdown: Per-Conversation Token Breakdown

## Summary

Add per-conversation token visibility to the AI Match chat. Three phases: Schema + Utility → Backend endpoint → Frontend. Phase 1 and Phase 2 may be partially or fully skipped if ai-enhancements Phase 1 has already been executed.

---

## Phase 1 — Schema + Utility

> Run all codebase checks from `plan.md` first before any task in this phase.

### Task 1.1 — Add `conversationId` to `token_usage` (If Missing)

**File:** `lib/db/schema.ts`

Check:
```bash
grep -A 30 "tokenUsage\s*=" lib/db/schema.ts | grep -i "conversation"
```

If missing, add to the `tokenUsage` table definition:
```ts
conversationId: text('conversation_id').references(() => conversations.id),
```

Then run:
```bash
pnpm --filter @workspace/db run push
```

If already present — confirm and skip.

### Task 1.2 — Update `logTokenUsage()` Signature (If Missing)

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

Check:
```bash
grep -A 8 "export.*logTokenUsage" artifacts/api-server/src/lib/tokenLogger.ts
```

If `conversationId?: string` is NOT already a parameter — add it per `plan.md` Q2 (exact signature and INSERT update shown there).

If already present — confirm and skip.

### Task 1.3 — Update AI Match Route to Pass `conversationId`

**File:** `artifacts/api-server/src/routes/openai.ts` (or wherever AI Match messages are handled)

Find every call to `logTokenUsage()` in the AI Match chat message handler. Ensure `conversationId` is passed:

```ts
// Extract conversationId from the route params
const { id: conversationId } = req.params;

// Pass to logTokenUsage
await logTokenUsage(db, internalUserId, 'ai_match', usage, conversationId);
```

Confirm the conversation ID is available from the route param (`/api/openai/conversations/:id/messages` — `:id` is the `conversationId`).

### Task 1.4 — Verify `token_usage` Rows Are Written With `conversationId`

After completing Tasks 1.1–1.3, send a test AI Match message and confirm:

```sql
SELECT conversation_id, feature, total_tokens
FROM token_usage
WHERE feature = 'ai_match'
ORDER BY created_at DESC LIMIT 3;
```

- [ ] `conversation_id` is populated (not NULL) for new `ai_match` rows

---

## Phase 2 — Backend API (Skip If Endpoint Already Exists)

> Check first:
> ```bash
> grep -r "conversation/:conversationId" artifacts/api-server/src/routes/tokenUsage.ts
> ```
> If endpoint exists — confirm response shape matches plan.md Q6, confirm `useGetTokenUsageConversationId()` hook exists, and skip to Phase 3.

### Task 2.1 — Add Endpoint to `tokenUsage.ts`

**File:** `artifacts/api-server/src/routes/tokenUsage.ts`

Add `GET /api/token-usage/conversation/:conversationId`

**Guards:**
1. Require Clerk auth + `userRole === 'employer'` → 403
2. Fetch employer's plan — if `employer_starter` → 402:
```ts
return res.status(402).json({
  error: 'Per-conversation breakdown requires Growth or Enterprise plan',
  code: 'PLAN_LIMIT',
  planNeeded: 'employer_growth'
});
```
3. Verify the conversation belongs to this employer (fetch from `conversations` table, check `userId`) → 403 if not theirs

**Query:**
```ts
const rows = await db.select()
  .from(tokenUsage)
  .where(eq(tokenUsage.conversationId, conversationId))
  .orderBy(asc(tokenUsage.createdAt));
```

**Response (from plan.md Q6 — use exactly this shape):**
```ts
{
  conversationId: string,
  totalTokens: number,           // sum of all rows
  messages: {
    id: number,
    promptTokens: number,
    completionTokens: number,
    totalTokens: number,
    createdAt: string            // ISO timestamp
  }[],
  legacyData: boolean            // true when messages array is empty
}
```

When `rows.length === 0`: return `{ conversationId, totalTokens: 0, messages: [], legacyData: true }`

### Task 2.2 — OpenAPI Spec Update + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add `GET /api/token-usage/conversation/{conversationId}` with full response schema.

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## Phase 3 — Frontend

### Task 3.1 — Inspect AiMatch.tsx

Before any frontend work:

```bash
grep -n "conversationId\|activeConversation\|selectedConversation\|conversations\.map\|ConversationItem" \
  artifacts/talentlock/src/pages/AiMatch.tsx | head -30
```

Document:
- How the active conversation ID is tracked
- Whether there is a shared conversation list item component
- The exact variable name holding the active conversation ID

### Task 3.2 — Add `CONVERSATION_BREAKDOWN_LAUNCH_DATE` Constant

**File:** `artifacts/talentlock/src/lib/constants.ts` (create if not exists)

```ts
// Set to the date this feature is deployed — update before deploying
export const CONVERSATION_BREAKDOWN_LAUNCH_DATE = new Date('2025-01-01');
```

Update the date value to the actual deploy date before merging.

### Task 3.3 — Add `formatMessageTime` Utility

**File:** `artifacts/talentlock/src/lib/formatMessageTime.ts` (create new)

Use the exact function from `plan.md` Q8. Export as a named export.

### Task 3.4 — Verify `useGetTokenUsageConversationId()` Hook

```bash
grep -r "useGetTokenUsageConversationId\|TokenUsageConversation" lib/api-client-react/src/
```

If missing, re-run codegen before continuing.

### Task 3.5 — Create `<ConversationTokenBadge />`

**File:** `artifacts/talentlock/src/components/ConversationTokenBadge.tsx` (create new)

Props:
```ts
interface ConversationTokenBadgeProps {
  conversationId: string;
  isActive: boolean;         // only fetch when this is the active conversation
  userPlan: string;
}
```

Logic:
```ts
const { data } = useGetTokenUsageConversationId(conversationId, {
  enabled: isActive && userPlan !== 'employer_starter',
});

if (!isActive || userPlan === 'employer_starter' || !data) return null;

return (
  <span className="text-xs text-muted-foreground bg-slate-100 rounded px-1.5 py-0.5">
    {data.totalTokens.toLocaleString()} tokens
  </span>
);
```

Does not render for Starter plan. Does not render while loading (no skeleton). Renders only on the active conversation.

### Task 3.6 — Create `<ConversationTokenBreakdown />`

**File:** `artifacts/talentlock/src/components/ConversationTokenBreakdown.tsx` (create new)

Props:
```ts
interface ConversationTokenBreakdownProps {
  conversationId: string;
  userPlan: string;
}
```

Data sources:
```ts
const { data: breakdownData } = useGetTokenUsageConversationId(conversationId, {
  enabled: userPlan !== 'employer_starter',
});
const { data: monthlyUsage } = useGetTokenUsageMe();
```

Renders 4 states — see `UI.md` for full spec:
1. **Locked** — Starter plan
2. **Legacy** — `legacyData === true`
3. **Loaded** — breakdown table with messages
4. **Error** — API error with retry

See `UI.md` for exact rendering of each state.

### Task 3.7 — Integrate Into AiMatch.tsx

**File:** `artifacts/talentlock/src/pages/AiMatch.tsx`

**A — Add badge to conversation list:**

In the conversation list render (sidebar), add `<ConversationTokenBadge />` per item:

```tsx
// In conversation list item render
<div className="flex items-center justify-between">
  <span className="conversation-title">{conversation.title}</span>
  <ConversationTokenBadge
    conversationId={conversation.id}
    isActive={conversation.id === activeConversationId}
    userPlan={userPlan}
  />
</div>
```

If a separate `<ConversationListItem />` component exists or needs to be extracted, do that first.

**B — Add breakdown panel below chat messages:**

Below the messages list, above any input area:

```tsx
{activeConversationId && (
  <ConversationTokenBreakdown
    conversationId={activeConversationId}
    userPlan={userPlan}
  />
)}
```

---

## Acceptance Criteria

- [ ] `token_usage.conversationId` column exists (migrated or already present)
- [ ] `logTokenUsage()` accepts optional `conversationId` parameter
- [ ] AI Match chat message handler passes `conversationId` to `logTokenUsage()`
- [ ] NEW conversations after deployment have `conversationId` populated in `token_usage`
- [ ] `GET /api/token-usage/conversation/:conversationId` endpoint exists
- [ ] Endpoint returns `403` for non-employers
- [ ] Endpoint returns `402 PLAN_LIMIT` for Starter employers
- [ ] Endpoint returns `403` when conversation belongs to a different employer
- [ ] Endpoint returns `legacyData: true` when no rows found
- [ ] `useGetTokenUsageConversationId()` hook exists from codegen
- [ ] `CONVERSATION_BREAKDOWN_LAUNCH_DATE` constant set in frontend
- [ ] `<ConversationTokenBadge />` renders only on active conversation
- [ ] Badge absent for Starter plan
- [ ] Badge absent while loading (no skeleton)
- [ ] Badge shows formatted token count with comma separator
- [ ] `<ConversationTokenBreakdown />` renders all 4 states correctly
- [ ] Locked state shown for Starter plan
- [ ] Legacy state shown when `legacyData === true`
- [ ] Breakdown panel collapsed by default
- [ ] Toggle expands to show message table
- [ ] `%` of monthly quota shown for Growth (omitted for Enterprise)
- [ ] Message timestamps use correct format (time-only today, date+time older)
- [ ] `pnpm typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 (inspect) → 1.3 → 1.4 (verify rows)
Task 2.1 → 2.2 (skip entirely if endpoint exists)
Task 3.1 (inspect AiMatch) → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7
```

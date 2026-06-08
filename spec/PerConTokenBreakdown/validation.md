# TalentLock — Validation Guide: Per-Conversation Token Breakdown

> **Purpose:** Verify the Per-Conversation Token Breakdown feature is correctly implemented before it is considered complete. Run after all phases of `task.md` are marked done.
>
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix failures before marking a phase complete.

---

## Phase 1 Validation — Schema + Utility

### V1.1 — `conversationId` Column Exists on `token_usage`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'token_usage'
AND column_name = 'conversation_id';
```

- [ ] Column exists, type `text`, nullable (`YES`)

### V1.2 — `logTokenUsage()` Accepts `conversationId`

```bash
grep -A 10 "export.*logTokenUsage" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] Function signature includes `conversationId?: string` parameter
- [ ] INSERT statement includes `conversationId: conversationId ?? null`

### V1.3 — AI Match Route Passes `conversationId`

```bash
grep -n "logTokenUsage" artifacts/api-server/src/routes/openai.ts
```

- [ ] `logTokenUsage()` call in AI Match handler includes a non-null `conversationId` argument
- [ ] The `conversationId` comes from the route param (`:id` in `/api/openai/conversations/:id/messages`)

### V1.4 — New Conversations Write `conversationId` to DB

Send a new AI Match message via the UI. Then check:

```sql
SELECT conversation_id, feature, total_tokens, created_at
FROM token_usage
WHERE feature = 'ai_match'
ORDER BY created_at DESC LIMIT 3;
```

- [ ] `conversation_id` is NOT null for the new row
- [ ] Value matches the active conversation's ID in the `conversations` table

---

## Phase 2 Validation — Backend API

### V2.1 — Endpoint Exists

```bash
grep -r "conversation/:conversationId\|conversation\/:conversationId" \
  artifacts/api-server/src/routes/tokenUsage.ts
```

- [ ] `GET /api/token-usage/conversation/:conversationId` is defined
- [ ] Route is registered in `artifacts/api-server/src/index.ts`

### V2.2 — Auth Guards

```bash
# No auth
curl http://localhost:8080/api/token-usage/conversation/test-id
```
- [ ] Returns `HTTP 401`

```bash
# Freelancer token
curl http://localhost:8080/api/token-usage/conversation/test-id \
  -H "Authorization: Bearer <freelancer_token>"
```
- [ ] Returns `HTTP 403`

### V2.3 — Starter Plan Blocked

```bash
curl http://localhost:8080/api/token-usage/conversation/<valid_conversation_id> \
  -H "Authorization: Bearer <starter_employer_token>"
```
- [ ] Returns `HTTP 402`
- [ ] Response: `{ "code": "PLAN_LIMIT", "planNeeded": "employer_growth" }`

### V2.4 — Cross-Employer Protection

```bash
# Growth employer A tries to access Growth employer B's conversation
curl http://localhost:8080/api/token-usage/conversation/<employer_B_conversation_id> \
  -H "Authorization: Bearer <employer_A_token>"
```
- [ ] Returns `HTTP 403`

### V2.5 — Happy Path With Data

Send 2 AI messages in a conversation as a Growth employer. Then:

```bash
curl http://localhost:8080/api/token-usage/conversation/<conversation_id> \
  -H "Authorization: Bearer <growth_employer_token>"
```

- [ ] Returns `HTTP 200`
- [ ] Response contains `conversationId` matching the request
- [ ] `totalTokens` is a positive integer
- [ ] `messages` array has 2 items (one per message sent)
- [ ] Each message has `promptTokens`, `completionTokens`, `totalTokens`, `createdAt`
- [ ] `legacyData` is `false`
- [ ] `totalTokens` equals sum of `messages[].totalTokens`

### V2.6 — Legacy Data (No Rows Found)

```bash
# Conversation that existed before feature was deployed
curl http://localhost:8080/api/token-usage/conversation/<old_conversation_id> \
  -H "Authorization: Bearer <growth_employer_token>"
```

- [ ] Returns `HTTP 200`
- [ ] `messages` is an empty array `[]`
- [ ] `totalTokens` is `0`
- [ ] `legacyData` is `true`

### V2.7 — TypeCheck Passes

```bash
pnpm typecheck
```
- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — `CONVERSATION_BREAKDOWN_LAUNCH_DATE` Set

```bash
grep "CONVERSATION_BREAKDOWN_LAUNCH_DATE" artifacts/talentlock/src/lib/constants.ts
```

- [ ] Constant exists
- [ ] Value is a valid Date (not `new Date('2025-01-01')` placeholder — must be updated to actual deploy date)

### V3.2 — `useGetTokenUsageConversationId()` Hook Exists

```bash
grep -r "useGetTokenUsageConversationId" lib/api-client-react/src/
```

- [ ] Hook exists and is exported

### V3.3 — Sidebar Badge: Active Conversation Only

Navigate to `/ai-match` as a Growth employer with multiple conversations:

- [ ] Token badge appears ONLY on the currently selected/active conversation item
- [ ] Badge shows `"{N} tokens"` with comma-formatted number
- [ ] Unselected conversations show NO badge
- [ ] Badge is absent while loading (no skeleton, no placeholder)

Switch to a different conversation:
- [ ] Badge moves to the newly selected conversation
- [ ] Previous conversation's badge disappears

### V3.4 — Sidebar Badge: Starter Plan

Log in as a Starter employer:
- [ ] NO token badges anywhere in the conversation list
- [ ] No placeholder, no locked indicator in the sidebar

### V3.5 — Breakdown Panel: Default Collapsed

Select a conversation as a Growth employer:
- [ ] `"▾ Token usage for this conversation"` toggle visible below messages
- [ ] Panel content NOT visible by default (collapsed)

### V3.6 — Breakdown Panel: Expand and Collapse

Click the toggle:
- [ ] Panel expands to show breakdown content
- [ ] Chevron rotates (▾ → ▲)
- [ ] Click again → panel collapses

### V3.7 — Breakdown Panel: Full Data State (Growth)

With a conversation that has AI message history:

- [ ] `"Token Usage — This Conversation"` heading visible
- [ ] Total tokens line: `"Total: {N} tokens · {X}% of monthly quota"`
- [ ] Message table visible with correct columns (#, Prompt, Completion, Total, Time)
- [ ] Row count matches number of AI messages sent
- [ ] Token numbers formatted with comma separator
- [ ] Alternating row colours (white / slate-50)
- [ ] Today's messages show time only (e.g. `"10:24 AM"`)
- [ ] Yesterday's messages show date + time (e.g. `"Jun 3, 10:24 AM"`)

### V3.8 — Breakdown Panel: Enterprise (No Quota %)

Log in as an Enterprise employer and open a conversation:

- [ ] Total line shows `"Total: {N} tokens"` ONLY — no `"· X% of monthly quota"` text
- [ ] No percentage anywhere in the panel

### V3.9 — Breakdown Panel: Legacy State

Open a conversation that predates the feature deployment:

- [ ] Legacy message shown: `"Token breakdown is only available for conversations started after {date}."`
- [ ] Date matches `CONVERSATION_BREAKDOWN_LAUNCH_DATE` formatted as `"MMMM D, YYYY"`
- [ ] No table or token numbers shown

### V3.10 — Breakdown Panel: Starter Locked State

Log in as a Starter employer, open a conversation:

- [ ] Locked state shown: `"🔒 Per-conversation breakdown — Growth plan feature"`
- [ ] `"Upgrade to Growth →"` link navigates to `/pricing`
- [ ] No toggle, no collapse/expand behaviour
- [ ] No badge in sidebar

### V3.11 — Breakdown Panel: Error State

Simulate API error (temporarily break the endpoint):

- [ ] `"Could not load breakdown."` text shown
- [ ] `[Retry]` button re-fires the query
- [ ] Retrying successfully loads the panel once endpoint is restored

---

## Security Validation

### S1 — Employer Cannot Access Other Employer's Breakdown

```bash
curl http://localhost:8080/api/token-usage/conversation/<other_employer_conversation_id> \
  -H "Authorization: Bearer <my_employer_token>"
```
- [ ] Returns `HTTP 403`

### S2 — Freelancers Cannot Access Breakdown

```bash
curl http://localhost:8080/api/token-usage/conversation/<any_conversation_id> \
  -H "Authorization: Bearer <freelancer_token>"
```
- [ ] Returns `HTTP 403`

### S3 — Token Data Shows Only This Conversation

Inspect the API response for a conversation with ID `conv_123`:

- [ ] All rows in `messages[]` have `conversationId = 'conv_123'` in the DB
- [ ] No rows from other conversations leak into the response

```sql
-- Verify no cross-contamination in endpoint query
SELECT DISTINCT conversation_id FROM token_usage
WHERE conversation_id = '<conversation_id_used_in_test>';
```
- [ ] Only one distinct `conversation_id` value — the requested one

---

## Regression Validation

### R1 — Existing Monthly Token Widget Unchanged

Navigate to `/billing` and `/dashboard` as an employer:

- [ ] `<TokenUsageWidget />` still renders correctly
- [ ] Monthly totals and progress bar unchanged
- [ ] No interference from new `conversationId` column

### R2 — `GET /api/token-usage/me` Still Works

```bash
curl http://localhost:8080/api/token-usage/me \
  -H "Authorization: Bearer <employer_token>"
```
- [ ] Returns correct monthly totals
- [ ] `breakdown` object still contains `ai_match` and `agreement_generation` keys

### R3 — AI Match Chat Still Works

Send a message in the AI Match chat:

- [ ] Chat still responds correctly
- [ ] Token usage still logged (check `token_usage` table)
- [ ] `conversation_id` now populated (not null) — this is the key regression check

### R4 — TypeCheck and Build Pass

```bash
pnpm typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```
- [ ] Zero TypeScript errors
- [ ] Both builds complete without errors

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Schema + Utility | ⬜ | | |
| Phase 2 — Backend API | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| Security Checks | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

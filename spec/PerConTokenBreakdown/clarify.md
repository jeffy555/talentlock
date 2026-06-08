# TalentLock — Clarification & Verification: Per-Conversation Token Breakdown

This file audits `features.md` against `project.md`, the completed token-consumption feature, and the ai-enhancements schema decisions to surface gaps, risks, and questions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `token_usage` table exists | Completed in token-consumption Phase 1 |
| `logTokenUsage()` utility exists | Completed in token-consumption Phase 2 |
| `GET /api/token-usage/me` endpoint exists | Completed in token-consumption Phase 2, Task 2.5 |
| `conversations` table exists | Confirmed in `project.md` database schema |
| `messages` table exists | Confirmed in `project.md` database schema |
| `GET /api/openai/conversations` exists | Confirmed in `project.md` API routes |
| `/ai-match` frontend route exists | Confirmed in `project.md` frontend routes |
| `useGetTokenUsageMe()` hook exists | Generated in token-consumption codegen |
| `employer_growth` / `employer_enterprise` plan gating pattern | Confirmed — same pattern as contract redlining |
| `402 PLAN_LIMIT` response pattern | Confirmed in existing codebase |
| shadcn/ui `<Collapsible>` / `<Table>` available | Confirmed tech stack |
| Orval codegen pattern | Confirmed `lib/api-client-react/` |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Does `token_usage.conversationId` Column Already Exist?

**Question:** The ai-enhancements Phase 1 spec (Task 1.1) adds a `conversationId` column to `token_usage`. Has this phase been executed already, or does this feature need to add it?

**Impact:** If the column doesn't exist, a schema migration is required before the endpoint can filter by `conversationId`. If it already exists, skip the migration.

**Recommendation:**
```bash
grep -A 20 "tokenUsage\|token_usage" lib/db/schema.ts | grep -i "conversation"
```

---

### Q2 — Does `logTokenUsage()` Already Accept `conversationId`?

**Question:** The ai-enhancements plan (Q1) updates `logTokenUsage()` to accept an optional `conversationId?: string` parameter. Has this been done?

**Impact:** If not, the parameter needs adding AND the AI Match chat message handler needs updating to pass the `conversationId` when logging. Without this, the `token_usage` rows have NULL `conversationId` and the breakdown endpoint returns `legacyData: true` for all conversations.

**Recommendation:**
```bash
grep -A 10 "logTokenUsage" artifacts/api-server/src/lib/tokenLogger.ts
```

---

### Q3 — Does `GET /api/token-usage/conversation/:conversationId` Already Exist?

**Question:** The ai-enhancements task.md (Task 2.6) specifies this endpoint. Has it been implemented as part of ai-enhancements execution?

**Impact:** If already implemented, Phase 2 of this feature is entirely skipped and we go straight to the frontend. If not, Phase 2 must build it.

**Recommendation:**
```bash
grep -r "conversation" artifacts/api-server/src/routes/tokenUsage.ts
```

---

### Q4 — How Is the Current Conversation ID Available in the Frontend?

**Question:** The breakdown panel and sidebar badge need the `conversationId` for each conversation. How does the frontend currently identify the active conversation? Is there a conversation object in the React state, a URL param like `/ai-match/:conversationId`, or a context provider?

**Impact:** The component needs the `conversationId` to call `useGetTokenUsageConversationId()`. Getting this wrong means calling the endpoint with undefined and getting no data.

**Recommendation:** Inspect `artifacts/talentlock/src/pages/AiMatch.tsx` to understand how conversations are selected and how their IDs are accessed.

---

### Q5 — What Is the AI Match Sidebar Structure?

**Question:** The sidebar shows a list of conversations. Is each conversation item a standalone component (`<ConversationItem />`) or inline JSX in the list render? The token badge needs to be added per conversation item.

**Impact:** Adding the badge to a shared component is one change. Adding it to inline JSX may require extracting a component first.

**Recommendation:** Inspect `AiMatch.tsx` for the conversation list render structure.

---

### Q6 — How Should `percentOfMonthlyQuota` Be Calculated?

**Question:** The breakdown panel shows what percentage of the employer's monthly quota this conversation consumed. The monthly quota data lives in `GET /api/token-usage/me`. Should:
- **(A)** The conversation endpoint calculate it server-side by joining with the employer's quota
- **(B)** The frontend calculate it by combining data from `useGetTokenUsageMe()` and `useGetTokenUsageConversationId()`

**Impact:** Option A keeps calculation server-side and avoids a second frontend API call. Option B reuses the already-fetched `useGetTokenUsageMe()` data (already present on `/ai-match` for the banner).

**Recommendation:** Option B — the frontend already has the monthly quota from `useGetTokenUsageMe()`. The conversation endpoint returns `totalTokens` and the frontend calculates `(totalTokens / monthlyTokenLimit) * 100`. Less server-side complexity.

---

### Q7 — Should Sidebar Badges Load for All Conversations or Only the Active One?

**Question:** The sidebar may show 10–20 conversations. Loading token breakdown for all of them on page load would fire 10–20 API calls simultaneously.

**Options:**
- **(A)** Load badge for ALL visible conversations on sidebar mount (parallel calls)
- **(B)** Load badge only for the currently ACTIVE conversation
- **(C)** Load badge lazily as conversations become visible in the viewport (intersection observer)

**Impact:** Option A is the simplest but most wasteful. Option B means badges only appear on the selected conversation. Option C is the most efficient but requires `IntersectionObserver`.

**Recommendation:** Option B — only load the active conversation's breakdown. The sidebar badge therefore only shows on the conversation the employer is currently viewing. This is simpler and avoids N parallel API calls.

---

### Q8 — What Time Format Should Message Timestamps Use?

**Question:** The breakdown table shows a timestamp per message row. Should this be:
- **(A)** Time only: `10:24 AM` (relative to today)
- **(B)** Date + time: `Jun 4, 10:24 AM`
- **(C)** Relative: `2 hours ago`

**Impact:** Minor UX decision. Option A is cleanest for recent conversations. Option B is better for older conversations. Option C is familiar but less precise.

**Recommendation:** Option A for today's conversations, Option B for older ones. Use `Intl.DateTimeFormat` with a conditional: if `createdAt` is today, show time only; otherwise show date + time.

---

## ⚠️ Risks & Notes

### Risk 1 — NULL `conversationId` Rows

If `logTokenUsage()` was not updated to accept and store `conversationId`, all existing `token_usage` rows for AI Match have `conversationId = NULL`. Querying by `conversationId` returns zero rows, and `legacyData: true` is returned. This is the correct graceful-degradation behaviour — but it means the feature appears to show no data for existing conversations even after deployment.

Resolution: Ensure `logTokenUsage()` is updated and the AI Match message handler passes `conversationId` before this feature is considered complete.

### Risk 2 — N+1 API Calls for Sidebar Badges

If badges are loaded for all conversations simultaneously (Option A from Q7), and an employer has 20 conversations, this fires 20 API calls on page load. The recommendation to load only the active conversation's badge (Option B) eliminates this.

### Risk 3 — Enterprise Plan `null` Monthly Limit

For Enterprise employers, `monthlyTokenLimit` is `null` (unlimited). The percentage calculation `(totalTokens / monthlyTokenLimit) * 100` must guard against division by null:

```ts
const percent = monthlyTokenLimit === null
  ? null
  : Math.round((totalTokens / monthlyTokenLimit) * 100);
```

When `percent` is null, omit the `"X% of monthly quota"` line entirely. Do not show `"0%"` or `"NaN%"`.

### Risk 4 — Codegen Export Rules

After adding `GET /api/token-usage/conversation/:conversationId` to the OpenAPI spec:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | `token_usage.conversationId` column existence | Task 1.1 (migration check) |
| Q2 | `logTokenUsage()` signature updated | Task 1.2 (utility check) |
| Q3 | Endpoint already exists? | Phase 2 (skip if done) |
| Q4 | How `conversationId` is accessed in frontend | Task 3.1 (AiMatch inspection) |
| Q5 | Sidebar conversation list structure | Task 3.2 (badge placement) |

Questions Q6, Q7, Q8 are resolved in `plan.md`.

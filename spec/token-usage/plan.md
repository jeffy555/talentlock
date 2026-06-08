# TalentLock — Implementation Plan: AI Token Consumption Feature

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## What This File Is

`clarify.md` identified 8 open questions and 4 architectural risks before implementation could begin.
This file closes all of them with a final, binding decision for each.
No question should remain open after reading this file.

---

## Resolved Questions

---

### Q1 — Token Limit Values

**Decision: Use the values below exactly. Do not adjust them.**

| Plan ID | Display Name | Monthly Token Limit |
|---|---|---|
| `employer_starter` | Employer Starter ($49) | `50000` |
| `employer_growth` | Employer Growth ($199) | `250000` |
| `employer_enterprise` | Employer Enterprise (Custom) | `null` — unlimited |

These values are written directly into `artifacts/api-server/src/lib/plans.ts` as a `monthlyTokenLimit` field on each plan object. Freelancer plans (`freelancer_free`, `freelancer_pro`) do NOT get this field — they have no AI usage.

**How to implement in `plans.ts`:**
```ts
// Add to each employer plan object only
monthlyTokenLimit: 50000,      // employer_starter
monthlyTokenLimit: 250000,     // employer_growth
monthlyTokenLimit: null,       // employer_enterprise — unlimited
```

---

### Q2 — Do Existing AI Calls Return `response.usage`?

**Decision: Inspect the route file before logging. Follow this logic tree:**

**Step 1** — Open `artifacts/api-server/src/routes/openai.ts` and check for `stream: true` in the OpenAI API call options.

**If NOT streaming (no `stream: true`):**
- `response.usage` is available directly on the response object
- Extract as: `const { prompt_tokens, completion_tokens, total_tokens } = response.usage`
- Pass to `logTokenUsage()` immediately after the API call returns

**If streaming (`stream: true` is present):**
- Add `stream_options: { include_usage: true }` to the OpenAI call options
- Accumulate chunks until the stream ends
- The final chunk contains `chunk.usage` — extract from there
- Add a code comment: `// stream_options: include_usage added for token logging — TalentLock token-consumption feature`

**If `response.usage` is undefined at runtime:**
- Do NOT throw an error or block the request
- Log a warning via Pino: `logger.warn({ userId, feature }, 'token usage unavailable on response')`
- Skip the `logTokenUsage()` call silently
- The quota check will still work; this request simply won't count against the quota

---

### Q3 — Which User ID Flows Through AI Routes?

**Decision: Always use the internal `users.id` (DB primary key), never the raw Clerk user ID string.**

**How to resolve it in the route handler:**
```ts
// Pattern already used in other authenticated routes — replicate exactly
const clerkUserId = req.auth.userId; // from Clerk middleware
const user = await db.query.users.findFirst({
  where: eq(users.clerkId, clerkUserId),
});
if (!user) throw new Error('User not found');
const internalUserId = user.id; // ← pass this to logTokenUsage()
```

If the route already resolves the internal user earlier in the handler (many do), reuse that resolved value — do not make a second DB call.

**Where this applies:**
- `artifacts/api-server/src/routes/openai.ts` — for AI Match logging
- `artifacts/api-server/src/routes/agreements.ts` — for Agreement Generation logging

---

### Q4 — Where Is the Agreement Generation AI Call?

**Decision: Check `artifacts/api-server/src/routes/agreements.ts` first.**

**Inspection steps:**
1. Open `agreements.ts` and search for `openai` — if an OpenAI client call exists directly in this file, hook the logger here.
2. If the file imports from a shared OpenAI utility or delegates to `openai.ts`, hook the logger at the point where the response returns to `agreements.ts` (not inside the shared utility, to keep feature logging explicit).
3. If calls exist in BOTH files, hook the logger in BOTH — log `feature: 'agreement_generation'` in `agreements.ts` and `feature: 'ai_match'` in `openai.ts`.

**Feature label values — use exactly these strings, no variations:**
```ts
feature: 'ai_match'              // AI Talent Matching chat messages
feature: 'agreement_generation'  // AI Agreement document generation
```

---

### Q5 — Freelancer Visibility of Token Widget

**Decision: Omit the widget entirely for freelancers. No placeholder, no message.**

The AI Usage section (heading + `<TokenUsageWidget />`) is wrapped in a conditional that renders nothing when `userRole !== 'employer'`. The freelancer billing page DOM is unchanged — no empty container, no hidden element, no "not applicable" note.

```tsx
// Billing.tsx — render only for employers
{userRole === 'employer' && (
  <>
    <h2 className="text-lg font-semibold text-foreground mb-3">AI Usage</h2>
    <Separator />
    <TokenUsageWidget variant="full" />
  </>
)}
```

---

### Q6 — Reset Date: Calendar Month vs. Billing Period

**Decision: UTC calendar month (Option A). Consistent with existing `monthlyJobPosts` reset.**

- Token quota resets at `00:00:00 UTC on the 1st of each calendar month`
- Reset date displayed to the user = first day of the next UTC calendar month
- The `subscriptions.currentPeriodStart` / `currentPeriodEnd` columns are NOT used for token quota calculation

**Reset date calculation (use this exact logic):**
```ts
// In GET /api/token-usage/me and checkTokenQuota()
const now = new Date();
const resetDate = new Date(Date.UTC(
  now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(),
  now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1,
  1
));
```

**Token usage aggregation window (use this exact WHERE clause in Drizzle):**
```ts
// Sum tokens for the current UTC calendar month only
const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
where: and(
  eq(tokenUsage.userId, userId),
  gte(tokenUsage.createdAt, startOfMonth)
)
```

---

### Q7 — Admin Endpoint: All Employers or Active Subscribers Only?

**Decision: All users with `role = 'employer'`, including free-tier and those with no subscription row.**

**Query logic:**
- LEFT JOIN `subscriptions` on `users.id = subscriptions.userId`
- If subscription row is NULL, treat plan as `employer_starter` with limit `50000`
- If subscription row exists, use `subscriptions.planId` to look up the limit from plans config
- Always show all employer users — 0 token usage is a valid and useful data point

**NULL subscription handling in the admin query:**
```ts
// Treat missing subscription as employer_starter
const planId = subscription?.planId ?? 'employer_starter';
const limit = plans[planId]?.monthlyTokenLimit ?? 50000;
```

---

### Q8 — Warning Banner Dismiss: Session or Persistent?

**Decision: sessionStorage only (Option A). No backend changes required.**

- Key: `tl_token_banner_dismissed`
- Value: `'true'` (string)
- Set on dismiss button click
- Automatically cleared when the browser tab or session closes
- Banner reappears on next session if usage is still ≥ 80%

```ts
// On dismiss click
sessionStorage.setItem('tl_token_banner_dismissed', 'true');

// On component mount
const sessionDismissed = sessionStorage.getItem('tl_token_banner_dismissed') === 'true';
```

---

## Resolved Risks

---

### Risk 1 — TOCTOU on Token Quota

**Resolution: Accept the race window. Document it in code.**

The `SELECT ... FOR UPDATE` lock on the `users` row covers the count + quota decision. The OpenAI API call happens outside the transaction — this is an accepted trade-off, identical to the existing booking and job-post gating. Add this comment to `checkTokenQuota()`:

```ts
// NOTE: The OpenAI API call occurs outside this transaction.
// A small race window exists between quota approval and token logging.
// This is an accepted trade-off consistent with existing plan gating patterns.
// Over-quota by one request is tolerable; hard blocking mid-stream is not.
```

---

### Risk 2 — Streaming OpenAI Responses

**Resolution: Covered by Q2 decision above.**

If `stream: true` is found in any OpenAI route, add `stream_options: { include_usage: true }` and extract usage from the final chunk. If `usage` is unavailable on the final chunk, fail silently with a Pino warning (do not block the request).

---

### Risk 3 — Orval Codegen Export Rules

**Resolution: Enforce these rules immediately after running codegen in Task 2.6.**

After `pnpm --filter @workspace/api-spec run codegen`:

1. Open `lib/api-zod/orval.config.ts` — confirm `indexFiles: false` is still present. If codegen overwrote it, restore it immediately.
2. Open `lib/api-zod/src/index.ts` — confirm it exports only `./generated/api`. If codegen added additional exports, remove them.
3. Run `pnpm build` or `pnpm typecheck` to confirm no duplicate export errors before proceeding to Phase 3.

These two checks are mandatory after every codegen run, not optional.

---

### Risk 4 — `null` Token Limit on Enterprise Plan

**Resolution: Guard every percentage calculation and every progress bar render.**

**In `TokenUsageWidget.tsx` — use this guard pattern everywhere:**
```ts
const isUnlimited = monthlyTokenLimit === null;
const usagePercent = isUnlimited
  ? null
  : Math.round((tokensUsed / monthlyTokenLimit) * 100);

// Never render <Progress> when isUnlimited is true
// Never render the warning banner when isUnlimited is true
// Never call checkTokenQuota() gate when isUnlimited is true
```

**In `checkTokenQuota()` — short-circuit for null limits:**
```ts
if (plan.monthlyTokenLimit === null) {
  return { allowed: true }; // enterprise — always allow
}
```

---

## Final Pre-Implementation Checklist

Before the Cursor Agent writes a single line of code, confirm all of the following:

- [ ] `project.md` has been read in full this session
- [ ] `specs/token-usage/features.md` has been read
- [ ] `specs/token-usage/clarify.md` has been read
- [ ] This `plan.md` has been read — all 8 questions and 4 risks are resolved
- [ ] `specs/token-usage/task.md` has been read — phase order is understood
- [ ] `specs/token-usage/UI.md` has been read — all component states are understood
- [ ] `DATABASE_URL` is set and `pnpm --filter @workspace/db run push` connects cleanly
- [ ] `pnpm install` has been run at repo root

---

## Phase Execution Sign-Off

Mark each phase complete only after its acceptance criteria in `task.md` are fully met.

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Database — schema + migration | ⬜ Not started |
| Phase 2 | Backend API — logger, gating, endpoint, codegen | ⬜ Not started |
| Phase 3 | Frontend — components, page integrations, error handling | ⬜ Not started |
| Phase 4 | Admin — token usage tab + endpoint | ⬜ Not started |

Update this table as phases complete.

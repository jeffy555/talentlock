# TalentLock — Task Breakdown: AI Token Consumption Feature

## Summary

Implement employer-facing AI token usage tracking, quota enforcement, and a usage dashboard. Covers database, backend API, AI integration hooks, and frontend UI.

---

## Phase 1 — Database

### Task 1.1 — Add `token_usage` Table

**File:** `lib/db/schema.ts`

Add a new Drizzle ORM table:

```ts
export const tokenUsage = pgTable('token_usage', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  feature: text('feature').notNull(), // 'ai_match' | 'agreement_generation'
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### Task 1.2 — Add Token Limit Columns to Plans Config

**File:** `artifacts/api-server/src/lib/plans.ts`

Add a `monthlyTokenLimit` field to each employer plan object:

- `employer_starter`: `50000`
- `employer_growth`: `250000`
- `employer_enterprise`: `null` (unlimited)

### Task 1.3 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

---

## Phase 2 — Backend API

### Task 2.1 — Token Logging Utility

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

Create a utility function `logTokenUsage(db, userId, feature, usage)` that inserts a row into `token_usage`. Called after every successful OpenAI API response.

### Task 2.2 — Hook Token Logger into AI Routes

**Files:**
- `artifacts/api-server/src/routes/openai.ts` (AI Match chat)
- `artifacts/api-server/src/routes/agreements.ts` (Agreement generation)

After each OpenAI API call, extract `response.usage` and call `logTokenUsage(...)`.

### Task 2.3 — Token Quota Check Utility

**File:** `artifacts/api-server/src/lib/subscriptionGating.ts`

Add a new `checkTokenQuota(db, userId)` function:

1. Fetch the user's active plan and its `monthlyTokenLimit`.
2. If `null` (enterprise), allow.
3. Sum `total_tokens` from `token_usage` for this `user_id` in the current UTC month.
4. If sum >= limit, return `{ allowed: false, planNeeded }`.
5. Run inside a Drizzle transaction with `SELECT ... FOR UPDATE` on the `users` row (same pattern as existing gating).

### Task 2.4 — Gate AI Routes with Token Quota

**Files:** Same as Task 2.2

Before calling OpenAI, run `checkTokenQuota`. On failure, return:

```json
HTTP 402
{
  "error": "Monthly AI token limit reached",
  "code": "TOKEN_LIMIT",
  "planNeeded": "employer_growth"
}
```

### Task 2.5 — New API Endpoint: `GET /api/token-usage/me`

**File:** `artifacts/api-server/src/routes/tokenUsage.ts`

Returns the employer's token usage summary for the current UTC month:

```json
{
  "plan": "employer_starter",
  "monthlyTokenLimit": 50000,
  "tokensUsed": 12400,
  "tokensRemaining": 37600,
  "resetDate": "2025-07-01T00:00:00.000Z",
  "breakdown": {
    "ai_match": 9800,
    "agreement_generation": 2600
  }
}
```

- Unlimited (enterprise) returns `monthlyTokenLimit: null` and `tokensRemaining: null`.
- Register route in `artifacts/api-server/src/index.ts`.

### Task 2.6 — OpenAPI Spec Update

**File:** `lib/api-spec/openapi.yaml`

Add `GET /api/token-usage/me` endpoint with full response schema.

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Phase 3 — Frontend UI

### Task 3.1 — Token Usage Hook

**File:** `lib/api-client-react/` (auto-generated via codegen in Task 2.6)

Codegen will produce `useGetTokenUsageMe()` React Query hook. Verify after codegen run.

### Task 3.2 — Token Usage Widget Component

**File:** `artifacts/talentlock/src/components/TokenUsageWidget.tsx`

A reusable card component that displays:

- Heading: "AI Token Usage — [Month Year]"
- Progress bar: tokens used / limit (colour-coded: green → yellow at 80% → red at 100%)
- Text: "12,400 / 50,000 tokens used"
- Text: "Resets on July 1, 2025"
- Feature breakdown rows: "AI Talent Matching: 9,800" / "Agreement Generation: 2,600"
- If unlimited plan: show "Unlimited" badge, no progress bar

Uses `shadcn/ui` Progress and Badge components. Displays a skeleton loader while fetching.

### Task 3.3 — Embed Widget on `/billing` Page

**File:** `artifacts/talentlock/src/pages/Billing.tsx`

Add `<TokenUsageWidget />` below the existing plan/usage section. Visible only when `userRole === 'employer'`.

### Task 3.4 — Embed Summary Widget on `/dashboard` Page

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`

Add a compact version of `<TokenUsageWidget />` to the employer dashboard stats grid (below or beside existing metrics cards). Show only when `userRole === 'employer'`.

### Task 3.5 — 80% Usage Warning Banner

**File:** `artifacts/talentlock/src/pages/AiMatch.tsx` and optionally `Dashboard.tsx`

Add a dismissible `shadcn/ui` Alert banner:

> ⚠️ You've used 83% of your monthly AI token quota. Upgrade your plan to avoid interruptions.

- Only shown when `tokensUsed / monthlyTokenLimit >= 0.8` and limit is not `null`.
- "Upgrade" links to `/pricing`.
- Dismissible (sessionStorage flag, not persisted).

### Task 3.6 — Handle `TOKEN_LIMIT` 402 Error in AI Match

**File:** `artifacts/talentlock/src/pages/AiMatch.tsx`

In the message-send handler, catch `{ code: "TOKEN_LIMIT" }` alongside the existing `PLAN_LIMIT` handler and redirect to `/pricing`.

### Task 3.7 — Handle `TOKEN_LIMIT` 402 Error in Agreement Generation

**File:** `artifacts/talentlock/src/pages/Agreement.tsx` (or wherever AI generation is triggered)

Same pattern as Task 3.6.

---

## Phase 4 — Admin Console

### Task 4.1 — Add Token Usage Tab to Admin Dashboard

**File:** Admin dashboard frontend (`/admin` route tree)

Add a "Token Usage" tab that shows a table: `User Email | Plan | Tokens Used (MTD) | Limit | % Used`.

Fetch from a new admin-only endpoint:

**File:** `artifacts/api-server/src/routes/admin.ts`

`GET /api/admin/token-usage` — Returns paginated list of all employer users with their current month token totals. Gated by `requireAdmin` middleware.

---

## Acceptance Criteria

- [ ] `token_usage` table exists and is migrated
- [ ] Every OpenAI call logs prompt/completion/total tokens with feature label
- [ ] Token quota is checked before OpenAI call; 402 returned on limit breach
- [ ] `GET /api/token-usage/me` returns correct totals and reset date
- [ ] Billing page shows token usage widget for employers
- [ ] Dashboard shows compact token usage widget for employers
- [ ] Warning banner appears at 80% usage on AI Match page
- [ ] `TOKEN_LIMIT` 402 redirects to `/pricing` from AI Match and Agreement pages
- [ ] Enterprise plan users see "Unlimited" (no progress bar, no gate)
- [ ] Admin console has token usage tab

---

## Dependencies & Order

```
Task 1.1 → 1.2 → 1.3
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6
Task 3.1 (after 2.6) → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7
Task 4.1 (after 2.5)
```

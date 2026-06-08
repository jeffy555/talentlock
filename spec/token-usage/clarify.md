# TalentLock — Clarification & Verification: Token Consumption Feature

This file audits `task.md` against `project.md` and `features.md` to surface gaps, architectural risks, and decisions that need confirmation before implementation begins.

---

## ✅ Verified — Consistent with Existing Architecture

| Task | Verified Against |
|---|---|
| Drizzle ORM table addition (`token_usage`) | `lib/db/` schema pattern matches existing tables |
| `SELECT ... FOR UPDATE` transaction pattern for quota checks | Already used in `subscriptionGating.ts` for `createBooking`, `createJobRequirement`, `expressJobInterest` |
| `402 PLAN_LIMIT` pattern for frontend redirect to `/pricing` | Already implemented for `PostJob`, `JobDetail`, `FreelancerDetail` |
| `shadcn/ui` components (Progress, Badge, Alert) | Confirmed in tech stack |
| React Query hooks via codegen from OpenAPI | Confirmed `lib/api-client-react/` pattern |
| Admin route gated by `requireAdmin` middleware | Confirmed `/api/admin/` pattern |
| UTC month reset logic | Matches existing `monthlyJobPosts` UTC-month reset pattern |

---

## ❓ Open Questions — Require Confirmation Before Implementation

### Q1 — Token Limit Values
**Question:** The token limits in `features.md` (`50,000` / `250,000` / unlimited) are proposed estimates. Are these the intended production limits, or should they be adjusted?

**Impact:** Affects `plans.ts` config and all quota check logic. Easy to change post-implementation but should be confirmed before seeding plans.

---

### Q2 — Do Existing AI Calls Return `response.usage`?
**Question:** The OpenAI route (`artifacts/api-server/src/routes/openai.ts`) and agreement generation must return `response.usage` for token logging to work. Is `usage` currently being extracted from the OpenAI response, or is only the message content captured?

**Impact:** If `usage` is not currently being forwarded from the OpenAI response object, Task 2.2 will require a response structure change in addition to logging.

**Suggestion:** Check whether the route uses streaming (`stream: true`). Streaming responses accumulate usage differently — `usage` is only available in the final chunk with `stream_options: { include_usage: true }`. If streaming is in use, Task 2.2 needs to handle this explicitly.

---

### Q3 — Which User Identity Is Passed to OpenAI Routes?
**Question:** The AI Match chat endpoint is `GET/POST /api/openai/conversations/:id/messages`. When this is called, is the Clerk `userId` already resolved to the internal `users.id` (the DB primary key), or is it the Clerk user ID string?

**Impact:** `token_usage.userId` must reference `users.id` consistently with all other tables. The logger must receive the correct resolved ID.

---

### Q4 — Is Agreement Generation AI Call in `agreements.ts` or `openai.ts`?
**Question:** AI Agreement Generation is listed as a key feature, but the route map only shows `/api/agreements/:id` and `/api/agreements/:id/sign`. Is the GPT call triggered within the agreements route handler, or does it delegate to the OpenAI route?

**Impact:** Task 2.2 needs to hook into the correct file(s). If it's in `agreements.ts`, that's a separate hook from `openai.ts`.

---

### Q5 — Freelancer Role Visibility of Token Widget
**Question:** `features.md` states token tracking is employer-only. The task gates the widget with `userRole === 'employer'`. Should the `/billing` page for freelancers remain completely unchanged, or should a placeholder note (e.g., "AI usage is not applicable to your plan") appear?

**Impact:** Minor UI decision but clarifies whether the Billing page needs a conditional branch or simply omits the widget.

---

### Q6 — Reset Date Display: Calendar Month vs. Billing Period
**Question:** The project's `subscriptions` table tracks `currentPeriodStart` / `currentPeriodEnd` per user. Should the token quota reset follow:
- **(A) UTC calendar month** (1st of every month, same as `monthlyJobPosts` — simpler), or
- **(B) The user's billing period** (aligned to their subscription start date — more accurate for paid plans)?

**Impact:** Option A is already implemented as a pattern and is simpler to implement. Option B requires reading `subscriptions.currentPeriodStart` in the quota check and usage aggregation query. The reset date displayed on the UI would differ between the two.

**Recommendation:** Option A (UTC calendar month) for consistency with existing gating, unless billing-period alignment is a product requirement.

---

### Q7 — Admin Token Usage Endpoint: All Employers or Only Active Subscribers?
**Question:** `GET /api/admin/token-usage` should return employer token usage. Should this include:
- **(A)** All users with `role = 'employer'`, or
- **(B)** Only employers with an active paid subscription?

**Impact:** Free-tier employers (`employer_starter` at $0) also consume tokens but may not have a `subscriptions` row if they never went through upgrade flow. The query should handle the `NULL` subscription case.

---

### Q8 — 80% Warning Banner: Per-Session Dismissal or Persistent?
**Question:** Task 3.5 proposes `sessionStorage` for the dismiss flag (cleared on tab close). Should this be:
- **(A) Session only** — banner reappears on next visit/tab open
- **(B) Persistent** (localStorage or a backend flag) — dismissed once until next month

**Impact:** Minor UX decision. Option A is simpler and requires no backend changes. Option B gives a cleaner experience but requires either localStorage (acknowledged to fail in Claude.ai Artifacts — not a concern here since this is the app itself) or a new DB column.

---

## ⚠️ Risks & Notes

### Risk 1 — TOCTOU on Token Quota
The `SELECT ... FOR UPDATE` transaction pattern used in existing gating works well for simple count+insert. For token gating, the pattern still applies (lock user row → sum tokens → if under limit → proceed → log after call). However, since the OpenAI call itself happens *outside* the transaction, there is a small race window. This is acceptable (same trade-off as existing gating) but should be documented in code comments.

### Risk 2 — Streaming OpenAI Responses
If any AI route uses `stream: true`, token usage is not available in the standard response object. Ensure `stream_options: { include_usage: true }` is set, and handle the final chunk's `usage` field. See Q2 above.

### Risk 3 — `orval.config.ts` / `index.ts` Export Rules
After adding the OpenAPI spec entry for `GET /api/token-usage/me` and running codegen:
- `lib/api-zod/orval.config.ts` must keep `indexFiles: false`
- `lib/api-zod/src/index.ts` must only export `./generated/api`

These constraints are already documented in `project.md` but are easy to miss after a codegen run.

### Risk 4 — `employer_enterprise` Plan and `null` Token Limit
The frontend progress bar and token gate must explicitly handle `monthlyTokenLimit: null` (unlimited). A `null` limit passed to a percentage calculation would produce `NaN`. Add a guard in `TokenUsageWidget.tsx` before rendering the progress bar.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Token limit values | Task 1.2 |
| Q2 | `response.usage` availability + streaming | Task 2.2 |
| Q3 | User ID resolution in AI routes | Task 2.1 |
| Q4 | AI agreement generation call location | Task 2.2 |
| Q6 | Calendar month vs. billing period reset | Task 2.3, 2.5 |

Questions Q5, Q7, Q8 are lower priority and can be resolved during implementation.

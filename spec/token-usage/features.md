# TalentLock — Features Specification

## Feature: AI Agent Token Consumption Dashboard (Employer)

### Overview

Employers on TalentLock use AI-powered features (AI Talent Matching chat, AI Agreement Generation). This feature gives employers full visibility into their AI token usage — how much they've consumed, how much remains, when their quota resets, and how it ties to their active subscription plan.

---

### Feature Modules

#### 1. Token Usage Tracker

Tracks every OpenAI API call made on behalf of an employer and records:

- Prompt tokens consumed
- Completion tokens consumed
- Total tokens per request
- Feature/source context (`ai_match`, `agreement_generation`)
- Timestamp of the request

**Storage:** A new `token_usage` table in PostgreSQL (via Drizzle ORM).

---

#### 2. Monthly Token Quota Per Plan

Each employer subscription plan has a monthly token allowance:

| Plan | Monthly Token Limit |
|---|---|
| `employer_starter` ($49) | 50,000 tokens |
| `employer_growth` ($199) | 250,000 tokens |
| `employer_enterprise` (Custom) | Unlimited |

Token quotas reset on the first day of the UTC calendar month, aligned with how the existing `monthlyJobPosts` limit is reset.

---

#### 3. Usage Dashboard UI (Employer)

A new **"AI Usage"** section visible on the employer's `/billing` page and optionally as a widget on `/dashboard`. Displays:

- **Tokens used this month** (with a progress bar)
- **Tokens remaining**
- **Total token limit** for their current plan
- **Reset date** (next 1st of month, UTC)
- **Breakdown by feature** (AI Match vs Agreement Generation)
- **Subscription plan name and billing period** (already on `/billing`, surfaced alongside usage)

---

#### 4. Token Limit Enforcement (Soft Gate)

When an employer has exhausted their monthly token quota:

- AI Talent Matching chat returns a `402 PLAN_LIMIT` error with `code: "TOKEN_LIMIT"` and `planNeeded: "employer_growth"` or `"employer_enterprise"`.
- Agreement Generation AI call is blocked similarly.
- Frontend catches this and redirects to `/pricing` (same pattern as existing plan gating).
- A dismissible banner on `/dashboard` and `/ai-match` warns when usage is above 80% of the limit.

---

#### 5. Usage Reset Notification (UI)

- The `/billing` page displays the **next reset date** in plain language: _"Your token quota resets on July 1, 2025."_
- No email notification in this phase (deferred to Phase 3).

---

### Non-Goals (Out of Scope for This Phase)

- Per-conversation token breakdown (only feature-level breakdown)
- Email/push alerts for quota thresholds
- Token rollover between months
- Freelancer-side token tracking (freelancers do not use AI features)
- Real Stripe billing integration (already deferred to Phase 3)

---

# P1 Follow-Up Addendum — Complete Feature Breakdown (added 2026-06-09)

> Source: TalentLock Security & Production Readiness review (P1). Appended after the original feature shipped. Additive only — no change to quota enforcement or the existing UI contract above.

## Problem

The token-usage system logs **9 distinct AI features** (`TokenFeature` union in `artifacts/api-server/src/lib/tokenLogger.ts`):

`ai_match`, `ai_match_explanation`, `agreement_generation`, `contract_redlining`, `job_description_assistant`, `ai_proposal`, `document_verification`, `rate_suggestion`, `contract_health_score`.

All 9 are logged correctly, and `tokensUsed` (the total used for quota enforcement) **does** sum all 9 — so quota gating is accurate. However, the `breakdown` object returned by `GET /api/token-usage/me` only reports **2 of the 9** features. In `artifacts/api-server/src/lib/subscriptionGating.ts`:

```ts
export interface TokenUsageBreakdown {
  ai_match: number;
  agreement_generation: number;   // only 2 keys
}
// getMonthlyTokenUsage() only increments these two; the other 7 features'
// tokens are summed into tokensUsed but dropped from the breakdown.
```

Result: an employer whose tokens were spent on (e.g.) `contract_redlining` or `document_verification` sees those tokens in their **total** but they vanish from the per-feature breakdown — the breakdown does not reconcile with the total, which looks like missing/forgotten usage.

## Module 5 — Full 9-Feature Breakdown

**Fix:** Extend `TokenUsageBreakdown` to include all 9 feature keys (sourced from the single `TokenFeature` union so the two never drift again), and update `getMonthlyTokenUsage` to aggregate every feature. Surface all non-zero features in the breakdown UI on `/billing` and the admin token tab.

**Invariant:** `sum(breakdown values) === tokensUsed` for any user/month.

## Non-Goals (Addendum)

- No change to quota enforcement (already correct — counts all features).
- No new logged features; this only reports the ones already logged.
- No per-conversation expansion (still out of scope per original Non-Goals).

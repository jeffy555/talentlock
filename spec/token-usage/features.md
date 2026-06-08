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

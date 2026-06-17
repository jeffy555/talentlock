# TalentLock — UI Specification: AI Token Consumption Feature

## Overview

This document specifies the complete UI for the employer-facing AI token consumption tracking feature. It covers every new component, every surface where it appears, every state variant, all copy, and interaction behaviour. It is intended as the single source of truth for frontend implementation (Tasks 3.1–3.7 in `task.md`).

**Tech stack context:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter routing.  
**Employer-only:** All UI in this spec is gated by `userRole === 'employer'`. Freelancer views are unchanged.

---

## Design Tokens & Colour Semantics

The progress bar and status indicators use a traffic-light system tied to quota consumption. Use these consistently across all components:

| Usage % | Colour Name | Tailwind Class (bar fill) | Meaning |
|---|---|---|---|
| 0–79% | Green | `bg-emerald-500` | Healthy |
| 80–99% | Amber | `bg-amber-400` | Warning |
| 100% | Red | `bg-red-500` | Limit reached |

Badge variants (shadcn/ui `<Badge>`):

| State | Variant | Label |
|---|---|---|
| Unlimited plan | `secondary` | `Unlimited` |
| Healthy | `outline` (green border) | `{X}% used` |
| Warning | `outline` (amber border) | `{X}% used` |
| Limit reached | `destructive` | `Limit reached` |

---

## Component 1 — `<TokenUsageWidget />`

**File:** `artifacts/talentlock/src/components/TokenUsageWidget.tsx`

### Purpose

A reusable card that summarises the employer's AI token usage for the current UTC month. Appears in two sizes: `full` (Billing page) and `compact` (Dashboard).

### Props

```ts
interface TokenUsageWidgetProps {
  variant?: 'full' | 'compact'; // default: 'full'
}
```

### Data Source

`useGetTokenUsageMe()` — React Query hook from `lib/api-client-react/`.  
Response shape: `{ plan, monthlyTokenLimit, tokensUsed, tokensRemaining, resetDate, breakdown: { ai_match, agreement_generation } }`

---

### State 1 — Loading

Display a shadcn/ui `<Skeleton />` placeholder.

**Full variant:**
```
┌─────────────────────────────────────────────────┐
│  ████████████████████░░░░   (skeleton title)    │
│                                                 │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  (skeleton bar) │
│  ████████░░  ░░░░░░░░░░░░░░░       (skeleton text) │
│                                                 │
│  ░░░░░░░░░░░░░░░   ░░░░░░░░░░░░░   (skeleton rows) │
│  ░░░░░░░░░░░░░░░   ░░░░░░░░░░░░░                │
└─────────────────────────────────────────────────┘
```

**Compact variant:** Two skeleton lines only (bar + single stat line).

---

### State 2 — Unlimited Plan (`monthlyTokenLimit === null`)

**Full variant layout:**

```
┌─────────────────────────────────────────────────┐
│  AI Token Usage — June 2025          [Unlimited]│  ← shadcn Badge variant="secondary"
│                                                 │
│  Your Enterprise plan includes unlimited AI     │
│  token usage.                                   │
│                                                 │
│  ─────────────────────────────────────────────  │
│  AI Talent Matching          No limit           │
│  Agreement Generation        No limit           │
└─────────────────────────────────────────────────┘
```

- No progress bar rendered.
- No "Resets on" line.
- Breakdown rows show "No limit" instead of a number.

**Compact variant:** Card shows badge `Unlimited` + text `Enterprise plan · AI usage unlimited`. No rows.

---

### State 3 — Normal Usage (0–79%)

**Full variant layout:**

```
┌─────────────────────────────────────────────────┐
│  AI Token Usage — June 2025                     │
│                                                 │
│  [████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]    │  ← emerald-500 fill
│  12,400 of 50,000 tokens used  ·  24% used      │
│  Resets on July 1, 2025                         │
│                                                 │
│  ─────────────────────────────────────────────  │
│  🤖 AI Talent Matching         9,800 tokens     │
│  📄 Agreement Generation       2,600 tokens     │
└─────────────────────────────────────────────────┘
```

- Progress bar uses shadcn/ui `<Progress value={24} />` with override class `[&>div]:bg-emerald-500`.
- Numbers formatted with `toLocaleString()` (comma thousands separator).
- "Resets on" uses the `resetDate` field formatted as `MMMM D, YYYY` in the user's locale.

**Compact variant layout:**

```
┌──────────────────────────────────┐
│  AI Tokens  ·  24% used          │
│  [████░░░░░░░░░░░░░░░░░░░░░░░░░] │  ← compact height h-2
│  12,400 / 50,000  ·  Resets Jul 1│
└──────────────────────────────────┘
```

- Breakdown rows hidden in compact variant.
- Card is clickable — `onClick` navigates to `/billing` via Wouter.
- Cursor: `cursor-pointer`. Hover: subtle `ring-1 ring-border` highlight.

---

### State 4 — Warning Usage (80–99%)

Same layout as State 3, with these changes:

- Progress bar fill: `[&>div]:bg-amber-400`
- Percentage badge next to usage text: amber-coloured `<Badge variant="outline">` with amber border
- "Resets on" line gains urgency suffix: `Resets on July 1, 2025 — 8 days remaining`
- Days remaining calculation: `Math.ceil((resetDate - now) / 86400000)`

**Full variant only** — an inline note appears below the breakdown:

```
⚠️  You've used 83% of your quota. Upgrade your plan to avoid AI disruptions.
    [Upgrade Plan →]                                    ← links to /pricing
```

Text is `text-amber-700 bg-amber-50` in a `rounded-md p-3` container.  
"Upgrade Plan →" is a `<Button variant="link" size="sm">` styled amber.

---

### State 5 — Limit Reached (100%)

- Progress bar fill: `[&>div]:bg-red-500`, `value={100}`
- Badge: `<Badge variant="destructive">Limit reached</Badge>` next to heading
- Usage text: `50,000 / 50,000 tokens used`
- Inline note:

```
🚫  You've reached your monthly AI token limit.
    AI Talent Matching and Agreement Generation are paused until July 1, 2025.
    [Upgrade Plan →]                                    ← links to /pricing
```

Container: `text-red-700 bg-red-50 rounded-md p-3`.

---

### Accessibility

- Progress bar: `aria-label="AI token usage: 24 percent"` on the `<Progress>` element.
- Breakdown rows: use `<dl>` / `<dt>` / `<dd>` semantic structure.
- Compact card: `role="button" tabIndex={0}` with `onKeyDown` Enter/Space handler for navigation.

---

## Component 2 — Warning Banner (`<TokenUsageBanner />`)

**File:** `artifacts/talentlock/src/components/TokenUsageBanner.tsx`

### Purpose

A dismissible page-level alert shown on `/dashboard` and `/ai-match` when usage ≥ 80% or limit is reached. Appears at the top of the page content area, below the nav.

### Visibility Logic

```ts
const shouldShow = (
  monthlyTokenLimit !== null &&
  (tokensUsed / monthlyTokenLimit) >= 0.8 &&
  !sessionDismissed
);
```

`sessionDismissed` is read from `sessionStorage` key `tl_token_banner_dismissed`. Set to `'true'` on dismiss button click. Cleared automatically when the tab/session closes (per Q8 default in `clarify.md` — sessionStorage).

### State A — Warning (80–99%)

```
┌────────────────────────────────────────────────────────────────────────┐
│  ⚠️  You've used {X}% of your monthly AI token quota.                  │
│      Upgrade your plan to keep using AI Matching and Agreement         │
│      Generation without interruption.    [Upgrade Plan]   [✕ Dismiss] │
└────────────────────────────────────────────────────────────────────────┘
```

- Container: shadcn/ui `<Alert>` with `variant="warning"` styling (amber bg, amber border).  
  If shadcn doesn't include a `warning` variant natively, use `className="border-amber-300 bg-amber-50 text-amber-800"`.
- `[Upgrade Plan]`: `<Button variant="outline" size="sm">` linking to `/pricing`.
- `[✕ Dismiss]`: `<Button variant="ghost" size="icon">` — `<X className="h-4 w-4" />` icon.

### State B — Limit Reached (100%)

```
┌────────────────────────────────────────────────────────────────────────┐
│  🚫  You've reached your monthly AI token limit.                       │
│      AI features are paused until {resetDate}. Upgrade to restore      │
│      access immediately.                [Upgrade Plan]   [✕ Dismiss]  │
└────────────────────────────────────────────────────────────────────────┘
```

- Container: `className="border-red-300 bg-red-50 text-red-800"`.

### Responsive

On mobile (`< md` breakpoint), the `[Upgrade Plan]` button stacks below the text. Dismiss `✕` remains top-right.

---

## Page Integration 1 — `/billing` Page

**File:** `artifacts/talentlock/src/pages/Billing.tsx`  
**Task reference:** Task 3.3

### Placement

Insert `<TokenUsageWidget variant="full" />` as a new card section **below** the existing plan card and **above** any payment history section (if present). Only rendered when `userRole === 'employer'`.

### Section heading

Add a section label above the widget:

```
AI Usage
─────────────────────────────────────────
<TokenUsageWidget variant="full" />
```

Heading: `<h2 className="text-lg font-semibold text-foreground mb-3">AI Usage</h2>`  
Followed by a `<Separator />` then the widget card.

### Billing Period Context

The existing plan card on `/billing` already shows plan name and billing period. The `TokenUsageWidget` displays the reset date independently — no duplication needed. The two cards sit as siblings, not nested.

### Freelancer View

When `userRole === 'freelancer'`, the entire AI Usage section (heading + widget) is **not rendered**. No placeholder or "not applicable" message — the section simply does not exist in the DOM (per Q5 resolution: omit cleanly).

---

## Page Integration 2 — `/dashboard` Page

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`  
**Task reference:** Task 3.4

### Placement

The employer dashboard has a stats grid (booking count, earnings/spend, review averages). Add `<TokenUsageWidget variant="compact" />` as an additional grid cell within this stats row, placed after the existing metric cards.

**Grid layout:** The existing dashboard likely uses a CSS grid. Add the compact widget as the last item in the same grid row. If the grid is 3-column and becomes 4-column with this addition, update the grid class from `grid-cols-3` to `grid-cols-2 md:grid-cols-4`.

### Warning Banner Placement

`<TokenUsageBanner />` is rendered at the top of the page content area, before the stats grid:

```jsx
// Dashboard.tsx render order
<TokenUsageBanner />          {/* ← new, employer only */}
<h1>Dashboard</h1>
<StatsGrid>
  ...existing cards...
  <TokenUsageWidget variant="compact" />  {/* ← new */}
</StatsGrid>
<AnalyticsChart />
...
```

Only render `<TokenUsageBanner />` when `userRole === 'employer'`.

---

## Page Integration 3 — `/ai-match` Page

**File:** `artifacts/talentlock/src/pages/AiMatch.tsx`  
**Task references:** Task 3.5, Task 3.6

### Warning Banner

`<TokenUsageBanner />` is rendered at the top of the AI Match page content area, above the chat interface. Same placement pattern as Dashboard.

### Token Limit Error Handling (Task 3.6)

In the message-send handler (likely `handleSendMessage` or equivalent mutation `onError`), intercept the API error and check:

```ts
if (error?.status === 402 && error?.body?.code === 'TOKEN_LIMIT') {
  navigate('/pricing');
  return;
}
```

This mirrors the existing `PLAN_LIMIT` handler pattern already in `PostJob`, `JobDetail`, `FreelancerDetail`.

**Additionally**, if `tokensUsed >= monthlyTokenLimit` (i.e. the widget already shows 100%), disable the chat input proactively before the user even sends a message:

- The message `<Input>` and `<Button type="submit">` receive `disabled={isAtLimit}`.
- A helper text below the input reads:

```
Your monthly AI token limit has been reached.
Tokens reset on July 1, 2025. [Upgrade your plan →]
```

`text-sm text-muted-foreground` styling. "Upgrade your plan →" is a Wouter `<Link to="/pricing">`.

`isAtLimit` is derived from the `useGetTokenUsageMe()` hook:
```ts
const isAtLimit = !!monthlyTokenLimit && tokensUsed >= monthlyTokenLimit;
```

---

## Page Integration 4 — `/agreements/:id` Page

**File:** `artifacts/talentlock/src/pages/Agreement.tsx` (or where AI generation is triggered)  
**Task reference:** Task 3.7

### Token Limit Error Handling

In the "Generate Agreement" button's click handler or mutation `onError`, intercept:

```ts
if (error?.status === 402 && error?.body?.code === 'TOKEN_LIMIT') {
  navigate('/pricing');
  return;
}
```

**Proactive disable:** If `isAtLimit` is true when the page loads, the "Generate Agreement" button is `disabled`. A helper text below the button reads:

```
AI Agreement Generation is paused — your monthly token limit has been reached.
Tokens reset on July 1, 2025. [Upgrade your plan →]
```

Same styling as the AI Match helper text above.

---

## Admin Console — Token Usage Tab

**File:** Admin dashboard frontend (`/admin` route tree)  
**Task reference:** Task 4.1

### Tab Addition

Add a "Token Usage" tab to the existing admin dashboard tab bar (alongside Users, Activity Log, Bookings, Jobs, Subscriptions).

Tab label: `Token Usage`  
Icon: `<Zap className="h-4 w-4" />` (from lucide-react)

### Table Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│  Token Usage — June 2025                                   [← Prev] [Next →]  │
│                                                                                │
│  User Email               Plan               MTD Tokens   Limit     % Used    │
│  ─────────────────────────────────────────────────────────────────────────── │
│  alice@co.com             Employer Growth    148,200      250,000   59%        │
│  bob@startup.io           Employer Starter   49,100       50,000    98% ⚠️     │
│  corp@enterprise.com      Employer Enterprise 1,200,000  Unlimited  —          │
│  dave@company.com         Employer Starter   0            50,000    0%         │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Column details:**

| Column | Notes |
|---|---|
| User Email | Plain text, sortable |
| Plan | Display name from plans config, not the key |
| MTD Tokens | `toLocaleString()` formatted integer |
| Limit | `toLocaleString()` or `Unlimited` for enterprise |
| % Used | Integer percentage. For unlimited rows: `—`. For ≥ 80%: amber text + ⚠️ icon. For 100%: red text + 🚫 icon. |

**Pagination:** The API returns paginated data. Show 20 rows per page. Page navigation at top-right.

**Month selector:** The tab heading "Token Usage — June 2025" is informational only; the admin always sees the **current UTC month**. Month navigation is out of scope for this phase.

**Empty state:** If no employers have made AI calls this month:

```
No AI token usage recorded for this month.
```

Centered, `text-muted-foreground`.

---

## Copy & Microcopy Reference

All user-facing strings in one place for easy review/localisation later.

| Location | String |
|---|---|
| Widget heading | `AI Token Usage — {Month YYYY}` |
| Usage line | `{X} of {Y} tokens used · {Z}% used` |
| Reset line (normal) | `Resets on {Date}` |
| Reset line (warning) | `Resets on {Date} — {N} days remaining` |
| Breakdown row — AI Match | `AI Talent Matching` |
| Breakdown row — Agreement | `Agreement Generation` |
| Unlimited badge | `Unlimited` |
| Unlimited subtitle | `Your Enterprise plan includes unlimited AI token usage.` |
| Unlimited breakdown cell | `No limit` |
| Warning inline note | `You've used {X}% of your quota. Upgrade your plan to avoid AI disruptions.` |
| Limit reached inline note | `You've reached your monthly AI token limit. AI Talent Matching and Agreement Generation are paused until {Date}.` |
| Banner — warning | `You've used {X}% of your monthly AI token quota. Upgrade your plan to keep using AI Matching and Agreement Generation without interruption.` |
| Banner — limit reached | `You've reached your monthly AI token limit. AI features are paused until {resetDate}. Upgrade to restore access immediately.` |
| AI Match input disabled | `Your monthly AI token limit has been reached. Tokens reset on {Date}.` |
| Agreement button disabled | `AI Agreement Generation is paused — your monthly token limit has been reached. Tokens reset on {Date}.` |
| CTA link text | `Upgrade Plan →` / `Upgrade your plan →` |

---

## Loading & Error States Summary

| Component | Loading | API Error |
|---|---|---|
| `TokenUsageWidget` (full) | Full skeleton card | `<Alert variant="destructive">` inside card: "Could not load usage data." with retry button |
| `TokenUsageWidget` (compact) | 2-line skeleton | Card shows "—" in place of numbers |
| `TokenUsageBanner` | Hidden (do not show banner until data resolves) | Hidden (fail silently — banner is non-critical) |
| Admin Token Usage tab | Skeleton table rows | Alert at top of tab: "Failed to load token usage data." |

---

## Responsiveness

| Breakpoint | `TokenUsageWidget` (full) | `TokenUsageWidget` (compact) | `TokenUsageBanner` |
|---|---|---|---|
| Mobile (`< md`) | Full width, stacked layout | Full width, single row | Stacked: text above buttons |
| Tablet (`md`) | Full width in single column | Spans 2 grid columns | Inline layout |
| Desktop (`lg+`) | Constrained to card max-width | Single grid cell | Inline layout |

The compact widget's click-to-navigate behaviour (`/billing`) is preserved on all breakpoints.

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/TokenUsageWidget.tsx` | **New** | 3.2 |
| `src/components/TokenUsageBanner.tsx` | **New** | 3.5 |
| `src/pages/Billing.tsx` | Modified | 3.3 |
| `src/pages/Dashboard.tsx` | Modified | 3.4 |
| `src/pages/AiMatch.tsx` | Modified | 3.5, 3.6 |
| `src/pages/Agreement.tsx` | Modified | 3.7 |
| Admin dashboard (token tab) | Modified | 4.1 |

---

# P1 Follow-Up Addendum — Complete Feature Breakdown UI (added 2026-06-09)

> UI guidance for Module 5 (`features.md`) / Phase 5 (`task.md`). The widget previously displayed only 2 features; it must now display all features that have usage.

## Breakdown list behaviour

- The breakdown section (in `TokenUsageWidget.tsx` and the admin token tab) iterates over the `breakdown` object returned by `GET /api/token-usage/me`.
- **Render only non-zero features** — most employers use 2–3 of the 9. Sort descending by token count so the heaviest usage is on top.
- Each row: human-readable label (left) + token count (right), using the label map below.
- If every feature is zero, fall back to the existing empty/zero state (no list, no "0 tokens" rows).

## Feature label map

| Breakdown key | Display label |
|---|---|
| `ai_match` | AI Match |
| `ai_match_explanation` | Match Explanation |
| `agreement_generation` | Agreement Generation |
| `contract_redlining` | Contract Redlining |
| `job_description_assistant` | Job Description Assistant |
| `ai_proposal` | AI Proposal |
| `document_verification` | Document Verification |
| `rate_suggestion` | Rate Suggestion |
| `contract_health_score` | Contract Health Score |

## Reconciliation cue

The sum of the displayed rows must visibly match the headline "tokens used" figure. Because the backend now buckets all 9 features, no usage is silently dropped — the list always reconciles with the total.

## Responsive

Reuse the existing widget layout; the breakdown is a vertical list that stacks naturally on mobile. No new breakpoints introduced.

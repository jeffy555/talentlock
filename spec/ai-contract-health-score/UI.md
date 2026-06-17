# TalentLock — UI Specification: AI Contract Health Score

## Overview

One new component (`<ContractHealthScoreCard />`), one small inline component (`<GradeBadge />`), and one utility file. The card integrates into `/agreements/:id`. The badge integrates into the agreements list page. No new pages. No new routes.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Grade A | `text-emerald-700 bg-emerald-50 border-emerald-300` | Excellent (90–100) |
| Grade B | `text-blue-700 bg-blue-50 border-blue-300` | Good (75–89) |
| Grade C | `text-amber-700 bg-amber-50 border-amber-300` | Acceptable (60–74) |
| Grade D | `text-orange-700 bg-orange-50 border-orange-300` | Needs Review (45–59) |
| Grade F | `text-red-700 bg-red-50 border-red-300` | Weak (0–44) |
| Strong verdict | `text-emerald-600` | Dimension verdict |
| Acceptable verdict | `text-blue-600` | Dimension verdict |
| Needs attention verdict | `text-amber-600` | Dimension verdict |
| Weak verdict | `text-red-600` | Dimension verdict |
| Dimension bar fill | `bg-indigo-500` | Score progress bars |
| Dimension bar bg | `bg-slate-100` | Score progress bar background |
| Redline nudge | `bg-amber-50 border-amber-200` | Below-75 nudge box |
| Disclaimer | `text-muted-foreground text-xs` | "Not legal advice" |

---

## Component — `<ContractHealthScoreCard />`

**File:** `artifacts/talentlock/src/components/ContractHealthScoreCard.tsx`

---

### State 1 — Not Yet Scored (default)

```
┌─────────────────────────────────────────────────────────────┐
│  Contract Health Score                                      │
│                                                             │
│  Get an AI assessment of this contract's overall quality    │
│  before signing.                                            │
│                                                             │
│  ✦ Score this contract                                      │
└─────────────────────────────────────────────────────────────┘
```

Container: `rounded-lg border border-slate-200 bg-white p-5`
Heading: `text-base font-semibold text-slate-800 mb-1`
Body: `text-sm text-slate-500 mb-4`
Button: `<Button variant="outline" size="sm">` with `<Sparkles className="h-4 w-4 mr-1 text-indigo-500" />`

---

### State 2 — Loading (after button click)

```
┌─────────────────────────────────────────────────────────────┐
│  Contract Health Score                                      │
│                                                             │
│  [⟳  Analysing contract...]                                │
└─────────────────────────────────────────────────────────────┘
```

Button shows spinner and `"Analysing contract..."` text. Disabled during load.

---

### State 3 — Score Loaded (main state)

```
┌─────────────────────────────────────────────────────────────┐
│  Contract Health Score                              [Rescore]│
│                                                             │
│      ┌───────┐                                              │
│      │   B   │   74 / 100   ·   Good                       │
│      └───────┘                                              │
│                                                             │
│  "This contract is well-structured with clear payment       │
│  terms, but enforceability is weakened by vague delivery    │
│  timelines. Consider defining milestones more precisely."   │
│                                                             │
│  Dimensions                                                 │
│  ─────────────────────────────────────────────────────────  │
│  Clarity          ████████████████░░░░  16/20   Strong      │
│  Fairness         ████████████████████  18/20   Strong      │
│  Completeness     ████████████░░░░░░░░  14/20   Acceptable  │
│  Enforceability   ████████░░░░░░░░░░░░  10/20   Weak        │
│  Industry Fit     ████████████████░░░░  16/20   Strong      │
│                                                             │
│  ⓘ AI-generated assessment — not legal advice              │
└─────────────────────────────────────────────────────────────┘
```

**Grade badge:**
```tsx
<div className={`flex items-center justify-center w-14 h-14 rounded-lg
  text-3xl font-bold border-2 ${grade.colour} ${grade.bg} ${grade.border}`}>
  {grade.grade}
</div>
```

**Score line:**
```tsx
<div className="flex items-center gap-2 mt-1">
  <span className={`text-2xl font-bold ${grade.colour}`}>{totalScore}</span>
  <span className="text-slate-400 text-sm">/ 100</span>
  <span className={`text-sm font-medium ${grade.colour}`}>· {grade.label}</span>
</div>
```

**AI summary:**
```tsx
<p className="text-sm text-slate-600 italic mt-3 leading-relaxed">
  "{summary}"
</p>
```

**Dimension rows:**
```tsx
{Object.entries(dimensions).map(([key, dim]) => (
  <div key={key} className="grid grid-cols-[120px_1fr_50px_100px] gap-3 items-center py-1.5">
    <span className="text-sm text-slate-600">{DIMENSION_LABELS[key]}</span>
    <div className="bg-slate-100 rounded-full h-2">
      <div
        className="bg-indigo-500 rounded-full h-2 transition-all duration-700"
        style={{ width: `${(dim.score / 20) * 100}%` }}
      />
    </div>
    <span className="text-sm font-medium text-slate-700 text-right">{dim.score}/20</span>
    <span className={`text-xs font-medium ${verdictColour(dim.verdict)}`}>
      {dim.verdict}
    </span>
  </div>
))}
```

Dimension explanations shown as a tooltip on hover over the dimension name:
```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger>
      <span className="text-sm text-slate-600 underline decoration-dotted cursor-help">
        {DIMENSION_LABELS[key]}
      </span>
    </TooltipTrigger>
    <TooltipContent side="right" className="max-w-[220px] text-xs">
      {dim.explanation}
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**"Rescore" button** (top right): `<Button variant="ghost" size="sm">` — calls the API again, ignores cache (sends `forceRefresh: true` param if implemented, otherwise just re-calls the mutation which invalidates the local state first). Clears `scoreData` to show loading state.

**Disclaimer:**
```tsx
<p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
  <Info className="h-3 w-3" />
  AI-generated assessment — not legal advice
</p>
```

---

### State 4 — Cached Score (shows same as State 3 but with indicator)

Adds a subtle badge in the top right corner of the card:

```
✓ Cached result  [Rescore]
```

```tsx
{cached && (
  <span className="text-xs text-muted-foreground flex items-center gap-1">
    <CheckCircle2 className="h-3 w-3" />
    Cached result
  </span>
)}
```

The full score card renders identically to State 3.

---

### State 5 — Redline Nudge (score < 75, Growth+ employer only)

Shown below the dimensions section, above the disclaimer:

```
┌─────────────────────────────────────────────────────────────┐
│  bg-amber-50 border border-amber-200 rounded-md p-3         │
│                                                             │
│  ⚠ This contract scored below 75. Consider running AI      │
│  redlining to improve specific clauses before signing.      │
│                                                             │
│                              [Run Redlining ✦]              │
└─────────────────────────────────────────────────────────────┘
```

```tsx
{totalScore < 75 && userPlan === 'employer_growth' || userPlan === 'employer_enterprise' ? (
  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 mt-4">
    <p className="text-sm text-amber-800">
      ⚠ This contract scored below 75. Consider running AI redlining to
      improve specific clauses before signing.
    </p>
    <Button
      variant="outline"
      size="sm"
      className="mt-2 border-amber-400 text-amber-800 hover:bg-amber-100"
      onClick={onRunRedlining}
    >
      Run Redlining <Sparkles className="h-3.5 w-3.5 ml-1" />
    </Button>
  </div>
) : null}
```

Add `onRunRedlining?: () => void` prop — the parent calls `POST /api/agreements/:id/redline` when triggered.

---

### State 6 — Token Quota Exceeded (402)

```
┌─────────────────────────────────────────────────────────────┐
│  Contract Health Score                                      │
│                                                             │
│  ⚡ Token limit reached for this month.                     │
│  Upgrade your plan to run more AI assessments.             │
│                                                             │
│  [Upgrade plan →]                                           │
└─────────────────────────────────────────────────────────────┘
```

"Upgrade plan →" links to `/pricing`.

---

### State 7 — Parse Error

```
┌─────────────────────────────────────────────────────────────┐
│  Contract Health Score                                      │
│                                                             │
│  Could not score this contract.                             │
│  The AI returned an unexpected response. Please try again. │
│                                                             │
│                                              [Try again]   │
└─────────────────────────────────────────────────────────────┘
```

"Try again" re-fires the mutation.

---

### State 8 — Freelancer View (different framing)

Same score card, same layout. Only two strings change:

- Card description (State 1): `"Understand how balanced and complete this contract is before you sign."`
- Redline nudge: not shown for freelancers (redlining is employer-only Growth+)

Everything else is identical.

---

## Component — `<GradeBadge />` (Agreement List)

**Placement:** On each agreement card/row in the `/agreements` list, beside the agreement title or status badge.

```
[Agreement title]  [Status: Draft]  [B]     ← grade badge when scored
[Agreement title]  [Status: Signed]          ← no badge when not scored
```

```tsx
function GradeBadge({ score }: { score: number }) {
  const { grade, colour, bg, border } = getHealthGrade(score);
  return (
    <span
      title={`Health score: ${score}/100`}
      className={`inline-flex items-center justify-center
        w-6 h-6 rounded text-xs font-bold border
        ${colour} ${bg} ${border} shrink-0`}
    >
      {grade}
    </span>
  );
}
```

---

## Page Integration — `/agreements/:id`

**File:** `artifacts/talentlock/src/pages/AgreementDetail.tsx`

### DOM Placement

```
[Agreement header — title, parties, status badge]   ← existing
[Agreement content / clauses]                       ← existing
[Redline suggestions panel]                         ← existing (Growth+)
──────────────────────────────────────────────────
<ContractHealthScoreCard />                         ← NEW
──────────────────────────────────────────────────
[Signing section — signature upload / typed name]  ← existing
[Download section — after fully signed]            ← existing
```

Visible to both employer and freelancer viewing the agreement.

---

## Page Integration — `/agreements` (List)

**File:** `artifacts/talentlock/src/pages/Agreements.tsx`

For each agreement item in the paginated list — add `<GradeBadge />` beside the title when `agreement.healthScore !== null`.

---

## Copy Reference

| Location | String |
|---|---|
| Card heading | `Contract Health Score` |
| Default description (employer) | `Get an AI assessment of this contract's overall quality before signing.` |
| Default description (freelancer) | `Understand how balanced and complete this contract is before you sign.` |
| Score button | `✦ Score this contract` |
| Loading | `Analysing contract...` |
| Rescore button | `Rescore` |
| Cached indicator | `✓ Cached result` |
| Dimensions heading | `Dimensions` |
| Dimension — Clarity | `Clarity` |
| Dimension — Fairness | `Fairness` |
| Dimension — Completeness | `Completeness` |
| Dimension — Enforceability | `Enforceability` |
| Dimension — Industry Fit | `Industry Fit` |
| Verdict — Strong | `Strong` |
| Verdict — Acceptable | `Acceptable` |
| Verdict — Needs attention | `Needs attention` |
| Verdict — Weak | `Weak` |
| Redline nudge | `⚠ This contract scored below 75. Consider running AI redlining to improve specific clauses before signing.` |
| Redline nudge button | `Run Redlining ✦` |
| Disclaimer | `AI-generated assessment — not legal advice` |
| Quota error heading | `⚡ Token limit reached for this month.` |
| Quota error body | `Upgrade your plan to run more AI assessments.` |
| Quota upgrade button | `Upgrade plan →` |
| Parse error heading | `Could not score this contract.` |
| Parse error body | `The AI returned an unexpected response. Please try again.` |
| Parse error retry | `Try again` |
| Grade A label | `Excellent` |
| Grade B label | `Good` |
| Grade C label | `Acceptable` |
| Grade D label | `Needs Review` |
| Grade F label | `Weak` |

---

## Loading & Error States Summary

| State | Trigger | Component Response |
|---|---|---|
| Not scored | `healthScore === null`, no request | Score button shown |
| Loading | Button clicked, API in flight | Spinner + "Analysing..." |
| Scored | API returns success | Full score card |
| Cached | API returns `cached: true` | Full card + "✓ Cached result" |
| Quota exceeded | API returns 402 | Quota error + upgrade link |
| Parse error | API returns `parseError: true` | Error message + Retry |
| OpenAI down | API returns 500 | Generic error + Retry |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/lib/contractHealthUtils.ts` | **New** | 3.2 |
| `src/components/ContractHealthScoreCard.tsx` | **New** | 3.3 |
| `src/pages/AgreementDetail.tsx` | Modified | 3.4 |
| `src/pages/Agreements.tsx` | Modified | 3.5 |

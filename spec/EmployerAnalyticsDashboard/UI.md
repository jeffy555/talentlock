# TalentLock — UI Specification: Employer Analytics Dashboard

## Overview

Five new components, one shared window selector, one orchestrating panel, and one dashboard integration. All employer-only. Freelancer dashboard completely unchanged.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, recharts, React Query, Wouter routing.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Funnel stage fill | `bg-indigo-500` | Funnel bar active fill |
| Funnel conversion | `text-slate-500 text-xs` | Conversion rate labels |
| Demand bar | `bg-indigo-400` | Skills demand bars |
| Supply bar | `bg-emerald-400` | Skills supply bars |
| Gap highlight | `bg-red-100 text-red-700` | Skills in demand but not supply |
| Retention repeat | `#6366f1` (indigo) | Donut repeat slice |
| Retention new | `#e2e8f0` (slate-200) | Donut new slice |
| Outcomes completed | `#6366f1` (indigo) | Donut completed slice |
| Outcomes cancelled | `#ef4444` (red-500) | Donut cancelled slice |
| Outcomes in progress | `#f59e0b` (amber-500) | Donut in-progress slice |
| Outcomes other | `#94a3b8` (slate-400) | Donut other slice |
| Faster trend | `text-emerald-600 ▼` | Lifecycle improved |
| Slower trend | `text-red-500 ▲` | Lifecycle worsened |
| Same trend | `text-slate-400 ─` | No change |

---

## Window Selector

A shared `<Select>` at the top of the panel controls both Funnel and Lifecycle:

```
Analytics window:  [Last 90 days ▾]
```

Options: `Last 30 days` / `Last 90 days` / `Last 12 months`

`shadcn/ui <Select>` — `defaultValue="90d"`. Changing it triggers a new API call with the updated `window` param.

---

## Component 1 — `<HiringFunnel />`

**File:** `artifacts/talentlock/src/components/hiring/HiringFunnel.tsx`

### Loaded State

```
Hiring Funnel  ·  Last 90 days
──────────────────────────────────────────────────────────────────

  Jobs Posted      Bookings Created    Agreements Signed   Completed
  ┌──────────┐     ┌──────────┐        ┌──────────┐        ┌──────────┐
  │    12    │ ──► │     8    │ ──► ──►│     6    │ ──────►│     4    │
  └──────────┘     └──────────┘        └──────────┘        └──────────┘
                    67% converted       75% to signed       67% completed
```

Each stage box:
```tsx
<div className="flex flex-col items-center">
  <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-6 py-4 text-center min-w-[100px]">
    <p className="text-2xl font-bold text-indigo-700">{count}</p>
    <p className="text-xs text-slate-500 mt-1">{label}</p>
  </div>
</div>
```

Arrows between stages: `<ChevronRight className="h-5 w-5 text-slate-300 self-center" />`

Conversion rate below each arrow:
```tsx
<p className="text-xs text-slate-500 text-center mt-1">
  {rate !== null ? `${rate}% converted` : '—'}
</p>
```

**`funnelNote` banner** (when `createdAt` missing on job_requirements):
```
ℹ Jobs Posted count is all-time — no creation date on job requirements.
```
`text-xs text-muted-foreground bg-slate-50 p-2 rounded mt-2`

### Empty State

```
No hiring activity in the selected period.
```
`text-sm text-muted-foreground text-center py-6`

---

## Component 2 — `<SkillsGapChart />`

**File:** `artifacts/talentlock/src/components/hiring/SkillsGapChart.tsx`

### Loaded State (both demand and supply)

```
Skills: Demand vs Supply
──────────────────────────────────────────────────────────────────
             You post for        You hire

React        ████████████        ██████████
TypeScript   █████████           ████████
Node.js      ███████             ██████
AWS          ██████              ██                ← GAP
GraphQL      █████               ─ (none hired)   ← GAP
Vue          ████                █████
```

Two horizontal bar columns side by side.

Demand bar: `bg-indigo-400`
Supply bar: `bg-emerald-400`

Row highlighted in red background (`bg-red-50`) when skill is in `gaps` array.

GAP badge at end of row:
```tsx
{gaps.includes(skill) && (
  <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5 ml-2">
    Gap
  </span>
)}
```

**Gaps summary below chart:**
```
3 skill gaps identified: AWS, GraphQL, Docker
```
`text-sm text-amber-700 bg-amber-50 rounded p-2 mt-3`

### Supply-Only State (no job skills column)

```
Skills You Hire
──────────────────────────────────────────
React         ████████████
TypeScript    █████████
Node.js       ███████

ℹ Job skills data not available — gap analysis requires
  skills to be specified on job requirements.
```

### Empty State

```
No skill data available yet.
```

---

## Component 3 — `<RetentionCard />`

**File:** `artifacts/talentlock/src/components/hiring/RetentionCard.tsx`

### Loaded State

```
┌──────────────────────────────────────────────────────────┐
│  Freelancer Retention                                    │
│                                                          │
│     ╭─────╮                                             │
│     │ 42% │  ← indigo (repeat)      Repeat:  42%        │
│     │     │  ← slate (new)          New:     58%        │
│     ╰─────╯  (donut chart)          18 total bookings   │
│                                                          │
│  Top repeat freelancers:                                 │
│  ─────────────────────────────────────────────────────   │
│  Sarah Chen     React Dev     3 bookings  [View →]      │
│  João Alves     UX Design     2 bookings  [View →]      │
└──────────────────────────────────────────────────────────┘
```

Donut chart using recharts `PieChart` with `innerRadius={50}` and `outerRadius={70}`:
- Repeat slice: `fill="#6366f1"`
- New slice: `fill="#e2e8f0"`

Center label:
```tsx
<text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
  className="text-lg font-bold fill-indigo-700">
  {repeatRate}%
</text>
```

Repeat freelancer rows:
```tsx
<Link to={`/freelancers/${f.freelancerId}`} className="text-xs text-indigo-600 hover:underline">
  View →
</Link>
```

### Empty State (no completed bookings)

```
No completed bookings yet.
Retention data will appear after your first completed booking.
```

---

## Component 4 — `<LifecycleDuration />`

**File:** `artifacts/talentlock/src/components/hiring/LifecycleDuration.tsx`

### Loaded State

```
Hiring Lifecycle  ·  Last 90 days
──────────────────────────────────────────────────────────────────

  Job posted → First booking:      3.2 days   ▼ faster
  Booking    → Agreement signed:   1.8 days   ─ same
  Signed     → Completed:         24.6 days   ▲ slower
  ─────────────────────────────────────────────────────────
  Total (post to complete):        29.6 days
```

Each row:
```tsx
<div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
  <span className="text-sm text-slate-600">{label}</span>
  <div className="flex items-center gap-3">
    <span className="text-sm font-semibold text-slate-800">
      {duration !== null ? `${duration} days` : '—'}
    </span>
    <TrendIndicator trend={trend} />
  </div>
</div>
```

`<TrendIndicator />`:
- `faster` → `<span className="text-emerald-600 text-xs">▼ faster</span>`
- `slower` → `<span className="text-red-500 text-xs">▲ slower</span>`
- `same` → `<span className="text-slate-400 text-xs">─ same</span>`
- `null` → `<span className="text-slate-300 text-xs">─</span>`

**"Data not available" per metric** (when null):
- Row still shows but value is `—` and trend is empty
- No error state — partial data is fine

### Empty State (no completed bookings in window)

```
No completed bookings in this period.
Select a wider time window or wait for bookings to complete.
```

---

## Component 5 — `<OutcomesDonut />`

**File:** `artifacts/talentlock/src/components/hiring/OutcomesDonut.tsx`

### Loaded State

```
Booking Outcomes  ·  All time
──────────────────────────────────────────────────────────────────

       ╭─────────────────────╮
       │       ●  58%        │
       │    ╭──────╮         │   ● Completed     58%   (4)
       │    │      │         │   ● Cancelled     22%   (2)
       │    │  58% │         │   ● In Progress   14%   (1)
       │    ╰──────╯         │   ● Other          6%   (0)
       ╰─────────────────────╯
```

recharts `PieChart` donut (`innerRadius={60}`, `outerRadius={90}`):
```tsx
<Pie data={pieData} innerRadius={60} outerRadius={90} paddingAngle={2}>
  <Cell fill="#6366f1" />  // completed — indigo
  <Cell fill="#ef4444" />  // cancelled — red
  <Cell fill="#f59e0b" />  // in progress — amber
  <Cell fill="#94a3b8" />  // other — slate
</Pie>
```

Legend rows to the right of the chart (or below on mobile):
```tsx
<div className="space-y-1">
  {[
    { label: 'Completed', pct: completedPct, count: completed, color: 'bg-indigo-500' },
    { label: 'Cancelled', pct: cancelledPct, count: cancelled, color: 'bg-red-500' },
    { label: 'In Progress', pct: inProgressPct, count: inProgress, color: 'bg-amber-500' },
    { label: 'Other', pct: otherPct, count: other, color: 'bg-slate-400' },
  ].map(item => (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2">
        <div className={`h-3 w-3 rounded-full ${item.color}`} />
        <span className="text-slate-700">{item.label}</span>
      </div>
      <span className="text-slate-500">{item.pct}% ({item.count})</span>
    </div>
  ))}
</div>
```

**High cancellation insight** (when `cancelledPct > 30`):
```
⚠ High cancellation rate. Review your bookings for patterns.
```
`text-xs text-amber-700 bg-amber-50 rounded p-2 mt-3`

### Empty State (no bookings)

```
No bookings yet.
Outcome data will appear after your first booking.
```

---

## Component 6 — `<HiringAnalyticsPanel />`

**File:** `artifacts/talentlock/src/components/hiring/HiringAnalyticsPanel.tsx`

### Panel layout

```
[Window selector dropdown]                  ← top right

[HiringFunnel — full width]

[SkillsGapChart — half]  [RetentionCard — half]

[LifecycleDuration — half]  [OutcomesDonut — half]
```

```tsx
<div className="space-y-6">
  <div className="flex justify-end">
    <WindowSelector value={window} onChange={setWindow} />
  </div>
  <HiringFunnel funnel={data.funnel} />
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <SkillsGapChart {...data.skillsGap} />
    <RetentionCard retention={data.retention} />
  </div>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <LifecycleDuration lifecycle={data.lifecycle} />
    <OutcomesDonut outcomes={data.outcomes} />
  </div>
</div>
```

### Panel error state

```
Could not load hiring analytics.   [Retry]
```

Full-width card. Retry calls `refetch()`.

### Panel loading state

All sub-components show skeleton placeholders (defined per component above).

---

## Page Integration — `/dashboard`

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`

### DOM Placement

```
[Employer stats grid]           ← existing
[Monthly bar chart]             ← existing
Spend Analytics                 ← from Spend Analytics feature
[SpendAnalyticsPanel]           ← from Spend Analytics feature
─────────────────────────────────────────────
Hiring Analytics                ← NEW heading
[HiringAnalyticsPanel]          ← NEW
```

```tsx
{userRole === 'employer' && (
  <>
    <h2 className="text-lg font-semibold text-slate-800 mt-8 mb-4">
      Hiring Analytics
    </h2>
    <HiringAnalyticsPanel />
  </>
)}
```

Freelancer dashboard is completely unchanged.

---

## Copy Reference

| Location | String |
|---|---|
| Panel heading | `Hiring Analytics` |
| Window selector label | `Analytics window:` |
| Window — 30d | `Last 30 days` |
| Window — 90d | `Last 90 days` |
| Window — 12m | `Last 12 months` |
| Funnel heading | `Hiring Funnel` |
| Funnel — jobs posted | `Jobs Posted` |
| Funnel — bookings | `Bookings Created` |
| Funnel — agreements | `Agreements Signed` |
| Funnel — completed | `Completed` |
| Funnel — conversion | `{N}% converted` |
| Funnel — note | `ℹ Jobs Posted count is all-time — no creation date on job requirements.` |
| Funnel — empty | `No hiring activity in the selected period.` |
| Skills heading | `Skills: Demand vs Supply` |
| Skills — demand col | `You post for` |
| Skills — supply col | `You hire` |
| Skills — gap badge | `Gap` |
| Skills — gaps summary | `{N} skill gap{s} identified: {list}` |
| Skills — supply only note | `ℹ Job skills data not available — gap analysis requires skills to be specified on job requirements.` |
| Skills — empty | `No skill data available yet.` |
| Retention heading | `Freelancer Retention` |
| Retention — repeat label | `Repeat:` |
| Retention — new label | `New:` |
| Retention — total | `{N} total bookings` |
| Retention — top section | `Top repeat freelancers:` |
| Retention — link | `View →` |
| Retention — empty | `No completed bookings yet. Retention data will appear after your first completed booking.` |
| Lifecycle heading | `Hiring Lifecycle` |
| Lifecycle — step 1 | `Job posted → First booking:` |
| Lifecycle — step 2 | `Booking → Agreement signed:` |
| Lifecycle — step 3 | `Signed → Completed:` |
| Lifecycle — total | `Total (post to complete):` |
| Lifecycle — days | `{N} days` |
| Lifecycle — unavailable | `—` |
| Lifecycle — faster | `▼ faster` |
| Lifecycle — slower | `▲ slower` |
| Lifecycle — same | `─ same` |
| Lifecycle — empty | `No completed bookings in this period. Select a wider time window or wait for bookings to complete.` |
| Outcomes heading | `Booking Outcomes · All time` |
| Outcomes — completed | `Completed` |
| Outcomes — cancelled | `Cancelled` |
| Outcomes — in progress | `In Progress` |
| Outcomes — other | `Other` |
| Outcomes — high cancel | `⚠ High cancellation rate. Review your bookings for patterns.` |
| Outcomes — empty | `No bookings yet. Outcome data will appear after your first booking.` |
| Error message | `Could not load hiring analytics.` |
| Retry | `Retry` |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| `HiringFunnel` | 4 skeleton boxes in a row | Handled by panel |
| `SkillsGapChart` | Skeleton list (8 rows) | Handled by panel |
| `RetentionCard` | Skeleton donut + 2 rows | Handled by panel |
| `LifecycleDuration` | Skeleton list (4 rows) | Handled by panel |
| `OutcomesDonut` | Skeleton donut + legend | Handled by panel |
| `HiringAnalyticsPanel` | All sub-components skeleton | Full-width error card + Retry |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/hiring/HiringFunnel.tsx` | **New** | 2.2 |
| `src/components/hiring/SkillsGapChart.tsx` | **New** | 2.3 |
| `src/components/hiring/RetentionCard.tsx` | **New** | 2.4 |
| `src/components/hiring/LifecycleDuration.tsx` | **New** | 2.5 |
| `src/components/hiring/OutcomesDonut.tsx` | **New** | 2.6 |
| `src/components/hiring/HiringAnalyticsPanel.tsx` | **New** | 2.7 |
| `src/pages/Dashboard.tsx` | Modified | 2.8 |

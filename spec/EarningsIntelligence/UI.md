# TalentLock — UI Specification: Earnings Intelligence

## Overview

This document specifies the complete UI for the Earnings Intelligence feature. Six new components, one dashboard integration, all states, and all copy strings.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, recharts, React Query, Wouter routing.
**Freelancer-only.** Employer dashboard is unchanged.

---

## Design Tokens

| Semantic | Tailwind Classes | Used for |
|---|---|---|
| Freelancer line | `stroke="#6366f1"` (indigo) | Trend chart — own earnings |
| Platform line | `stroke="#94a3b8"` (slate-400) | Trend chart — platform average |
| Trend up | `text-emerald-600` + `▲` | MoM positive change |
| Trend down | `text-red-500` + `▼` | MoM negative change |
| Trend neutral | `text-slate-400` | No change / no data |
| Percentile bar fill | `bg-indigo-500` | Rate benchmark position bar |
| Skill bar fill | `bg-indigo-100` | Top skills bar |
| Card container | `rounded-lg border border-slate-200 bg-white p-5` | All stat cards |
| Section heading | `text-base font-semibold text-slate-800 mb-4` | Panel section labels |
| Empty state | `text-sm text-muted-foreground text-center py-6` | No data states |

---

## Component 1 — `<EarningsSummaryCards />`

**File:** `artifacts/talentlock/src/components/earnings/EarningsSummaryCards.tsx`

Three cards in a row (`grid grid-cols-1 sm:grid-cols-3 gap-4`).

### Card layout

```
┌───────────────────────────┐
│  This Month               │
│  $4,200                   │
│  ▲ 18% vs last month      │
└───────────────────────────┘
```

**This Month card:**
- Label: `"This Month"`
- Value: formatted currency — `$4,200` or `$4.2k`
- Trend: `▲ 18% vs last month` (emerald) or `▼ 12% vs last month` (red)
- When `monthOverMonthChange === null`: show `"First month of data"` in muted text

**Last Month card:**
- Label: `"Last Month"`
- Value: formatted currency
- No trend indicator

**All Time card:**
- Label: `"All Time"`
- Value: formatted currency
- No trend indicator

### Loading state
Three skeleton cards: `<Skeleton className="h-24 w-full rounded-lg" />`

---

## Component 2 — `<EarningsTrendChart />`

**File:** `artifacts/talentlock/src/components/earnings/EarningsTrendChart.tsx`

recharts `LineChart` — responsive, 300px height.

### Full data state (both lines)

```
$8k ─────────────────────────────────────────────
      ╭──╮                         ╭── You
$6k ──╯  ╰──────────╮              │
$4k ─────────────────╰──╮   ╭─────╯
$2k ──────────────────────╰──╯ ─── Platform avg
$0 ─────────────────────────────────────────────
    Jan   Feb   Mar   Apr   May   Jun
```

```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} />
    <YAxis
      tick={{ fontSize: 12, fill: '#94a3b8' }}
      tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
    />
    <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, '']} />
    <Legend />
    <Line
      type="monotone"
      dataKey="myEarnings"
      name="Your earnings"
      stroke="#6366f1"
      strokeWidth={2}
      dot={{ fill: '#6366f1', r: 3 }}
      activeDot={{ r: 5 }}
    />
    <Line
      type="monotone"
      dataKey="platformAvg"
      name={`${fieldOfWork} average`}
      stroke="#94a3b8"
      strokeWidth={1.5}
      strokeDasharray="4 4"
      dot={false}
      connectNulls={false}
    />
  </LineChart>
</ResponsiveContainer>
```

### Platform average unavailable state

When `platformAverage` is all nulls — render single indigo line only. Below the chart:

```
Platform average not available — fewer than 5 freelancers
have earnings data in your field.
```
`text-xs text-muted-foreground mt-2 text-center`

### Loading state

```
[Skeleton — h-[300px] w-full rounded-lg]
```

### Empty state (all zeros)

```
        📊
   No earnings data yet.
   Complete your first milestone to see your trend.
```

---

## Component 3 — `<RateBenchmarkCard />`

**File:** `artifacts/talentlock/src/components/earnings/RateBenchmarkCard.tsx`

### Loaded state

```
┌────────────────────────────────────────────────────┐
│  Rate Benchmarking                                 │
│  React developers on TalentLock                    │
│                                                    │
│  Your rate: $85/hr                                 │
│  Top 30% in your field                             │
│                                                    │
│  $40   ──────────[●]──────────────   $180          │
│         min     you            max                 │
│                                                    │
│  Field median: $72/hr  ·  18 freelancers           │
└────────────────────────────────────────────────────┘
```

**Position bar:**
The `●` marker position is calculated as:
```ts
const position = ((myRate - fieldMin) / (fieldMax - fieldMin)) * 100;
```

```tsx
<div className="relative h-2 bg-slate-100 rounded-full my-3">
  <div
    className="absolute h-4 w-4 -top-1 rounded-full bg-indigo-500 border-2 border-white shadow"
    style={{ left: `calc(${position}% - 8px)` }}
  />
</div>
```

Min/max labels below the bar: `text-xs text-muted-foreground`.

**Percentile label colour:**
- ≥ 75: `text-emerald-600 font-semibold` — "Top 25%"
- 50–74: `text-blue-600 font-semibold` — "Top 50%"
- 25–49: `text-amber-600 font-semibold` — "Bottom 50%"
- < 25: `text-slate-500` — "Bottom 25%"

### Null state (insufficient data)

```
┌────────────────────────────────────────────────────┐
│  Rate Benchmarking                                 │
│                                                    │
│  Not enough data yet.                              │
│  Rate benchmarking requires at least 3 freelancers │
│  with completed bookings in your field.            │
└────────────────────────────────────────────────────┘
```

`text-sm text-muted-foreground`

---

## Component 4 — `<ProjectionCard />`

**File:** `artifacts/talentlock/src/components/earnings/ProjectionCard.tsx`

### Has projection

```
┌────────────────────────────────────────────────────┐
│  Projected This Month          ⓘ                   │
│                                                    │
│  $3,200                                            │
│  From 4 upcoming milestones                        │
└────────────────────────────────────────────────────┘
```

`ⓘ` tooltip: `"Based on pending milestones due this month. Actual earnings may vary."`
Use shadcn/ui `<Tooltip>` on the info icon.

### No projection (zero milestones due)

```
┌────────────────────────────────────────────────────┐
│  Projected This Month                              │
│                                                    │
│  No milestones due this month.                     │
└────────────────────────────────────────────────────┘
```

`text-sm text-muted-foreground`

---

## Component 5 — `<TopSkillsCard />`

**File:** `artifacts/talentlock/src/components/earnings/TopSkillsCard.tsx`

### Has data

```
┌────────────────────────────────────────────────────┐
│  Top Earning Skills                                │
│                                                    │
│  1  React           $12,400  ████████████████      │
│  2  TypeScript       $8,200  ██████████            │
│  3  Node.js          $5,100  ██████                │
│  4  PostgreSQL       $3,800  ████                  │
│  5  AWS              $1,200  █                     │
└────────────────────────────────────────────────────┘
```

Bar width proportional to max value:
```ts
const maxEarned = Math.max(...skills.map(s => s.totalEarned));
const barWidth = (skill.totalEarned / maxEarned) * 100;
```

Bar: `<div className="h-2 bg-indigo-100 rounded-full" style={{ width: `${barWidth}%` }} />`

Each row: `grid grid-cols-[1.5rem_1fr_auto_6rem] gap-2 items-center py-1.5`

### Empty state

```
No skill-attributed earnings yet.
Complete bookings to see your top earning skills.
```

---

## Component 6 — `<EarningsIntelligencePanel />`

**File:** `artifacts/talentlock/src/components/earnings/EarningsIntelligencePanel.tsx`

Orchestrator. Calls `useGetDashboardEarningsIntelligence()` and passes props to sub-components.

### Panel loading state

All sub-components show their individual skeleton/loading states.

### Panel error state

```
┌────────────────────────────────────────────────────┐
│  Could not load earnings intelligence.  [Retry]    │
└────────────────────────────────────────────────────┘
```

Single error card across full width. Retry calls `refetch()`.

### Panel layout

```
Earnings Intelligence
──────────────────────────────────────────────────────

[EarningsSummaryCards — 3 col grid]

[EarningsTrendChart — full width]

[RateBenchmarkCard]  [ProjectionCard]
     (half width)        (half width)

[TopSkillsCard — full width]
```

Grid layout:
```tsx
<div className="space-y-6">
  <EarningsSummaryCards {...summary} />
  <EarningsTrendChart {...trend} fieldOfWork={rateBenchmark?.fieldOfWork ?? ''} />
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <RateBenchmarkCard data={rateBenchmark} />
    <ProjectionCard {...projection} />
  </div>
  <TopSkillsCard skills={topSkills} />
</div>
```

---

## Page Integration — `/dashboard`

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`

### DOM Placement

```
[Dashboard header]                          ← existing
[Stats grid — bookings, earnings totals]    ← existing
[Monthly bar chart]                         ← existing
─────────────────────────────────────────
Earnings Intelligence                       ← NEW section heading
[EarningsIntelligencePanel]                 ← NEW
```

Section heading above the panel:
```tsx
<h2 className="text-lg font-semibold text-slate-800 mt-8 mb-4">
  Earnings Intelligence
</h2>
```

Render condition: `{userRole === 'freelancer' && <EarningsIntelligencePanel />}`

Employer dashboard is completely unchanged.

---

## Copy Reference

| Location | String |
|---|---|
| Panel heading | `Earnings Intelligence` |
| Summary — this month | `This Month` |
| Summary — last month | `Last Month` |
| Summary — all time | `All Time` |
| Summary — first month | `First month of data` |
| Summary — trend up | `▲ {N}% vs last month` |
| Summary — trend down | `▼ {N}% vs last month` |
| Chart — my line | `Your earnings` |
| Chart — platform line | `{fieldOfWork} average` |
| Chart — no platform data | `Platform average not available — fewer than 5 freelancers have earnings data in your field.` |
| Chart — empty | `No earnings data yet. Complete your first milestone to see your trend.` |
| Benchmark heading | `Rate Benchmarking` |
| Benchmark subtitle | `{fieldOfWork} developers on TalentLock` |
| Benchmark — your rate | `Your rate: ${N}/hr` |
| Benchmark — percentile | `Top {N}% in your field` |
| Benchmark — median | `Field median: ${N}/hr · {N} freelancers` |
| Benchmark — null | `Not enough data yet.` |
| Benchmark — null subtitle | `Rate benchmarking requires at least 3 freelancers with completed bookings in your field.` |
| Projection heading | `Projected This Month` |
| Projection — tooltip | `Based on pending milestones due this month. Actual earnings may vary.` |
| Projection — milestone count | `From {N} upcoming milestone{s}` |
| Projection — empty | `No milestones due this month.` |
| Top skills heading | `Top Earning Skills` |
| Top skills — empty | `No skill-attributed earnings yet. Complete bookings to see your top earning skills.` |
| Error message | `Could not load earnings intelligence.` |
| Error retry | `Retry` |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| `EarningsSummaryCards` | 3 skeleton cards | Handled by parent panel |
| `EarningsTrendChart` | Single skeleton block h-[300px] | Handled by parent panel |
| `RateBenchmarkCard` | Skeleton card | Handled by parent panel |
| `ProjectionCard` | Skeleton card | Handled by parent panel |
| `TopSkillsCard` | Skeleton list (5 rows) | Handled by parent panel |
| `EarningsIntelligencePanel` | All sub-components in skeleton | Full-width error card + Retry |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/earnings/EarningsSummaryCards.tsx` | **New** | 2.2 |
| `src/components/earnings/EarningsTrendChart.tsx` | **New** | 2.3 |
| `src/components/earnings/RateBenchmarkCard.tsx` | **New** | 2.4 |
| `src/components/earnings/ProjectionCard.tsx` | **New** | 2.5 |
| `src/components/earnings/TopSkillsCard.tsx` | **New** | 2.6 |
| `src/components/earnings/EarningsIntelligencePanel.tsx` | **New** | 2.7 |
| `src/pages/Dashboard.tsx` | Modified | 2.8 |

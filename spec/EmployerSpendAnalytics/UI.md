# TalentLock — UI Specification: Employer Spend Analytics

## Overview

This document specifies the complete UI for the Employer Spend Analytics feature. Seven new components, one dashboard integration, all states, and all copy strings. The visual language deliberately mirrors Earnings Intelligence — same card containers, same colour system — creating a consistent analytics aesthetic across both roles.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, recharts, React Query, Wouter routing.
**Employer-only.** Freelancer dashboard is completely unchanged.

---

## Design Tokens

| Semantic | Tailwind / recharts | Used for |
|---|---|---|
| Spend bar | `fill="#6366f1"` (indigo) | Spend trend bar chart bars |
| Field bar fill | `bg-indigo-400` | Spend by field bars |
| Field bar bg | `bg-slate-100` | Spend by field bar background |
| Above market | `text-red-500` + `▲` | Rate above market |
| Below market | `text-emerald-600` + `▼` | Rate below market (positive for employer) |
| At market | `text-slate-500` | Within 5% of market |
| Trend up spend | `text-red-500` + `▲` | MoM spend increase (more cost) |
| Trend down spend | `text-emerald-600` + `▼` | MoM spend decrease (savings) |
| Card container | `rounded-lg border border-slate-200 bg-white p-5` | All stat cards |
| Section heading | `text-base font-semibold text-slate-800 mb-4` | Panel section labels |
| Empty state | `text-sm text-muted-foreground text-center py-6` | No data states |

**Note on spend trend direction:** Unlike personal earnings where up = good, for spend:
- `▲` (spend increased) = red (costs went up)
- `▼` (spend decreased) = emerald (costs went down / savings)

This is intentional and different from Earnings Intelligence.

---

## Component 1 — `<SpendSummaryCards />`

**File:** `artifacts/talentlock/src/components/spend/SpendSummaryCards.tsx`

Three cards in a `grid grid-cols-1 sm:grid-cols-3 gap-4`.

```
┌───────────────────────────┐  ┌───────────────────────────┐  ┌───────────────────────────┐
│  This Month               │  │  Last Month               │  │  All Time                 │
│  $8,400                   │  │  $6,200                   │  │  $42,800                  │
│  ▲ 35% vs last month      │  │                           │  │                           │
└───────────────────────────┘  └───────────────────────────┘  └───────────────────────────┘
```

**Trend indicator (This Month card only):**
- Spend increased → `▲ 35% vs last month` in `text-red-500` (costs up)
- Spend decreased → `▼ 12% vs last month` in `text-emerald-600` (savings)
- `monthOverMonthChange === null` → `"First month of spend"` in `text-muted-foreground`

### Loading state
Three skeleton cards: `<Skeleton className="h-24 w-full rounded-lg" />`

---

## Component 2 — `<SpendTrendChart />`

**File:** `artifacts/talentlock/src/components/spend/SpendTrendChart.tsx`

recharts `BarChart` — matches the existing dashboard bar chart style (employer already has a bar chart). Responsive, 280px height.

```
$10k ─────────────────────────────────────────
$8k  ──────────────────────────────────█──────
$6k  ──────────────█───█───────────────█──────
$4k  ──────█───────█───█───────────────█──────
$2k  ──────█───────█───█───────█───────█──────
$0   ──────────────────────────────────────────
     Jan   Feb   Mar   Apr   May   Jun
```

```tsx
<ResponsiveContainer width="100%" height={280}>
  <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
    <YAxis
      tick={{ fontSize: 12, fill: '#94a3b8' }}
      tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
      axisLine={false}
      tickLine={false}
    />
    <Tooltip
      formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Spend']}
      cursor={{ fill: '#f8fafc' }}
    />
    <Bar dataKey="spend" fill="#6366f1" radius={[4, 4, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

### Empty state (all zeros)

```
        💰
   No spend data yet.
   Create your first booking to see your spend trend.
```

---

## Component 3 — `<SpendByFieldChart />`

**File:** `artifacts/talentlock/src/components/spend/SpendByFieldChart.tsx`

Horizontal bar chart showing up to 6 fields by total spend.

```
Spend by Field
─────────────────────────────────────────────────────────

React Development     $18,400  43%  ████████████████████
UI/UX Design           $8,200  19%  █████████
Data Analytics         $6,100  14%  ███████
Content Writing        $5,800  13%  ██████
DevOps                 $2,400   6%  ███
Marketing              $2,100   5%  ██
```

Each row: `grid grid-cols-[10rem_5rem_3rem_1fr] gap-2 items-center py-2`

- Field name: `text-sm text-slate-700 truncate`
- Amount: `text-sm font-medium text-slate-800 text-right`
- Percentage: `text-xs text-muted-foreground text-right`
- Bar: full-width container with `bg-slate-100 rounded-full h-2` background, inner `bg-indigo-400 rounded-full h-2` at `width: ${percentageOfTotal}%`

### Single field state

```
All spend is in React Development.
```

`text-sm text-muted-foreground` — no bar chart, just the one field with amount.

### Empty state

```
No spend breakdown yet.
Complete your first booking to see spending by field.
```

---

## Component 4 — `<TopFreelancersCard />`

**File:** `artifacts/talentlock/src/components/spend/TopFreelancersCard.tsx`

Ranked list of up to 5 freelancers.

```
Top Freelancers by Spend
─────────────────────────────────────────────────────────

1  Sarah Chen          React Developer   ★ 4.8    $12,400
   3 bookings          [View Profile →]

2  João Alves          UI/UX Designer    ★ 4.5     $8,200
   2 bookings          [View Profile →]

3  Priya Sharma        Data Analyst      No review  $6,100
   1 booking           [View Profile →]
```

Each row layout:
```tsx
<div className="flex items-start justify-between py-3 border-b border-slate-50 last:border-0">
  <div className="flex items-start gap-3">
    <span className="text-sm font-medium text-slate-400 w-4">{rank}</span>
    <div>
      <p className="text-sm font-medium text-slate-800">{name}</p>
      <p className="text-xs text-muted-foreground">
        {fieldOfWork}
        {averageRatingGiven && ` · ★ ${averageRatingGiven.toFixed(1)}`}
      </p>
      <p className="text-xs text-muted-foreground">{bookingCount} booking{bookingCount !== 1 ? 's' : ''}</p>
    </div>
  </div>
  <div className="text-right shrink-0 ml-4">
    <p className="text-sm font-semibold text-slate-800">${totalPaid.toLocaleString()}</p>
    <Link to={`/freelancers/${freelancerId}`} className="text-xs text-indigo-600 hover:underline">
      View Profile →
    </Link>
  </div>
</div>
```

When `averageRatingGiven === null`: show `"No review"` in muted text.

### Empty state

```
No completed bookings yet.
Your top freelancers by spend will appear here.
```

---

## Component 5 — `<CommittedSpendCard />`

**File:** `artifacts/talentlock/src/components/spend/CommittedSpendCard.tsx`

```
┌────────────────────────────────────────────────────┐
│  Committed This Month              ⓘ               │
│                                                    │
│  $4,800                                            │
│  Across 6 upcoming milestones                      │
└────────────────────────────────────────────────────┘
```

`ⓘ` tooltip: `"Based on pending milestones due this month from active bookings. Actual spend depends on milestone approval."`

### Zero state

```
┌────────────────────────────────────────────────────┐
│  Committed This Month                              │
│                                                    │
│  No milestones due this month.                     │
└────────────────────────────────────────────────────┘
```

`text-sm text-muted-foreground`

---

## Component 6 — `<RateBenchmarkCard />` (Employer Version)

**File:** `artifacts/talentlock/src/components/spend/RateBenchmarkCard.tsx`

Different framing from the freelancer version — employer perspective.

### Loaded state with field breakdown

```
┌────────────────────────────────────────────────────┐
│  Rate Analysis                                     │
│  How your rates compare to market                  │
│                                                    │
│  Your avg paid: $82/hr                             │
│  Market median: $75/hr                             │
│  ▲ 9% above market                                │
│                                                    │
│  By field:                                         │
│  React Development    $88/hr  ▲ 12% above market  │
│  UI/UX Design         $72/hr  ▼ 4% below market   │
│  Data Analytics       $78/hr  ─ At market         │
└────────────────────────────────────────────────────┘
```

**Overall badge:**
- > +10% above market → `text-red-500` — "You may be overpaying"
- -10% to +10% → `text-slate-600` — "At market rate"
- < -10% below market → `text-emerald-600` — "Below market rate"

**Per-field rows:**
- `differencePercent > 5` → `text-red-500 ▲`
- `differencePercent < -5` → `text-emerald-600 ▼`
- Between -5 and 5 → `text-slate-500 ─ At market`

### Null state (insufficient data)

```
┌────────────────────────────────────────────────────┐
│  Rate Analysis                                     │
│                                                    │
│  Not enough data yet.                              │
│  Rate analysis requires completed bookings and     │
│  sufficient market data in your fields.            │
└────────────────────────────────────────────────────┘
```

---

## Component 7 — `<SpendAnalyticsPanel />`

**File:** `artifacts/talentlock/src/components/spend/SpendAnalyticsPanel.tsx`

### Panel layout

```
Spend Analytics
──────────────────────────────────────────────────────

[SpendSummaryCards — 3 col grid]

[SpendTrendChart — full width]

[SpendByFieldChart — half]  [CommittedSpendCard — half]

[TopFreelancersCard — half]  [RateBenchmarkCard — half]
```

```tsx
<div className="space-y-6">
  <SpendSummaryCards {...summary} />
  <SpendTrendChart months={trend.months} spend={trend.spend} />
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <SpendByFieldChart data={spendByField} />
    <CommittedSpendCard {...committed} />
  </div>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <TopFreelancersCard freelancers={topFreelancers} />
    <RateBenchmarkCard data={rateBenchmark} />
  </div>
</div>
```

### Panel error state

```
┌────────────────────────────────────────────────────┐
│  Could not load spend analytics.   [Retry]         │
└────────────────────────────────────────────────────┘
```

Full-width error card. Retry calls `refetch()`.

---

## Page Integration — `/dashboard`

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`

### DOM Placement

```
[Dashboard header]                              ← existing
[Employer stats grid — bookings, spend totals]  ← existing
[Monthly spend bar chart]                       ← existing
─────────────────────────────────────────────────────────
Spend Analytics                                 ← NEW section heading
[SpendAnalyticsPanel]                           ← NEW
```

```tsx
{userRole === 'employer' && (
  <>
    <h2 className="text-lg font-semibold text-slate-800 mt-8 mb-4">
      Spend Analytics
    </h2>
    <SpendAnalyticsPanel />
  </>
)}
```

Freelancer dashboard (`userRole === 'freelancer'`) is completely unchanged.

---

## Copy Reference

| Location | String |
|---|---|
| Panel heading | `Spend Analytics` |
| Summary — this month | `This Month` |
| Summary — last month | `Last Month` |
| Summary — all time | `All Time` |
| Summary — first month | `First month of spend` |
| Summary — trend up | `▲ {N}% vs last month` |
| Summary — trend down | `▼ {N}% vs last month` |
| Trend chart — empty | `No spend data yet. Create your first booking to see your spend trend.` |
| Field chart heading | `Spend by Field` |
| Field chart — single field | `All spend is in {field}.` |
| Field chart — empty | `No spend breakdown yet. Complete your first booking to see spending by field.` |
| Top freelancers heading | `Top Freelancers by Spend` |
| Top freelancers — link | `View Profile →` |
| Top freelancers — no review | `No review` |
| Top freelancers — empty | `No completed bookings yet. Your top freelancers by spend will appear here.` |
| Committed heading | `Committed This Month` |
| Committed tooltip | `Based on pending milestones due this month from active bookings. Actual spend depends on milestone approval.` |
| Committed — count | `Across {N} upcoming milestone{s}` |
| Committed — empty | `No milestones due this month.` |
| Rate benchmark heading | `Rate Analysis` |
| Rate benchmark subtitle | `How your rates compare to market` |
| Rate benchmark — avg | `Your avg paid: ${N}/hr` |
| Rate benchmark — market | `Market median: ${N}/hr` |
| Rate benchmark — above | `▲ {N}% above market` |
| Rate benchmark — below | `▼ {N}% below market` |
| Rate benchmark — at market | `─ At market rate` |
| Rate benchmark — overpaying | `You may be overpaying` |
| Rate benchmark — at market (overall) | `At market rate` |
| Rate benchmark — saving | `Below market rate` |
| Rate benchmark — null | `Not enough data yet.` |
| Rate benchmark — null subtitle | `Rate analysis requires completed bookings and sufficient market data in your fields.` |
| Per-field — above | `▲ {N}% above market` |
| Per-field — below | `▼ {N}% below market` |
| Per-field — at | `─ At market` |
| Error message | `Could not load spend analytics.` |
| Error retry | `Retry` |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| `SpendSummaryCards` | 3 skeleton cards | Handled by panel |
| `SpendTrendChart` | `<Skeleton className="h-[280px] w-full" />` | Handled by panel |
| `SpendByFieldChart` | Skeleton list (6 rows) | Handled by panel |
| `TopFreelancersCard` | Skeleton list (5 rows) | Handled by panel |
| `CommittedSpendCard` | Skeleton card | Handled by panel |
| `RateBenchmarkCard` | Skeleton card | Handled by panel |
| `SpendAnalyticsPanel` | All sub-components skeleton | Full-width error card + Retry |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/spend/SpendSummaryCards.tsx` | **New** | 2.2 |
| `src/components/spend/SpendTrendChart.tsx` | **New** | 2.3 |
| `src/components/spend/SpendByFieldChart.tsx` | **New** | 2.4 |
| `src/components/spend/TopFreelancersCard.tsx` | **New** | 2.5 |
| `src/components/spend/CommittedSpendCard.tsx` | **New** | 2.6 |
| `src/components/spend/RateBenchmarkCard.tsx` | **New** | 2.7 |
| `src/components/spend/SpendAnalyticsPanel.tsx` | **New** | 2.8 |
| `src/pages/Dashboard.tsx` | Modified | 2.9 |

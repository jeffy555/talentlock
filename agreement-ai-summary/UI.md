# TalentLock — UI Specification: Agreement AI Summary

## Overview

One new component (`<AgreementSummaryPanel />`), one utility file, one list badge, and one page integration. The panel integrates into `/agreements/:id` for freelancers only. The badge integrates into the agreements list.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Panel border | `border-violet-200` | Summary panel outer border |
| Panel header bg | `bg-violet-600` | "AI Summary" heading strip |
| Panel header text | `text-white` | Heading and icon |
| Section icon bg | `bg-violet-50` | Icon circle background |
| Section icon | `text-violet-600` | Section emoji wrapper |
| Disclaimer bg | `bg-amber-50 border-l-4 border-amber-400` | Warning strip |
| Disclaimer text | `text-amber-800` | Disclaimer copy |
| Attention flag bg | `bg-red-50 border border-red-200` | Flag card |
| Attention flag heading | `text-red-700 font-semibold` | Flag clause quote |
| Attention flag detail | `text-red-600` | Flag explanation |
| No flags | `bg-green-50 border border-green-200` | All-clear card |
| Cached badge | `text-muted-foreground text-xs` | "✓ Cached result" |
| Summarised badge | `bg-violet-100 text-violet-700 border-violet-200` | Agreement list badge |

---

## Component — `<AgreementSummaryPanel />`

**File:** `artifacts/talentlock/src/components/AgreementSummaryPanel.tsx`

The panel occupies a fixed position on the page — always rendered for freelancers, transitions between internal states.

---

### State 1 — Idle (not yet summarised)

```
┌─────────────────────────────────────────────────────────────┐
│  ✦  AI Agreement Summary                          freelancer │
│─────────────────────────────────────────────────────────────│
│                                                             │
│  Reading every clause of a legal agreement takes time       │
│  and expertise. Let AI highlight what matters most to       │
│  you as a freelancer before you sign.                       │
│                                                             │
│                          [✦ Summarise for me]               │
└─────────────────────────────────────────────────────────────┘
```

Container: `rounded-lg border border-violet-200 overflow-hidden`

Header strip:
```tsx
<div className="bg-violet-600 px-5 py-3 flex items-center justify-between">
  <div className="flex items-center gap-2">
    <Sparkles className="h-4 w-4 text-violet-200" />
    <span className="text-sm font-semibold text-white">AI Agreement Summary</span>
  </div>
  <span className="text-xs text-violet-300 bg-violet-700 px-2 py-0.5 rounded">Freelancer</span>
</div>
```

Body:
```tsx
<div className="p-5">
  <p className="text-sm text-slate-600 mb-4">
    Reading every clause of a legal agreement takes time and expertise.
    Let AI highlight what matters most to you as a freelancer before you sign.
  </p>
  <div className="flex justify-end">
    <Button onClick={handleSummarise} variant="outline" size="sm"
      className="border-violet-300 text-violet-700 hover:bg-violet-50">
      <Sparkles className="h-4 w-4 mr-1.5" />
      Summarise for me
    </Button>
  </div>
</div>
```

---

### State 2 — Loading

```
┌─────────────────────────────────────────────────────────────┐
│  ✦  AI Agreement Summary                          freelancer │
│─────────────────────────────────────────────────────────────│
│                                                             │
│  [⟳  Reading and summarising your agreement...]             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

```tsx
<div className="p-5 flex items-center gap-3">
  <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
  <span className="text-sm text-slate-500">Reading and summarising your agreement...</span>
</div>
```

---

### State 3 — Loaded (main state)

```
┌─────────────────────────────────────────────────────────────┐
│  ✦  AI Agreement Summary             ✓ Cached   [Regenerate]│
│─────────────────────────────────────────────────────────────│
│                                                             │
│  ⚠ Note: This is an AI-generated summary for your          │
│  convenience. It is not legal advice. Always read the       │
│  full agreement before signing.                            │
│                                                             │
│  📋  What you are being hired to do                         │
│  ───────────────────────────────────────────────────────   │
│  You are being engaged to build the React dashboard for     │
│  the client's SaaS product, including data visualisation    │
│  components and user authentication flows. The scope is     │
│  limited to frontend work only.                             │
│                                                             │
│  💰  How and when you get paid                              │
│  ───────────────────────────────────────────────────────   │
│  You will be paid $85/hr, invoiced bi-weekly. Payment is    │
│  due within 14 days of invoice. A 50% deposit is required   │
│  before work begins.                                        │
│                                                             │
│  ©   Who owns the work                                      │
│  ───────────────────────────────────────────────────────   │
│  All work created under this contract is assigned to the    │
│  client as work-for-hire. You retain no IP rights to the    │
│  deliverables once paid.                                    │
│                                                             │
│  🚪  How this contract can end                              │
│  ───────────────────────────────────────────────────────   │
│  Either party may terminate with 14 days written notice.    │
│  If the client terminates early without cause, you are      │
│  entitled to payment for all work completed to that date.  │
│                                                             │
│  🔒  Important restrictions on you                          │
│  ───────────────────────────────────────────────────────   │
│  You must keep all client information confidential for      │
│  2 years after the engagement ends. A non-solicitation      │
│  clause prevents you from hiring away the client's staff.  │
│                                                             │
│  📅  Key dates and deadlines                                │
│  ───────────────────────────────────────────────────────   │
│  Start date: June 15, 2025. First milestone due: July 1.    │
│  Full delivery expected by August 30, 2025.                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ⚠ Read before signing (2 items)                    │   │
│  │─────────────────────────────────────────────────────│   │
│  │  "all work created shall be assigned"               │   │
│  │  This is a full IP assignment — you will own no     │   │
│  │  rights to any code you write under this contract.  │   │
│  │                                                     │   │
│  │  "non-solicitation period of 24 months"             │   │
│  │  You cannot recruit or hire this client's employees │   │
│  │  for 2 years after the engagement ends.             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Disclaimer (always first, above all sections):**
```tsx
<div className="rounded border-l-4 border-amber-400 bg-amber-50 px-4 py-3 mb-5">
  <p className="text-xs text-amber-800">
    <span className="font-semibold">Note: </span>
    {AGREEMENT_SUMMARY_DISCLAIMER}
  </p>
</div>
```

**Section rendering (map over `SECTION_ORDER`):**
```tsx
{SECTION_ORDER.map(key => (
  <div key={key} className="mb-5">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-base">{SECTION_ICONS[key]}</span>
      <h4 className="text-sm font-semibold text-slate-800">
        {summary.sections[key].title}
      </h4>
    </div>
    <div className="border-b border-slate-100 mb-2" />
    <p className="text-sm text-slate-700 leading-relaxed">
      {summary.sections[key].content}
    </p>
  </div>
))}
```

**Attention flags (when `attentionFlags.exists === true`):**
```tsx
<div className="rounded-md border border-red-200 bg-red-50 overflow-hidden mt-2">
  <div className="px-4 py-2.5 border-b border-red-200 bg-red-100">
    <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
      <AlertTriangle className="h-4 w-4" />
      Read before signing ({attentionFlags.items.length} item{attentionFlags.items.length !== 1 ? 's' : ''})
    </p>
  </div>
  {attentionFlags.items.map((flag, i) => (
    <div key={i} className="px-4 py-3 border-b border-red-100 last:border-0">
      <p className="text-xs font-semibold text-red-700 mb-1">"{flag.heading}"</p>
      <p className="text-sm text-red-600">{flag.detail}</p>
    </div>
  ))}
</div>
```

**No unusual terms (when `attentionFlags.exists === false`):**
```tsx
<div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 mt-2">
  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
  <p className="text-sm text-green-700">
    No unusual terms found — this appears to be a standard freelance engagement contract.
  </p>
</div>
```

**Header right side (when loaded):**
```tsx
<div className="flex items-center gap-2">
  {cached && (
    <span className="text-xs text-violet-300 flex items-center gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Cached
    </span>
  )}
  <Button variant="ghost" size="sm"
    className="text-violet-300 hover:text-white hover:bg-violet-700 h-7 px-2 text-xs"
    onClick={handleRegenerate}>
    Regenerate
  </Button>
</div>
```

"Regenerate" clears the local `summaryData` state and re-fires the mutation (which ignores the cache because the local state was cleared). It does NOT call a separate API to invalidate the server cache — the next call will still return cached data unless the content changed. For a forced server refresh, the regenerate button should call the endpoint regardless — the backend always caches the result, so a "regenerate" is just a fresh call that overwrites the cache.

---

### State 4 — Parse Error

```
┌─────────────────────────────────────────────────────────────┐
│  ✦  AI Agreement Summary                          freelancer │
│─────────────────────────────────────────────────────────────│
│                                                             │
│  Could not summarise this agreement.                        │
│  The AI returned an unexpected response. Please try again.  │
│                                                             │
│                                             [Try again]     │
└─────────────────────────────────────────────────────────────┘
```

---

### State 5 — Server Error (500)

```
┌─────────────────────────────────────────────────────────────┐
│  ✦  AI Agreement Summary                          freelancer │
│─────────────────────────────────────────────────────────────│
│                                                             │
│  The AI service is temporarily unavailable.                 │
│  Please try again in a few moments.                         │
│                                                             │
│                                             [Try again]     │
└─────────────────────────────────────────────────────────────┘
```

---

## Component — "Summarised" Badge (Agreement List)

**Placement:** On the agreements list page, beside each agreement title, for freelancers only when `hasSummary === true`.

```
  My Agreement — Acme Corp  [Draft]  [✦ Summarised]
  React Dashboard Contract  [Signed]
```

```tsx
{userRole === 'freelancer' && agreement.hasSummary && (
  <span className="inline-flex items-center gap-1 text-xs
    bg-violet-100 text-violet-700 border border-violet-200
    rounded px-1.5 py-0.5 shrink-0">
    <Sparkles className="h-3 w-3" />
    Summarised
  </span>
)}
```

---

## Page Integration — `/agreements/:id`

**File:** `artifacts/talentlock/src/pages/AgreementDetail.tsx`

### DOM Placement (Enforced Order)

```
[Agreement header — title, parties, status badge]    ← existing
[Agreement content / full text]                      ← existing
[Redline suggestions panel]   ← employer-only        ← existing
────────────────────────────────────────────────────
[Health Score Card]           ← both parties         ← existing
────────────────────────────────────────────────────
<AgreementSummaryPanel />     ← freelancer-only      ← NEW
────────────────────────────────────────────────────
[Signing section]                                    ← existing
[Download section]                                   ← existing
```

```tsx
{/* Health Score — both parties */}
<ContractHealthScoreCard ... />

{/* AI Summary — freelancer only */}
{userRole === 'freelancer' && (
  <AgreementSummaryPanel
    agreementId={agreement.id}
    cachedSummary={agreement.freelancerSummary ?? null}
    cachedAt={agreement.freelancerSummaryScoredAt ?? null}
  />
)}

{/* Signing section */}
...
```

The `AgreementSummaryPanel` is not rendered at all for employers — not hidden with CSS, not rendered and hidden. Not rendered.

---

## Page Integration — `/agreements` (List)

**File:** `artifacts/talentlock/src/pages/Agreements.tsx`

For each agreement in the paginated list, freelancer view only:

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <span className="text-sm font-medium text-slate-800">{agreement.title}</span>
  <StatusBadge status={agreement.status} />
  {userRole === 'freelancer' && agreement.hasSummary && (
    <span className="inline-flex items-center gap-1 text-xs
      bg-violet-100 text-violet-700 border border-violet-200
      rounded px-1.5 py-0.5">
      <Sparkles className="h-3 w-3" />
      Summarised
    </span>
  )}
</div>
```

---

## Copy Reference

| Location | String |
|---|---|
| Panel heading | `AI Agreement Summary` |
| Role badge | `Freelancer` |
| Idle description | `Reading every clause of a legal agreement takes time and expertise. Let AI highlight what matters most to you as a freelancer before you sign.` |
| Summarise button | `Summarise for me` |
| Loading text | `Reading and summarising your agreement...` |
| Disclaimer prefix | `Note: ` |
| Disclaimer body | `This is an AI-generated summary for your convenience. It is not legal advice. Always read the full agreement before signing.` |
| Cached indicator | `Cached` |
| Regenerate button | `Regenerate` |
| Section 1 default title | `What you are being hired to do` |
| Section 2 default title | `How and when you get paid` |
| Section 3 default title | `Who owns the work` |
| Section 4 default title | `How this contract can end` |
| Section 5 default title | `Important restrictions on you` |
| Section 6 default title | `Key dates and deadlines` |
| Flags heading | `Read before signing ({N} item{s})` |
| No flags | `No unusual terms found — this appears to be a standard freelance engagement contract.` |
| Parse error heading | `Could not summarise this agreement.` |
| Parse error body | `The AI returned an unexpected response. Please try again.` |
| Server error heading | `The AI service is temporarily unavailable.` |
| Server error body | `Please try again in a few moments.` |
| Try again button | `Try again` |
| List badge | `Summarised` |

---

## Loading & Error State Summary

| State | Trigger | Panel Response |
|---|---|---|
| Idle | `cachedSummary === null` on mount | Button shown |
| Loading | Button clicked, API in flight | Spinner + loading text |
| Loaded | API returns success | Full 6-section summary |
| Cached | `cachedSummary !== null` on mount | Full summary + "Cached" indicator |
| Parse error | API returns `parseError: true` | Error message + Try again |
| Server error | API returns 500 | Server error message + Try again |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/lib/agreementSummaryUtils.ts` | **New** | 3.2 |
| `src/components/AgreementSummaryPanel.tsx` | **New** | 3.3 |
| `src/pages/AgreementDetail.tsx` | Modified | 3.4 |
| `src/pages/Agreements.tsx` | Modified | 3.5 |

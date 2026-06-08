# TalentLock — UI Specification: Agreement Templates + Redlining

## Overview

This document specifies the complete UI for the Agreement Templates + Redlining feature. Two new UI sections on the existing `/agreements/:id` page, all states, all copy strings, and all interactions are defined here.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter routing.
**Dual-role:** Employers interact with templates and redlining. Freelancers see a read-only notice only.

---

## Design Tokens

| Semantic | Tailwind Classes | Used for |
|---|---|---|
| AI content border | `border-l-4 border-violet-400 bg-violet-50` | Redline suggested text |
| Warning banner | `border border-amber-300 bg-amber-50 text-amber-800` | Signature reset warning |
| Freelancer notice | `border border-violet-200 bg-violet-50 text-violet-700` | AI revision notice |
| Locked feature | `border-dashed border-slate-300 bg-slate-50 text-slate-500` | Starter plan locked state |
| Redline panel | `border border-slate-200 bg-slate-50` | Redlining container |
| Error text | `text-red-500 text-xs` | Clause validation errors |
| Muted estimate | `text-sm text-muted-foreground` | Token estimate line |

---

## Component 1 — Industry Selector + Custom Clauses Panel

**File:** `artifacts/talentlock/src/pages/Agreement.tsx` (generation section)

### Placement in DOM

Inserted above the existing "Generate Agreement" button. Below any booking context display.

```
[Booking context card]     ← existing
[Industry Selector]        ← NEW
[Custom Clauses Panel]     ← NEW (enterprise only)
[Generate Agreement btn]   ← existing
```

---

### Industry Selector (All Plans)

Label: `Agreement Template`

```
Agreement Template
┌─────────────────────────────────────────────────┐
│  General (default)                            ▾ │
└─────────────────────────────────────────────────┘
```

`shadcn/ui <Select>` with `defaultValue="general"`. Required — no empty option.

Options in order:
1. General
2. Software Development
3. Design & Creative
4. Marketing & Content
5. Consulting & Strategy
6. Data & Analytics

Helper text below selector:
```
Includes industry-specific standard clauses in the agreement.
```
`text-xs text-muted-foreground mt-1`

---

### Custom Clauses Panel (Enterprise Only)

Rendered immediately below the industry selector. Only when `userPlan === 'employer_enterprise'`.

**Empty state (no clauses added yet):**
```
Custom Clauses  (optional — up to 5)
[+ Add Custom Clause]
```
Label: `text-sm font-medium` + `text-xs text-muted-foreground` inline

**With clauses:**
```
Custom Clauses  (optional — up to 5)                    (2 of 5)
┌──────────────────────────────────────────────────────────────┐
│  Clause 1                                      [×]  84/500   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Payment will be made within 7 days of milestone...    │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Clause 2                                      [×]   8/500   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ NDA applies                                            │  │
│  └────────────────────────────────────────────────────────┘  │
│  ⚠ Clause must be at least 20 characters                     │
└──────────────────────────────────────────────────────────────┘

[+ Add Custom Clause]
```

Per-clause details:
- Label `Clause {N}`: `text-sm font-medium text-slate-600`
- Remove button `[×]`: `<Button variant="ghost" size="sm">` top-right of clause card
- Character counter `{N}/500`: `text-xs text-muted-foreground` — turns `text-red-500` when ≤ 20 chars from limit
- Validation error below textarea: `text-xs text-red-500`
- `[+ Add Custom Clause]` button: `<Button variant="outline" size="sm">` — `disabled` when 5 clauses already exist
- Count `(N of 5)`: `text-xs text-muted-foreground` top-right of panel heading

**Generate Agreement button disabled state when clauses have errors:**

The existing "Generate Agreement" button gains `disabled={hasClauseErrors}`. When disabled, tooltip on hover:
```
Fix clause errors before generating
```

---

## Component 2 — Contract Redlining Section

**File:** `artifacts/talentlock/src/pages/Agreement.tsx`

### Placement in DOM

```
[Agreement content preview]    ← existing
[Signature Reset Banner]       ← NEW (conditional)
[Redlining Section]            ← NEW (employer only)
[Freelancer AI Notice]         ← NEW (freelancer only)
[Signature Section]            ← existing
```

---

### State 1 — Available (Growth/Enterprise, no signatures)

```
┌─────────────────────────────────────────────────────────┐
│  🔍 AI Contract Review                                   │
│  Get AI suggestions before signing.                      │
│  ~2,400 tokens will be used                              │
│                              [Request Redlining ✦]       │
└─────────────────────────────────────────────────────────┘
```

Container: `rounded-md border border-slate-200 bg-slate-50 p-4`
Heading: `text-sm font-semibold text-slate-700`
Subtitle: `text-sm text-slate-500`
Token estimate: `text-sm text-muted-foreground`
Button: `<Button variant="outline" size="sm">` with `<Sparkles className="h-4 w-4 mr-1" />`

**When approaching quota (within 20% remaining):**
```
~2,400 tokens will be used  ⚠ This may exhaust your remaining quota (2,800 left)
```
Warning suffix: `text-amber-600 text-sm ml-2`

---

### State 2 — Loading (button clicked, awaiting OpenAI)

Button replaces its content with:
```
[⟳ Analysing contract...]
```
`<Loader2 className="h-4 w-4 animate-spin mr-1" />` + `"Analysing contract..."`
Button remains `disabled` during loading.

---

### State 3 — Suggestions Loaded

```
AI Contract Review  ·  8 suggestions found
──────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────┐
│  Clause 4.2  ·  Ambiguous language              [1/8]   │
│                                                         │
│  Original                                               │
│  "Payment shall be made in a timely manner."            │
│                                                         │
│  Suggested                                          ←──── violet left border
│  ┌──────────────────────────────────────────────────┐   │
│  │  border-l-4 border-violet-400 bg-violet-50 p-3   │   │
│  │  "Payment shall be made within 14 calendar days   │   │
│  │   of invoice receipt."                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  Reason: Specifying a timeframe avoids disputes and     │
│  sets clear expectations for both parties.              │
│                                                         │
│                            [Skip]  [Accept Change ✓]    │
└─────────────────────────────────────────────────────────┘

[next suggestion card...]
```

**Suggestion card details:**

Header row: `text-sm font-medium text-slate-700` for clause number + `text-xs text-muted-foreground` for description — counter `[N/total]` floated right `text-xs text-muted-foreground`

Original text label: `text-xs font-medium text-slate-500 uppercase tracking-wide mb-1`
Original text: `text-sm text-slate-600 italic`

Suggested text label: same as original label
Suggested text box: `rounded border-l-4 border-violet-400 bg-violet-50 p-3 text-sm text-slate-700`

Reason: `text-xs text-slate-500 mt-2`

Skip button: `<Button variant="ghost" size="sm">` — removes card with fade animation (`animate-out fade-out duration-200`)
Accept button: `<Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">` — calls API, shows spinner during request, removes card on success

**Accept success toast:**
```
Agreement updated — both signatures have been reset. Both parties must re-sign.
```
`duration: 6000` (longer than default — important message)

---

### State 4 — All Suggestions Reviewed (Empty)

```
┌─────────────────────────────────────────────────────────┐
│          ✓ All suggestions reviewed.                     │
│          The agreement is ready for signing.             │
└─────────────────────────────────────────────────────────┘
```

`text-sm text-center text-muted-foreground py-4`
`<CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />`

---

### State 5 — Parse Error

```
┌─────────────────────────────────────────────────────────┐
│  Could not parse AI review response.   [Try Again]      │
└─────────────────────────────────────────────────────────┘
```

`text-sm text-muted-foreground`
Try Again: `<Button variant="ghost" size="sm">` — re-fires the mutation

---

### State 6 — Locked (Starter Plan)

```
┌─────────────────────────────────────────────────────────┐
│  🔒 AI Contract Review — Growth plan feature             │
│     Review contracts with AI before signing.             │
│                               [Upgrade to Growth →]      │
└─────────────────────────────────────────────────────────┘
```

Container: `rounded-md border border-dashed border-slate-300 bg-slate-50 p-4`
Text: `text-sm text-slate-500`
Upgrade link: `<Link to="/pricing">` styled as `text-sm font-medium text-slate-700 underline`

---

### State 7 — Hidden (After Any Signature)

Do not render the redlining section at all. No empty div, no placeholder.

Condition: `agreement.freelancerSignedAt !== null || agreement.employerSignedAt !== null`

---

## Signature Reset Warning Banner

**Render condition:** `agreement.status === 'redlined'` AND no signatures yet
**Visible to:** Both employer AND freelancer
**Placement:** Above the signature section

```
┌─────────────────────────────────────────────────────────┐
│  ⚠ This agreement was revised. Both parties must sign   │
│    again.                                               │
└─────────────────────────────────────────────────────────┘
```

`className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"`

---

## Freelancer AI Revision Notice

**Render condition:** `userRole === 'freelancer'` AND `agreement.status === 'redlined'`
**Placement:** Below agreement content, above signature section (same position as redlining section for employers — but rendered instead of it)

```
┌─────────────────────────────────────────────────────────┐
│  ℹ This agreement was revised with AI assistance        │
│    before signing.                                      │
└─────────────────────────────────────────────────────────┘
```

`className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-700"`

---

## Page DOM Order Summary

```
/agreements/:id  (employer view, no signatures, status = redlined)

[Agreement header + booking context]
[Agreement content preview]
[Signature Reset Warning Banner]     ← amber, shown when redlined + unsigned
[Redlining Section]                  ← employer only
  State 1 (available) OR
  State 2 (loading) OR
  State 3 (suggestions) OR
  State 4 (all reviewed) OR
  State 5 (parse error) OR
  State 6 (locked — Starter) OR
  State 7 (hidden — after signature)
[Signature Section]

/agreements/:id  (freelancer view, status = redlined)

[Agreement header + booking context]
[Agreement content preview]
[Signature Reset Warning Banner]     ← amber, shown when redlined + unsigned
[Freelancer AI Revision Notice]      ← violet, read-only
[Signature Section]

/agreements/:id  (generation flow, before generation)

[Booking context]
[Industry Selector]                  ← all plans
[Custom Clauses Panel]               ← enterprise only
[Generate Agreement button]
```

---

## Copy Reference

| Location | String |
|---|---|
| Industry selector label | `Agreement Template` |
| Industry selector helper | `Includes industry-specific standard clauses in the agreement.` |
| Industry — general | `General` |
| Industry — software | `Software Development` |
| Industry — design | `Design & Creative` |
| Industry — marketing | `Marketing & Content` |
| Industry — consulting | `Consulting & Strategy` |
| Industry — data | `Data & Analytics` |
| Custom clauses label | `Custom Clauses (optional — up to 5)` |
| Add clause button | `+ Add Custom Clause` |
| Clause too short | `Clause must be at least 20 characters` |
| Clause too long | `Clause must be 500 characters or fewer` |
| Generate disabled tooltip | `Fix clause errors before generating` |
| Redline section heading | `🔍 AI Contract Review` |
| Redline subtitle | `Get AI suggestions before signing.` |
| Token estimate | `~{N} tokens will be used` |
| Quota warning suffix | `⚠ This may exhaust your remaining quota ({N} left)` |
| Request button | `Request Redlining ✦` |
| Loading text | `Analysing contract...` |
| Suggestions found | `AI Contract Review · {N} suggestions found` |
| Original label | `Original` |
| Suggested label | `Suggested` |
| Reason label | `Reason:` |
| Skip button | `Skip` |
| Accept button | `Accept Change ✓` |
| Accept toast | `Agreement updated — both signatures have been reset. Both parties must re-sign.` |
| All reviewed heading | `✓ All suggestions reviewed.` |
| All reviewed subtitle | `The agreement is ready for signing.` |
| Parse error | `Could not parse AI review response.` |
| Try again | `Try Again` |
| Locked heading | `🔒 AI Contract Review — Growth plan feature` |
| Locked subtitle | `Review contracts with AI before signing.` |
| Locked CTA | `Upgrade to Growth →` |
| Reset warning | `⚠ This agreement was revised. Both parties must sign again.` |
| Freelancer notice | `ℹ This agreement was revised with AI assistance before signing.` |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| Industry selector | Static (no async) | N/A |
| Custom clauses panel | Static (no async) | Per-clause inline validation |
| Redlining section | Spinner on button, `"Analysing contract..."` | Parse error card + Try Again |
| Accept redline | Spinner on Accept button | Toast: `"Failed to update. Try again."` |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/pages/Agreement.tsx` | Modified | 3.2, 3.3, 3.4, 3.5, 3.6 |

# TalentLock — UI Specification: Smart Rate Suggestions

---

## Component — `<RateSuggestionWidget />`

**File:** `artifacts/talentlock/src/components/RateSuggestionWidget.tsx`

Placed immediately below the rate input field on `/freelancers/:id` and in the negotiation panel on `/bookings/:id`.

---

## State 1 — Static Only (Starter Plan, All Plans Before Button Click)

Always visible below the rate field. No button on Starter.

```
┌──────────────────────────────────────────────────────┐
│  Rate context for React Development                  │
│  Freelancer's rate:   $85/hr                         │
│  Market median:       $78/hr                         │
│  Your avg paid:       $82/hr  (or "No history yet")  │
│                                                      │
│  [✦ Get AI suggestion]   ← Growth/Enterprise only    │
└──────────────────────────────────────────────────────┘
```

Container: `rounded-md border border-slate-200 bg-slate-50 p-3 text-sm`
Label: `text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2`
Rows: `flex justify-between text-sm text-slate-600`
Button: `<Button variant="outline" size="sm">` with `<Sparkles className="h-3.5 w-3.5 mr-1" />`

When `marketMedian === null`:
```
Market median:  Not enough data in this field
```
`text-muted-foreground italic`

---

## State 2 — Loading (after button clicked)

```
[⟳ Analysing rates...]
```

Button shows spinner, disabled. Existing rows still visible.

---

## State 3 — AI Suggestion Loaded

```
┌──────────────────────────────────────────────────────┐
│  Rate context for React Development                  │
│  Freelancer's rate:   $85/hr                         │
│  Market median:       $78/hr                         │
│  Your avg paid:       $82/hr                         │
│  ──────────────────────────────────────────────────  │
│  ✦ AI suggestion:  $83/hr  · High confidence         │
│                                                      │
│  "Sarah's rate is slightly above market but in line  │
│  with your typical React developer spend. The 3-     │
│  month contract makes this rate reasonable."         │
│                                                      │
│             [Use $83/hr]  [Set my own rate]          │
└──────────────────────────────────────────────────────┘
```

AI suggestion row: `text-sm font-semibold text-indigo-700`
Confidence badge: `text-xs bg-emerald-100 text-emerald-700 rounded px-1.5` (high) / amber (medium) / slate (low)
Explanation: `text-xs text-slate-600 italic mt-1`
"Use $X/hr": `<Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">` — calls `onUseSuggestion(suggestedRate)`
"Set my own rate": `<Button variant="ghost" size="sm">` — dismisses AI suggestion row, keeps static context

---

## State 4 — Quota Exhausted (402 TOKEN_LIMIT)

```
⚡ Token limit reached. Upgrade to get rate suggestions.
```
`text-xs text-amber-700` below the button. Static context still visible.

---

## State 5 — Starter Plan Locked

No "Get AI suggestion" button. Static context card only (State 1 without button). No locked icon needed — absence of the button is clear enough.

---

## Page Integration

### `/freelancers/:id` — Booking Creation

```
Rate ($/hr)
┌────────────────┐
│  83            │
└────────────────┘
<RateSuggestionWidget />    ← immediately below rate field
[Request Booking]
```

### `/bookings/:id` — Negotiation Panel

```
[Negotiation section]
Counter-propose a rate:
┌────────────────┐
│  83            │
└────────────────┘
<RateSuggestionWidget />    ← below rate input in negotiation panel
[Propose Rate]
```

Only shown when `booking.negotiationStatus === 'negotiating'` AND `userRole === 'employer'`.

---

## Copy Reference

| Location | String |
|---|---|
| Widget heading | `Rate context for {fieldOfWork}` |
| Freelancer rate | `Freelancer's rate: ${N}/hr` |
| Market median | `Market median: ${N}/hr` |
| No market data | `Market median: Not enough data in this field` |
| Historical avg | `Your avg paid: ${N}/hr` |
| No history | `Your avg paid: No history yet` |
| AI button | `✦ Get AI suggestion` |
| Loading | `Analysing rates...` |
| AI suggestion label | `✦ AI suggestion: ${N}/hr · {confidence} confidence` |
| Use button | `Use ${N}/hr` |
| Own rate button | `Set my own rate` |
| Quota error | `⚡ Token limit reached. Upgrade to get rate suggestions.` |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/RateSuggestionWidget.tsx` | **New** | 3.2 |
| `src/pages/FreelancerDetail.tsx` | Modified | 3.3 |
| `src/pages/BookingDetail.tsx` | Modified | 3.4 |

# TalentLock — UI Specification: Post-Engagement AI Debrief

## Overview

One new component (`<DebriefCard />`) inserted into the existing `/bookings/:id` booking detail page. **Both** employer and freelancer see it when `status === 'completed'`. Each party sees a **different** debrief — role-specific content from `GET /api/bookings/:id/debrief`.

Unlike Meeting Brief (employer-only, amber accent), debrief uses **violet** accent for employer and **indigo** accent for freelancer to distinguish post-engagement retrospective from pre-meeting prep.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query (generated hooks), Wouter.

---

## Design Tokens

| Semantic | Employer value | Freelancer value | Used for |
|----------|----------------|------------------|----------|
| Card header bg | `bg-violet-50 border-violet-200` | `bg-indigo-50 border-indigo-200` | Card container |
| Card header text | `text-violet-800` | `text-indigo-800` | Title |
| Section heading | `text-slate-700 font-semibold text-sm` | same | Section labels |
| Re-hire strong | `bg-emerald-50 text-emerald-800 border-emerald-200` | — | `strong_rehire` verdict pill |
| Re-hire caveats | `bg-amber-50 text-amber-800 border-amber-200` | — | `rehire_with_caveats` |
| Re-hire one-off | `bg-slate-100 text-slate-600 border-slate-200` | — | `one_off` |
| Strength bullet | `text-emerald-700` | `text-emerald-700` | Positive signals |
| Growth bullet | `text-amber-700` | `text-amber-700` | Growth areas |
| Disclaimer | `bg-slate-50 border-slate-200 text-slate-600 text-xs` | same | Always first |
| Regenerate btn | `variant="outline" size="sm"` | same | Secondary action |
| Upgrade CTA | `border-violet-200 bg-violet-50 text-violet-800` | N/A | Starter employer sections 3–5 |

---

## Booking Detail Page Integration

**File:** `artifacts/talentlock/src/pages/BookingDetail.tsx`

Insert after milestone section and **before** review form:

```
┌─────────────────────────────────────────────────────────────────┐
│  Booking #142 — Completed                                        │
│  Sarah Chen × Acme Corp · React Dashboard                        │
│  Jan 15 – Apr 15, 2026 · $95/hr                                  │
├─────────────────────────────────────────────────────────────────┤
│  Milestones (3/3 complete)                                        │
├─────────────────────────────────────────────────────────────────┤
│  ✦ Post-Engagement Debrief              [Regenerate]            │  ← NEW
│  Generated Apr 16, 2026                                         │
│  [Disclaimer]                                                    │
│  [Role-specific sections]                                        │
├─────────────────────────────────────────────────────────────────┤
│  Leave a review (employer only)                                 │
└─────────────────────────────────────────────────────────────────┘
```

```tsx
{booking.status === "completed" && (
  <DebriefCard
    bookingId={booking.id}
    hasDebrief={booking.hasDebrief}
    debriefGeneratedAt={booking.debriefGeneratedAt}
    userRole={userRole}
    employerPlanId={employerPlanId}
  />
)}
```

`employerPlanId` is only required when `userRole === 'employer'` (from subscription hook).

---

## Component: `DebriefCard`

**File:** `artifacts/talentlock/src/components/bookings/DebriefCard.tsx`

### Props

```ts
interface DebriefCardProps {
  bookingId: number;
  hasDebrief: boolean;
  debriefGeneratedAt: string | null;
  userRole: "employer" | "freelancer";
  employerPlanId?: string;
}
```

### Hooks

- `useGetBookingDebrief(bookingId, { query: { enabled: hasDebrief } })`
- `usePostBookingDebrief()` for regenerate
- Poll parent `useGetBooking` every 3s while `!hasDebrief && isGenerating` (after PATCH to completed or POST regen)

---

## State 1 — Not Yet Generated

Shown when `status === 'completed'` but `hasDebrief === false` and not currently polling after user action.

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ Post-Engagement Debrief                                       │
│                                                                  │
│  Get a private AI summary of this engagement — outcomes,         │
│  strengths, and suggested next steps.                            │
│                                                                  │
│                                    [✦ Generate debrief]          │
└─────────────────────────────────────────────────────────────────┘
```

Copy (employer): *"Get a private AI wrap-up of this engagement — outcomes, re-hire signals, and internal notes."*

Copy (freelancer): *"Get a private AI wrap-up of this engagement — what you delivered, strengths, and profile tips."*

Button calls `POST /api/bookings/:id/debrief` → enters State 2.

---

## State 2 — Generating (Polling)

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ Post-Engagement Debrief                                       │
│                                                                  │
│  ◌ Generating your debrief…                                      │
│  This usually takes 10–20 seconds.                               │
└─────────────────────────────────────────────────────────────────┘
```

- `Loader2` spinner with `animate-spin`
- Poll `useGetBooking(bookingId)` until `hasDebrief === true`, then fetch debrief
- Timeout after 60s → State 4 (error) with retry

---

## State 3 — Loaded (Employer)

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ Post-Engagement Debrief                    [Regenerate ↻]    │
│  Generated Apr 16, 2026 at 2:34 PM                               │
├─────────────────────────────────────────────────────────────────┤
│  ⓘ AI-generated summary based on platform data only. Not a       │
│    performance review, legal record, or formal evaluation.       │
├─────────────────────────────────────────────────────────────────┤
│  ENGAGEMENT SNAPSHOT                                             │
│  Freelancer: Sarah Chen · Full Stack · $95/hr                    │
│  Jan 15 – Apr 15, 2026 · 3/3 milestones complete                 │
├─────────────────────────────────────────────────────────────────┤
│  OUTCOME SUMMARY                                                 │
│  [Paragraph text]                                                │
├─────────────────────────────────────────────────────────────────┤
│  PERFORMANCE SIGNALS                                             │
│  • All milestones completed on schedule                          │
│  • Review not yet submitted                                      │
├─────────────────────────────────────────────────────────────────┤
│  RE-HIRE RECOMMENDATION          [Strong re-hire ✓]              │
│  • Deep React expertise aligned to project needs                 │
│  • Completed all deliverables without scope disputes             │
├─────────────────────────────────────────────────────────────────┤
│  INTERNAL NOTES TEMPLATE                    [Copy to clipboard]  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Engagement with Sarah Chen (Jan–Apr 2026): Delivered...    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Employer Starter — Sections 3–5 gated

Replace PERFORMANCE SIGNALS, RE-HIRE RECOMMENDATION, and INTERNAL NOTES with:

```
┌─────────────────────────────────────────────────────────────────┐
│  🔒 Unlock full debrief on Growth                                │
│  Get performance signals, re-hire recommendation, and internal   │
│  notes template.                                                 │
│                              [View plans →]  (/pricing)          │
└─────────────────────────────────────────────────────────────────┘
```

Sections 1–2 (snapshot + outcome) always visible.

---

## State 3 — Loaded (Freelancer)

Same card structure, indigo accent, freelancer sections:

1. Engagement snapshot (company, role, dates, rate)
2. What you delivered
3. Strengths demonstrated (bullet list)
4. Growth areas (bullet list)
5. Profile suggestions (numbered list)

No plan gating on freelancer side.

---

## State 4 — Error

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ Post-Engagement Debrief                                       │
│                                                                  │
│  ⚠ Could not load your debrief.                                  │
│  [Try again]                                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Inline errors (toast or banner inside card)

| Condition | Copy | Action |
|-----------|------|--------|
| 402 `TOKEN_LIMIT` | "Monthly AI token limit reached. Upgrade or wait until next month." | Inline only — **no** redirect to `/pricing` |
| 429 `DEBRIEF_REGEN_COOLDOWN` | "You can regenerate once every 24 hours." | Disable regenerate button |
| 403 | "You don't have access to this debrief." | Hide card |
| Network error | "Something went wrong. Try again." | Retry button |

---

## Regenerate Button

- Visible in loaded state only
- `variant="outline" size="sm"`
- Icon: `RefreshCw`
- Disabled when `postDebrief.isPending` or within cooldown (after 429)
- On success → State 2 (polling)

---

## Copy Reference Table

| Key | String |
|-----|--------|
| `card.title` | Post-Engagement Debrief |
| `card.badge` | ✦ |
| `disclaimer` | AI-generated summary based on platform data only. Not a performance review, legal record, or substitute for a formal evaluation. |
| `generate.btn` | Generate debrief |
| `generating` | Generating your debrief… |
| `generating.hint` | This usually takes 10–20 seconds. |
| `regenerate` | Regenerate |
| `section.snapshot` | Engagement snapshot |
| `section.outcome` | Outcome summary |
| `section.signals` | Performance signals |
| `section.rehire` | Re-hire recommendation |
| `section.internal` | Internal notes template |
| `section.delivered` | What you delivered |
| `section.strengths` | Strengths demonstrated |
| `section.growth` | Growth areas |
| `section.profile` | Profile suggestions |
| `verdict.strong_rehire` | Strong re-hire |
| `verdict.rehire_with_caveats` | Re-hire with caveats |
| `verdict.one_off` | One-off engagement |
| `upgrade.title` | Unlock full debrief on Growth |
| `upgrade.body` | Get performance signals, re-hire recommendation, and internal notes template. |
| `upgrade.cta` | View plans |
| `notify.employer` | Your post-engagement debrief for {name} is ready. |
| `notify.freelancer` | Your post-engagement debrief for {company} is ready. |
| `copy.internal` | Copy to clipboard |
| `error.token` | Monthly AI token limit reached. Upgrade or wait until next month. |
| `error.cooldown` | You can regenerate once every 24 hours. |

---

## Accessibility

- Card title is `h3` with `id`; sections use `h4` or `aria-labelledby`
- Regenerate button has `aria-label="Regenerate post-engagement debrief"`
- Verdict pill has `role="status"`
- Copy button announces success via toast: "Copied to clipboard"
- Loading state: `aria-live="polite"` on generating message

---

## Responsive Behaviour

- Single column on all breakpoints
- Internal notes template: `font-mono text-sm` with `whitespace-pre-wrap`
- On mobile, regenerate button stacks below title row

---

## Component File Summary

| File | Status | Task |
|------|--------|------|
| `components/bookings/DebriefCard.tsx` | New | 3.1 |
| `pages/BookingDetail.tsx` | Modified | 3.2 |
| `components/NotificationItem.tsx` | Modified | 3.3 |

---

## Non-UI Scope

- No debrief on booking list page
- No debrief on dashboard widgets (Phase 2 future)
- No email template design in Phase 1 — uses plain `sendNotificationEmailAsync` body

# TalentLock — UI Specification: Availability Calendar (Visual)

## Overview

Three new components, four page integrations, all states, and all copy strings. The freelancer manages their calendar from `/profile`. Employers and public visitors see a read-only calendar. The Talent Vault gains a date filter and updated card badge.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, `react-day-picker`, React Query, Wouter routing.

---

## Design Tokens

| Semantic | Tailwind Classes | Used for |
|---|---|---|
| Booked block | `bg-indigo-100 text-indigo-800 border-indigo-300` | Auto-created from booking |
| Holiday block | `bg-amber-100 text-amber-800 border-amber-300` | Manual — freelancer holiday |
| Unavailable block | `bg-red-100 text-red-800 border-red-300` | Manual — other unavailability |
| Available now badge | `bg-emerald-100 text-emerald-700` | Card + profile badge |
| Available future badge | `bg-amber-100 text-amber-700` | Card + profile badge |
| Not available badge | `bg-slate-100 text-slate-500` | Card + profile badge |
| Calendar day — today | `font-bold text-indigo-600` | Today marker |
| Calendar day — blocked | coloured by reason | Days within a block |
| Calendar nav arrow | `<ChevronLeft /> <ChevronRight />` | Month navigation |

---

## Component 1 — `<AvailabilityCalendar />` (Read-Only)

**File:** `artifacts/talentlock/src/components/availability/AvailabilityCalendar.tsx`

Used on employer views (`/freelancers/:id`) and public profile (`/f/:id`).

### Props

```ts
interface AvailabilityCalendarProps {
  blocks: { startDate: string; endDate: string; reason: string }[];
  nextAvailableDate: string | null;
}
```

### Layout

```
┌────────────────────────────────────────────────┐
│  Availability                                  │
│  Next available: Jun 16, 2025                  │
│                                                │
│  ◀ June 2025                               ▶  │
│  Mo  Tu  We  Th  Fr  Sa  Su                   │
│       2   3   4   5   6   7                   │
│   8   9  10  11  12  13  14                   │
│  15  ██  ██  ██  ██  ██  21  ← holiday block  │
│  22  23  24  25  26  27  28                   │
│  29  30                                        │
│                                                │
│  Legend:  ● Booked  ● Holiday  ● Unavailable  │
└────────────────────────────────────────────────┘
```

**Month navigation:**
```tsx
<div className="flex items-center justify-between mb-3">
  <button onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></button>
  <p className="text-sm font-medium">{monthYear}</p>
  <button onClick={nextMonth}><ChevronRight className="h-4 w-4" /></button>
</div>
```

**Calendar grid:** render using `react-day-picker` `<DayPicker>` in static (non-interactive) mode:

```tsx
<DayPicker
  mode="range"
  selected={undefined}
  month={currentMonth}
  onMonthChange={setCurrentMonth}
  modifiers={{
    booked:      getModifierDays(blocks, 'booked'),
    holiday:     getModifierDays(blocks, 'holiday'),
    unavailable: getModifierDays(blocks, 'unavailable'),
  }}
  modifiersClassNames={{
    booked:      'bg-indigo-100 text-indigo-800 rounded',
    holiday:     'bg-amber-100 text-amber-800 rounded',
    unavailable: 'bg-red-100 text-red-800 rounded',
  }}
  showOutsideDays={false}
  disabled // non-interactive
/>
```

**`getModifierDays(blocks, reason)`** converts block date ranges to an array of individual `Date` objects for the given reason:
```ts
function getModifierDays(blocks: Block[], reason: string): Date[] {
  return blocks
    .filter(b => b.reason === reason)
    .flatMap(b => {
      const dates: Date[] = [];
      const current = new Date(b.startDate);
      const end = new Date(b.endDate);
      while (current <= end) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      return dates;
    });
}
```

**Next available display:**
```tsx
<p className="text-sm text-slate-600 mb-3">
  Next available:{' '}
  <span className={`font-medium ${nextAvailableDate ? 'text-emerald-700' : 'text-slate-400'}`}>
    {formatNextAvailable(nextAvailableDate)}
  </span>
</p>
```

**Legend:**
```tsx
<div className="flex gap-3 mt-3 flex-wrap">
  {[
    { label: 'Booked', colour: 'bg-indigo-200' },
    { label: 'Holiday', colour: 'bg-amber-200' },
    { label: 'Unavailable', colour: 'bg-red-200' },
  ].map(item => (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <span className={`h-3 w-3 rounded-sm ${item.colour}`} />
      {item.label}
    </span>
  ))}
</div>
```

### Loading State

```tsx
<Skeleton className="h-[260px] w-full rounded-lg" />
```

### Empty State (no blocks)

Calendar renders normally — all days are unblocked. "Next available: Available now" shown when `nextAvailableDate` is today or null.

---

## Component 2 — `<AvailabilityManager />` (Freelancer Edit)

**File:** `artifacts/talentlock/src/components/availability/AvailabilityManager.tsx`

Used only on the freelancer's own `/profile` page.

### Layout

```
┌────────────────────────────────────────────────────────┐
│  Availability                                          │
│                                                        │
│  ☑ Available for work        Available from: Jun 1    │
│  (existing toggle + date — kept above calendar)        │
│                                                        │
│  ◀ June 2025                                    ▶     │
│  [calendar grid with coloured blocks]                  │
│                                                        │
│  [+ Add Block]                                         │
│                                                        │
│  Upcoming blocks:                                      │
│  ──────────────────────────────────────────────────   │
│  ● Jun 16–30   Holiday       [no delete — auto]        │
│  ● Jul 1–15    Client project — TechCorp  [×]          │
└────────────────────────────────────────────────────────┘
```

**Calendar:** Same `react-day-picker` grid as the read-only version but the freelancer can click a day to start block creation (opens `<AddBlockModal />`).

**Block list below calendar:**

```tsx
{blocks.map(block => (
  <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-sm ${reasonColour(block.reason)}`} />
      <span className="text-sm text-slate-700">
        {formatDateRange(block.startDate, block.endDate)}
      </span>
      <span className={`text-xs px-1.5 py-0.5 rounded ${reasonBadge(block.reason)}`}>
        {block.reason}
      </span>
      {block.label && (
        <span className="text-xs text-muted-foreground">— {block.label}</span>
      )}
    </div>

    {/* Only show delete for manual blocks (no bookingId) */}
    {!block.bookingId ? (
      <Button variant="ghost" size="icon" onClick={() => handleDelete(block.id)}>
        <X className="h-4 w-4" />
      </Button>
    ) : (
      <span className="text-xs text-muted-foreground">auto</span>
    )}
  </div>
))}
```

**Delete confirmation:** When `[×]` is clicked, show an inline confirmation:
```
Delete this block?  [Cancel]  [Delete]
```
Use `shadcn/ui <AlertDialog>`.

**"+ Add Block" button:** `<Button variant="outline" size="sm">` — opens `<AddBlockModal />`.

### Empty Block List

```
No upcoming blocks. You appear as available.
```
`text-sm text-muted-foreground`

---

## Component 3 — `<AddBlockModal />` (Freelancer)

**File:** `artifacts/talentlock/src/components/availability/AddBlockModal.tsx`

`shadcn/ui <Dialog>` — not a Sheet. Compact form.

### Form Layout

```
┌────────────────────────────────────────────────┐
│  Add Unavailability Block                  [×] │
│                                                │
│  Reason                                        │
│  ○ Holiday                                     │
│  ○ Unavailable (other)                         │
│                                                │
│  Start date     End date                       │
│  [Jun 16 ▾]     [Jun 30 ▾]                    │
│                                                │
│  Label (optional)                              │
│  ┌────────────────────────────────────────┐   │
│  │ e.g. Client project, vacation...       │   │
│  └────────────────────────────────────────┘   │
│                             0/100             │
│                                                │
│  ⚠ Jun 16 – Jun 30 overlaps an existing block │
│    (warning, not blocking — overlaps allowed)  │
│                                                │
│              [Cancel]  [Save Block]            │
└────────────────────────────────────────────────┘
```

**Reason radio group:** `holiday` / `unavailable` (no `booked` option — that's auto-only)

**Date pickers:** Use shadcn/ui `<DatePicker>` component for both start and end date.

**Client-side validation before API call:**
- `endDate >= startDate` → error: `"End date must be after start date"`
- `endDate >= today` → error: `"End date cannot be in the past"`
- `endDate <= today + 365` → error: `"Blocks cannot be more than 1 year in the future"`

**Overlap warning** (non-blocking — just informational):
- If the selected range overlaps an existing block, show a yellow info banner
- Does NOT prevent saving

**Save Block button:**
- `disabled` while submitting
- Shows spinner: `<Loader2 className="h-4 w-4 animate-spin mr-1" />`

**On success:**
- Dialog closes
- Block list and calendar refresh automatically (React Query invalidation)
- Toast: `"Block added."`

**On error (`DATE_TOO_FAR`, `DATE_IN_PAST`, `DATE_INVALID`):**
- Inline error below the date pickers
- Dialog stays open

---

## Page Integration 1 — `/profile` (Freelancer)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

### Existing Availability Fields (Keep Above Calendar)

The `isAvailable` toggle and `availableFrom` date remain as quick controls at the top of the section:

```
☑ Available for work

Available from:  [Jun 1, 2025]
Availability note: "Available for contracts up to 3 months"
```

These remain — they are fast controls. The calendar below provides detailed date-range management.

### New Calendar Below Quick Controls

```
[isAvailable toggle]
[availableFrom date]
[availability note textarea]
─────────────────────────────────────
<AvailabilityManager />
```

---

## Page Integration 2 — `/freelancers/:id` (Employer View)

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

### DOM Placement

```
[FreelancerHero]
[VerificationBadge]
[StarRating]
[Bio]
─────────────────────────────────────
Availability                          ← NEW section
<AvailabilityCalendar />              ← NEW
─────────────────────────────────────
[Skills]
[Portfolio]
[Reviews]
```

### Data Source

```tsx
const { data: availabilityData } = useGetAvailabilityFreelancerId(freelancer.id);
```

---

## Page Integration 3 — `/f/:id` (Public Profile)

**File:** `artifacts/talentlock/src/pages/PublicProfile.tsx`

Same placement as employer view. `useGetAvailabilityFreelancerId()` works without auth (public endpoint).

---

## Page Integration 4 — `/freelancers` (Talent Vault)

### Filter Panel

Add below the existing filters:

```
Available from
┌──────────────────────┐
│  Pick a date...    ▾ │  ← shadcn/ui DatePicker
└──────────────────────┘
[Clear]                     ← shown when date is set
```

When a date is selected: appends `?availableFrom=YYYY-MM-DD` to the Talent Vault query.

### Freelancer Card Badge

Replace or augment the existing availability text on each card:

```
Sarah Chen
Senior React Developer
✓ Available now            ← emerald badge
⊙ Available Jun 16         ← amber badge
─ Not available            ← slate text
```

```tsx
const badge = formatNextAvailable(freelancer.nextAvailableDate);
const colour =
  freelancer.nextAvailableDate === null ? 'text-slate-400' :
  new Date(freelancer.nextAvailableDate) <= new Date() ? 'text-emerald-600' :
  'text-amber-600';

<span className={`text-xs font-medium ${colour}`}>{badge}</span>
```

---

## Copy Reference

| Location | String |
|---|---|
| Section heading | `Availability` |
| Next available label | `Next available:` |
| Available now | `Available now` |
| Available future | `Available {MMM D}` |
| Not available | `Not available` |
| Legend — booked | `Booked` |
| Legend — holiday | `Holiday` |
| Legend — unavailable | `Unavailable` |
| Add block button | `+ Add Block` |
| Modal heading | `Add Unavailability Block` |
| Reason — holiday | `Holiday` |
| Reason — unavailable | `Unavailable (other)` |
| Label placeholder | `e.g. Client project, vacation...` |
| Label max label | `{N}/100` |
| Overlap warning | `This range overlaps an existing block.` |
| End before start error | `End date must be after start date.` |
| Date in past error | `End date cannot be in the past.` |
| Date too far error | `Blocks cannot be more than 1 year in the future.` |
| Save block button | `Save Block` |
| Cancel button | `Cancel` |
| Add block toast | `Block added.` |
| Delete block toast | `Block removed.` |
| Delete confirm heading | `Delete this block?` |
| Delete confirm body | `This will remove the unavailability block from your calendar.` |
| Delete confirm cancel | `Keep block` |
| Delete confirm confirm | `Delete` |
| Auto block label | `auto` |
| Auto delete error | `Cannot delete an auto-created booking block. Cancel the booking to remove it.` |
| Empty block list | `No upcoming blocks. You appear as available.` |
| Filter label | `Available from` |
| Filter clear | `Clear` |
| Calendar loading | `<Skeleton h-[260px]>` |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| `AvailabilityCalendar` | Skeleton 260px tall | `"Could not load availability."` + Retry |
| `AvailabilityManager` | Skeleton calendar + 3 skeleton list rows | `"Could not load your availability."` + Retry |
| `AddBlockModal` | Spinner on Save button, button disabled | Inline error below date pickers |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/availability/AvailabilityCalendar.tsx` | **New** | 3.4 |
| `src/components/availability/AvailabilityManager.tsx` | **New** | 3.5 |
| `src/components/availability/AddBlockModal.tsx` | **New** | 3.6 |
| `src/lib/availabilityUtils.ts` | **New** | 3.3 |
| `src/pages/Profile.tsx` | Modified | 3.7 |
| `src/pages/FreelancerDetail.tsx` | Modified | 3.8 |
| `src/pages/PublicProfile.tsx` | Modified | 3.9 |
| `src/pages/Freelancers.tsx` | Modified | 3.10 |
| `src/components/FreelancerCard.tsx` | Modified | 3.11 |

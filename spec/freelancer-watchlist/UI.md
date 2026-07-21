# TalentLock — UI Specification: Freelancer Watchlist

Employer-only surfaces. Design tokens: rose accent for heart/watchlist active state (existing pattern), navy/gold for page chrome, `muted-foreground` for empty states.

---

## Component 1 — `WatchlistToggleButton`

**File:** `artifacts/talentlock/src/components/watchlist/WatchlistToggleButton.tsx`

**Props:**

```ts
interface WatchlistToggleButtonProps {
  freelancerId: number;
  className?: string;
}
```

**States:**

| State | Rendering |
|-------|-----------|
| Loading (initial check) | Heart icon, `opacity-50`, disabled |
| Not saved | Outline heart, `text-muted-foreground`, hover rose |
| Saved | Filled rose heart, `bg-rose-50 border-rose-200 text-rose-500` |
| Pending (mutation) | Disabled, `opacity-70` |
| Error | Toast: "Failed to update watchlist" |

**Placement:** Top-left of `FreelancerCard` (absolute `top-4 left-4`), same as current heart button.

**Aria:**

- Not saved: `aria-label="Add to watchlist"`
- Saved: `aria-label="Remove from watchlist"`

Enterprise team members use existing `TeamSaveButton` — not this component.

---

## Component 2 — `WatchlistNotesEditor`

**File:** `artifacts/talentlock/src/components/watchlist/WatchlistNotesEditor.tsx`

**Props:**

```ts
interface WatchlistNotesEditorProps {
  freelancerId: number;
  initialNotes?: string | null;
}
```

**States:**

| State | Rendering |
|-------|-----------|
| Collapsed, no notes | Text button: `Add a private note` |
| Collapsed, has notes | Truncated preview (max 60 chars) + `Edit note` link |
| Expanded | `<Textarea>` (max 500 chars, character counter), Save + Cancel buttons |
| Saving | Save button disabled, spinner |
| Error | Inline red text: `Could not save note. Try again.` |
| Success | Collapse to preview; no toast (silent save) |

**Layout (expanded):**

```
┌─────────────────────────────────────────┐
│ Private note (only visible to you)      │
│ ┌─────────────────────────────────────┐ │
│ │ Strong React skills. Follow up Q2.  │ │
│ └─────────────────────────────────────┘ │
│ 42/500                    [Cancel][Save]│
└─────────────────────────────────────────┘
```

Only rendered on the Watchlist tab panel — not on search-result cards.

---

## Component 3 — `WatchlistSummaryCard`

**File:** `artifacts/talentlock/src/components/watchlist/WatchlistSummaryCard.tsx`

**States:**

| State | Rendering |
|-------|-----------|
| Loading | Skeleton card (3 avatar circles + text bars) |
| Empty (count = 0) | `null` — card not rendered |
| Data | Card with title, count, up to 3 freelancer rows, CTA link |

**Layout:**

```
┌──────────────────────────────────────────────┐
│ ♥ Your Watchlist                        (12) │
│                                              │
│  [avatar] Jane Cooper · Available now        │
│  [avatar] Marcus Lee · £85/hr                │
│  [avatar] Priya Sharma · Expiring Soon       │
│                                              │
│              View watchlist →                │
└──────────────────────────────────────────────┘
```

Enterprise team members: title `Team Shortlist`, CTA links to `?view=team-shortlist`.

**Placement on Dashboard:** Below the KPI stat row, above Spend Analytics panel. Full width on mobile, half width on `lg` (left column if two-column layout).

---

## Page Integration — Talent Vault (`FreelancersList.tsx`)

### Tab bar (personal employers only)

DOM order below page title:

```
[Search results]   [Watchlist (N)]
```

Active tab: `bg-primary text-primary-foreground`.
Inactive: `bg-card text-muted-foreground hover:text-foreground`.

`N` = `saved.length`. Tab always visible (including when N = 0).

### Watchlist panel

When `vaultView === "watchlist"`:

1. Subheader: `{N} professional{N !== 1 ? "s" : ""} on your watchlist`
2. Grid of cards (`md:grid-cols-2 lg:grid-cols-3`)
3. Each card: standard `FreelancerCard` + `WatchlistNotesEditor` below footer
4. Optional badge: "No longer in Talent Vault" when `completenessScore < 60`

### Empty state (watchlist panel)

```
        ♥  (large muted heart icon)

   No one on your watchlist yet

   Save freelancers from search results to
   track them here and get notified when
   their availability or rate changes.

        [Browse search results]
```

Button sets `vaultView` to `"search"`.

### URL deep link

`/freelancers?view=watchlist` opens the Watchlist tab on mount.

### Removed UI

- Legacy `Shortlist ({N})` filter chip in search mode (`showSavedOnly` state removed)
- `showSavedOnly` filter count in Filters button

---

## Page Integration — Freelancer Detail (`FreelancerDetail.tsx`)

Heart button in header action row:

- Uses `WatchlistToggleButton` (or same styling)
- Toast on error only
- 402 → redirect `/pricing`

No notes editor on detail page in this phase.

---

## Page Integration — Dashboard (`Dashboard.tsx`)

```tsx
{isEmployer && <WatchlistSummaryCard />}
```

Between stat cards section and analytics panels.

---

## Copy Reference

| Key | String |
|-----|--------|
| Tab label | `Watchlist ({N})` |
| Team tab (enterprise) | `Team Shortlist ({N})` |
| Dashboard title (personal) | `Your Watchlist` |
| Dashboard title (enterprise) | `Team Shortlist` |
| Dashboard CTA | `View watchlist →` |
| Dashboard CTA (enterprise) | `View team shortlist →` |
| Empty title | `No one on your watchlist yet` |
| Empty body | `Save freelancers from search results to track them here and get notified when their availability or rate changes.` |
| Empty CTA | `Browse search results` |
| Notes label | `Private note (only visible to you)` |
| Notes add | `Add a private note` |
| Notes edit | `Edit note` |
| Vault hidden badge | `No longer in Talent Vault` |
| Save error toast | `Failed to update watchlist` |
| Notes error | `Could not save note. Try again.` |
| Notification label | `Watchlist update` |
| Availability alert | `{name} is now available for new engagements` |
| Rate alert | `{name} updated their rate` |
| Plan limit toast (optional) | `Watchlist limit reached — upgrade to save more` |

---

## Loading & Error Summary

| Surface | Loading | Error | Empty |
|---------|---------|-------|-------|
| Watchlist tab | 3 skeleton cards | Full-width retry card | Empty state component |
| Dashboard card | Skeleton | Hidden (fail silently) | Not rendered |
| Notes editor | Save button spinner | Inline error text | "Add a private note" CTA |
| Heart toggle | Opacity dim | Toast | N/A |

---

## Accessibility

- Tab bar: `role="tablist"`, each tab `role="tab"`, `aria-selected`
- Heart button: `aria-label` reflects save state (not icon-only without label)
- Notes textarea: `aria-label="Private watchlist note"`
- Character counter: `aria-live="polite"` when approaching 500 chars

---

## Component File Summary

| File | New/Modified | Task |
|------|--------------|------|
| `components/watchlist/WatchlistToggleButton.tsx` | New | 3.1 |
| `components/watchlist/WatchlistNotesEditor.tsx` | New | 3.1 |
| `components/watchlist/WatchlistSummaryCard.tsx` | New | 3.4 |
| `pages/FreelancersList.tsx` | Modified | 3.2 |
| `pages/FreelancerDetail.tsx` | Modified | 3.3 |
| `pages/Dashboard.tsx` | Modified | 3.4 |

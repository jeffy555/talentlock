# TalentLock — UI Specification: Product Gaps

## Overview

Six modules, six UI surfaces. Most modules are small additions to existing pages. The biggest UI work is the completeness banner (Module 3) and the pagination controls (Module 5). Module 6 (profile preview) is literally one link.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter routing.

---

## Component 1 — Email Notification Toggle (`/profile`)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

**Placement:** In the profile settings section (below avatar/name, above sections like bio and skills). Freelancers and employers both see this.

```
Notification Preferences
────────────────────────────────────────────────────────
☑ Email notifications                  (toggle switch)
  Receive email alerts for bookings, agreements,
  meetings, and other platform activity.
```

```tsx
<div className="flex items-start justify-between py-4 border-b border-slate-100">
  <div>
    <p className="text-sm font-medium text-slate-800">Email notifications</p>
    <p className="text-xs text-muted-foreground mt-0.5">
      Receive email alerts for bookings, agreements, meetings, and other platform activity.
    </p>
  </div>
  <Switch
    checked={emailNotificationsEnabled}
    onCheckedChange={handleToggle}
    disabled={isSaving}
  />
</div>
```

`shadcn/ui <Switch>` — saves via `PATCH /api/users/me/notification-preferences` on toggle change.

Toast on save: `"Notification preferences updated."`
On error: `"Failed to save preferences."` inline below the toggle.

---

## Component 2 — Keyword Search Input (`/freelancers`)

**File:** `artifacts/talentlock/src/pages/Freelancers.tsx`

**Placement:** Above the existing filter chips/panel. Full-width on mobile, full-width on desktop.

```
┌──────────────────────────────────────────────────────────┐
│  🔍  Search freelancers...                               │
└──────────────────────────────────────────────────────────┘
[Field ▾]  [Rate ▾]  [Available from]  [Clear filters]
```

```tsx
<div className="relative mb-4">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
  <input
    type="text"
    placeholder="Search freelancers..."
    value={searchQuery}
    onChange={e => setSearchQuery(e.target.value)}
    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm
               focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
  />
  {searchQuery && (
    <button onClick={() => setSearchQuery('')}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
      <X className="h-4 w-4" />
    </button>
  )}
</div>
```

**Debounce:** 400ms — no API call while typing. `useDebounce` from `use-debounce` package (install if not present: `pnpm add use-debounce`).

**Search results behaviour:**
- While debouncing: no visual change
- Loading (after debounce fires): existing skeleton pattern
- No results: `"No freelancers match your search."` empty state
- With results: existing freelancer card grid (unchanged)

**Active search indicator** — when a search query is active, show below the input:
```
Showing results for "postgresql"   [×]
```
`text-xs text-muted-foreground` — clicking `[×]` clears the query.

---

## Component 3 — Profile Completeness Banner (`/profile`)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

**Placement:** At the very top of the profile page content, below the page heading. Only visible to freelancers. Disappears once score ≥ 60.

### Score < 60 (gate not met)

```
┌────────────────────────────────────────────────────────────┐
│  bg-amber-50 border border-amber-200 rounded-lg p-4        │
│                                                            │
│  ⚠ Complete your profile to appear in Talent Vault         │
│                                                            │
│  Your profile is 45% complete. You need 60% to appear      │
│  in employer searches.                                     │
│                                                            │
│  Missing:                                                  │
│  • Add a bio (min 50 characters)            [→ Bio]         │
│  • Add at least 2 skills                   [→ Skills]      │
│                                                            │
│  ████████████░░░░░░░░  45%                                 │
└────────────────────────────────────────────────────────────┘
```

**Progress bar:**
```tsx
<div className="w-full bg-amber-100 rounded-full h-2 mt-3">
  <div
    className="bg-amber-500 rounded-full h-2 transition-all duration-500"
    style={{ width: `${score}%` }}
  />
</div>
<p className="text-xs text-amber-700 mt-1 text-right">{score}%</p>
```

**Missing items list:** each item links to the relevant section of the profile page via an anchor `href="#bio"`, `href="#skills"` etc.

Missing item format:
```tsx
<li className="flex items-center justify-between text-sm text-amber-800 py-1">
  <span className="flex items-center gap-1">
    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
    {missingLabel}
  </span>
  <a href={`#${anchor}`} className="text-xs text-amber-700 underline">
    → {sectionName}
  </a>
</li>
```

### Score 60–99 (gate met but not complete)

```
┌────────────────────────────────────────────────────────────┐
│  bg-blue-50 border border-blue-200 rounded-lg p-3          │
│                                                            │
│  ✓ Your profile is visible in Talent Vault (75%)          │
│  Complete the remaining fields to improve your ranking.    │
│  ████████████████░░░░  75%                                 │
└────────────────────────────────────────────────────────────┘
```

### Score 100 (fully complete)

Banner hidden entirely — no banner shown.

---

## Component 4 — Pagination Controls (List Pages)

**Files:** Booking list, Agreement list, Meeting list pages

All three list pages get the same pagination control component.

### `<PaginationControls />` — Shared Component

**File:** `artifacts/talentlock/src/components/PaginationControls.tsx` (create new)

```tsx
interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}
```

```
                    [← Prev]  Page 2 of 5  [Next →]
```

```tsx
<div className="flex items-center justify-end gap-3 mt-4 text-sm">
  <Button
    variant="outline"
    size="sm"
    onClick={() => onPageChange(page - 1)}
    disabled={page <= 1}
  >
    ← Prev
  </Button>
  <span className="text-muted-foreground">
    Page {page} of {totalPages}
  </span>
  <Button
    variant="outline"
    size="sm"
    onClick={() => onPageChange(page + 1)}
    disabled={page >= totalPages}
  >
    Next →
  </Button>
</div>
```

**State management:** Each list page holds `const [page, setPage] = useState(1)` and passes it to the query hook:

```tsx
const { data } = useGetBookings({ page, pageSize: 20 });
const bookings = data?.data ?? [];
const totalPages = data?.totalPages ?? 1;
```

When navigating pages, scroll to the top of the list:
```tsx
const onPageChange = (newPage: number) => {
  setPage(newPage);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
```

---

## Component 5 — Booking Message Textarea (`/freelancers/:id`)

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

**Placement:** In the booking creation form, below the rate field and above the Submit button.

```
Rate ($/hr)
┌────────────────────┐
│  85                │
└────────────────────┘

Message to [freelancer name] (optional)
┌────────────────────────────────────────────────────────┐
│  e.g. "Hi Sarah, I'm building a SaaS product and       │
│  need help with the React dashboard..."                 │
│                                                0/500   │
└────────────────────────────────────────────────────────┘

[Request Booking]
```

```tsx
<div className="space-y-1">
  <label className="text-sm font-medium text-slate-700">
    Message to {freelancer.firstName} <span className="text-muted-foreground font-normal">(optional)</span>
  </label>
  <Textarea
    placeholder={`e.g. "Hi ${freelancer.firstName}, I'm building..."`}
    value={message}
    onChange={e => setMessage(e.target.value)}
    maxLength={500}
    rows={3}
    className="resize-none"
  />
  <p className="text-xs text-muted-foreground text-right">{message.length}/500</p>
</div>
```

Character counter turns red when approaching limit: `message.length >= 450 ? 'text-red-500' : 'text-muted-foreground'`

**On `/bookings/:id`** — message displayed for both employer and freelancer:

```
Message from employer:
─────────────────────────────────────────────────────────
"Hi Sarah, I'm building a SaaS product and need help
with the React dashboard. The timeline is 2 months,
fully remote."
```

```tsx
{booking.message && (
  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 mt-3">
    <p className="text-xs font-medium text-slate-500 mb-1">Message from employer:</p>
    <p className="text-sm text-slate-700 italic">"{booking.message}"</p>
  </div>
)}
```

---

## Component 6 — Profile Preview Link (`/profile`)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

**Placement:** In the profile page header, next to the page title or Save button. Freelancer-only.

```
My Profile                          [Preview public profile ↗]
```

```tsx
{userRole === 'freelancer' && myProfile?.id && (
  <a
    href={`/f/${myProfile.id}`}
    target="_blank"
    rel="noopener noreferrer"
    className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline
               flex items-center gap-1 transition-colors"
  >
    Preview public profile
    <ExternalLink className="h-3.5 w-3.5" />
  </a>
)}
```

Zero backend changes. Zero API calls. One element.

---

## Page Integration Summary

| Page | Module | What Changes |
|---|---|---|
| `/profile` | 1, 3, 6 | Email toggle (top) + completeness banner (top) + preview link (header) |
| `/freelancers` | 2 | Search input above filter panel |
| `/freelancers/:id` | 4 | Message textarea in booking form |
| `/bookings` (list) | 5 | Pagination controls at bottom |
| `/bookings/:id` | 4 | Message display block |
| `/agreements` (list) | 5 | Pagination controls at bottom |
| `/meetings` (list) | 5 | Pagination controls at bottom |

---

## Copy Reference

| Location | String |
|---|---|
| Email toggle label | `Email notifications` |
| Email toggle description | `Receive email alerts for bookings, agreements, meetings, and other platform activity.` |
| Email toggle toast | `Notification preferences updated.` |
| Search placeholder | `Search freelancers...` |
| Search active label | `Showing results for "{q}"` |
| Search no results | `No freelancers match your search.` |
| Completeness banner heading (< 60%) | `⚠ Complete your profile to appear in Talent Vault` |
| Completeness banner body | `Your profile is {N}% complete. You need 60% to appear in employer searches.` |
| Completeness banner heading (60–99%) | `✓ Your profile is visible in Talent Vault ({N}%)` |
| Completeness banner subtitle | `Complete the remaining fields to improve your ranking.` |
| Missing — photo | `Add a profile photo` |
| Missing — bio | `Add a bio (min 50 characters)` |
| Missing — skills | `Add at least 2 skills` |
| Missing — rate | `Set your hourly rate` |
| Missing — field of work | `Set your field of work` |
| Missing — availability | `Set your availability` |
| Pagination prev | `← Prev` |
| Pagination next | `Next →` |
| Pagination indicator | `Page {N} of {M}` |
| Booking message label | `Message to {name} (optional)` |
| Booking message placeholder | `e.g. "Hi {name}, I'm building..."` |
| Booking message counter | `{N}/500` |
| Booking message display label | `Message from employer:` |
| Preview link text | `Preview public profile` |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| Email toggle | Disabled while saving | Inline error below toggle |
| Search input | Existing skeleton on results | Empty state: "No freelancers match your search." |
| Completeness banner | Hidden (no skeleton) | Fail silently — banner absent |
| Pagination controls | Disabled while loading | N/A — previous page still shown |
| Booking message | N/A (textarea) | Character limit enforced client-side |
| Preview link | N/A (static link) | N/A |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/PaginationControls.tsx` | **New** | 5.3 |
| `src/pages/Profile.tsx` | Modified | 6.1, 6.3, 6.4 |
| `src/pages/Freelancers.tsx` | Modified | 6.2 |
| `src/pages/FreelancerDetail.tsx` | Modified | 6.5 |
| `src/pages/BookingList.tsx` (or equivalent) | Modified | 5.3 |
| `src/pages/AgreementList.tsx` (or equivalent) | Modified | 5.3 |
| `src/pages/MeetingList.tsx` (or equivalent) | Modified | 5.3 |
| `src/pages/BookingDetail.tsx` (or equivalent) | Modified | 6.5 (message display) |

# TalentLock — UI Specification: Security Hardening

## Overview

This feature has minimal frontend work. Four of the six hardening items are pure backend changes with no UI. The two items that require frontend changes are:

1. **Admin CSRF token integration** — the admin login form must fetch and include a CSRF token (Task 5.3)
2. **GDPR account deletion flow** — a "Delete Account" section added to `/profile` (Task 5.4)

No new pages. No new routes. No new React Query hooks (the deletion endpoint is called via plain `fetch` inside an async handler — no codegen needed since it's a one-time action with no caching requirement).

---

## Component 1 — Admin Login CSRF Integration

**File:** `artifacts/talentlock/src/pages/AdminLogin.tsx` (or equivalent admin login file)

This is a modification only — no new component.

### Change

On mount, fetch the CSRF token and store it in state. Include it as a request header on form submission.

```tsx
const [csrfToken, setCsrfToken] = useState<string>('');

useEffect(() => {
  fetch('/api/admin/csrf-token', { credentials: 'include' })
    .then(r => r.json())
    .then(data => setCsrfToken(data.token))
    .catch(() => {
      // CSRF token fetch failed — disable form submit
      setCsrfToken('');
    });
}, []);

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,      // ← this is the only change to the submit handler
    },
    body: JSON.stringify({ username, password }),
  });
  // ... existing handling
};
```

The form submit button is disabled when `csrfToken` is empty:
```tsx
<button type="submit" disabled={!csrfToken || isLoading}>
  Sign in
</button>
```

No visible UI change for users — the CSRF flow is invisible.

---

## Component 2 — Account Deletion Section (`/profile`)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

### Placement

Added at the very bottom of the `/profile` page, below all other sections (portfolio, reviews, availability). Separated by a visible danger zone divider.

```
[Profile Info]
[Verification]
[Availability]
[Portfolio]
[Reviews Received]
──────────────────────────────────────────────────────
Danger Zone                                          ← NEW
[Delete Account Section]                             ← NEW
```

---

### State 1 — Default (button visible)

```
┌────────────────────────────────────────────────────────┐
│  Danger Zone                                           │
│  ─────────────────────────────────────────────────    │
│  Delete Account                                        │
│                                                        │
│  Permanently delete your TalentLock account and all   │
│  associated personal data. This action cannot be      │
│  undone.                                               │
│                                                        │
│                              [Delete my account]      │
└────────────────────────────────────────────────────────┘
```

Section heading: `text-sm font-semibold text-red-600 uppercase tracking-wide mb-3`
Body text: `text-sm text-slate-600`
Delete button: `<Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400">`

---

### State 2 — Confirmation Dialog (after button click)

`shadcn/ui <AlertDialog>` — NOT a sheet or drawer. Modal dialog.

```
┌────────────────────────────────────────────────────────┐
│  Delete your account?                                  │
│                                                        │
│  This will permanently:                                │
│  • Anonymise your name, email, and profile data        │
│  • Remove your documents, notifications, and           │
│    availability blocks                                 │
│  • Cancel your TalentLock account                      │
│                                                        │
│  Your completed bookings and reviews are retained      │
│  for the other party's records, but your name          │
│  will appear as "Deleted User".                        │
│                                                        │
│  To confirm, type your email address:                  │
│  ┌────────────────────────────────────────────────┐   │
│  │ your@email.com                                 │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  [Cancel]                     [Delete my account]      │
└────────────────────────────────────────────────────────┘
```

**Email confirmation input:**
- Placeholder: user's actual email address
- "Delete my account" button `disabled` until `inputEmail === user.email`
- `className="text-sm"` input, `border-red-300 focus:ring-red-500`

**"Delete my account" button in dialog:** `<AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white">` — only enabled when email matches.

---

### State 3 — Loading (API call in flight)

Button shows spinner and `"Deleting..."` text. Both buttons disabled. Dialog cannot be closed.

```tsx
<AlertDialogAction disabled={isDeleting}>
  {isDeleting ? (
    <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Deleting...</>
  ) : (
    'Delete my account'
  )}
</AlertDialogAction>
```

---

### State 4 — Active Bookings Error (API returns 409)

Dialog stays open. Error shown below the email input:

```
┌─────────────────────────────────────────────────────┐
│  bg-amber-50 border border-amber-200 rounded p-3    │
│  ⚠ You have 2 active bookings.                      │
│  Please cancel or complete all active bookings      │
│  before deleting your account.                      │
│                                                     │
│  [View bookings →]                                  │
└─────────────────────────────────────────────────────┘
```

"View bookings →" is a `<Link to="/bookings">` that closes the dialog and navigates.

---

### State 5 — Success

Dialog closes. User is redirected to `/` (landing page) since their session is now invalid.

Toast shown briefly before redirect:
```
Your account has been deleted.
```

Use `setTimeout(() => navigate('/'), 2000)` after the toast appears.

No profile page to stay on — the session is terminated.

---

### State 6 — Existing Deletion Request Pending

If the user already has a pending deletion request (detected on page load via `GET /api/account/delete-request`), replace the delete button with a status notice:

```
┌────────────────────────────────────────────────────────┐
│  Danger Zone                                           │
│  ─────────────────────────────────────────────────    │
│  Account Deletion Pending                              │
│                                                        │
│  Your account deletion request is being processed.    │
│  You will be logged out automatically when complete.  │
└────────────────────────────────────────────────────────┘
```

`text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3`

---

## Copy Reference

| Location | String |
|---|---|
| Danger zone heading | `Danger Zone` |
| Delete section heading | `Delete Account` |
| Delete body text | `Permanently delete your TalentLock account and all associated personal data. This action cannot be undone.` |
| Delete trigger button | `Delete my account` |
| Dialog heading | `Delete your account?` |
| Dialog bullet 1 | `Anonymise your name, email, and profile data` |
| Dialog bullet 2 | `Remove your documents, notifications, and availability blocks` |
| Dialog bullet 3 | `Cancel your TalentLock account` |
| Dialog retention note | `Your completed bookings and reviews are retained for the other party's records, but your name will appear as "Deleted User".` |
| Email confirmation label | `To confirm, type your email address:` |
| Email placeholder | `{user.email}` |
| Cancel button | `Cancel` |
| Confirm button | `Delete my account` |
| Loading button | `Deleting...` |
| Active bookings error heading | `⚠ You have {N} active booking{s}.` |
| Active bookings error body | `Please cancel or complete all active bookings before deleting your account.` |
| Active bookings link | `View bookings →` |
| Success toast | `Your account has been deleted.` |
| Pending notice heading | `Account Deletion Pending` |
| Pending notice body | `Your account deletion request is being processed. You will be logged out automatically when complete.` |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| Admin login CSRF | Button disabled until token fetched | Button remains disabled if token fetch fails |
| Delete trigger button | N/A (opens dialog) | N/A |
| Delete dialog — submit | Spinner + "Deleting..." + buttons disabled | Active bookings → inline amber banner |
| Delete dialog — success | Redirect after toast | Clerk API failure → generic error toast |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| Admin login page (confirmed path) | Modified | 5.3 |
| `src/pages/Profile.tsx` | Modified | 5.4 |

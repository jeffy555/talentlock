# TalentLock — UI Specification: Document Verification Feature

## Overview

This document specifies the complete UI for the Document Verification feature. Every new component, every page integration, every state variant, all copy strings, and all interactions are defined here. It is the single source of truth for Phase 3 frontend implementation.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter routing.
**Dual-role feature:** Freelancers upload and manage documents. Employers view verification status only — they never see documents or rejection details.

---

## Design Tokens

| Semantic | Tailwind Classes | Used for |
|---|---|---|
| Verified | `bg-emerald-100 text-emerald-700 border-emerald-300` | Verified status, green badge |
| Pending | `bg-slate-100 text-slate-500 border-slate-300` | Awaiting AI review |
| Needs Review | `bg-amber-100 text-amber-700 border-amber-300` | Flagged for admin |
| Rejected | `bg-red-100 text-red-700 border-red-300` | Rejected by AI or admin |
| Unverified | `text-slate-400` | No documents submitted |
| Badge SM | `text-xs px-1.5 py-0.5 rounded-full font-medium` | Talent Vault card |
| Badge MD | `text-sm px-2.5 py-1 rounded-full font-medium` | Profile + detail pages |

Status icons (lucide-react):
- Verified: `<ShieldCheck className="h-4 w-4 text-emerald-600" />`
- Pending: `<Clock className="h-4 w-4 text-slate-400" />`
- Needs Review: `<AlertTriangle className="h-4 w-4 text-amber-600" />`
- Rejected: `<ShieldX className="h-4 w-4 text-red-600" />`
- Not Submitted: `<Shield className="h-4 w-4 text-slate-300" />`

---

## Component 1 — Freelancer Verification Section (`/profile`)

**File:** `artifacts/talentlock/src/pages/Profile.tsx` (modification)

### Placement

Inserted as a new card section below the existing profile fields and above the portfolio section. Freelancer role only — hidden for employers.

### Overall Section Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Identity Verification                                       │
│  Submit documents to earn a Verified badge on your profile. │
│                                                             │
│  Overall status:  [Partially Verified ◑]                    │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  [Document Row — Government ID]                             │
│  [Document Row — Professional Credential]                   │
│  [Document Row — Portfolio Proof]                           │
└─────────────────────────────────────────────────────────────┘
```

Overall status badge:
- `unverified` → `[Not Verified ○]` gray, `text-slate-500 bg-slate-100`
- `partially_verified` → `[Partially Verified ◑]` amber, `text-amber-700 bg-amber-100`
- `fully_verified` → `[Fully Verified ✓]` green, `text-emerald-700 bg-emerald-100`

---

### Document Row — 5 States per Document Type

Each document type (`government_id`, `professional_credential`, `portfolio_proof`) renders as a row with a consistent layout:

```
[Icon]  [Document Type Label]      [Status Badge]     [Action Button]
        [Status detail line]
```

**State 1 — Not Submitted**
```
[Shield○]  Government ID           [Not submitted]    [Upload ↑]
           Passport, driving licence, or national ID
```
- Status badge: `text-slate-400 bg-slate-100 border border-slate-200`
- Upload button: `<Button variant="outline" size="sm">`
- Icon: `<Shield className="h-5 w-5 text-slate-300" />`

**State 2 — Pending (uploading / AI reviewing)**
```
[Clock]  Government ID             [Reviewing...]     [—]
         AI review in progress — usually takes under a minute
```
- Status badge: `text-slate-500 bg-slate-100` with animated pulse dot
- Action button: disabled, hidden
- Frontend polls `GET /api/documents/me` every 3 seconds while any doc is `pending`
- Animated pulse indicator: `<span className="animate-pulse h-2 w-2 rounded-full bg-slate-400" />`

**State 3 — Verified**
```
[ShieldCheck✓]  Government ID     [✓ Verified]        [Re-upload ↑]
                Verified on June 4, 2025
```
- Status badge: `text-emerald-700 bg-emerald-100 border border-emerald-200`
- Icon: `<ShieldCheck className="h-5 w-5 text-emerald-600" />`
- Re-upload button: `<Button variant="ghost" size="sm">` — less prominent than initial upload
- Date formatted: `"Verified on {MMMM D, YYYY}"`

**State 4 — Rejected**
```
[ShieldX✗]  Government ID         [✗ Rejected]        [Re-upload ↑]
            Image was too dark to verify. Please upload a clearer photo.
```
- Status badge: `text-red-700 bg-red-100 border border-red-200`
- Icon: `<ShieldX className="h-5 w-5 text-red-600" />`
- `aiNotes` or `adminNotes` shown as the detail line — helps freelancer fix the issue
- Re-upload button prominent: `<Button variant="outline" size="sm">`

**State 5 — Needs Review (flagged for admin)**
```
[AlertTriangle]  Government ID    [Under Review ⏳]   [—]
                 Sent for manual review — usually resolved within 24 hours
```
- Status badge: `text-amber-700 bg-amber-100 border border-amber-200`
- Action button: hidden
- Freelancer cannot re-upload while status is `needs_review` — must wait for admin

---

## Component 2 — `<DocumentUploader />`

**File:** `artifacts/talentlock/src/components/DocumentUploader.tsx`

### Props

```ts
interface DocumentUploaderProps {
  documentType: 'government_id' | 'professional_credential' | 'portfolio_proof';
  onSuccess: () => void;  // callback to refresh document list
}
```

### Upload Flow States

**Step 1 — File Selection**

Clicking the Upload button opens a hidden `<input type="file" accept="image/jpeg,image/png,image/webp">`.

Client-side validation fires immediately on file selection:

- File size > 10MB → inline error: `"File must be 10MB or smaller."`
- MIME type not in allowed list → inline error: `"Only JPEG, PNG, and WebP images are accepted. PDF support coming soon."`
- On validation pass → proceed to Step 2

**Step 2 — Requesting Presigned URL (loading)**
```
[Spinner]  Preparing upload...
```
Calls `usePostDocumentsUploadUrl()`. On API error → inline error with retry button.

**Step 3 — Uploading to GCS (progress)**
```
[Progress bar]  Uploading...  47%
```
PUT request to the presigned URL with `XMLHttpRequest` for progress tracking. Progress bar: shadcn/ui `<Progress value={percent} />` with `[&>div]:bg-blue-500`.

**Step 4 — Confirming Upload (loading)**
```
[Spinner]  Saving...
```
Calls `usePostDocumentsConfirm()`. On error → inline error.

**Step 5 — Success**
```
[CheckCircle]  Uploaded! AI review in progress...
```
Green check icon. Calls `onSuccess()` callback which triggers a `GET /api/documents/me` refetch. The document row switches to the Pending state automatically.

**Error State (any step)**
```
[AlertCircle]  Upload failed. [Try again]
```
`text-red-600`. "Try again" resets to Step 1.

---

## Component 3 — `<VerificationBadge />`

**File:** `artifacts/talentlock/src/components/VerificationBadge.tsx`

### Props

```ts
interface VerificationBadgeProps {
  level: 'unverified' | 'partially_verified' | 'fully_verified';
  size?: 'sm' | 'md';       // default: 'md'
  showTooltip?: boolean;    // default: false
}
```

### Rendering per Level

**`fully_verified` — md size:**
```
[✓ ShieldCheck]  Fully Verified
```
`className="inline-flex items-center gap-1 text-sm px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700 border border-emerald-200"`

**`fully_verified` — sm size (Talent Vault card):**
```
[✓]  Verified
```
`className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700"`

**`partially_verified` — md size:**
```
[◑ Shield]  Partially Verified
```
`className="... bg-amber-100 text-amber-700 border border-amber-200"`

**`partially_verified` — sm size:**
```
[◑]  Verified*
```
`className="... bg-amber-100 text-amber-700"` — asterisk signals partial

**`unverified`:**
Do NOT render the badge at all. Return `null`. Unverified freelancers have no badge — absence is the signal.

### Tooltip (when `showTooltip={true}`)

Wrap with shadcn/ui `<Tooltip>`. Tooltip content:

- `fully_verified`: `"Identity and credentials verified by AI review"`
- `partially_verified`: `"1 document verified — additional documents can be submitted"`
- Always append: `"\nDocument reviewed by AI — not a legal identity verification."`

Tooltip max-width: `max-w-[220px]` with text wrapping.

### Accessibility

`aria-label` on the badge element:
- `fully_verified`: `"Verified freelancer"`
- `partially_verified`: `"Partially verified freelancer"`

---

## Page Integration 1 — `/profile` (Freelancer)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

### DOM Order

```jsx
<ProfileHeader />
<ProfileFields />        {/* existing */}
<SignatureSection />     {/* existing */}
<VerificationSection />  {/* ← NEW — freelancer only */}
<PortfolioSection />     {/* existing */}
```

### Section Header

```
Identity Verification
─────────────────────────────────────────────────────────
Submit documents to earn a Verified badge on your profile
and build trust with employers.
```

Heading: `<h2 className="text-lg font-semibold">`. Subtitle: `text-sm text-muted-foreground`.

### Data Source

`useGetDocumentsMe()` — polls every 3 seconds when any document has `status === 'pending'`:
```ts
const { data } = useGetDocumentsMe({
  refetchInterval: hasPending ? 3000 : false,
});
const hasPending = data?.documents.some(d => d.status === 'pending');
```

### Loading State

Three skeleton rows (one per document type). Each row: `<Skeleton className="h-16 w-full rounded-md" />`.

### Error State

```
Could not load verification status.  [Retry]
```
`text-sm text-muted-foreground` centered within the section.

---

## Page Integration 2 — `/freelancers/:id` (Employer View)

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

### DOM Order

```jsx
<FreelancerHero />         {/* name, role, rate, Lock badge */}
<VerificationDisplay />    {/* ← NEW — employer view only */}
<FreelancerBio />
<SkillsSection />
<PortfolioSection />
<ReviewsSection />
```

### Employer Verification Display

```
┌──────────────────────────────────────────────────────────┐
│  [✓ Fully Verified]                                      │
│  2 documents verified                                    │
│                                                          │
│  ℹ Document reviewed by AI — not a legal identity        │
│    verification.                                         │
└──────────────────────────────────────────────────────────┘
```

- `<VerificationBadge level={verification.level} size="md" showTooltip={true} />`
- Count line: `text-sm text-muted-foreground` — only shown when `level !== 'unverified'`
- Disclaimer: `text-xs text-muted-foreground flex items-start gap-1` with `<Info className="h-3 w-3 mt-0.5" />`
- When `level === 'unverified'`: render nothing — no section, no placeholder

### Loading State

`<Skeleton className="h-10 w-40 rounded-full" />` — badge placeholder width.

---

## Page Integration 3 — `/freelancers` (Talent Vault)

**File:** `artifacts/talentlock/src/pages/Freelancers.tsx`

### Verified Filter Toggle

Added to the existing filter panel alongside the existing field/rate/availability filters:

```
Filters
────────────────────────────────
Field of Work    [All ▾]
Rate             [$0 — $500]
Availability     [Available ▾]
                 ─────────────
☑ Verified only              ← new toggle
```

The toggle is a shadcn/ui `<Switch>` with label `"Verified only"`. When on, adds `?verified=true` to the query. Label includes `<VerificationBadge level="fully_verified" size="sm" />` inline after the text.

### Freelancer Card Badge

On each `<FreelancerCard />`, the `<VerificationBadge size="sm" />` appears alongside the existing Lock badge (if booked):

```
[card]
  Sarah Chen                    [🔒 Booked]  [✓ Verified]
  Senior React Developer
  $85/hr  ·  Available
```

Badge position: top-right of card, beside the Lock badge. Only rendered when `level !== 'unverified'`.

---

## Page Integration 4 — `/f/:id` (Public Profile)

**File:** `artifacts/talentlock/src/pages/PublicProfile.tsx`

### Badge Placement

```
[Avatar]  Sarah Chen
          Senior React Developer
          [✓ Fully Verified]     ← new, below name/role
          $85/hr  ·  Available from June 10
```

`<VerificationBadge level={...} size="md" showTooltip={true} />` placed below the freelancer's title, above the rate/availability line.

When `level === 'unverified'`: nothing rendered.

---

## Admin Section — Document Review Tab

**File:** Admin dashboard frontend (`/admin` route tree)

### Tab Bar Addition

Tab label: `Document Review` with pending count badge:
```
Document Review  [3]
```
Badge: `<span className="ml-1 rounded-full bg-amber-500 text-white text-xs px-1.5 py-0.5">3</span>`
Tab icon: `<ShieldCheck className="h-4 w-4" />`
Position: after the existing Token Usage tab.

Count is the total `needs_review` documents from `GET /api/admin/documents`.

### Review Queue Table

```
┌────────────────────────────────────────────────────────────────────────┐
│  Document Review Queue  ·  3 pending                    [← Prev][Next→]│
│                                                                        │
│  Freelancer        Doc Type           Submitted     Confidence  Action │
│  ───────────────────────────────────────────────────────────────────── │
│  Sarah Chen        Government ID      2h ago        42%         [Review]│
│  João Alves        Professional Cert  5h ago        58%         [Review]│
│  Priya Sharma      Portfolio Proof    1d ago        —           [Review]│
└────────────────────────────────────────────────────────────────────────┘
```

Columns:
- **Freelancer**: name + email in small text below
- **Doc Type**: human-readable label (`Government ID` / `Professional Credential` / `Portfolio Proof`)
- **Submitted**: relative time (`2h ago`) — full timestamp on hover tooltip
- **Confidence**: AI confidence score with colour coding: ≥ 70 green, 40–69 amber, < 40 red, `—` if null
- **Action**: `[Review]` button opens the review panel

### Review Panel (opens on [Review] click)

Opens as a shadcn/ui `<Sheet side="right">` with `w-[520px]`:

```
┌─────────────────────────────────────────────────┐
│  Review Document                             [×] │
│                                                  │
│  Sarah Chen  ·  Government ID                    │
│  Submitted June 4, 2025 at 10:24 AM              │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  [View Document Image]                      │ │
│  │  [Loads signed URL — expires in 15min]      │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  AI Assessment                                   │
│  Confidence: 42%                                 │
│  "Image appears genuine but lighting is poor,    │
│   making some details hard to verify."           │
│                                                  │
│  Admin Decision                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  Note to freelancer (optional)           │   │
│  │  ┌────────────────────────────────────┐  │   │
│  │  │                                    │  │   │
│  │  └────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│        [✗ Reject]          [✓ Verify]            │
└─────────────────────────────────────────────────┘
```

- Document image loads via same-origin `GET /api/storage/objects/${fileUrl}` with admin session (see `plan.md` Q10) — **not** via external signed URL in `<img src>`
- Fallback: if same-origin load fails, show error state with "Open in new tab" link
- Image displayed in a constrained box: `max-h-[300px] object-contain rounded-md border`
- AI Notes displayed verbatim in a `bg-slate-50 rounded p-3 text-sm` block
- Admin note textarea: optional, max 300 chars, character counter
- `[✗ Reject]` → `<Button variant="destructive">`, `[✓ Verify]` → `<Button variant="default" className="bg-emerald-600 hover:bg-emerald-700">`
- Both buttons disabled while submitting; show spinner on active button
- On success: sheet closes, table row removed, success toast: `"Document marked as verified."` or `"Document rejected — freelancer notified."`

### Empty State

```
No documents pending review.
All submitted documents have been processed.
```

`text-muted-foreground` centered in the tab content area. `<ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto mb-2" />`

---

## Copy Reference

| Location | String |
|---|---|
| Profile section heading | `Identity Verification` |
| Profile section subtitle | `Submit documents to earn a Verified badge on your profile and build trust with employers.` |
| Overall status — unverified | `Not Verified` |
| Overall status — partial | `Partially Verified` |
| Overall status — full | `Fully Verified` |
| Doc type — government_id | `Government ID` |
| Doc type — professional_credential | `Professional Credential` |
| Doc type — portfolio_proof | `Portfolio Proof` |
| Doc hint — government_id | `Passport, driving licence, or national ID` |
| Doc hint — professional_credential | `Degree certificate, professional licence, or certification` |
| Doc hint — portfolio_proof | `Proof of past work or professional project` |
| Status — not submitted | `Not submitted` |
| Status — pending | `Reviewing...` |
| Status — pending detail | `AI review in progress — usually takes under a minute` |
| Status — verified date | `Verified on {MMMM D, YYYY}` |
| Status — rejected | `Rejected` |
| Status — needs review | `Under Review` |
| Status — needs review detail | `Sent for manual review — usually resolved within 24 hours` |
| Upload button | `Upload ↑` |
| Re-upload button | `Re-upload ↑` |
| Uploader — preparing | `Preparing upload...` |
| Uploader — uploading | `Uploading... {N}%` |
| Uploader — saving | `Saving...` |
| Uploader — success | `Uploaded! AI review in progress...` |
| Uploader — error | `Upload failed.` |
| Uploader — retry | `Try again` |
| File too large error | `File must be 10MB or smaller.` |
| Wrong file type error | `Only JPEG, PNG, and WebP images are accepted. PDF support coming soon.` |
| Employer view — count | `{N} document{s} verified` |
| AI disclaimer | `Document reviewed by AI — not a legal identity verification.` |
| Talent Vault filter label | `Verified only` |
| Badge — fully verified | `Fully Verified` |
| Badge — partially verified | `Partially Verified` |
| Badge — sm fully verified | `Verified` |
| Badge — sm partially verified | `Verified*` |
| Admin tab label | `Document Review` |
| Admin queue heading | `Document Review Queue · {N} pending` |
| Admin empty state | `No documents pending review.` |
| Admin empty subtitle | `All submitted documents have been processed.` |
| Admin verify button | `✓ Verify` |
| Admin reject button | `✗ Reject` |
| Admin verify toast | `Document marked as verified.` |
| Admin reject toast | `Document rejected — freelancer notified.` |
| Tooltip — fully verified | `Identity and credentials verified by AI review` |
| Tooltip — partially verified | `1 document verified — additional documents can be submitted` |
| Tooltip — disclaimer suffix | `Document reviewed by AI — not a legal identity verification.` |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| Verification Section (Profile) | 3 skeleton rows | `"Could not load verification status."` + retry |
| DocumentUploader | Step-specific spinners + progress bar | Inline error per step + Try again |
| VerificationBadge | `<Skeleton className="h-7 w-32 rounded-full" />` | Render nothing (fail silent) |
| Employer Verification Display | Badge skeleton | Render nothing (fail silent) |
| Admin Review Queue | Skeleton table rows | Alert at tab top + retry |
| Admin Review Sheet — image | Spinner while loading preview | `"Could not load document image."` + `Open in new tab` link |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/DocumentUploader.tsx` | **New** | 3.3 |
| `src/components/VerificationBadge.tsx` | **New** | 3.4 |
| `src/pages/Profile.tsx` | Modified | 3.2 |
| `src/pages/FreelancerDetail.tsx` | Modified | 3.5 |
| `src/components/FreelancerCard.tsx` | Modified | 3.6 |
| `src/pages/Freelancers.tsx` | Modified | 3.7 |
| `src/pages/PublicProfile.tsx` | Modified | 3.8 |
| Admin dashboard (document review tab) | Modified | 4.1 |

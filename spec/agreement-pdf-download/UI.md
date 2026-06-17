# TalentLock — UI Specification: Agreement PDF Download

## Overview

Two frontend touchpoints: a download button on `/agreements/:id` and a download icon on the `/agreements` list. No new pages. No new routes. The download triggers a browser file save, not a navigation.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Download button border | `border-emerald-300` | Fully-signed signal colour |
| Download button text | `text-emerald-700` | Consistent with signed/success states |
| Download button hover | `hover:bg-emerald-50` | Subtle fill on hover |
| Loading spinner | `text-emerald-600 animate-spin` | During PDF generation |
| List icon default | `text-slate-400` | Muted until hovered |
| List icon hover | `hover:text-emerald-600` | Consistent with button |

---

## Component — Download Button on `/agreements/:id`

**File:** `artifacts/talentlock/src/pages/AgreementDetail.tsx`

### State 1 — Ready to Download

```
┌──────────────────────────────────────────────────────────────────┐
│  ACME CORP × SARAH CHEN                                          │
│  React Dashboard Project Agreement              [Fully Signed ✓] │
│                                                                  │
│  [↓ Download Signed Agreement]                                   │
└──────────────────────────────────────────────────────────────────┘
```

```tsx
<Button
  onClick={handleDownload}
  variant="outline"
  size="sm"
  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1.5"
>
  <Download className="h-4 w-4" />
  Download Signed Agreement
</Button>
```

---

### State 2 — Generating (First Download, Loading)

```
[⟳ Generating PDF...]
```

```tsx
<Button disabled variant="outline" size="sm"
  className="border-emerald-300 text-emerald-600 gap-1.5">
  <Loader2 className="h-4 w-4 animate-spin" />
  Generating PDF...
</Button>
```

Button is disabled. Cursor shows the default cursor (not pointer) — the `disabled` prop handles this.

---

### State 3 — Downloading (Cached PDF, Near-Instant)

Same loading state as State 2 — shows for ~200ms even on cache hit. This prevents the UI from flickering with no feedback for instant downloads.

---

### State 4 — Download Error

If the fetch returns a non-OK status:

```tsx
toast.error('Download failed. Please try again.');
```

Standard shadcn/ui toast, error variant. The button returns to its ready state.

---

### State 5 — Not Fully Signed (Button Hidden)

No button shown. Not hidden with CSS opacity — not rendered at all. The signing section remains the primary CTA.

---

## Page Integration — `/agreements/:id`

### DOM Placement

```
[Agreement header — title, status badge, parties]        ← existing
────────────────────────────────────────────────────────
[↓ Download Signed Agreement button]                     ← NEW (fully_signed only)
────────────────────────────────────────────────────────
[Agreement content text]                                 ← existing
[Redline suggestions panel]    (employer, Growth+)       ← existing
[Health Score Card]            (both parties)            ← existing
[Agreement Summary Panel]      (freelancer only)         ← existing
────────────────────────────────────────────────────────
[Signing section]              (hidden when fully_signed) ← existing
[Download section]                                       ← THIS IS IT
```

The download button sits between the agreement header and the content — the first thing both parties see on a fully signed agreement is a clear path to download it.

```tsx
{/* Download — fully signed only, both parties */}
{agreement.status === 'fully_signed' && (
  <div className="flex items-center gap-3 py-3 border-y border-slate-100">
    <Button
      onClick={handleDownload}
      disabled={isDownloading}
      variant="outline"
      size="sm"
      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1.5"
    >
      {isDownloading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating PDF...
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          Download Signed Agreement
        </>
      )}
    </Button>
    <span className="text-xs text-muted-foreground">
      Signed PDF · TalentLock certified document
    </span>
  </div>
)}
```

---

## Component — Download Icon on `/agreements` List

**File:** `artifacts/talentlock/src/pages/Agreements.tsx`

For each `fully_signed` agreement in the paginated list, a small download icon appears to the right of the status badge:

```
  React Dashboard Agreement   [Fully Signed ✓]  [✦ Summarised]  [↓]
  UX Design Contract          [Draft]
  Marketing Copy Project      [Partially Signed]
```

```tsx
{agreement.status === 'fully_signed' && (
  <button
    onClick={(e) => {
      e.stopPropagation(); // Don't navigate to detail page
      handleListDownload(agreement.id);
    }}
    title="Download signed PDF"
    className="p-1 rounded text-slate-400 hover:text-emerald-600
               hover:bg-emerald-50 transition-colors shrink-0"
  >
    {downloadingId === agreement.id ? (
      <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
    ) : (
      <Download className="h-4 w-4" />
    )}
  </button>
)}
```

State is managed with `downloadingId: string | null` — only one download runs at a time. Clicking a different agreement's icon while one is downloading is allowed (sets `downloadingId` to the new id).

---

## Shared Download Utility

**File:** `artifacts/talentlock/src/lib/downloadUtils.ts` (create new)

Extracted so both the detail page and list page use the same logic:

```ts
export async function downloadAgreementPdf(
  agreementId: string,
  getToken: () => Promise<string | null>
): Promise<void> {
  const token = await getToken();
  const response = await fetch(`/api/agreements/${agreementId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    if (response.status === 403) {
      const body = await response.json().catch(() => ({}));
      if (body.code === 'NOT_FULLY_SIGNED') {
        throw new Error('Agreement must be fully signed before downloading.');
      }
    }
    throw new Error(`Download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TalentLock-Agreement-${agreementId}-Signed.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

---

## PDF Document Visual Spec

The PDF is generated server-side by `@react-pdf/renderer`. This section documents what the output should look like so QA can verify it visually.

### Page 1 — Cover + Content

```
┌────────────────────────────────────────────────────────┐
│  TalentLock                                 [margin]   │
│                                                        │
│  FREELANCE ENGAGEMENT AGREEMENT                        │
│  ──────────────────────────────────────────────────   │
│  AGREEMENT ID    tl-agr-xxxxxxxx                       │
│  GENERATED       June 10, 2026                         │
│  EMPLOYER        John Smith — Acme Corp                │
│  FREELANCER      Sarah Chen                            │
│  ──────────────────────────────────────────────────   │
│                                                        │
│  This Freelance Engagement Agreement ("Agreement")     │
│  is entered into as of June 10, 2026...                │
│                                                        │
│  1. SCOPE OF WORK                                      │
│  The Freelancer agrees to provide the following...     │
│                                                        │
│  [continues for as many pages as needed]               │
│                                                        │
│  TalentLock — Agreement tl-agr-xxxxxx        1 / 3    │
└────────────────────────────────────────────────────────┘
```

### Final Page — Signatures

```
┌────────────────────────────────────────────────────────┐
│  SIGNATURES                                            │
│                                                        │
│  EMPLOYER                    FREELANCER                │
│                                                        │
│  [signature image 160×60]    [signature image 160×60]  │
│  or: cursive typed name      or: cursive typed name    │
│  _____________________       _____________________     │
│                                                        │
│  John Smith                  Sarah Chen                │
│  Acme Corp                   React Developer           │
│  Signed: June 10, 2026       Signed: June 10, 2026    │
│  14:32 UTC                   15:01 UTC                 │
│                                                        │
│  ──────────────────────────────────────────────────   │
│  This document was generated by TalentLock and        │
│  constitutes a legally binding agreement between       │
│  the parties named above.                              │
│  Agreement ID: tl-agr-xxxxxxxx                         │
│                                                        │
│  TalentLock — Agreement tl-agr-xxxxxx        3 / 3    │
└────────────────────────────────────────────────────────┘
```

---

## Copy Reference

| Location | String |
|---|---|
| Download button — ready | `Download Signed Agreement` |
| Download button — loading | `Generating PDF...` |
| Download button label | `Signed PDF · TalentLock certified document` |
| Download icon tooltip | `Download signed PDF` |
| Toast error | `Download failed. Please try again.` |
| Toast error — not signed | `Agreement must be fully signed before downloading.` |
| PDF — wordmark | `TalentLock` |
| PDF — document title | `FREELANCE ENGAGEMENT AGREEMENT` |
| PDF — agreement ID label | `AGREEMENT ID` |
| PDF — generated label | `GENERATED` |
| PDF — employer label | `EMPLOYER` |
| PDF — freelancer label | `FREELANCER` |
| PDF — signatures heading | `SIGNATURES` |
| PDF — employer role label | `EMPLOYER` |
| PDF — freelancer role label | `FREELANCER` |
| PDF — signed label | `Signed: {date} {time} UTC` |
| PDF — legal footer | `This document was generated by TalentLock and constitutes a legally binding agreement between the parties named above.` |
| PDF — footer left | `TalentLock — Agreement {id}` |
| PDF — filename | `TalentLock-Agreement-{id}-Signed.pdf` |

---

## Loading & Error States Summary

| State | Trigger | Response |
|---|---|---|
| Hidden | `status !== 'fully_signed'` | Button not rendered |
| Ready | `status === 'fully_signed'`, no download in progress | Green outline download button |
| Generating | First download, API call in flight | Spinner + "Generating PDF..." |
| Downloading | Cached PDF, near-instant | Same spinner briefly shown |
| Error | API returns non-OK | Toast error, button returns to ready |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/lib/downloadUtils.ts` | **New** | 3.1 |
| `src/pages/AgreementDetail.tsx` | Modified | 3.1 |
| `src/pages/Agreements.tsx` | Modified | 3.2 |

# TalentLock — Features Specification: Agreement PDF Download

## Overview

TalentLock generates legal agreements using AI and allows both parties to sign them with handwritten signature images or typed names. Feature 8 in the Key Features list describes an "Agreement Safe Locker — Fully executed agreements unlock a one-time certified download per party." The route `GET /api/agreements/:id/download` exists and is access-controlled, but the actual PDF generation has never been specced or implemented. The route currently returns the raw agreement text, not a proper PDF document.

The problem is real: a fully signed legal contract stored only as text in a database is not useful for record-keeping, legal enforcement, or sharing with a lawyer. Both parties need a proper, professional PDF document that looks like a legal contract — with the agreement content, both parties' names, signing dates, and signature images rendered on the page — that they can download, store locally, email to their legal counsel, or submit as evidence of an engagement.

This feature specifies the complete implementation of the agreement PDF download:
- A server-side PDF generator that produces a professional, properly formatted legal document
- Both parties' signature images rendered on the final page
- A typed-name fallback when no image signature was uploaded
- A clear metadata block (parties, dates, agreement ID, TalentLock watermark)
- The download is available to both parties once the agreement is `fully_signed`
- The download is available at any time after signing — not one-time-only (see Non-Goals and the note on "one-time" semantics below)

---

## The "One-Time" Question — Resolved

The existing description says "one-time certified download." This was likely intended to mean "available only after both parties have signed" (i.e. not downloadable during draft or partially signed state), not literally that the file self-destructs after the first download. Making a legal document literally un-re-downloadable would be a significant UX problem — users lose files, change computers, and need to resend to lawyers.

**Decision:** The download is available any time after `status = 'fully_signed'`. It is not literally one-time. The "one-time certified" language in the existing description is reinterpreted as "the PDF is generated once and cached — you get a certified copy of the final agreed document." Both parties can download as many times as needed.

---

## Feature Modules

### Module 1 — Server-Side PDF Generation

On `GET /api/agreements/:id/download`, the server:

1. Fetches the agreement (must be `fully_signed` — 403 otherwise)
2. Verifies the requesting user is a party (employer or freelancer on this agreement)
3. Checks if a cached PDF already exists in GCS at a deterministic path (`agreements/{agreementId}/signed-agreement.pdf`)
4. If cached: streams the file directly from GCS
5. If not cached: generates the PDF, uploads to GCS, then streams to the client

The PDF is generated using `puppeteer` (headless Chromium) or `@react-pdf/renderer` — see `clarify.md` for the decision. The server renders an HTML template to PDF, which gives full control over typography, layout, and signature image rendering.

---

### Module 2 — PDF Document Structure

The generated PDF has exactly this structure:

**Page 1 — Header & Metadata**
```
┌─────────────────────────────────────────────────────────┐
│  [TalentLock Logo / Wordmark]                           │
│                                                         │
│  FREELANCE ENGAGEMENT AGREEMENT                         │
│  Agreement ID: tl-agr-xxxxxxxxxxxx                      │
│  Generated: June 10, 2026                               │
│                                                         │
│  PARTIES                                                │
│  Employer:    Acme Corp (John Smith)                    │
│  Freelancer:  Sarah Chen                                │
│                                                         │
│  SIGNING STATUS                                         │
│  Employer signed:    June 10, 2026 at 14:32 UTC         │
│  Freelancer signed:  June 10, 2026 at 15:01 UTC         │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  [Full agreement content — paragraphs, clauses, etc.]   │
└─────────────────────────────────────────────────────────┘
```

**Final Page — Signatures**
```
┌─────────────────────────────────────────────────────────┐
│  SIGNATURES                                             │
│                                                         │
│  Employer                    Freelancer                 │
│  ┌─────────────────────┐    ┌─────────────────────┐    │
│  │  [signature image]  │    │  [signature image]  │    │
│  │  or typed name      │    │  or typed name      │    │
│  └─────────────────────┘    └─────────────────────┘    │
│                                                         │
│  John Smith                  Sarah Chen                 │
│  Acme Corp                   React Developer            │
│  Signed: June 10, 2026       Signed: June 10, 2026     │
│  14:32 UTC                   15:01 UTC                  │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  This document was generated by TalentLock             │
│  and is a legally binding agreement between the         │
│  parties named above. Agreement ID: tl-agr-xxxx        │
└─────────────────────────────────────────────────────────┘
```

---

### Module 3 — Signature Rendering

Each signature is rendered using whatever the party used to sign:

| Signing method | Rendered in PDF |
|---|---|
| Image upload (`signatureImageUrl`) | The signature image embedded at natural scale, max 200px wide |
| Typed name (`typedName`) | The name rendered in a cursive/handwriting-style font (e.g. Dancing Script) with a 1px underline |

Both methods produce a professional-looking signed document.

---

### Module 4 — PDF Caching in GCS

The PDF is generated once and cached. The deterministic GCS path is:

```
agreements/{agreementId}/signed-agreement.pdf
```

On every subsequent download request, the server checks GCS for this path first. If found, stream directly — no re-generation.

**Cache invalidation:** The PDF is never invalidated after the agreement is `fully_signed`. The content is frozen at that point. Redlines can only be accepted before both parties sign — once fully signed, `accept-redline` is blocked. So the PDF content never changes after generation.

---

### Module 5 — Download Button on `/agreements/:id`

The frontend download button appears in the agreement detail page:

- Only visible when `agreement.status === 'fully_signed'`
- Available to both employer and freelancer
- Triggers a browser file download — not a navigation (does not leave the page)
- Shows a loading spinner during generation (first download) or immediately starts for cached PDF
- Filename: `TalentLock-Agreement-{agreementId}-Signed.pdf`

---

### Module 6 — Agreement List Download Shortcut

On the `/agreements` list page, each fully signed agreement shows a small download icon (↓) beside the status badge. One click, no modal, no confirmation — triggers the download directly.

---

## API Behaviour

`GET /api/agreements/:id/download`

| Condition | Response |
|---|---|
| Not authenticated | `401` |
| Not a party | `403` |
| Agreement not `fully_signed` | `403` with `code: 'NOT_FULLY_SIGNED'` |
| First download (no cache) | Generates PDF, uploads to GCS, streams with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="TalentLock-Agreement-{id}-Signed.pdf"` |
| Subsequent download (cached) | Streams from GCS directly |

Response headers on success:
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="TalentLock-Agreement-{id}-Signed.pdf"
Cache-Control: private, max-age=86400
```

---

## Plan Gating

| Plan | Available |
|---|---|
| All freelancer plans | ✅ — both parties can download |
| All employer plans | ✅ — both parties can download |

No plan gate. Downloading a signed legal agreement you are a party to is a fundamental right, not a premium feature.

---

## Non-Goals

- PDF generation for unsigned/partially-signed agreements (draft preview is a separate future feature)
- Email delivery of the PDF (email notification system exists but attaching a PDF to it is out of scope)
- PDF digital signatures (cryptographic PDF signing via certificate authority — this is a future enterprise feature)
- PDF watermarking per download (the TalentLock footer serves this purpose)
- Different PDF templates per agreement type (one professional template only)
- Admin bulk PDF export of all agreements
- PDF generation for booking summaries or milestone reports

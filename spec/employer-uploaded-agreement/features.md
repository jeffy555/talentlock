# TalentLock — Features Specification: Employer Uploaded Agreement

## Overview

Today employers can only generate agreements via TalentLock AI. Some employers already have their own contract templates and need to upload them instead.

**Employer Uploaded Agreement** lets employers upload a PDF/DOCX/TXT contract, get an AI summary for quick review, add amendment points, have AI inject agreed dates and freelancer compensation from the booking, run a thorough AI review on finalize, and then sign through the existing e-sign flow.

```
Upload → AI summary → Employer amendments → AI enrich (dates + rate) → Finalize + health review → Employer signature → Freelancer signature
```

---

## Feature Modules

### Module 1 — Agreement Source Choice (Booking Detail)

On `BookingDetail`, after rate is agreed, employers choose:

- **Generate AI Agreement** — existing flow (unchanged)
- **Upload Your Agreement** — new upload wizard

Only one agreement per booking (existing rule).

---

### Module 2 — Document Upload

- Accepted types: PDF, DOCX, DOC, TXT (max 10 MB)
- Two-step presigned upload (same pattern as freelancer documents)
- Text extracted server-side; original stored at `documentUrl`
- `agreements.source` = `employer_upload`

---

### Module 3 — Employer AI Summary

After upload confirm, AI generates an **employer-facing** plain-English summary:

- Key obligations, payment terms, IP, termination, restrictions
- Up to 3 attention flags
- Cached on `employerSummary` / `employerSummaryScoredAt`
- Token feature: `agreement_upload_summary`

---

### Module 4 — Employer Amendments

Employer can add/edit bullet points (`amendments` jsonb) before enrichment.

`PATCH /agreements/:id/amendments` — employer only, `uploadStage` must be `summary_ready` or `enriched`.

---

### Module 5 — AI Enrichment

`POST /agreements/:id/enrich` merges:

- Original uploaded text
- Employer amendment points
- Booking start/end dates
- Agreed rate in booking currency (`buildRateDisplay`)

Output replaces `content`; sets `uploadStage` = `enriched`.

Token feature: `agreement_upload_enrich`

---

### Module 6 — Finalize + Thorough Review

`POST /agreements/:id/finalize`:

- Runs contract health score (existing `contract_health_score` token feature)
- Sets `uploadStage` = `finalized`, `finalizedAt`
- Employer UI prompts signature (existing sign dialog)

---

### Module 7 — Signing (Unchanged)

Existing `POST /agreements/:id/sign` flow. Freelancer signs after employer.

Freelancer still gets `POST /agreements/:id/summarise` for their own plain-English view.

---

## Database Additions (`agreements`)

| Column | Type | Notes |
|--------|------|-------|
| `source` | text DEFAULT `ai_generated` | `ai_generated` \| `employer_upload` |
| `employerSummary` | jsonb nullable | Employer-facing AI summary |
| `employerSummaryScoredAt` | timestamptz nullable | |
| `amendments` | jsonb DEFAULT `[]` | `[{ id, text, addedAt }]` |
| `uploadFilename` | text nullable | Original filename |
| `uploadStage` | text nullable | `summary_ready` \| `enriched` \| `finalized` |
| `finalizedAt` | timestamptz nullable | |

Existing rows backfill: `source = ai_generated`, null upload fields.

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/agreements/upload-url` | Presigned URL for agreement file (employer) |
| POST | `/agreements/upload-confirm` | Confirm upload, extract text, create agreement + summary |
| PATCH | `/agreements/:id/amendments` | Update amendment points |
| POST | `/agreements/:id/enrich` | AI merge amendments + booking dates/rate |
| POST | `/agreements/:id/finalize` | Health score review + mark ready to sign |

---

## Plan Gating

| Surface | Gating |
|---------|--------|
| Upload + summary + enrich | All employer plans (token quota) |
| Finalize health review | All employer plans (token quota) |
| Signing | All plans |

---

## Explicit Non-Goals

- Freelancer cannot upload agreements
- No OCR for scanned PDFs beyond pdf-parse text layer
- No collaborative real-time editing
- No version history beyond amendment list
- Admin console changes deferred

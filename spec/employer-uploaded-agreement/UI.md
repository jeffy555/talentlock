# TalentLock — UI Specification: Employer Uploaded Agreement

## BookingDetail — Agreement Section (Employer)

Replace single "Generate AI Agreement" card with a **tabbed card**:

| Tab | Content |
|-----|---------|
| AI Generate | Existing industry selector + custom clauses + Generate button |
| Upload Yours | `EmployerAgreementUploadPanel` |

Copy under tabs: *"Choose how to create the legal agreement for this engagement."*

Upload panel:
- Drag-and-drop zone (PDF, DOCX, TXT, max 10 MB)
- Progress: Preparing → Uploading → Processing
- On success: toast + navigate to `/agreements/:id`

---

## AgreementDetail — Employer Upload Workflow

Show stepper when `source === employer_upload` && viewer is employer && not fully signed:

```
1. Review Summary → 2. Add Points → 3. Enrich → 4. Final Review → 5. Sign
```

### Step 1 — Review Summary

`EmployerAgreementSummaryPanel` — bullet sections + attention flags (amber cards).

### Step 2 — Add Points

Textarea to add amendment (min 20 chars). List of existing points with remove button.
"Save amendments" button.

### Step 3 — Enrich

Explanation: *"AI will add your agreed dates and compensation from the booking."*
"Apply dates & compensation" button → loading → advances to step 4.

### Step 4 — Final Review

Show `ContractHealthScoreCard` (auto-loaded after finalize).
"Finalize agreement" button runs health review.

### Step 5 — Sign

Banner: *"Your agreement has been reviewed. Please sign to send it to the freelancer."*
Existing Sign Document dialog (pulse CTA).

---

## Freelancer View

No workflow stepper. Standard agreement content + freelancer summary panel (existing).

---

## Error States

| Code | UI |
|------|-----|
| `NEGOTIATION_PENDING` | Inline on upload panel |
| `TOKEN_LIMIT` | Inline error, no redirect |
| `PLAN_LIMIT` | N/A for this feature |
| 422 extract fail | "Could not read file — try DOCX" |
| Sign blocked | Toast: "Finalize the agreement before signing" |

---

## Visual Tokens

- Stepper: primary for active, muted for complete
- Upload zone: dashed border, `border-primary/40` on drag
- Attention flags: `bg-amber-50 border-amber-200`

# TalentLock — Implementation Plan: Employer Uploaded Agreement

> **Status: APPROVED — Ready for implementation**

---

## Phase 1 — Database

Edit `lib/db/src/schema/agreements.ts`:

```ts
source: text("source").notNull().default("ai_generated"),
employerSummary: jsonb("employer_summary"),
employerSummaryScoredAt: timestamp("employer_summary_scored_at", { withTimezone: true }),
amendments: jsonb("amendments").$type<AgreementAmendment[]>().default([]),
uploadFilename: text("upload_filename"),
uploadStage: text("upload_stage"), // summary_ready | enriched | finalized
finalizedAt: timestamp("finalized_at", { withTimezone: true }),
```

Export `AgreementAmendment` type. Run `pnpm --filter @workspace/db run push`.

---

## Phase 2 — Backend

### Utilities

- `artifacts/api-server/src/lib/documentTextExtract.ts` — PDF/DOCX/TXT extraction (shared logic)
- `artifacts/api-server/src/lib/employerAgreementSummaryUtils.ts` — employer summary prompt + validation
- `artifacts/api-server/src/lib/agreementEnrichUtils.ts` — enrich prompt builder

### Token logger

Add `agreement_upload_summary` and `agreement_upload_enrich` to `TokenFeature`.

### Routes (`artifacts/api-server/src/routes/agreements.ts`)

1. `POST /agreements/upload-url` — employer only, booking validation
2. `POST /agreements/upload-confirm` — read storage, extract, create row, AI summary
3. `PATCH /agreements/:id/amendments`
4. `POST /agreements/:id/enrich`
5. `POST /agreements/:id/finalize` — health score + finalizedAt

Update `POST /agreements/:id/sign` — block employer sign on `employer_upload` until `uploadStage === finalized`.

Update `enrichAgreementForViewer` — include new fields; strip `employerSummary` for freelancers.

### OpenAPI

Add schemas + paths. Run codegen + typecheck.

---

## Phase 3 — Frontend

### BookingDetail

- Tab or radio: "AI Generate" vs "Upload Your Agreement"
- `EmployerAgreementUploadPanel` — file picker, progress, redirect to agreement detail

### AgreementDetail

When `source === employer_upload` && employer viewer:

- `EmployerAgreementWorkflow` stepper: Summary → Amendments → Enrich → Review → Sign
- Reuse `ContractHealthScoreCard` after finalize
- Signature CTA when finalized and unsigned

### New components

- `artifacts/talentlock/src/components/agreements/EmployerAgreementUploadPanel.tsx`
- `artifacts/talentlock/src/components/agreements/EmployerAgreementWorkflow.tsx`
- `artifacts/talentlock/src/components/agreements/EmployerAgreementSummaryPanel.tsx`

---

## Phase 4 — Docs

Update `project.md` feature list and `spec/spec.md` index.

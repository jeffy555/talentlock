# TalentLock — Task Breakdown: Employer Uploaded Agreement

---

## Phase 1 — Database

### Task 1.1 — Extend `agreements` schema

**File:** `lib/db/src/schema/agreements.ts`

Add columns per `plan.md`. Export `AgreementAmendment` interface.

### Task 1.2 — Push schema

```bash
pnpm --filter @workspace/db run push
```

---

## Phase 2 — Backend

### Task 2.1 — Document text extraction utility

**File:** `artifacts/api-server/src/lib/documentTextExtract.ts` (create)

### Task 2.2 — Employer summary utilities

**File:** `artifacts/api-server/src/lib/employerAgreementSummaryUtils.ts` (create)

### Task 2.3 — Enrich utilities

**File:** `artifacts/api-server/src/lib/agreementEnrichUtils.ts` (create)

### Task 2.4 — Token features

**File:** `artifacts/api-server/src/lib/tokenLogger.ts` — add `agreement_upload_summary`, `agreement_upload_enrich`.

**File:** `lib/api-spec/openapi.yaml` — add to TokenUsageBreakdown.

### Task 2.5 — Agreement routes

**File:** `artifacts/api-server/src/routes/agreements.ts`

Implement upload-url, upload-confirm, amendments PATCH, enrich POST, finalize POST.

Update sign handler gating. Update `enrichAgreementForViewer`.

### Task 2.6 — OpenAPI + codegen

**File:** `lib/api-spec/openapi.yaml`

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

### Task 2.7 — Unit tests

**File:** `artifacts/api-server/tests/unit/employerAgreementSummaryUtils.test.ts`
**File:** `artifacts/api-server/tests/unit/agreementEnrichUtils.test.ts`

---

## Phase 3 — Frontend

### Task 3.1 — Upload panel on BookingDetail

**File:** `artifacts/talentlock/src/components/agreements/EmployerAgreementUploadPanel.tsx`
**File:** `artifacts/talentlock/src/pages/BookingDetail.tsx`

### Task 3.2 — Workflow on AgreementDetail

**Files:**
- `artifacts/talentlock/src/components/agreements/EmployerAgreementWorkflow.tsx`
- `artifacts/talentlock/src/components/agreements/EmployerAgreementSummaryPanel.tsx`
- `artifacts/talentlock/src/pages/AgreementDetail.tsx`

---

## Phase 4 — Documentation

- `project.md` — feature #45
- `spec/spec.md` — index entry

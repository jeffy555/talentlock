# TalentLock — Task Breakdown: Domain Job Visibility

## Summary

Server-side profession lock on freelancer job discovery and Cruise Mode. No DB migration.

---

## Phase 1 — Jobs API

### Task 1.1 — Helper

**File:** `artifacts/api-server/src/lib/professionDomain.ts`

- [x] `isSameProfessionDomain` / `normalizeProfessionCategory`
- [x] Unit tests `artifacts/api-server/tests/unit/professionDomain.test.ts`

### Task 1.2 — List + detail

**File:** `artifacts/api-server/src/routes/jobRequirements.ts`

- [x] Freelancer list filtered to their `professionCategory`
- [x] Freelancer GET-by-id 404 on mismatch
- [x] Anonymous / employer behaviour unchanged

### Task 1.3 — Interest

**File:** `artifacts/api-server/src/routes/jobInterests.ts`

- [x] 404 when freelancer domain ≠ job domain

---

## Phase 2 — Cruise Mode

### Task 2.1 — Pre-filter by domain

**File:** `artifacts/api-server/src/lib/cruiseModeEvaluator.ts`

- [x] Join `freelancer_profiles`; skip other domains before `preFilter` / OpenAI
- [x] Silent skip (no activity row)
- [x] Re-check inside `evaluateSingleCandidate`

### Task 2.2 — Prompt

**File:** `artifacts/api-server/src/lib/cruiseModeUtils.ts`

- [x] `professionCategory` on normalised job + freelancer context
- [x] Hard-lock instruction in evaluation prompt

---

## Phase 3 — Frontend

- [x] `/jobs` subtitle + empty state (profession-scoped)
- [x] Job detail 404 copy for freelancers

---

## Phase 4 — Docs

- [x] This spec folder
- [x] `project.md` + `spec/spec.md`
- [x] OpenAPI list-endpoint description

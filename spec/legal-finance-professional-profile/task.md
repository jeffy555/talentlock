# TalentLock — Task Breakdown: Legal & Finance Professional Profile

## Summary

Four implementation phases after prerequisite gate: Database → Backend → Frontend → TalentSearch. Phase 5 (after-signup professional document uploads) is a separate spec / later PR.

**Prerequisite:** Healthcare Phase 1 on branch (`aadhaarVerificationStatus`, Vault Aadhaar helper, three onboarding cards).

**Credential scope Phase 1:** Reuse platform `aadhaar`. Legal & Finance Vault requires **verified** Aadhaar. Phase 2 document types in constants only; **no upload at registration**.

---

## Phase 0 — Prerequisite Verification

### Task 0.1 — Confirm Healthcare + Aadhaar

```bash
grep -E "professionCategory|aadhaarVerificationStatus" lib/db/src/schema/freelancerProfiles.ts
grep aadhaar artifacts/api-server/src/lib/documentConstants.ts
grep healthcare lib/db/src/schema/teachingProfileTypes.ts
```

- [ ] `profession_category` exists
- [ ] `aadhaar` in `DOCUMENT_TYPES`
- [ ] `aadhaarVerificationStatus` column exists
- [ ] `ProfessionCategory` includes `healthcare`
- [ ] If any missing → stop; complete Healthcare Phase 1 first

---

## Phase 1 — Database

### Task 1.1 — Inspection comments

Document in `legalFinanceProfileTypes.ts` header:
- Array columns match `skills` / `clinicalSpecialties`
- Reuse `location` and `aadhaarVerificationStatus`
- Do not reuse healthcare `registration_*` columns
- `ChipInput` path, `buildProfessionContext` path, Vault Aadhaar helper path

### Task 1.2 — Create `legalFinanceProfileTypes.ts`

**File:** `lib/db/src/schema/legalFinanceProfileTypes.ts`

Types and constants from `features.md` Modules 2–4 and `plan.md` Q6.

Export from `lib/db/src/schema/index.ts`.

Update `teachingProfileTypes.ts`:

```ts
export type ProfessionCategory = "technology" | "education" | "healthcare" | "legal_finance";
```

### Task 1.3 — Add columns to `freelancer_profiles`

Exact column list from `plan.md` Schema section. All nullable except `enrolmentAlertStage` default `"none"`.

Do **not** add duplicate Aadhaar or location columns.

### Task 1.4 — TalentSearch type

**File:** `lib/db/src/schema/talentSearch.ts`

Add to `TalentSearchRules`:

```ts
legalFinanceSubType: ... | null;
practiceArea: string | null;
```

### Task 1.5 — Push

```bash
pnpm --filter @workspace/db run push
```

Optional: no Aadhaar backfill (Healthcare already owns that).

- [ ] New columns nullable except alert default
- [ ] 0 rows with `legal_finance_profession_type` set immediately after push

---

## Phase 2 — Backend

### Task 2.1 — Vault filter + Aadhaar gate

**File:** `artifacts/api-server/src/routes/freelancers.ts`

- Query param `practiceArea` (array match on `practiceAreas`)
- `professionCategory=legal_finance` already works if enum extended
- Refactor Aadhaar Vault condition so **healthcare OR legal_finance** require `aadhaarVerificationStatus === 'verified'`

### Task 2.2 — Mask enrolment number

Extend `mapFreelancerProfileForApi` to mask `enrolmentNumber` with existing `maskRegistrationNumber()`.

### Task 2.3 — `buildProfessionContext()`

**File:** `artifacts/api-server/src/lib/professionContext.ts`

Add `legal_finance` branch from `plan.md`. Unit test in `professionContext.test.ts` — regression for technology (`""`), education, healthcare.

### Task 2.4 — PUT sanitisation + expiry reset

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Accept Module 3 fields when `professionCategory === 'legal_finance'`. `sanitiseText` on string fields. If `enrolmentExpiry` changes, set `enrolmentAlertStage: 'none'`.

### Task 2.5 — OpenAPI + codegen

**File:** `lib/api-spec/openapi.yaml`

1. `ProfessionCategory` enum: add `legal_finance`
2. Schemas: `LegalFinanceProfessionType`, `LegalFinanceQualification`, `PreferredEngagementMode`
3. `LegalFinanceProfileFields` object; extend `FreelancerProfile`, public profile, create/update bodies
4. `GET /api/freelancers` query: `practiceArea`
5. `TalentSearchRules`: `legalFinanceSubType`, `practiceArea`
6. Job requirement `professionCategory` includes `legal_finance`

Do **not** add Phase 2 document types to confirm/upload enums.

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Post-codegen:
- [ ] `lib/api-zod/orval.config.ts` still `indexFiles: false` (or spec `orval.config.ts` equivalent)
- [ ] `lib/api-zod/src/index.ts` exports `./generated/api` only

### Task 2.6 — Unit tests

- `professionContext.test.ts` — legal_finance + regression
- `talentSearchUtils.test.ts` — sub-type + practice area + Aadhaar gate (Phase 4 may land same PR)

---

## Phase 3 — Frontend

### Task 3.1 — Rate default

**File:** `artifacts/talentlock/src/lib/rateFormatUtils.ts`

`profileDefaultRateType('legal_finance')` → `'per_day'`.

### Task 3.2 — Labels

**File:** `artifacts/talentlock/src/lib/legalFinanceDisplayUtils.ts`

```ts
export const LEGAL_FINANCE_TYPE_LABELS: Record<LegalFinanceProfessionType, string> = {
  advocate: "Advocate / Lawyer",
  chartered_accountant: "Chartered Accountant",
  company_secretary: "Company Secretary",
  tax_consultant: "Tax Consultant",
  financial_advisor: "Financial Advisor",
};
```

Qualification + engagement-mode labels.

### Task 3.3 — Onboarding fourth card + details

**File:** `artifacts/talentlock/src/pages/Onboarding.tsx`

- Fourth card (Scale icon, navy/slate)
- Sub-type picker
- `LegalFinanceDetailsSection`
- Merge payload in `buildProfessionPayload()`
- Aadhaar stays `FreelancerDocumentOnboardingStep` — do not duplicate

### Task 3.4 — `LegalFinanceDetailsSection.tsx`

**File:** `artifacts/talentlock/src/components/onboarding/LegalFinanceDetailsSection.tsx`

Fields from Module 3. `courtJurisdictions` chip input visible when sub-type is `advocate` (optional for others).

### Task 3.5 — Profile + after-signup checklist

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

Conditional section when `professionCategory === 'legal_finance'`.

**File:** `artifacts/talentlock/src/components/legal-finance/LegalFinanceCredentialChecklist.tsx`

Phase 1: Aadhaar interactive. Phase 2 rows: muted **"Upload after signup"** / Planned — **no** upload buttons.

### Task 3.6 — Talent Vault

**File:** `FreelancersList.tsx`

Chip: Legal & Finance. Practice-area text filter. Badges: sub-type + Aadhaar verified. Rate via `profileDefaultRateType`.

### Task 3.7 — Detail + public profile

**Files:** `FreelancerDetail.tsx`, `PublicProfile.tsx`

Practice areas, settings, masked enrolment, engagement mode. Never show full enrolment number or Aadhaar data.

### Task 3.8 — Post Job

**File:** `PostJob.tsx`

Profession includes Legal & Finance; default rate type `per_day`.

---

## Phase 4 — TalentSearch

### Task 4.1 — Rule builder

**Files:** `TalentSearchRuleBuilder.tsx`, `talentSearchDisplayUtils.ts`

Healthcare-style block: sub-type radios, practice-area input. Reuse existing `requireAadhaarVerified` toggle when category is legal_finance (or keep global toggle).

### Task 4.2 — Pre-filter + normalise

**File:** `talentSearchUtils.ts`

Per `plan.md`. Parse-rules system prompt includes `legal_finance` and new fields.

### Task 4.3 — Meeting brief

**File:** `meetingBriefGenerator.ts`

Include legal/finance fields when `professionCategory === 'legal_finance'`.

---

## Phase 5 — After-signup credentials (`legal-finance-credential-verification`)

**Out of this task list.** When scheduled:

- Add PHASE2 types to `DOCUMENT_TYPES` + OpenAPI
- Upload UI on Profile checklist
- AI review prompts (Bar sanad, ICAI membership, GSTN screenshot, NISM)
- Optional scoped Vault drop on expired COP (explicit decision; not Phase 1)

---

## Files Touched (Expected)

| Area | Files |
|---|---|
| Schema | `freelancerProfiles.ts`, `legalFinanceProfileTypes.ts`, `teachingProfileTypes.ts`, `talentSearch.ts`, `index.ts` |
| API | `freelancers.ts`, `professionContext.ts`, `talentSearchUtils.ts`, `meetingBriefGenerator.ts`, `openapi.yaml` |
| Frontend | `Onboarding.tsx`, `Profile.tsx`, `FreelancersList.tsx`, `PostJob.tsx`, `FreelancerDetail.tsx`, `PublicProfile.tsx`, new legal-finance components |
| Tests | `professionContext.test.ts`, `talentSearchUtils.test.ts` |

---

## Out of Scope

- Blocking registration on Bar/ICAI/GST files
- UIDAI OTP
- Legal agreement templates
- `per_assignment` rate type
- Employer firm-number enforcement

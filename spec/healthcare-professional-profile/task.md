# TalentLock — Task Breakdown: Healthcare Professional Profile

## Summary

Four implementation phases after prerequisite gate: Database → Backend → Frontend → TalentSearch. **Phase 5 (Phase 2+ credentials)** is specified in this folder and is **ready to execute** after Phases 1–4.

**Prerequisite:** `spec/teaching-professional-profile/` Phase 1 complete on branch.

**Credential scope Phase 1:** Reuse platform `aadhaar` document + sync `aadhaarVerificationStatus`; healthcare Vault requires **verified** Aadhaar.

**Credential scope Phase 5:** Add Phase 2+ types to `DOCUMENT_TYPES` + OpenAPI; Profile checklist uploads; AI review; scoped Vault drop on expired physician/nurse `registrationExpiry`.

---

## Phase 0 — Prerequisite Verification

### Task 0.1 — Confirm Teaching Schema

```bash
grep -E "professionCategory|profession_category" lib/db/src/schema/freelancerProfiles.ts
grep -E "professionCategory|profession_category|rate_type" lib/db/src/schema/jobRequirements.ts
```

- [ ] `profession_category` NOT NULL DEFAULT `technology` on both tables
- [ ] `rate_type` NOT NULL DEFAULT `hourly` on `job_requirements`
- [ ] If missing → stop; run Teaching Phase 1 first

---

## Phase 1 — Database

### Task 1.1 — Codebase Inspection

Document in schema comment block:
- `skills` array column type (Q1 — match for `clinicalSpecialties` / `clinicalSettings`)
- `location` column exists (reuse)
- Chip input component path (reuse for clinical arrays)
- `buildProfessionContext` file path
- All `formatRate` call sites (for `per_shift`)
- Document review branching in `documentReview.ts`

### Task 1.2 — Create `healthcareProfileTypes.ts`

**File:** `lib/db/src/schema/healthcareProfileTypes.ts`

```ts
export type ProfessionCategory = "technology" | "education" | "healthcare";
export type HealthcareProfessionType =
  | "physician"
  | "registered_nurse"
  | "nurse_practitioner"
  | "allied_health"
  | "care_worker";
export type HealthcareQualification = /* see features.md Module 3 */;
export type PreferredCareMode = "in_person" | "telehealth" | "both";
export type AadhaarVerificationStatus =
  | "not_uploaded"
  | "uploaded"
  | "verified"
  | "rejected"
  | "expired";
export type RateType =
  | "hourly"
  | "per_day"
  | "per_session"
  | "per_course"
  | "per_shift";

export const REQUIRED_DOCUMENTS_BY_HEALTHCARE_TYPE = /* features.md Module 4 */;
export const HEALTHCARE_DOCUMENT_TYPES_PHASE1 = ["aadhaar"] as const;
export const HEALTHCARE_DOCUMENT_TYPES_PHASE2 = [/* ... */] as const;

export function maskRegistrationNumber(value: string | null): string | null;
```

Update `teachingProfileTypes.ts` `ProfessionCategory` to include `healthcare` OR consolidate exports in `lib/db/src/schema/index.ts`.

### Task 1.3 — Add Healthcare Columns to `freelancer_profiles`

All nullable except alert/status defaults:

```ts
healthcareProfessionType: text("healthcare_profession_type"),
clinicalSpecialties: text("clinical_specialties").array(),
clinicalSettings: text("clinical_settings").array(),
yearsClinicalExperience: integer("years_clinical_experience"),
highestQualification: text("highest_qualification"),
qualificationSpecialization: text("qualification_specialization"),
qualificationInstitution: text("qualification_institution"),
registrationCouncil: text("registration_council"),
registrationNumber: text("registration_number"),
registrationExpiry: timestamp("registration_expiry", { withTimezone: true }),
registrationAlertStage: text("registration_alert_stage").notNull().default("none"),
aadhaarVerificationStatus: text("aadhaar_verification_status").notNull().default("not_uploaded"),
aadhaarLastFour: text("aadhaar_last_four"),
preferredCareMode: text("preferred_care_mode"),
```

Do **not** add duplicate `location` column.

### Task 1.4 — Sync Aadhaar Status (No New Document Type)

**Skip** if `aadhaar` already in `documentConstants.ts` (onboarding scaffolding).

Add denormalized `aadhaarVerificationStatus` on profile; backfill from existing `documents` rows where `documentType = 'aadhaar'`:

```sql
-- Optional one-time backfill after column add
UPDATE freelancer_profiles fp
SET aadhaar_verification_status = d.status
FROM documents d
WHERE d.freelancer_id = fp.id AND d.document_type = 'aadhaar';
```

### Task 1.5 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify:
```sql
SELECT COUNT(*) FROM freelancer_profiles WHERE healthcare_profession_type IS NOT NULL;
-- Expect: 0

SELECT column_default FROM information_schema.columns
WHERE table_name = 'freelancer_profiles' AND column_name = 'aadhaar_verification_status';
-- Expect: 'not_uploaded'
```

- [ ] All healthcare columns nullable except status defaults
- [ ] No existing row has `healthcare_profession_type` set

---

## Phase 2 — Backend

### Task 2.1 — `GET /api/freelancers` Filters

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Add optional query params:
- `professionCategory=healthcare`
- `clinicalSpecialty` (case-insensitive array match on `clinicalSpecialties`)

Add Vault gate for healthcare + Aadhaar (see `plan.md` Q2).

### Task 2.2 — Mask Registration Number in Serializers

Employer-facing list/detail responses mask `registrationNumber`. Admin routes may show full value.

### Task 2.3 — Extend `buildProfessionContext()`

**File:** `artifacts/api-server/src/lib/professionContext.ts`

Add healthcare branch per `plan.md`. Update unit tests in `professionContext.test.ts`.

### Task 2.4 — Aadhaar Status Sync on Document Review

**Files:** `documentReview.ts`, `routes/documents.ts`, `routes/admin.ts`

On any `aadhaar` document status change, update `freelancer_profiles.aadhaarVerificationStatus` (extend existing handler if onboarding already partially does this — ensure healthcare Vault gate reads correct value).

Optional: set `aadhaarLastFour` from admin AI notes only — never employer-visible.

Aadhaar AI prompt already exists from onboarding; extend only if healthcare-specific wording needed.

### Task 2.5 — `PUT /api/freelancers/me` Validation

Accept Module 3 healthcare fields when `professionCategory === 'healthcare'`. Partial update semantics unchanged.

Block setting `professionCategory: 'healthcare'` without subsequent Aadhaar upload path documented in API error message (soft — Vault gate handles visibility).

### Task 2.6 — OpenAPI + Codegen

**File:** `lib/api-spec/openapi.yaml`

1. `ProfessionCategory` enum: add `healthcare`
2. `HealthcareProfessionType`, `HealthcareQualification`, `PreferredCareMode`, `AadhaarVerificationStatus` schemas
3. `HealthcareProfileFields` object (mirror `TeachingProfileFields`)
4. Extend `FreelancerProfile`, `PUT /api/freelancers/me` body
5. `GET /api/freelancers` query params: `clinicalSpecialty`
6. `RateType` enum: add `per_shift`
7. `DocumentsConfirmBodyDocumentType` — `aadhaar` already present from onboarding; only add Phase 2 types in Phase 5
8. Job requirement schemas: `professionCategory` includes `healthcare`

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Post-codegen checks:
- [ ] `lib/api-zod/orval.config.ts` → `indexFiles: false`
- [ ] `lib/api-zod/src/index.ts` → exports `./generated/api` only

### Task 2.7 — Unit Tests

- `professionContext.test.ts` — healthcare + regression technology/education
- `talentSearchUtils.test.ts` — healthcare pre-filter cases (if Phase 4 in same PR, else defer)
- Document type validation accepts `aadhaar`

---

## Phase 3 — Frontend

### Task 3.1 — Extend Rate Utilities

**File:** `artifacts/talentlock/src/lib/rateFormatUtils.ts`

- Add `per_shift: '/shift'`
- `profileDefaultRateType('healthcare')` → `'per_shift'`
- Update all call sites from inspection list

### Task 3.2 — Healthcare Labels

**File:** `artifacts/talentlock/src/lib/healthcareDisplayUtils.ts` (new)

```ts
export const HEALTHCARE_TYPE_LABELS: Record<HealthcareProfessionType, string> = {
  physician: "Physician / Doctor",
  registered_nurse: "Registered Nurse",
  nurse_practitioner: "Nurse Practitioner",
  allied_health: "Allied Health Professional",
  care_worker: "Care Worker",
};
```

### Task 3.3 — Onboarding: Third Category Card + Healthcare Flow

**File:** `artifacts/talentlock/src/pages/Onboarding.tsx`

- Add Healthcare card (emerald accent — `UI.md`)
- Sub-type picker (5 options)
- `HealthcareDetailsSection` component (mirror `TeachingDetailsSection.tsx`)
- **Aadhaar upload panel** — reuse `FreelancerDocumentOnboardingStep` on registration form (not a healthcare-only duplicate step)
- Payload merge on `PUT /api/freelancers/me`

### Task 3.4 — `HealthcareDetailsSection.tsx`

**File:** `artifacts/talentlock/src/components/onboarding/HealthcareDetailsSection.tsx`

Fields: clinical specialties (chip), clinical settings (chip), years experience, qualification fields, registration council/number/expiry, preferred care mode. Location reuses `LocationStep` if onboarding scaffolding provides it.

### Task 3.5 — Profile Edit Page

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

Conditional section when `professionCategory === 'healthcare'`:
- Healthcare details form
- Aadhaar status badge + re-upload
- Document checklist widget from `REQUIRED_DOCUMENTS_BY_HEALTHCARE_TYPE` (Phase 1: Aadhaar required; Phase 2+ items muted **"Planned"** until Phase 5)

### Task 3.6 — Talent Vault Filters

**File:** `artifacts/talentlock/src/pages/FreelancersList.tsx`

- Filter chip: Healthcare
- Specialty text filter when Healthcare selected
- Card badges: healthcare sub-type, Aadhaar verified checkmark
- Rate display via `formatRate(..., profileDefaultRateType(...))`

### Task 3.7 — Freelancer Detail + Public Profile

**Files:** `FreelancerDetail.tsx`, `PublicProfile.tsx`

Show healthcare badges, masked registration, clinical specialties, care mode. Never show full registration number or Aadhaar data.

### Task 3.8 — Post Job Form

**File:** `artifacts/talentlock/src/pages/PostJob.tsx`

- Profession category includes Healthcare
- Rate type picker when healthcare (default `per_shift`)

### Task 3.9 — Watchlist / AiMatch / Dashboard Cards

Update rate formatting and optional healthcare badge on any shared freelancer card components touched by teaching rollout.

---

## Phase 4 — TalentSearch & Cruise Mode (may ship after Phase 3)

### Task 4.1 — TalentSearch Rules UI

**Files:** `TalentSearchRuleBuilder.tsx`, `talentSearchDisplayUtils.ts`

Add healthcare profession category, healthcare sub-type, clinical specialty, `requireAadhaarVerified` toggle.

### Task 4.2 — TalentSearch Pre-Filter

**File:** `talentSearchUtils.ts`

Extend `talentSearchPreFilterReason()` for healthcare rules.

### Task 4.3 — Meeting Brief Generator

**File:** `meetingBriefGenerator.ts`

Include healthcare profile fields in brief context when applicable.

---

## Phase 5 — Phase 2+ Credentials (after signup)

**Prerequisite:** Phases 1–4 on `main` (healthcare profile, Aadhaar Vault gate, checklist component).

Do **not** block registration. Do **not** add UIDAI OTP. Do **not** add Phase 3 recommended types to `DOCUMENT_TYPES`.

### Task 5.1 — Extend `DOCUMENT_TYPES`

**File:** `artifacts/api-server/src/lib/documentConstants.ts`

Append (do not remove `aadhaar` / `government_id` / `professional_credential`):

```ts
"experience_certificate",
"mbbs_degree",
"medical_registration_certificate",
"nursing_degree",
"nursing_registration_certificate",
"allied_qualification",
```

If Legal & Finance Phase 5 already added `experience_certificate`, do **not** duplicate.

Update `HEALTHCARE_DOCUMENT_TYPES_PHASE2` in `healthcareProfileTypes.ts` to include `allied_qualification`.

### Task 5.2 — OpenAPI + codegen

**File:** `lib/api-spec/openapi.yaml`

Extend every document-type enum (`DocumentsUploadUrlBody`, `DocumentsConfirmBody`, GET documents responses, admin document types) with the Phase 2+ strings.

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Post-codegen: `indexFiles: false`; `lib/api-zod/src/index.ts` exports `./generated/api` only.

### Task 5.3 — AI review prompts

**File:** `artifacts/api-server/src/lib/documentReview.ts`

Add labels + `buildDocumentReviewUserPrompt()` branches from `plan.md` Phase 2+ table. After verify, existing `updateVerificationLevel()` + TalentSearch trigger stay as-is (no Aadhaar-only restriction for verification level).

### Task 5.4 — Vault drop on expired registration

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Add the Q8 `not(and(...))` condition next to the school-teacher licence exclusion. Comment must say: allied/care_worker never dropped; missing Phase 2+ uploads never dropped.

### Task 5.5 — Profile checklist uploads

**File:** `artifacts/talentlock/src/components/healthcare/HealthcareCredentialChecklist.tsx`

Replace muted “Planned” rows with interactive rows for `futureRequired` types for the current sub-type:

- Status icon from `useGetDocumentsMe`
- Upload / re-upload via existing `DocumentUploader` (or shared row used by `VerificationSection`)
- Optional expiry date on registration certificates
- View via existing signed-URL / proxied preview
- **No** upload buttons for Phase 3 recommended types

**File:** `artifacts/talentlock/src/pages/Profile.tsx` — pass documents list into the checklist.

Copy: Aadhaar still required for Vault. Professional certificates are optional for Vault visibility.

### Task 5.6 — Tests

- Document type validation accepts Phase 2+ strings; rejects unknown types
- Vault list excludes physician with past `registrationExpiry`; includes allied_health with past `registrationExpiry`
- Unit: prompt builder returns non-empty text for `mbbs_degree`

- [ ] Technology / education upload enum still works
- [ ] Finish-registration still only requires Aadhaar
- [ ] Completeness score unchanged

---

## Files Touched (Expected)

| Area | Files |
|---|---|
| Schema | `freelancerProfiles.ts`, `healthcareProfileTypes.ts`, `documentConstants.ts` |
| API | `freelancers.ts`, `documents.ts`, `documentReview.ts`, `professionContext.ts`, `openapi.yaml` |
| Frontend | `Onboarding.tsx`, `Profile.tsx`, `FreelancersList.tsx`, `PostJob.tsx`, new healthcare components; Phase 5: `HealthcareCredentialChecklist.tsx` |
| Utils | `rateFormatUtils.ts`, `healthcareDisplayUtils.ts` |
| Tests | `professionContext.test.ts`, integration vault tests; Phase 5: document-type + expired-registration Vault |

---

## Out of Scope (This Task List)

- Booking gating on medical registration verified
- UIDAI OTP API
- Healthcare agreement templates
- Employer hospital licence enforcement
- Phase 3 recommended document types (`specialist_qualification`, indemnity, BLS, `allied_registration`)

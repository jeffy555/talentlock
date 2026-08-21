# TalentLock — Features Specification: Healthcare Professional Profile

## Overview

TalentLock today supports **Technology** (`professionCategory: 'technology'`) and **Education** (`professionCategory: 'education'`) as first-class verticals. Healthcare professionals (doctors, nurses, allied health, care workers) are listed in `fieldOfWork` (e.g. "Medicine & Healthcare", "Nursing") but still default to `professionCategory: 'technology'` unless the freelancer explicitly chose Education — which is the wrong data model for clinical hiring.

This feature is the **Healthcare vertical expansion**: it adds `professionCategory: 'healthcare'`, structured clinical profile fields, India-first credential capture (Aadhaar mandatory in Phase 1), Talent Vault discovery, AI matching context, job posting rate types, and hooks for TalentSearch / Cruise Mode — **without changing the universal 7-step flow** (Post → Discover → Meet → Book → Agree → Deliver → Review).

**Geographic focus (Phase 1):** India. Credential names, councils, and document types align with NMC (doctors), State Medical Councils (SMC), State Nursing Registration Councils (SNRC), and UIDAI Aadhaar. The schema and enums are designed so UK GMC/NMC and US state licence patterns can be added later via `registrationCouncil` free text and additional document types.

**Prerequisites:**
- `spec/teaching-professional-profile/` — shared `professionCategory` + `rateType` columns and multi-category onboarding pattern.
- `spec/onboarding-scaffolding/` — **mandatory Aadhaar for all freelancers** at registration (`documentType: aadhaar` on `documents` table; finish registration blocked until upload confirmed). Healthcare does **not** re-implement Aadhaar upload — it **inherits** this platform gate.

This spec **extends** Teaching + onboarding scaffolding rather than replacing them.

---

## Feature Modules

### Module 1 — Profession Category Extension

Extend the existing enum:

```ts
type ProfessionCategory = 'technology' | 'education' | 'healthcare';
```

- Existing rows remain `technology` — **zero behaviour change**.
- New freelancers choose **Healthcare** during onboarding (alongside Technology and Education).
- `professionCategory` on `freelancer_profiles` and `job_requirements` gains `'healthcare'` as a valid value (column already exists from Teaching spec).
- Healthcare-specific profile columns are **nullable** and only meaningful when `professionCategory === 'healthcare'`.

---

### Module 2 — Healthcare Sub-Type

Within `professionCategory: 'healthcare'`, five sub-types cover the user's stated targets (doctors, nurses) plus adjacent roles that fit the same booking/verification model:

```ts
type HealthcareProfessionType =
  | 'physician'           // MBBS / allopathic doctors, GPs, specialists
  | 'registered_nurse'    // RN, staff nurse, RM (India: SNRC-registered)
  | 'nurse_practitioner'  // Advanced practice nurse / CNS (where applicable)
  | 'allied_health'       // Physiotherapist, radiographer, lab tech, OT, pharmacist
  | 'care_worker';        // Health care assistant, ward assistant, home care aide
```

For `technology` and `education` freelancers, `healthcareProfessionType` is always `null`.

---

### Module 3 — Healthcare Profile Fields

New structured fields on `freelancer_profiles`, populated only for healthcare professionals:

| Field | Type | Example |
|---|---|---|
| `healthcareProfessionType` | enum | `'physician'` |
| `clinicalSpecialties` | string array | `["Internal Medicine", "Emergency Medicine"]` |
| `clinicalSettings` | string array | `["Hospital", "ICU", "Telehealth"]` |
| `yearsClinicalExperience` | integer | `12` |
| `highestQualification` | enum | `'mbbs'`, `'bsc_nursing'`, `'gnm'`, etc. |
| `qualificationSpecialization` | string | `"Cardiology"` |
| `qualificationInstitution` | string | `"AIIMS Delhi"` |
| `registrationCouncil` | string | `"Maharashtra Medical Council"` / `"Tamil Nadu Nurses Council"` |
| `registrationNumber` | string | Stored full; **API masks** for employers (e.g. `MH-****4521`) |
| `registrationExpiry` | date nullable | Renewal date from SMC/SNRC licence |
| `registrationAlertStage` | enum | `none \| 90d \| 30d \| 7d \| expired` (reuse teaching licence pattern) |
| `aadhaarVerificationStatus` | enum | `not_uploaded \| uploaded \| verified \| rejected \| expired` |
| `preferredCareMode` | enum | `in_person \| telehealth \| both` |
| `location` | string nullable | **Reuse existing column** from Teaching spec — do not duplicate |

**Skills vs clinical specialties:** For healthcare professionals, `clinicalSpecialties` holds structured clinical areas (departments, specialties). The existing `skills` array may still hold free-text tags (e.g. `"Ventilator management"`, `"Epic EMR"`) for AI matching and keyword search.

**Highest qualification enum (India-first):**

```ts
type HealthcareQualification =
  | 'mbbs' | 'bds' | 'md_ms' | 'dnb' | 'diploma_medical'
  | 'bsc_nursing' | 'msc_nursing' | 'gnm' | 'anm' | 'post_basic_bsc'
  | 'bpt' | 'mph' | 'other';
```

---

### Module 4 — Credential Documents (Phased)

Healthcare uses the existing `documents` table with **new `documentType` values** and profession-specific checklists (static lookup, same pattern as `REQUIRED_DOCUMENTS_BY_EDUCATION_TYPE`).

#### Phase 1 — Mandatory now (credential MVP)

| Document type | Purpose | Mandatory for | Owner spec |
|---|---|---|---|
| `aadhaar` | UIDAI identity document (card scan or e-Aadhaar PDF) | **All** healthcare sub-types | `spec/onboarding-scaffolding/` (platform-wide — already live) |

**Gating (Phase 1):**
- **Registration:** Cannot finish freelancer registration without Aadhaar upload (onboarding scaffolding — applies to technology/education/healthcare equally).
- **Talent Vault (healthcare-only stricter gate):** Healthcare profiles appear in Vault only when `completenessScore >= 60` AND Aadhaar document `status` is `verified` (or `pending` / `needs_review` if product chooses softer gate — default binding decision: **`verified` required** for healthcare Vault visibility; see `plan.md`).
- Rejected Aadhaar blocks Vault until re-upload + re-verification.

**Privacy (binding):**
- Never store the 12-digit Aadhaar number in `freelancer_profiles` or employer-visible API fields.
- `registrationNumber` and document metadata may reference council IDs only.
- AI `aiNotes` for Aadhaar are **admin-only** (existing documents pattern).
- Optional: store `aadhaarLastFour` on profile for support dedup — nullable, never shown on public profile.

#### Phase 2 — Planned (document types defined now; upload UI + AI prompts deferred)

| Document type | Purpose | Typical for |
|---|---|---|
| `experience_certificate` | Work experience letter from hospital/clinic/employer | All sub-types |
| `mbbs_degree` | MBBS degree certificate (digital copy per NMC NMR guidance) | `physician` |
| `medical_registration_certificate` | SMC / NMR registration certificate (legal licence to practice) | `physician` |
| `nursing_degree` | B.Sc / GNM / ANM diploma certificate | `registered_nurse`, `nurse_practitioner` |
| `nursing_registration_certificate` | SNRC registration (RN/RM number certificate) | `registered_nurse`, `nurse_practitioner` |

#### Phase 3 — Recommended / specialist (future)

| Document type | Purpose |
|---|---|
| `specialist_qualification` | MD/MS/DNB/Fellowship certificate |
| `medical_indemnity_insurance` | Professional indemnity policy |
| `bls_acls_certificate` | BLS/ACLS/ATLS life-support certs |
| `allied_qualification` | Degree/diploma for physio/radiology/lab |
| `allied_registration` | Council registration where applicable |

#### Checklist lookup table (UI completeness widget)

```ts
export const REQUIRED_DOCUMENTS_BY_HEALTHCARE_TYPE: Record<
  HealthcareProfessionType,
  { required: string[]; recommended: string[]; futureRequired: string[] }
> = {
  physician: {
    required: ['aadhaar'],
    futureRequired: ['mbbs_degree', 'medical_registration_certificate', 'experience_certificate'],
    recommended: ['specialist_qualification', 'medical_indemnity_insurance', 'bls_acls_certificate'],
  },
  registered_nurse: {
    required: ['aadhaar'],
    futureRequired: ['nursing_registration_certificate', 'nursing_degree', 'experience_certificate'],
    recommended: ['bls_acls_certificate'],
  },
  nurse_practitioner: {
    required: ['aadhaar'],
    futureRequired: ['nursing_registration_certificate', 'nursing_degree', 'experience_certificate'],
    recommended: ['specialist_qualification', 'bls_acls_certificate'],
  },
  allied_health: {
    required: ['aadhaar'],
    futureRequired: ['allied_qualification', 'experience_certificate'],
    recommended: ['allied_registration'],
  },
  care_worker: {
    required: ['aadhaar'],
    futureRequired: ['experience_certificate'],
    recommended: ['nursing_degree'], // ANM/GNM where applicable
  },
};
```

**Research basis (India):** NMC's National Medical Register (NMR) requires doctors to authenticate with **Aadhaar**, upload **MBBS degree**, and **State Medical Council registration certificate** for registration. Nurses obtain legal practice authority via **State Nursing Registration Councils** (RN/RM registration + nursing qualification certificates). Experience letters are standard for hospital locum/contract verification and foreign nursing verification workflows.

Aadhaar upload UI, storage paths, and AI review for `documentType: aadhaar` are **already implemented** (`FreelancerDocumentOnboardingStep`, `documentConstants.ts`). Phase 1 of *this* spec wires healthcare profile + Vault gates to the existing Aadhaar row. Phase 2 medical document upload flows are bundled in tasks below (or a follow-up PR if scope-split).

---

### Module 5 — Onboarding Flow Change

**Freelancers — extended category picker:**

```
Role picker → Profession category picker → Profile form (+ conditional sections)
```

Category cards gain a third option:

| Card | Sub-text |
|---|---|
| Technology | Software, design, data, DevOps |
| Education | Teaching, tutoring, lecturing |
| **Healthcare** | Doctors, nurses, allied health, care |

When **Healthcare** is selected:

1. Sub-type picker: Physician / Registered Nurse / Nurse Practitioner / Allied Health / Care Worker
2. **Healthcare Details** section (chip inputs + registration fields) — mirror Teaching Details
3. Aadhaar is **not** a separate healthcare-only step — it remains on the unified registration form (`FreelancerDocumentOnboardingStep`). Healthcare freelancers upload Aadhaar there like everyone else.
4. Final `PUT /api/freelancers/me` includes `professionCategory: 'healthcare'` + Module 3 fields (after or alongside registration flow per onboarding scaffolding)

Employers unchanged — they set `professionCategory` on the **job**, not their profile.

---

### Module 6 — Talent Vault Discovery for Healthcare

`GET /api/freelancers` gains optional query params:

```
?professionCategory=healthcare
?clinicalSpecialty=Cardiology
```

- Omitted → unchanged behaviour (all categories, existing filters)
- `professionCategory=healthcare` → healthcare professionals only
- `clinicalSpecialty=Cardiology` → case-insensitive match against `clinicalSpecialties` array (same SQL pattern as `teachingSubject`)

**Vault gating for healthcare:** In addition to `completenessScore >= 60`, healthcare freelancers must have an `aadhaar` document row with `status = 'verified'` (binding default). Denormalized `aadhaarVerificationStatus` on profile mirrors document status for fast Vault queries (updated on document review — same pattern as education `dbsCheckStatus`).

UI: Talent Vault filter chips add **Healthcare** alongside Technology / Education. Selecting Healthcare reveals optional **Specialty** text filter.

---

### Module 7 — AI Matching Context for Healthcare

When `job_requirements.professionCategory === 'healthcare'`, inject into AI Match + match-explanation prompts:

> "This is a healthcare hiring request. Evaluate clinical specialties, care settings, registration council status, years of experience, and Aadhaar/credential verification as primary match criteria instead of technical skills or teaching subjects."

For `technology` and `education`, healthcare context is an **empty string** — no regression.

Extend `buildProfessionContext()` (or equivalent) with a healthcare branch; technology and education branches unchanged.

---

### Module 8 — Job Posting: Healthcare Rate Types

Extend `rateType` enum:

```ts
type RateType =
  | 'hourly'
  | 'per_day'
  | 'per_session'
  | 'per_course'   // education
  | 'per_shift';  // healthcare — NEW
```

Job posting form: when `professionCategory === 'healthcare'`, show rate type picker defaulting to `per_shift` for hospital-style postings (employers may choose hourly/per_day/per_shift).

`formatRate()` / `rateUnitLabel()` gain `/shift` label.

---

### Module 9 — TalentSearch & Cruise Mode Integration

**TalentSearch** (`talent_search_configs.rules`):

- `professionCategory: 'healthcare'` filter (already pattern-established for education)
- `healthcareSubType` rule (parallel to `educationSubType`)
- `clinicalSpecialty` rule (parallel to `teachingSubject`)
- `requireAadhaarVerified: boolean` — pre-filter rejects freelancers without verified Aadhaar when true

**Cruise Mode** (freelancer-side): healthcare freelancers evaluating **technology** jobs unchanged; evaluating healthcare jobs uses clinical context in AI evaluator (future: healthcare job posts with `professionCategory: 'healthcare'`).

> **Superseded 2026-08-21:** `spec/domain-job-visibility/` hard-locks Cruise Mode and the freelancer job board to the onboarded profession. Healthcare freelancers no longer evaluate or see technology jobs.

Implementation touches `talentSearchUtils.ts`, `talentSearchEvaluator.ts`, `cruiseModeUtils.ts` — **Phase 4** after profile + credential Phase 1 ship.

---

### Module 10 — Agreement & Employer Verification Hooks

- Agreement template picker should eventually include **healthcare/locum** clauses (shift coverage, indemnity, clinical governance). Deferred to `spec/healthcare-credential-verification/` Phase 2 or a small `healthcare-agreement-templates` follow-up.
- Employer Verification (`employer_documents.business_licence`) already notes regulated sectors (education, healthcare). Hospitals/clinics posting healthcare jobs should be prompted to upload **business licence / clinical establishment registration** — informational in Phase 1, not gating.

---

### Module 11 — Registration Expiry & Credential Expiry Tracking

Reuse `spec/credential-expiry-tracking/` infrastructure:

- `registrationExpiry` on profile → same alert stages as `teachingLicenceExpiry`
- `aadhaar` documents → typically no expiry; `expiryDate` nullable
- `medical_registration_certificate` / `nursing_registration_certificate` → freelancer-supplied `expiryDate` on document row when Phase 2 ships
- Talent Vault removal when **legally required** registration expires (physician + nurse with mandatory registration cert in Phase 2) — mirror `school_teacher` teaching licence rule

---

## Non-Goals

- Prescribing, EMR integration, or clinical workflow (orders, notes, telemedicine video)
- Aadhaar OTP / UIDAI API integration — document upload + AI vision only in Phase 1
- Cross-border credential equivalency (INC foreign nurse equivalency workflow)
- Renaming "Freelancer" → "Clinician" in global UI copy
- Stripe / payment rails changes
- Token tracking on freelancer routes
- Replacing or merging Education tutor flow — tutors remain under `education`

---

## Build Order Recommendation

| Sprint | Deliverable |
|---|---|
| 1 | Phase 1 DB + extend enums + healthcare profile columns |
| 2 | Backend filters, AI context, OpenAPI + codegen, Aadhaar document type |
| 3 | Frontend onboarding, profile section, Vault filters, rate `/shift` |
| 4 | TalentSearch/Cruise healthcare rules |
| 5 | Phase 2 credentials (`experience_certificate`, degree, registration certs) via `healthcare-credential-verification/` |

---

## Companion Specs

| Spec | Relationship |
|---|---|
| `spec/teaching-professional-profile/` | **Prerequisite** — shared `professionCategory`, `rateType`, onboarding pattern |
| `spec/onboarding-scaffolding/` | **Prerequisite** — mandatory Aadhaar at registration |
| `spec/healthcare-credential-verification/` | **Optional split** — Phase 2 medical docs if not in Phase 5 tasks |
| `spec/credential-expiry-tracking/` | **Reuse** — expiry scan for registration + documents |
| `spec/document-verification/` | **Extend** — Phase 2 healthcare `documentType` values |
| `spec/employee-verification/` | **Parallel** — employer hospital/clinic verification |

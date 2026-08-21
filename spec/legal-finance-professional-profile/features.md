# TalentLock — Features Specification: Legal & Finance Professional Profile

## Overview

TalentLock today supports **Technology**, **Education**, and **Healthcare** as first-class verticals (`professionCategory`). Legal and finance professionals already appear in `FIELDS_OF_WORK` (e.g. "Law & Legal Services", "Accounting & Finance", "Tax & Audit", "Financial Planning & Investment") but still onboard as **Technology** unless they pick Education or Healthcare — the same data-model mismatch Healthcare just fixed.

This feature is the **Legal & Finance vertical expansion**: it adds `professionCategory: 'legal_finance'`, structured practice-profile fields, India-first enrolment capture, Talent Vault discovery, AI matching context, job posting rate defaults, and TalentSearch / Cruise hooks — **without changing the universal 7-step flow** (Post → Discover → Meet → Book → Agree → Deliver → Review).

**Geographic focus (Phase 1):** India. Credential names align with the Bar Council of India / State Bar Councils (advocates), ICAI (Chartered Accountants), ICSI (Company Secretaries), GSTN GST Practitioner enrolment (tax), and SEBI / NISM (financial advisers). Schema is additive so UK SRA / US bar / CPA patterns can later use the same `enrolmentBody` free-text field.

**Prerequisites:**
- `spec/teaching-professional-profile/` — shared `professionCategory` + `rateType` columns and multi-category onboarding pattern.
- `spec/healthcare-professional-profile/` — fourth-category card pattern, Aadhaar Vault gate, `aadhaarVerificationStatus` denormalized column, masked enrolment/registration serializer.
- `spec/onboarding-scaffolding/` — **mandatory Aadhaar for all freelancers** at registration (`documentType: aadhaar`). Legal & Finance does **not** re-implement Aadhaar upload — it **inherits** this platform gate.

**Credential split (binding, per product request):**
- **Now (registration):** Aadhaar only — same as Technology / Education / Healthcare.
- **After signup:** professional documents (Bar enrolment, ICAI/ICSI membership, GST practitioner, SEBI/NISM, experience letter) — checklist on `/profile`, upload API in Phase 5. Do **not** block finish-registration on these files.

This spec **extends** Teaching + Healthcare + onboarding scaffolding rather than replacing them.

---

## Feature Modules

### Module 1 — Profession Category Extension

```ts
type ProfessionCategory = 'technology' | 'education' | 'healthcare' | 'legal_finance';
```

- Existing rows remain `technology` / `education` / `healthcare` — **zero behaviour change**.
- New freelancers choose **Legal & Finance** during onboarding (fourth card).
- `professionCategory` on `freelancer_profiles` and `job_requirements` already exists; OpenAPI enum gains `'legal_finance'`.
- Legal & Finance–specific profile columns are **nullable** and only meaningful when `professionCategory === 'legal_finance'`.

---

### Module 2 — Legal & Finance Sub-Type

```ts
type LegalFinanceProfessionType =
  | 'advocate'              // State Bar Council enrolled advocate / litigating lawyer
  | 'chartered_accountant'  // ICAI member (CA)
  | 'company_secretary'     // ICSI member (CS)
  | 'tax_consultant'        // GST / direct-tax practice (may also hold CA/advocate credentials)
  | 'financial_advisor';    // SEBI RIA / NISM / independent financial planner
```

For `technology`, `education`, and `healthcare` freelancers, `legalFinanceProfessionType` is always `null`.

**Not a sub-type in Phase 1:** Cost Accountant (CMA / ICMAI) — capture via `highestQualification: 'cma_final'` under CA or tax. Management consultant without a statutory enrolment stays in **Technology** (`fieldOfWork: Business Consulting`).

---

### Module 3 — Legal & Finance Profile Fields

New structured fields on `freelancer_profiles`, populated only for this vertical:

| Field | Type | Example |
|---|---|---|
| `legalFinanceProfessionType` | enum | `'advocate'` |
| `practiceAreas` | string array | `["Corporate", "M&A", "GST"]` |
| `practiceSettings` | string array | `["Law firm", "Chambers", "Independent practice"]` |
| `yearsPracticeExperience` | integer | `9` |
| `highestQualification` | enum | `'llb'`, `'ca_final'`, `'cs_professional'`, … |
| `qualificationSpecialization` | string | `"Indirect tax"` |
| `qualificationInstitution` | string | `"NLSIU Bangalore"` / `"ICAI"` |
| `enrolmentBody` | string | `"Bar Council of Maharashtra & Goa"` / `"ICAI"` |
| `enrolmentNumber` | string | Stored full; **API masks** for employers (e.g. `MAH/****4521`) |
| `enrolmentExpiry` | date nullable | COP / membership renewal date |
| `enrolmentAlertStage` | enum | `none \| 90d \| 30d \| 7d \| expired` (reuse teaching/healthcare licence pattern) |
| `courtJurisdictions` | string array nullable | `["Bombay High Court", "NCLT Mumbai"]` — advocates; optional for others |
| `preferredEngagementMode` | enum | `'in_person' \| 'remote' \| 'both'` |
| `aadhaarVerificationStatus` | enum | **Reuse existing column** from Healthcare spec — do not duplicate |
| `location` | string nullable | **Reuse existing column** from Teaching spec — do not duplicate |

**Skills vs practice areas:** `practiceAreas` holds structured legal/finance domains. Existing `skills` may still hold tools/languages (e.g. `"GST portal"`, `"Ind-AS"`, `"English / Hindi"`).

**Highest qualification enum (India-first):**

```ts
type LegalFinanceQualification =
  | 'llb'
  | 'llm'
  | 'ca_final'
  | 'cs_professional'
  | 'cma_final'
  | 'mba_finance'
  | 'cfa'
  | 'other';
```

Do **not** reuse Healthcare `registrationCouncil` / `registrationNumber` columns — a freelancer who later switches category would collide. Legal enrolment is a separate column set.

---

### Module 4 — Credential Documents (Phased)

Uses the existing `documents` table. Phase 1 does **not** add new upload types to the API.

#### Phase 1 — Mandatory now (registration)

| Document type | Purpose | Mandatory for | Owner spec |
|---|---|---|---|
| `aadhaar` | UIDAI identity document | **All** Legal & Finance sub-types | `spec/onboarding-scaffolding/` (platform-wide — already live) |

**Gating (Phase 1):**
- **Registration:** Cannot finish freelancer registration without Aadhaar upload confirmed (onboarding scaffolding — all categories equally).
- **Talent Vault (legal_finance-only stricter gate):** Profiles appear in Vault only when `completenessScore >= 60` **AND** `aadhaarVerificationStatus === 'verified'` — same pattern as Healthcare. See `plan.md` Q2.
- Rejected Aadhaar blocks Vault until re-upload + re-verification.

**Privacy (binding):** identical to Healthcare — never store the 12-digit Aadhaar on the profile; mask `enrolmentNumber` for employers; AI `aiNotes` admin-only.

#### Phase 2 — After signup (document types — **Phase 5 of this spec ships the uploads**)

These appear on `/profile` as a **credential checklist**. Until Phase 5 they show **"After signup — coming soon"**. After Phase 5 they are **interactive uploads**. They are **not** required to finish registration. Missing Phase 2 files do **not** hide a legal/finance profile from Talent Vault (verified Aadhaar remains the Vault gate).

| Document type | Purpose | Typical for |
|---|---|---|
| `experience_certificate` | Firm / chambers / employer experience letter | All sub-types (reuse string if Healthcare Phase 2 already defined it) |
| `bar_enrolment_certificate` | State Bar Council enrolment / sanad | `advocate` |
| `certificate_of_practice` | BCI Certificate of Practice / ICAI or ICSI COP | `advocate`, `chartered_accountant`, `company_secretary` |
| `icai_membership_certificate` | ICAI membership certificate | `chartered_accountant` |
| `icsi_membership_certificate` | ICSI membership certificate | `company_secretary` |
| `gst_practitioner_certificate` | GSTN GST Practitioner enrolment evidence | `tax_consultant` |
| `sebi_nism_certificate` | SEBI RIA registration or NISM pass certificate | `financial_advisor` |

#### Phase 3 — Recommended / specialist (future)

| Document type | Purpose |
|---|---|
| `aibe_certificate` | All India Bar Examination pass (advocates enrolled after AIBE mandate) |
| `professional_indemnity_insurance` | PI policy (law / CA firms) |
| `udyin_msme` | Udyam registration for independent practice |

#### Checklist lookup (UI widget on `/profile` after signup)

```ts
export const REQUIRED_DOCUMENTS_BY_LEGAL_FINANCE_TYPE: Record<
  LegalFinanceProfessionType,
  { required: string[]; recommended: string[]; futureRequired: string[] }
> = {
  advocate: {
    required: ['aadhaar'],
    futureRequired: ['bar_enrolment_certificate', 'certificate_of_practice', 'experience_certificate'],
    recommended: ['aibe_certificate', 'professional_indemnity_insurance'],
  },
  chartered_accountant: {
    required: ['aadhaar'],
    futureRequired: ['icai_membership_certificate', 'certificate_of_practice', 'experience_certificate'],
    recommended: ['professional_indemnity_insurance'],
  },
  company_secretary: {
    required: ['aadhaar'],
    futureRequired: ['icsi_membership_certificate', 'certificate_of_practice', 'experience_certificate'],
    recommended: ['professional_indemnity_insurance'],
  },
  tax_consultant: {
    required: ['aadhaar'],
    futureRequired: ['gst_practitioner_certificate', 'experience_certificate'],
    recommended: ['icai_membership_certificate', 'bar_enrolment_certificate'],
  },
  financial_advisor: {
    required: ['aadhaar'],
    futureRequired: ['sebi_nism_certificate', 'experience_certificate'],
    recommended: ['professional_indemnity_insurance'],
  },
};
```

**Research basis (India):** Advocates are enrolled with a **State Bar Council**; a **Certificate of Practice** is required to appear. CAs hold **ICAI membership** and typically a **Certificate of Practice** for public practice. Company Secretaries are members of **ICSI**. GST practitioners enrol on the **GSTN** portal. Financial advisers may hold **SEBI RIA** registration and/or **NISM** certifications. Aadhaar is already the platform identity gate.

---

### Module 5 — Onboarding Flow Change

Category cards become four options:

| Card | Sub-text |
|---|---|
| Technology | Software, design, data, DevOps |
| Education | Teaching, tutoring, lecturing |
| Healthcare | Doctors, nurses, allied health, care |
| **Legal & Finance** | Advocates, CAs, CS, tax, advisers |

When **Legal & Finance** is selected:

1. Sub-type picker (5 options)
2. **Legal & Finance Details** section (chips + enrolment fields) — mirror `HealthcareDetailsSection`
3. Aadhaar remains on the unified registration form (`FreelancerDocumentOnboardingStep`) — **not** a Legal & Finance-only step
4. Final `PUT /api/freelancers/me` includes `professionCategory: 'legal_finance'` + Module 3 fields

Employers unchanged — they set `professionCategory` on the **job**.

---

### Module 6 — Talent Vault Discovery

```
?professionCategory=legal_finance
?practiceArea=GST
```

- Omitted → unchanged (all categories)
- `practiceArea` → case-insensitive match on `practiceAreas` array (same SQL as `teachingSubject` / `clinicalSpecialty`)

**Vault gating:** `completenessScore >= 60` AND `aadhaarVerificationStatus === 'verified'` for `legal_finance` rows. Reuse Healthcare's denormalized Aadhaar column + sync on document review.

UI: fourth filter chip **Legal & Finance**. Selecting it reveals optional **Practice area** text filter.

---

### Module 7 — AI Matching Context

When `job_requirements.professionCategory === 'legal_finance'`:

> "This is a legal or finance hiring request. Evaluate practice areas, enrolment body and number status, years of practice, court jurisdictions (if advocate), and Aadhaar/credential verification as primary match criteria instead of technical skills, teaching subjects, or clinical specialties."

For other categories, this branch returns `""`. Extend `buildProfessionContext()`; existing branches unchanged.

---

### Module 8 — Job Posting Rate Types

Reuse existing `hourly` and `per_day`. **Do not** add a new rate enum in Phase 1.

```ts
profileDefaultRateType('legal_finance') → 'per_day'
```

Job form: when Legal & Finance is selected, rate type picker defaults to **per day** (briefing / retainer-day pattern). Employers may choose hourly.

`per_assignment` / `per_retainer` deferred — not in this spec.

---

### Module 9 — TalentSearch & Cruise Mode

Additive TalentSearch rule fields:

```ts
legalFinanceSubType?: LegalFinanceProfessionType | null;
practiceArea?: string | null;
requireAadhaarVerified?: boolean; // already exists from Healthcare — reuse, do not duplicate
```

Pre-filter after healthcare rules. Cruise Mode: legal_finance freelancers evaluating technology jobs unchanged.

> **Superseded 2026-08-21:** `spec/domain-job-visibility/` — legal/finance freelancers no longer see or Cruise-match technology (or other) jobs.

---

### Module 10 — Agreement & Employer Verification Hooks

- Agreement templates should eventually include **engagement letter / Vakalatnama-adjacent** clauses (conflict, privilege, COP status). **Still deferred** — not in Phase 5.
- Employer `business_licence` already notes regulated sectors. Law firms / CA firms posting jobs should be **prompted** (not gated) to upload firm registration / ICAI firm number.

---

### Module 11 — Enrolment Expiry

Reuse `spec/credential-expiry-tracking/`:

- `enrolmentExpiry` → same alert ladder as `teachingLicenceExpiry` / healthcare `registrationExpiry`
- Phase 2 COP / membership documents: freelancer-supplied `expiryDate` on the document row (Phase 5)
- Vault removal when **legally required** COP / membership expiry has passed: `advocate`, `chartered_accountant`, and `company_secretary` with `enrolmentExpiry` in the past — mirror school-teacher licence (`plan.md` Q9). Tax consultants and financial advisers are **not** dropped for enrolment expiry.

---

## Non-Goals

- Case management, e-filing, GST return filing, or wealth-management tools
- Aadhaar OTP / UIDAI API
- Blocking registration on Bar / ICAI / GST documents (those are **after signup**)
- Cross-border equivalency (US bar, ACCA)
- Renaming "Freelancer" → "Counsel" / "Practitioner" in global copy
- Stripe / payment rails
- Token tracking on freelancer routes
- Merging advocates into Healthcare or CAs into Technology
- New `rateType` values (`per_assignment`, `per_retainer`)

---

## Build Order Recommendation

| Sprint | Deliverable |
|---|---|
| 1 | DB + enums + legal_finance profile columns |
| 2 | Backend filters, AI context, OpenAPI + codegen; reuse Aadhaar sync |
| 3 | Frontend: fourth onboarding card, details section, Vault, Post Job default `/day` |
| 4 | TalentSearch rules (`legalFinanceSubType`, `practiceArea`) |
| 5 | After-signup document uploads **in this folder** — Bar / ICAI / ICSI / GST / NISM / COP / experience letter; AI review; scoped Vault drop on expired advocate/CA/CS enrolment |

---

## Companion Specs

| Spec | Relationship |
|---|---|
| `spec/teaching-professional-profile/` | **Prerequisite** — `professionCategory`, onboarding cards |
| `spec/healthcare-professional-profile/` | **Prerequisite** — Aadhaar Vault gate, fourth-card pattern, mask helper |
| `spec/onboarding-scaffolding/` | **Prerequisite** — mandatory Aadhaar at registration |
| `spec/legal-finance-credential-verification/` | **Superseded** — Phase 5 lives in this folder, not a separate spec |
| `spec/credential-expiry-tracking/` | **Reuse** — enrolment expiry alerts |
| `spec/document-verification/` | **Extend** — Phase 5 `documentType` values |
| `spec/employee-verification/` | **Parallel** — firm / CA firm licence prompt |

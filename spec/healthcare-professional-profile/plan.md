# TalentLock — Implementation Plan: Healthcare Professional Profile

> **Status: APPROVED — Ready for implementation**
> Resolves open questions from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` conflict, **this file wins**.

---

## Prerequisite Gate (Task 0)

Before any Healthcare work:

```bash
grep "profession_category" lib/db/src/schema/freelancerProfiles.ts
grep "profession_category" lib/db/src/schema/jobRequirements.ts
grep "aadhaar" artifacts/api-server/src/lib/documentConstants.ts
```

If `profession_category` missing → execute Teaching Phase 1 first.
If `aadhaar` missing from `DOCUMENT_TYPES` → execute onboarding scaffolding first.

---

## Resolved Questions

### Q1 — Aadhaar Privacy

**Decision: Document-only storage; no full Aadhaar number in profile or employer APIs.**

```ts
// Allowed on freelancer_profiles:
aadhaarVerificationStatus: text // not_uploaded | uploaded | verified | rejected | expired
aadhaarLastFour: text // nullable, optional, support-only — never public profile

// NOT allowed:
aadhaarNumber: never
```

Employer-facing `FreelancerProfile` schema exposes `aadhaarVerificationStatus` as read-only derived field (updated when `documents` row for `aadhaar` changes). `registrationNumber` serialized with mask helper:

```ts
function maskRegistrationNumber(value: string | null): string | null {
  if (!value || value.length < 4) return value;
  return value.slice(0, 2) + "****" + value.slice(-4);
}
```

---

### Q2 — Aadhaar Mandatory Gating

**Decision: Registration gate (platform) + stricter Healthcare Vault gate.**

1. **Registration** — unchanged onboarding scaffolding: finish blocked until Aadhaar upload confirmed (all freelancers).
2. **Talent Vault** — healthcare rows require Aadhaar `status = 'verified'` (stricter than registration, which only requires upload):

```ts
// Join or denormalized aadhaarVerificationStatus === 'verified'
conditions.push(
  or(
    ne(freelancerProfiles.professionCategory, "healthcare"),
    eq(freelancerProfiles.aadhaarVerificationStatus, "verified"),
  ),
);
```

3. `aadhaarVerificationStatus` on `freelancer_profiles` synced when `documents` row for `aadhaar` changes (mirror `dbsCheckStatus` for education).

---

### Q3 — `per_shift` RateType

**Decision: Additive enum value.**

```ts
export type RateType =
  | "hourly"
  | "per_day"
  | "per_session"
  | "per_course"
  | "per_shift";
```

```ts
const RATE_UNIT_LABELS: Record<RateType, string> = {
  hourly: "/hr",
  per_day: "/day",
  per_session: "/session",
  per_course: "/course",
  per_shift: "/shift",
};
```

`profileDefaultRateType('healthcare')` returns `'per_shift'` (parallel to education → `per_session`).

---

### Q4 — Onboarding Layout

**Decision:** `grid-cols-1 md:grid-cols-3` for three category cards. Healthcare card uses emerald accent (see `UI.md`).

---

### Q5 — `clinicalSpecialty` Filter

**Decision:** Structured array filter only — duplicate `teachingSubject` SQL pattern on `clinicalSpecialties`.

---

### Q6 — Phase 2 Document Types

**Decision:** Define in `REQUIRED_DOCUMENTS_BY_HEALTHCARE_TYPE` constant and admin AI prompt registry. Upload API accepts **only `aadhaar`** in Phase 1:

```ts
export const HEALTHCARE_DOCUMENT_TYPES_PHASE1 = ["aadhaar"] as const;
export const HEALTHCARE_DOCUMENT_TYPES_PHASE2 = [
  "experience_certificate",
  "mbbs_degree",
  "medical_registration_certificate",
  "nursing_degree",
  "nursing_registration_certificate",
] as const;
```

OpenAPI `DocumentsConfirmBodyDocumentType` extended with `aadhaar` only until Phase 2 task explicitly adds the rest.

---

### Q7 — Allied Health Granularity

**Decision:** Single `allied_health` sub-type for Phase 1.

---

## Schema — Healthcare Columns (additive, nullable)

**File:** `lib/db/src/schema/freelancerProfiles.ts`

```ts
healthcareProfessionType: text("healthcare_profession_type"),
clinicalSpecialties: text("clinical_specialties").array(), // match skills column type
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
aadhaarLastFour: text("aadhaar_last_four"), // nullable
preferredCareMode: text("preferred_care_mode"),
// location — REUSE existing column
```

**File:** `lib/db/src/schema/healthcareProfileTypes.ts` (new — mirror `teachingProfileTypes.ts`)

Export types, enums, `REQUIRED_DOCUMENTS_BY_HEALTHCARE_TYPE`, mask helpers.

**No new columns on `job_requirements`** beyond extending enum values for `professionCategory` and `rateType` in OpenAPI (DB columns already exist from Teaching spec).

---

## AI Matching — Healthcare Context Injection

Extend `buildProfessionContext()`:

```ts
export function buildProfessionContext(job: { professionCategory: string }): string {
  if (job.professionCategory === "education") {
    return "This is an education hiring request. Evaluate teaching subjects, levels, qualifications, and DBS/licence status as the primary match criteria instead of technical skills.\n\n";
  }
  if (job.professionCategory === "healthcare") {
    return "This is a healthcare hiring request. Evaluate clinical specialties, care settings, registration council status, years of experience, and Aadhaar/credential verification as primary match criteria instead of technical skills or teaching subjects.\n\n";
  }
  return "";
}
```

Regression: technology jobs still get `""` — byte-identical prompts.

---

## Aadhaar Document — AI Review Prompt (Phase 1)

Add to document review router (mirror `documentReview.ts` branching):

```
Document type: Aadhaar (India UIDAI identity document).
Verify: (1) document appears to be a genuine Aadhaar card or official e-Aadhaar PDF,
(2) name and photo region present, (3) QR/hologram region visible if on card photo,
(4) document not obviously tampered.
Do NOT extract or return the full 12-digit Aadhaar number in your response.
If readable, you may note only whether a number appears present and last 4 digits for admin cross-check.
Verdict: verified | needs_review | rejected with plain-English employerNotes-safe summary.
```

---

## Profile Completeness

**Decision: Do NOT modify `calculateCompletenessScore()` weights for healthcare fields.**

Aadhaar and registration gates are **separate** from completeness score (consistent with Education spec).

---

## TalentSearch Rules Extension

```ts
// talent_search_configs.rules jsonb — additive fields
healthcareSubType?: HealthcareProfessionType | null;
clinicalSpecialty?: string | null;
requireAadhaarVerified?: boolean; // default false; pre-filter when true
```

Pre-filter in `talentSearchPreFilterReason()` after education rules block.

---

## Onboarding Flow

```tsx
// Freelancers: role → profession_category (3 cards) → profile (+ healthcare section + aadhaar upload)
// Healthcare final submit requires aadhaar document confirmed
```

State held client-side until `PUT /api/freelancers/me` + documents confirm — no new profile endpoint.

---

## India Credential Reference (for Phase 2 prompts)

| Role | Authority | Primary legal credential |
|---|---|---|
| Physician | NMC + State Medical Council | SMC registration / NMR certificate |
| Physician registration inputs | NMR portal | Aadhaar + MBBS degree + SMC registration cert |
| Nurse | State Nursing Registration Council | RN/RM registration certificate |
| Nurse education | INC (standards) / SNRC (licence) | Nursing degree/diploma + SNRC registration |

Experience certificate: hospital-issued letter on letterhead stating role, department, dates — standard for locum and foreign verification.

# TalentLock — Implementation Plan: Legal & Finance Professional Profile

> **Status: APPROVED — Ready for implementation**
> Resolves open questions from `clarify.md`.
> Phases 1–4 shipped on `main`. Remaining work is **Phase 5 (after-signup credentials)**.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` conflict, **this file wins**.

---

## Prerequisite Gate (Task 0)

```bash
grep "profession_category" lib/db/src/schema/freelancerProfiles.ts
grep "aadhaar" artifacts/api-server/src/lib/documentConstants.ts
grep "aadhaarVerificationStatus" lib/db/src/schema/freelancerProfiles.ts
grep "healthcare" lib/db/src/schema/teachingProfileTypes.ts
```

If `profession_category` missing → Teaching Phase 1 first.
If `aadhaar` missing from `DOCUMENT_TYPES` → onboarding scaffolding first.
If `aadhaarVerificationStatus` missing → Healthcare Phase 1 first (this spec reuses that column).

---

## Resolved Questions

### Q1 — Aadhaar Privacy

**Decision: Identical to Healthcare.** Document image in object storage; no full Aadhaar on profile; mask `enrolmentNumber` with `maskRegistrationNumber()` (rename-neutral helper already in `healthcareProfileTypes.ts` — import it, do not duplicate).

### Q2 — Aadhaar Mandatory Now; Professional Docs After Signup

**Decision:**

1. **Registration** — platform Aadhaar upload confirmed before `PUT /users/me` (all freelancers). Legal & Finance does not add a second identity document at signup.
2. **Talent Vault** — `legal_finance` rows require `aadhaarVerificationStatus === 'verified'` (same OR-gate as Healthcare):

```ts
conditions.push(
  or(
    and(
      ne(freelancerProfiles.professionCategory, "healthcare"),
      ne(freelancerProfiles.professionCategory, "legal_finance"),
    ),
    eq(freelancerProfiles.aadhaarVerificationStatus, "verified"),
  ),
);
```

Refactor the Healthcare-only `or(ne(..., "healthcare"), verified)` into a shared helper `requiresVerifiedAadhaarForVault(category)` that returns true for `healthcare` **and** `legal_finance`.

3. **After signup** — Phase 2 document types exist only in `REQUIRED_DOCUMENTS_BY_LEGAL_FINANCE_TYPE`. Profile checklist shows them as "Upload after you finish registration" / "Planned". Upload API **unchanged** until Phase 5.
4. Switching `professionCategory` to `legal_finance` without Aadhaar on file: registration already required Aadhaar, so the row should exist; Vault still waits for **verified**.

### Q3 — Rate Types

**Decision: No new enum value.** `profileDefaultRateType('legal_finance')` returns `'per_day'`. Job form shows hourly / per day (and existing education/healthcare types if the shared picker lists all). Default selected: per day.

### Q4 — Onboarding Layout

**Decision:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`. Legal & Finance card: navy border / slate selected state (`border-slate-800 ring-2 ring-slate-200 bg-slate-50`), Lucide `Scale` icon. See `UI.md`.

### Q5 — `practiceArea` Filter

**Decision:** Structured `practiceAreas` array match only — copy `clinicalSpecialty` SQL.

### Q6 — Phase 2 Types

```ts
export const LEGAL_FINANCE_DOCUMENT_TYPES_PHASE1 = ["aadhaar"] as const;
export const LEGAL_FINANCE_DOCUMENT_TYPES_PHASE2 = [
  "experience_certificate",
  "bar_enrolment_certificate",
  "certificate_of_practice",
  "icai_membership_certificate",
  "icsi_membership_certificate",
  "gst_practitioner_certificate",
  "sebi_nism_certificate",
] as const;
```

Do not add PHASE2 strings to `DOCUMENT_TYPES` until **Phase 5**. Phase 5 **does** add them (this Q6 list + OpenAPI). Q9 is the Vault drop only.

### Q7 — Sub-type granularity

**Decision:** Five types only (`advocate`, `chartered_accountant`, `company_secretary`, `tax_consultant`, `financial_advisor`).

### Q8 — Enrolment columns

**Decision: New columns.** Do not write legal enrolment into healthcare `registration_*` fields.

### Q9 — Expired COP / membership Vault drop

**Decision: Scoped, Phase 5 only.** Mirror school-teacher teaching licence:

```ts
not(
  and(
    eq(freelancerProfiles.professionCategory, "legal_finance"),
    inArray(freelancerProfiles.legalFinanceProfessionType, [
      "advocate",
      "chartered_accountant",
      "company_secretary",
    ]),
    isNotNull(freelancerProfiles.enrolmentExpiry),
    lt(freelancerProfiles.enrolmentExpiry, new Date()),
  ),
)
```

- Tax consultant / financial advisor: **never** dropped for `enrolmentExpiry`.
- Missing Phase 2 uploads: **never** dropped (Aadhaar verified remains the legal/finance Vault gate).
- Direct profile URLs unchanged.
- `enrolmentAlertStage` already resets when `enrolmentExpiry` changes on `PUT /freelancers/me`.

---

## Schema — Legal & Finance Columns (additive, nullable)

**File:** `lib/db/src/schema/freelancerProfiles.ts`

```ts
legalFinanceProfessionType: text("legal_finance_profession_type"),
practiceAreas: text("practice_areas").array(),
practiceSettings: text("practice_settings").array(),
yearsPracticeExperience: integer("years_practice_experience"),
legalFinanceHighestQualification: text("legal_finance_highest_qualification"),
legalFinanceQualificationSpecialization: text("legal_finance_qualification_specialization"),
legalFinanceQualificationInstitution: text("legal_finance_qualification_institution"),
enrolmentBody: text("enrolment_body"),
enrolmentNumber: text("enrolment_number"),
enrolmentExpiry: timestamp("enrolment_expiry", { withTimezone: true }),
enrolmentAlertStage: text("enrolment_alert_stage").notNull().default("none"),
courtJurisdictions: text("court_jurisdictions").array(),
preferredEngagementMode: text("preferred_engagement_mode"),
```

Qualification column names are prefixed `legalFinance*` so they do not collide with healthcare `highestQualification`.

**Reuse, do not add:** `aadhaarVerificationStatus`, `aadhaarLastFour`, `location`, `countryCode`, `currencyCode`.

**File:** `lib/db/src/schema/legalFinanceProfileTypes.ts` (new)

Export types, `REQUIRED_DOCUMENTS_BY_LEGAL_FINANCE_TYPE`, PHASE1/PHASE2 constants.

Update `ProfessionCategory` in `teachingProfileTypes.ts` (canonical enum) to include `'legal_finance'`.

**No new columns on `job_requirements`.**

---

## Serializers

`mapFreelancerProfileForApi` (or equivalent) masks `enrolmentNumber` with `maskRegistrationNumber()` whenever `maskRegistration !== false`. Omit `aadhaarLastFour` (already omitted).

---

## AI Matching

```ts
if (job.professionCategory === "legal_finance") {
  return "This is a legal or finance hiring request. Evaluate practice areas, enrolment body and number status, years of practice, court jurisdictions (if advocate), and Aadhaar/credential verification as primary match criteria instead of technical skills, teaching subjects, or clinical specialties.\n\n";
}
```

Technology still gets `""`.

---

## Aadhaar Sync

**No new sync function.** Healthcare `syncAadhaarVerificationStatus()` already updates the shared column. Vault helper must include `legal_finance`. Do not copy-paste a second sync.

When `enrolmentExpiry` changes on `PUT /freelancers/me`, reset `enrolmentAlertStage` to `'none'` (mirror teaching licence / healthcare registration expiry).

---

## Profile Completeness

**Do NOT modify `calculateCompletenessScore()`.**

---

## TalentSearch Rules Extension

```ts
legalFinanceSubType?: LegalFinanceProfessionType | null;
practiceArea?: string | null;
// requireAadhaarVerified already on TalentSearchRules from Healthcare — reuse
```

`defaultTalentSearchRules()` / `emptyTalentSearchRules()` / OpenAPI `TalentSearchRules` / parse prompt all gain the two new fields. `requireAadhaarVerified` already exists — do not add a second flag.

Pre-filter after healthcare block:

```ts
if (rules.legalFinanceSubType && freelancer.legalFinanceProfessionType !== rules.legalFinanceSubType) {
  return `Legal & finance sub-type does not match (requires ${rules.legalFinanceSubType})`;
}
if (rules.practiceArea?.trim()) {
  const needle = rules.practiceArea.trim().toLowerCase();
  const areas = freelancer.practiceAreas ?? [];
  if (!areas.some((s) => s.toLowerCase().includes(needle))) {
    return `Practice area does not match (requires ${rules.practiceArea})`;
  }
}
```

Normalise freelancer must copy `legalFinanceProfessionType`, `practiceAreas`, `practiceSettings`, `courtJurisdictions`.

---

## Onboarding Flow

```
Role → 4 category cards → Legal & Finance sub-type → shared profile + LegalFinanceDetailsSection + Aadhaar
```

Finish registration requires Aadhaar confirm. Does **not** require enrolment documents.

---

## India Credential Reference (Phase 5 prompts)

| Role | Authority | Primary legal credential (after signup) |
|---|---|---|
| Advocate | State Bar Council + BCI COP | Enrolment / sanad + Certificate of Practice |
| CA | ICAI | Membership certificate + COP for public practice |
| CS | ICSI | Membership certificate + COP |
| Tax consultant | GSTN | GST Practitioner enrolment (optional CA/Bar docs) |
| Financial adviser | SEBI / NISM | RIA registration and/or NISM certificate |

Experience letter: firm/chambers letterhead, role, dates — same `experience_certificate` type as Healthcare Phase 2+.

---

## Phase 5 — After-signup credential uploads

**No new tables.** Reuse `documents` UNIQUE `(freelancerId, documentType)`.

### AI review prompts

Extend `buildDocumentReviewUserPrompt()`:

| `documentType` | Prompt focus |
|---|---|
| `experience_certificate` | Same as Healthcare — letterhead, role, dates (shared type) |
| `bar_enrolment_certificate` | State Bar Council enrolment / sanad; enrolment number region; not Aadhaar |
| `certificate_of_practice` | BCI / ICAI / ICSI Certificate of Practice; holder name region; not a visiting card |
| `icai_membership_certificate` | ICAI membership certificate |
| `icsi_membership_certificate` | ICSI membership certificate |
| `gst_practitioner_certificate` | GSTN GST Practitioner enrolment screenshot or certificate; GSTIN region may be present — do not require storing GSTIN on profile |
| `sebi_nism_certificate` | SEBI RIA acknowledgement or NISM pass certificate |

Never return full enrolment numbers in `employerNotes`.

Recommended Phase 3 types (`aibe_certificate`, `professional_indemnity_insurance`, `udyin_msme`) stay **out** of `DOCUMENT_TYPES`.

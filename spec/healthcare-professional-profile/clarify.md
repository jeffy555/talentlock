# TalentLock — Clarification & Verification: Healthcare Professional Profile

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `professionCategory` + `rateType` on `freelancer_profiles` / `job_requirements` | `spec/teaching-professional-profile/` + `lib/db/src/schema/freelancerProfiles.ts` |
| `location` column on `freelancer_profiles` | Teaching spec — reuse, do not duplicate |
| `documents` table with `documentType`, AI review, admin queue | `spec/document-verification/` |
| `teachingLicenceExpiry` + `teachingLicenceAlertStage` expiry pattern | `spec/credential-expiry-tracking/` |
| `buildProfessionContext()` for education AI prompts | `artifacts/api-server/src/lib/professionContext.ts` |
| TalentSearch pre-filter by `professionCategory` / `educationSubType` | `talentSearchUtils.ts` |
| `formatRate()` / `rateUnitLabel()` centralised | `artifacts/talentlock/src/lib/rateFormatUtils.ts` |
| Onboarding profession category step (Technology / Education) | `Onboarding.tsx` |
| `FIELDS_OF_WORK` includes Medicine, Nursing | `artifacts/talentlock/src/lib/fields.ts` |
| Employer `business_licence` for regulated sectors | `spec/employee-verification/features.md` |
| Onboarding mandatory Aadhaar (`documentType: aadhaar`) | `spec/onboarding-scaffolding/` + `FreelancerDocumentOnboardingStep.tsx` |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Aadhaar Storage & Privacy

**Question:** UIDAI and India's DPDP Act restrict how Aadhaar numbers are stored and displayed. What may TalentLock persist?

**Recommendation:**
- Store **document image/PDF** in GCS via existing presigned upload path.
- **Do not** persist full 12-digit Aadhaar in `freelancer_profiles` or employer API responses.
- Optional nullable `aadhaarLastFour` (char(4)) for support dedup — never on public profile.
- AI `aiNotes` admin-only; employers see `aadhaarVerificationStatus` enum only.
- Mask `registrationNumber` in list/detail API (show last 4–6 chars).

**Must resolve before:** Task 1.x schema + Task 2.x API serializers.

---

### Q2 — Aadhaar Gating Strictness

**Question:** User requires Aadhaar "mandatory for now." What exactly is blocked without it?

**Options:**
- **(A)** Onboarding cannot complete (hard block on final step)
- **(B)** Profile saves but Talent Vault hides profile (`completenessScore` gate + Aadhaar gate)
- **(C)** Both A and B

**Recommendation:** **(C)** — onboarding final submit requires `POST /api/documents/confirm` for `aadhaar` succeeded; Vault query adds `aadhaarVerificationStatus NOT IN ('not_uploaded', 'rejected')`.

**Must resolve before:** Phase 3 onboarding UI + `GET /api/freelancers` filter.

---

### Q3 — `per_shift` RateType Backward Compatibility

**Question:** `rateType` enum today is `hourly | per_day | per_session | per_course`. Adding `per_shift` touches OpenAPI, Zod, `formatRate()`, job forms, agreements.

**Recommendation:** Add `per_shift` as additive enum value; `formatRate()` defaults unknown/null to `hourly`; existing rows unchanged.

**Must resolve before:** OpenAPI codegen + `rateFormatUtils.ts`.

---

### Q4 — Healthcare Onboarding vs Multi-Category Picker Layout

**Question:** Onboarding currently shows 2 category cards (Technology / Education). Healthcare adds a third card.

**Options:**
- **(A)** 3-column grid on desktop (`grid-cols-3`)
- **(B)** 2+1 layout (Technology + Education row, Healthcare full width below)
- **(C)** Vertical list of 3 options on mobile-first stack

**Recommendation:** **(C)** stack on mobile, **(A)** `grid-cols-3` on `md+` — see `UI.md`.

**Must resolve before:** Phase 3 UI.

---

### Q5 — `clinicalSpecialty` Filter vs Keyword `?q=`

**Question:** Should `?clinicalSpecialty=` duplicate `?q=` keyword search?

**Recommendation:** **No.** `clinicalSpecialty` filters structured `clinicalSpecialties` array only (exact teachingSubject pattern). `?q=` continues to search bio/skills/tagline across all categories.

---

### Q6 — Phase 2 Document Types in API

**Decision (updated 2026-08-21):** Phase 2+ **does** add types to `DOCUMENT_TYPES` / OpenAPI / upload-confirm. Registration upload remains `aadhaar` only. Phase 2+ files never block `PUT /users/me`.

**Must resolve before:** Phase 5 document upload routes — **resolved in `plan.md` Q6 / Q8.**

---

### Q7 — Allied Health & Care Worker Scope

**Question:** How granular should `allied_health` be?

**Recommendation:** Single sub-type for Phase 1; `clinicalSpecialties` + `highestQualification` carry discipline (Physiotherapy, Radiology). Split sub-types (physiotherapist, pharmacist) only if onboarding analytics show volume — defer.

---

### Q8 — Expired medical / nursing registration vs Talent Vault

**Question:** School-teacher Vault exclusion is scoped to expired `teachingLicenceExpiry`. Should physician/nurse profiles drop from Vault when SMC/SNRC registration expires?

**Recommendation:** **Yes, scoped.** Same pattern as school teachers: only `physician` | `registered_nurse` | `nurse_practitioner` with a non-null `registrationExpiry` in the past are excluded. Allied health and care workers are never dropped for registration expiry. Direct `/freelancers/:id` and `/f/:id` stay visible. Missing Phase 2+ uploads do **not** hide from Vault.

**Must resolve before:** Phase 5 Vault filter — **resolved in `plan.md` Q8.**

---

## ⚠️ Risks & Notes

### Risk 1 — Teaching Spec Not Yet Merged

If `professionCategory` columns do not exist on main, this spec's Phase 1 must include Teaching schema columns OR be blocked until Teaching Phase 1 lands.

**Mitigation:** `task.md` Task 0 verifies columns exist; if missing, execute Teaching Phase 1 tasks 1.2–1.3 first.

### Risk 2 — Aadhaar Already Platform-Wide

`aadhaar` document type and mandatory registration upload already ship via onboarding scaffolding. This spec does **not** add Aadhaar to `documentConstants` again.

**Mitigation:** Healthcare Vault gate joins `documents` where `documentType = 'aadhaar'` OR uses denormalized `aadhaarVerificationStatus` synced on document review. Healthcare credential checklist references existing Aadhaar row.

### Risk 3 — Healthcare Completeness Score

Education deliberately did **not** extend `calculateCompletenessScore()`. Healthcare Aadhaar gating is separate from completeness score.

**Mitigation:** Vault gate = `completenessScore >= 60` AND Aadhaar gate (Q2). Do not fold Aadhaar into completeness weights without product sign-off.

### Risk 4 — Cross-Vertical Freelancer Migration

A nurse who registered as Technology with `fieldOfWork: Nursing` will not auto-migrate.

**Mitigation:** Profile edit allows switching `professionCategory` to healthcare (with warning + Aadhaar step). No automatic backfill.

### Risk 5 — Codegen & Enum Extension

Adding `healthcare` to `ProfessionCategory` and `aadhaar` to document types requires full OpenAPI → codegen → typecheck before frontend.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Aadhaar privacy / storage | Schema + API serializers |
| Q2 | Aadhaar gating strictness | Onboarding + Vault filter |
| Q3 | `per_shift` enum | OpenAPI + rateFormatUtils |
| Q6 | Phase 2+ doc types in API enum | Document upload routes |
| Q8 | Expired SMC/SNRC Vault drop | Vault filter (Phase 5) |
| — | Teaching prerequisite | Task 0 gate |

Q4, Q5, Q7 resolved in `plan.md` / `UI.md`. Q6 and Q8 are binding for Phase 2+ (this spec Phase 5).

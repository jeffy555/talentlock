# TalentLock — Clarification & Verification: Legal & Finance Professional Profile

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `professionCategory` includes `technology` \| `education` \| `healthcare` | `lib/db/src/schema/teachingProfileTypes.ts`, Healthcare spec |
| `rateType` includes `hourly` \| `per_day` \| `per_session` \| `per_course` \| `per_shift` | Healthcare spec — Legal & Finance **reuses** `hourly` / `per_day`, no new enum |
| `aadhaar` document type + mandatory registration upload | `spec/onboarding-scaffolding/`, `documentConstants.ts` |
| `aadhaarVerificationStatus` on `freelancer_profiles` | Healthcare spec — **reuse**, do not add a second column |
| Mask helper for registration numbers | `maskRegistrationNumber()` in `healthcareProfileTypes.ts` — reuse or generalise for `enrolmentNumber` |
| `location` column | Teaching spec |
| `buildProfessionContext()` education + healthcare branches | `professionContext.ts` |
| TalentSearch healthcare/education pre-filter | `talentSearchUtils.ts` |
| Onboarding 3 category cards | `Onboarding.tsx` (Healthcare) |
| `FIELDS_OF_WORK` includes Law, Accounting, Tax, Financial Planning | `fields.ts` |
| Completeness score ignores vertical fields | `completenessUtils.ts` + Teaching/Healthcare plans |
| Vault exclusion for expired school-teacher licence is **scoped** | `project.md` — do not silently extend to COP expiry without Phase 5 decision |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Aadhaar Storage & Privacy

**Question:** Same UIDAI / DPDP constraints as Healthcare.

**Recommendation:** Identical to Healthcare Q1. Reuse `aadhaarVerificationStatus` / optional `aadhaarLastFour`. Never persist full Aadhaar. Mask `enrolmentNumber` with the same helper as `registrationNumber`.

**Must resolve before:** Schema serializers (already decided in Healthcare `plan.md` — copy, do not reopen).

---

### Q2 — Aadhaar vs After-Signup Documents

**Question:** User requires Aadhaar mandatory **now**, and professional documents **after signup**. What is blocked without each?

**Options:**
- **(A)** Aadhaar blocks registration only; Vault uses completeness ≥ 60 only
- **(B)** Aadhaar blocks registration **and** Legal & Finance Vault requires verified Aadhaar (Healthcare pattern)
- **(C)** Also block registration until Bar/ICAI files upload

**Recommendation: (B).** (C) contradicts the product request. Phase 2 files never block `PUT /users/me`.

**Must resolve before:** Onboarding + `GET /api/freelancers`.

---

### Q3 — New `rateType` for matters / retainers

**Question:** Legal work is often billed per matter or monthly retainer.

**Recommendation:** **Do not add** `per_assignment` / `per_retainer` in this spec. Default job rate type to existing `per_day`. Revisit in a rate-types follow-up.

**Must resolve before:** OpenAPI — no enum change required.

---

### Q4 — Fourth onboarding card layout

**Question:** Healthcare used `grid-cols-1 md:grid-cols-3`. A fourth card needs a layout.

**Recommendation:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` — two-by-two on tablet, four-across on desktop. See `UI.md`. Accent: slate/navy (legal) + gold hairline — distinct from emerald Healthcare and blue Education.

---

### Q5 — `practiceArea` filter vs `?q=`

**Recommendation:** Structured array filter only (same as `clinicalSpecialty`). `?q=` stays bio/skills/tagline.

---

### Q6 — Phase 2 document types in upload API

**Decision:** Constants + checklist only. **Do not** add Bar/ICAI/GST types to `DOCUMENT_TYPES` / OpenAPI until Phase 5. Registration upload remains `aadhaar` only.

---

### Q7 — CMA / in-house counsel / Big 4 consultants

**Question:** Separate sub-types?

**Recommendation:** No. CMA via qualification enum. In-house counsel = `advocate` (or Technology if they refuse Bar enrolment). Big 4 consultants without ICAI membership stay Technology / `tax_consultant` if they practise GST.

---

### Q8 — Reuse Healthcare registration columns?

**Question:** `registrationCouncil` / `registrationNumber` already exist.

**Recommendation:** **Do not reuse.** Add `enrolmentBody` / `enrolmentNumber` / `enrolmentExpiry`. Category switch must not overwrite clinical registration.

---

## ⚠️ Risks & Notes

### Risk 1 — Healthcare / Aadhaar column missing on target branch

If implementing on a branch without Healthcare Phase 1, `aadhaarVerificationStatus` will not exist.

**Mitigation:** Task 0 greps both Teaching and Healthcare columns. If Aadhaar status column missing, implement Healthcare Phase 1 first **or** add the column in this spec's Phase 1 (prefer prerequisite).

### Risk 2 — Shared `experience_certificate` document type

Healthcare Phase 2 already names `experience_certificate`. Phase 5 upload API must treat it as **one** `documentType` across verticals (unique on `freelancerId, documentType`). A CA cannot hold two experience letters of that type without a later multi-doc design.

**Mitigation:** One row per freelancer; checklist copy says "Experience letter (any employer)". Do not invent `legal_experience_certificate`.

### Risk 3 — Completeness score

Do **not** fold enrolment or Aadhaar into `calculateCompletenessScore()`. Vault = completeness ≥ 60 **plus** Aadhaar verified for this category.

### Risk 4 — Category migration

An advocate who registered as Technology with `fieldOfWork: Law & Legal Services` is not auto-migrated. Profile edit may switch category (warning + Aadhaar already on file).

### Risk 5 — Codegen enum

Adding `legal_finance` to `ProfessionCategory` requires OpenAPI → codegen → typecheck before frontend.

### Risk 6 — COP expiry Vault drop

`project.md` forbids extending school-teacher Vault exclusion to generic credentials without an explicit decision. Phase 1 **does not** hide profiles with expired `enrolmentExpiry`. Phase 5 may add a scoped rule for advocates/CAs with COP — separate task.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q2 | Aadhaar Vault strictness vs after-signup docs | Onboarding + Vault filter |
| Q3 | No new rate enum | Confirmed — skip OpenAPI rate change |
| Q6 | Phase 2 types not in upload API | Document routes |
| Q8 | Separate enrolment columns | Schema |
| — | Healthcare + Aadhaar prerequisite | Task 0 |

Q1 copies Healthcare. Q4, Q5, Q7 resolved in `plan.md` / `UI.md`.

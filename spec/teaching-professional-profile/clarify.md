# TalentLock — Clarification & Verification: Teaching Professional Profile

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `freelancer_profiles` has `skills` (array), `fieldOfWork`, `rate`, `bio`, `completenessScore` | Confirmed in `project.md` schema table |
| `GET /api/freelancers` supports filters + `?q=` keyword search already | Confirmed — Product Gaps feature |
| `calculateCompletenessScore()` exists and is recalculated atomically on profile update | Confirmed — `completenessUtils.ts` |
| `job_requirements` table exists, employer-created | Confirmed |
| AI Match chat + `GET /api/ai/match-explanation` build a prompt from job + freelancer data | Confirmed — Smarter Matching feature |
| `documents` table exists with a `documentType` field for credential uploads | Confirmed — Document Verification feature |
| Onboarding flow: role picker → profile form, `Onboarding.tsx` treats 404 as new user | Confirmed |
| `sanitiseText()` applies to all free-text writes | Confirmed |
| Orval codegen pattern for new query params / schema fields | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Exact Column Type for `skills` and `teachingSubjects`/`teachingLevels`

**Question:** `freelancer_profiles.skills` — is it `text[]` (Postgres array) or `jsonb`? The new `teachingSubjects` and `teachingLevels` fields should use the **same column type** as `skills` for consistency and so existing array-handling utility code (if any) can be reused.

**Recommendation:**
```bash
grep -A 30 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "skills"
```
Match the type exactly. If `skills` is `jsonb`, use `jsonb` for the two new array fields too — do not introduce a new pattern.

---

### Q2 — Does `freelancer_profiles` Already Have Any Location Field?

**Question:** The spec adds `location: text('location')`. Confirm no existing column already serves this purpose (e.g. from a prior "availability" or "timezone" feature) to avoid duplication.

**Recommendation:**
```bash
grep -A 30 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "location\|city\|timezone\|country"
```
If a column already exists for a different purpose (e.g. `timezone` used by Cruise Mode blackout windows), do not conflate it with `location` — they serve different purposes (timezone = for blackout window calculation; location = for display/future distance filtering).

---

### Q3 — `professionCategory` Backfill Strategy for Existing Rows

**Question:** Adding `professionCategory` as nullable with application-level default `'technology'` is one approach. An alternative is a **non-null column with a SQL default** so every existing row is explicitly backfilled at migration time.

**Options:**
- **(A)** Nullable column, `null` treated as `'technology'` everywhere in application code (more `?? 'technology'` checks scattered through the codebase)
- **(B)** Non-null column with `DEFAULT 'technology'` — migration backfills all existing rows to `'technology'` explicitly, application code can assume the column is always populated

**Recommendation:** Option B. A non-null column with a database default is safer — no `?? 'technology'` fallback logic needed anywhere, and it is impossible for a row to end up in an ambiguous "uncategorised" state. The migration is a single `ALTER TABLE ... ADD COLUMN profession_category text NOT NULL DEFAULT 'technology'` — Postgres backfills existing rows automatically with the default.

---

### Q4 — Where Does `rateType` Affect Existing Rate Display Logic?

**Question:** `freelancer_profiles.rate` and `bookings.proposedRate` are currently displayed everywhere as "$X/hr". If `rateType` can be `'per_day'` or `'per_session'`, every UI location that renders a rate needs to check `rateType` and show the correct unit label.

**Impact:** This touches: Talent Vault cards, freelancer detail page, booking creation form, negotiation panel, Rate Suggestions widget, Earnings Intelligence, Spend Analytics, Agreement generation (the rate clause).

**Recommendation:** Centralise this in a single shared utility `formatRate(amount, rateType)` (frontend) and reuse it everywhere a rate is displayed. This is a **display-only** concern in Phase 1 — the underlying `rate`/`proposedRate` numeric columns are unchanged; only their rendered label changes based on `rateType`. List every call site in `task.md` so none are missed (a missed call site would silently show "$150/hr" for a teacher whose rate is actually "£150/day" — confusing but not breaking).

---

### Q5 — Should `professionCategory` on `job_requirements` Cascade to `bookings` and `agreements`?

**Question:** When an education job is booked, does the resulting `bookings` row or `agreements` row need its own `professionCategory`, or is it always derivable by joining back to `job_requirements`?

**Recommendation:** **No new column on `bookings` or `agreements`.** `professionCategory` is read from `job_requirements` via the existing `jobRequirementId` join (already present on `bookings`/`conversations`). The agreement generation prompt builder (Module 4 of `features.md`, implemented in the companion spec) reads `booking → jobRequirement.professionCategory` at generation time. This avoids data duplication and keeps the category as a single source of truth on the job posting.

---

### Q6 — Chip Input Component Reuse

**Question:** `teachingSubjects` and `teachingLevels` are array inputs ("chip" style — add/remove tags). Does a chip input component already exist in the frontend (used for `skills`)?

**Recommendation:**
```bash
grep -rn "ChipInput\|TagInput\|SkillsInput" artifacts/talentlock/src/components/ | head -5
```
If a skills chip input exists, reuse the same component for `teachingSubjects` and `teachingLevels` — do not build a new one. If none exists, build one generic `<ChipInput />` and use it for all three fields (`skills`, `teachingSubjects`, `teachingLevels`).

---

## ⚠️ Risks & Notes

### Risk 1 — Onboarding Step Order Must Not Break Existing "New User" Detection

`Onboarding.tsx` currently treats a `404` from `GET /api/users/me` as "new user" and shows the role picker. Inserting a "profession category" step between the role picker and the profile form must not change this 404-detection logic — it is purely an additional screen in the flow for freelancers, gated entirely on the client side until the final profile submission (`PUT /api/freelancers/me`), which is unchanged.

**Mitigation:** The profession category selection is held in local component state and only sent as part of the existing `PUT /api/freelancers/me` payload (as `professionCategory` + the Module 3 fields, all optional). No new endpoint, no new submission step from the backend's perspective.

### Risk 2 — Empty-String vs Null Context Injection in AI Prompts

Module 7 of `features.md` states the AI prompt context line is "an empty string" for technology jobs, to guarantee byte-identical prompts. If the prompt template uses template literals (`` `...${professionContext}...` ``), an empty string for `professionContext` must not introduce a stray double-space, trailing newline, or empty line that differs from the current hardcoded prompt.

**Mitigation:** When inspecting the existing prompt builder (Task 2.x in `task.md`), the exact insertion point and surrounding whitespace must be captured verbatim, and the conditional string must be constructed so that `professionContext === ''` reproduces the current prompt **character-for-character**. A diff test (Phase 2 validation) confirms this.

### Risk 3 — `dbsCheckStatus` Default Value for Non-Education Freelancers

`dbsCheckStatus` is an enum (`'not_uploaded' | 'uploaded' | 'verified' | 'expired'`). For a `professionCategory: 'technology'` freelancer, this field is irrelevant. Ensure the column default (`'not_uploaded'`) or `null` does not cause this field to appear anywhere in the technology freelancer's UI (profile page, completeness checklist). The Module 4 "required documents" lookup table must be keyed strictly off `educationProfessionType`, and rendering of any DBS-related UI must be conditional on `educationProfessionType !== null`.

### Risk 4 — Talent Vault Filter Chip Row Must Not Shift Existing Layout

Module 6 adds a new filter chip row ("Profession Category: Technology / Education") above the existing filters. On the employer's Talent Vault page, this is an additional row of UI. Confirm with a screenshot/visual check (Phase 3 validation) that this does not push the freelancer card grid below the fold on common viewport sizes, and that the row collapses cleanly when not needed (i.e., it should probably always show, defaulting to "All" / no selection, rather than being conditionally rendered — conditional rendering of filter UI based on data is a worse UX than always showing "All").

### Risk 5 — Codegen Required for New Query Params and Schema Fields

`GET /api/freelancers?professionCategory=&teachingSubject=` and the new `PUT /api/freelancers/me` payload fields require an OpenAPI spec update and `pnpm --filter @workspace/api-spec run codegen` before any frontend work (Phase 3). Standard post-codegen checks apply (`indexFiles: false`, single export, `pnpm run typecheck`).

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | `skills` column type (array vs jsonb) | Task 1.2 (schema — new array columns) |
| Q2 | Existing location-like columns | Task 1.2 (schema — `location` column) |
| Q3 | `professionCategory` nullable vs `NOT NULL DEFAULT` | Task 1.1 (schema — backfill strategy) |
| Q6 | Existing chip input component | Task 3.3 (onboarding UI — education fields) |

Q4 and Q5 are resolved with binding decisions in `plan.md` and do not block schema work, but must be resolved before Phase 3 (frontend).

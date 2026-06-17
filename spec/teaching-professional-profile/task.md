# TalentLock — Task Breakdown: Teaching Professional Profile

## Summary

Three phases: Database (additive columns, two non-null with defaults, rest nullable) → Backend (filter params, AI prompt context injection, OpenAPI + codegen) → Frontend (onboarding step, teaching details form, Talent Vault filter, rate formatting rollout). No new tables. No new routes. No changes to `bookings`, `agreements`, `meetings`, `reviews`.

---

## Phase 1 — Database

### Task 1.1 — Codebase Inspection

Run all inspection commands from `plan.md`. Document and confirm:
- Exact type of `freelancer_profiles.skills` (array vs jsonb) — Q1
- Whether any location/timezone-like column already exists on `freelancer_profiles` — Q2
- Exact column names on `job_requirements` for rate/budget and any existing category field
- Whether a chip/tag input component already exists — Q6
- Location of the AI matching prompt builder file
- Every frontend file that renders a rate with `/hr` — Q4 (full list required for Task 3.6)

Add a comment block at the top of the schema file changes summarising all findings.

### Task 1.2 — Add `professionCategory` and `rateType` to `job_requirements`

**File:** `lib/db/src/schema/` — job_requirements table

```ts
professionCategory: text('profession_category').notNull().default('technology'),
rateType: text('rate_type').notNull().default('hourly'),
```

### Task 1.3 — Add `professionCategory` to `freelancer_profiles`

```ts
professionCategory: text('profession_category').notNull().default('technology'),
```

### Task 1.4 — Add Education Fields to `freelancer_profiles`

All nullable, no default:

```ts
educationProfessionType: text('education_profession_type'),
teachingSubjects: /* array type matching skills — confirmed in Task 1.1 */,
teachingLevels:   /* array type matching skills — confirmed in Task 1.1 */,
yearsTeachingExperience: integer('years_teaching_experience'),
highestDegree: text('highest_degree'),
degreeSubject: text('degree_subject'),
degreeInstitution: text('degree_institution'),
teachingLicenceState: text('teaching_licence_state'),
teachingLicenceExpiry: timestamp('teaching_licence_expiry', { withTimezone: true }),
dbsCheckStatus: text('dbs_check_status'),
researchPublications: text('research_publications'),
preferredTeachingMode: text('preferred_teaching_mode'),
location: text('location'),
```

If Task 1.1 found an existing column suitable for `location`, skip adding a duplicate and document the decision instead.

### Task 1.5 — Export Types

**File:** `lib/db/src/schema/` (or shared types file)

```ts
export type ProfessionCategory = 'technology' | 'education';
export type EducationProfessionType = 'school_teacher' | 'university_lecturer' | 'tutor' | 'researcher';
export type HighestDegree = 'bachelors' | 'masters' | 'phd' | 'postdoc';
export type DbsCheckStatus = 'not_uploaded' | 'uploaded' | 'verified' | 'expired';
export type PreferredTeachingMode = 'in_person' | 'online' | 'both';
export type RateType = 'hourly' | 'per_day' | 'per_session' | 'per_course';

export const REQUIRED_DOCUMENTS_BY_EDUCATION_TYPE: Record<EducationProfessionType, {
  required: string[];
  recommended: string[];
}> = {
  school_teacher: {
    required: ['degree_certificate', 'teaching_licence', 'dbs_check'],
    recommended: ['masters_degree', 'subject_endorsement'],
  },
  university_lecturer: {
    required: ['masters_or_phd_degree'],
    recommended: ['transcripts', 'teaching_statement'],
  },
  tutor: {
    required: [],
    recommended: ['degree_certificate', 'dbs_check'],
  },
  researcher: {
    required: ['phd_degree'],
    recommended: ['orcid_profile', 'publication_list'],
  },
};
```

### Task 1.6 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify:
```sql
-- Confirm non-null defaults applied to existing rows
SELECT profession_category, COUNT(*) FROM freelancer_profiles GROUP BY profession_category;
-- Expect: all existing rows show 'technology'

SELECT profession_category, rate_type, COUNT(*) FROM job_requirements GROUP BY profession_category, rate_type;
-- Expect: all existing rows show 'technology' / 'hourly'

-- Confirm nullable education columns exist and are null for existing rows
SELECT COUNT(*) FROM freelancer_profiles WHERE education_profession_type IS NOT NULL;
-- Expect: 0 (no existing freelancer has this set yet)
```

- [ ] All existing `freelancer_profiles` rows have `profession_category = 'technology'`
- [ ] All existing `job_requirements` rows have `profession_category = 'technology'` and `rate_type = 'hourly'`
- [ ] All education-specific columns are `NULL` for every existing row

---

## Phase 2 — Backend

### Task 2.1 — `GET /api/freelancers` Filter Params

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Add `professionCategory` and `teachingSubject` as optional query params per the exact implementation in `plan.md` ("Talent Vault Filter — Exact Query Param Behaviour"). Insert alongside existing filter conditions (field, rate, availableFrom, `?q=`) — do not reorder or restructure existing filter logic.

```ts
const { professionCategory, teachingSubject } = req.query;

if (professionCategory) {
  query = query.where(eq(freelancerProfiles.professionCategory, professionCategory as string));
}

if (teachingSubject) {
  query = query.where(
    sql`EXISTS (
      SELECT 1 FROM unnest(${freelancerProfiles.teachingSubjects}) AS subject
      WHERE subject ILIKE ${'%' + teachingSubject + '%'}
    )`
  );
}
```

### Task 2.2 — AI Matching Prompt Context Injection

**File:** location confirmed in Task 1.1 (likely `artifacts/api-server/src/lib/aiAssist.ts` or similar)

Implement `buildProfessionContext()` exactly as specified in `plan.md`. Insert at the start of the existing prompt template:

```ts
const prompt = `${buildProfessionContext(jobRequirement)}${existingPromptBody}`;
```

Apply to BOTH:
- `GET /api/ai/match-explanation`
- AI Match chat (`POST /api/openai/conversations/:id/messages` when conversation has `jobRequirementId`)

### Task 2.3 — Byte-Identical Prompt Regression Check (Manual)

Before moving to Phase 3, manually verify:

1. Pick an existing technology job requirement (`professionCategory = 'technology'` after migration)
2. Capture the AI matching prompt string generated for it BEFORE Task 2.2's code is applied (or reconstruct from the unchanged template)
3. Apply Task 2.2
4. Regenerate the prompt for the same job
5. Diff the two strings — must be **identical**

Document the result in a comment or the PR description. This is the regression guard for Risk 2.

### Task 2.4 — `PUT /api/freelancers/me` — Accept New Fields

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Extend the Zod validation schema (generated from OpenAPI after Task 2.6) to accept the new optional fields from Module 3 of `features.md`, plus `professionCategory`. All new fields optional in the request body — omitting them leaves existing values unchanged (standard partial update semantics, matching current behaviour for `skills`/`bio`/etc.).

`calculateCompletenessScore()` is **not modified** — confirmed in `plan.md`. No change to its inputs or output.

### Task 2.5 — `GET /api/freelancers/:id` and `/me` — Return New Fields

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Ensure the detail and `/me` response serialisers include all new columns (they will be included automatically if the handler does `SELECT *` or returns the full Drizzle row — verify and adjust only if fields are explicitly enumerated).

### Task 2.6 — OpenAPI + Codegen

**File:** `lib/api-spec/openapi.yaml`

1. Add `professionCategory` (enum: `technology`, `education`) and `teachingSubject` (string) as optional query params on `GET /api/freelancers`
2. Add all Module 3 fields + `professionCategory` to the `FreelancerProfile` schema and the `PUT /api/freelancers/me` request body schema
3. Add `professionCategory` (enum) and `rateType` (enum: `hourly`, `per_day`, `per_session`, `per_course`) to the `JobRequirement` schema and `POST`/`PATCH /api/job-requirements` request bodies

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 3

---

## Phase 3 — Frontend

### Task 3.1 — Verify Generated Hooks

```bash
grep -r "professionCategory\|teachingSubject\|teachingSubjects\|rateType" lib/api-client-react/src/ | head -10
```

- [ ] `useGetFreelancers()` hook accepts `professionCategory` and `teachingSubject` params
- [ ] Freelancer profile types include all Module 3 fields
- [ ] Job requirement types include `professionCategory` and `rateType`

If missing, re-run codegen before continuing.

### Task 3.2 — Create `rateFormatUtils.ts`

**File:** `artifacts/talentlock/src/lib/rateFormatUtils.ts` (create new)

Implement `formatRate()` and `rateUnitLabel()` exactly as specified in `plan.md` Q4.

### Task 3.3 — Onboarding: Profession Category Step

**File:** `artifacts/talentlock/src/pages/Onboarding.tsx`

Implement the additive state machine from `plan.md` ("Onboarding Flow — Exact Implementation"):

1. Add `'profession_category'` step, freelancer-only, between `'role'` and `'profile'`
2. Two selectable cards: "Technology" and "Education"
3. Selecting "Education" reveals an `educationProfessionType` sub-picker (4 options: School Teacher, University Lecturer, Tutor, Researcher)
4. Selection held in local state — no API call at this step
5. On reaching `'profile'` step with Education selected, render the existing form PLUS a new "Teaching Details" section (Task 3.4)
6. Final submit: single `PUT /api/freelancers/me` call with the merged payload (existing fields + `professionCategory` + education fields if set)

Employer flow: `'role'` → `'profile'`, completely unchanged — no new step rendered.

### Task 3.4 — Create `<TeachingDetailsSection />`

**File:** `artifacts/talentlock/src/components/onboarding/TeachingDetailsSection.tsx` (create new)

Rendered only when `professionCategory === 'education'` during onboarding (and later, on the profile edit page). Fields:

- `teachingSubjects` — chip input (Task 3.5)
- `teachingLevels` — chip input (Task 3.5)
- `yearsTeachingExperience` — number input
- `highestDegree` — select (Bachelor's / Master's / PhD / Postdoc)
- `degreeSubject` — text input
- `degreeInstitution` — text input
- `teachingLicenceState` — text input, shown conditionally (hide for `tutor`/`researcher` sub-types where it's typically not applicable, but never hard-block entry)
- `teachingLicenceExpiry` — date picker
- `preferredTeachingMode` — radio (In Person / Online / Both)
- `location` — text input

All fields optional at the form level — no client-side required validation beyond what the existing profile form already enforces for its own fields.

### Task 3.5 — Chip Input Component

**File:** `artifacts/talentlock/src/components/ChipInput.tsx`

If Task 1.1 inspection found an existing chip/tag input used for `skills`, reuse it directly for `teachingSubjects` and `teachingLevels` — no new component. Otherwise, create the generic `<ChipInput />` per `plan.md` Q6 and use it for both new fields (do not retrofit `skills`).

### Task 3.6 — Profile Edit Page — Teaching Details

**File:** `artifacts/talentlock/src/pages/Profile.tsx` (or wherever the freelancer profile edit form lives)

Render `<TeachingDetailsSection />` when `freelancerProfile.professionCategory === 'education'`, allowing existing education professionals to edit these fields after initial onboarding. Uses the same `PUT /api/freelancers/me` endpoint.

### Task 3.7 — Talent Vault Filter UI

**File:** `artifacts/talentlock/src/pages/Freelancers.tsx` (Talent Vault page)

Add a "Profession Category" filter chip row above existing filters:

```tsx
<div className="flex gap-2 mb-3">
  <FilterChip active={professionCategory === undefined} onClick={() => setProfessionCategory(undefined)}>
    All
  </FilterChip>
  <FilterChip active={professionCategory === 'technology'} onClick={() => setProfessionCategory('technology')}>
    Technology
  </FilterChip>
  <FilterChip active={professionCategory === 'education'} onClick={() => setProfessionCategory('education')}>
    Education
  </FilterChip>
</div>

{professionCategory === 'education' && (
  <input
    type="text"
    placeholder="Filter by subject (e.g. Mathematics)"
    value={teachingSubject}
    onChange={(e) => setTeachingSubject(e.target.value)}
    className="mb-3"
  />
)}
```

This row is **always rendered** (per Risk 4 in `clarify.md`) — defaulting to "All", never conditionally hidden based on data.

### Task 3.8 — Rate Display Rollout

Using the full list from Task 1.1 inspection #6, update every call site to use `formatRate(amount, rateType)`:

- [ ] Talent Vault freelancer cards
- [ ] Freelancer detail page (`/freelancers/:id`)
- [ ] Public profile page (`/f/:id`)
- [ ] Booking creation form
- [ ] Negotiation panel (counter-offer display)
- [ ] Rate Suggestions widget
- [ ] Earnings Intelligence charts/labels
- [ ] Spend Analytics charts/labels
- [ ] Booking detail page (`/bookings/:id`)

For every call site, `rateType` is read from the relevant `job_requirements` row (via the booking's `jobRequirementId`) where applicable, or from `freelancer_profiles.professionCategory`-implied default for profile-level rate display (a freelancer profile's own `rate` field has no `rateType` of its own in this phase — it is displayed using the freelancer's `professionCategory` to pick a sensible default unit, defaulting to `/hr` for `technology` and `/session` for `education` on the profile card; the authoritative `rateType` for a specific booking/job always comes from `job_requirements.rateType`).

### Task 3.9 — Job Posting Form — Profession Category + Rate Type

**File:** `artifacts/talentlock/src/pages/JobNew.tsx` (or equivalent)

Add a "Profession Category" picker (Technology / Education) and, when Education is selected, a "Rate Type" picker (Hourly / Per Day / Per Session / Per Course) next to the existing rate field. The rate input itself is unchanged — only the unit label adjacent to it changes via `rateUnitLabel(rateType)`.

Default value for both new fields when not touched: `professionCategory: 'technology'`, `rateType: 'hourly'` — matching the database defaults, so an employer who doesn't interact with these new controls produces a job identical to today's.

---

## Acceptance Criteria

- [ ] `profession_category` (NOT NULL DEFAULT 'technology') added to `freelancer_profiles` and `job_requirements`
- [ ] `rate_type` (NOT NULL DEFAULT 'hourly') added to `job_requirements`
- [ ] All existing rows backfilled to `'technology'` / `'hourly'` automatically via migration
- [ ] 12 nullable education fields added to `freelancer_profiles`, all `NULL` for existing rows
- [ ] `REQUIRED_DOCUMENTS_BY_EDUCATION_TYPE` lookup exported and matches `features.md` Module 4 table
- [ ] `GET /api/freelancers` with no `professionCategory`/`teachingSubject` params returns identical results to pre-change behaviour
- [ ] `GET /api/freelancers?professionCategory=education` returns only education professionals
- [ ] `GET /api/freelancers?professionCategory=education&teachingSubject=Mathematics` filters correctly (case-insensitive substring match)
- [ ] AI matching prompt for a `professionCategory: 'technology'` job is byte-identical to the pre-change prompt (Task 2.3 diff test passes)
- [ ] AI matching prompt for a `professionCategory: 'education'` job includes the new context sentence
- [ ] `PUT /api/freelancers/me` accepts all new optional fields without breaking existing partial-update behaviour
- [ ] `calculateCompletenessScore()` output unchanged for a fixed test profile before and after this change
- [ ] Onboarding: employer flow shows zero new screens
- [ ] Onboarding: freelancer flow shows profession category picker; selecting Education reveals sub-type picker and Teaching Details section
- [ ] Onboarding: final submit produces one `PUT /api/freelancers/me` call (not multiple)
- [ ] Profile edit page shows Teaching Details section for education professionals, hidden for technology
- [ ] Talent Vault shows "All / Technology / Education" filter row always, regardless of data
- [ ] Selecting "Education" reveals subject filter input
- [ ] `formatRate(90, 'hourly')` → `"$90/hr"` (identical to current hardcoded output)
- [ ] `formatRate(180, 'per_day', '£')` → `"£180/day"`
- [ ] All 9 rate-display call sites from Task 3.8 use `formatRate()`
- [ ] Job posting form defaults to `professionCategory: 'technology'`, `rateType: 'hourly'` when untouched
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) -> 1.2 -> 1.3 -> 1.4 -> 1.5 -> 1.6 (migration verify)
Task 2.1 -> 2.2 -> 2.3 (regression diff) -> 2.4 -> 2.5 -> 2.6 (codegen + typecheck)
Task 3.1 (verify hooks) -> 3.2 -> 3.3 -> 3.4 -> 3.5 -> 3.6 -> 3.7 -> 3.8 -> 3.9
```

# TalentLock — Validation Guide: Teaching Professional Profile

---

## Phase 1 Validation — Database

### V1.1 — New Columns Exist

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
AND column_name IN (
  'profession_category', 'education_profession_type', 'teaching_subjects',
  'teaching_levels', 'years_teaching_experience', 'highest_degree',
  'degree_subject', 'degree_institution', 'teaching_licence_state',
  'teaching_licence_expiry', 'dbs_check_status', 'research_publications',
  'preferred_teaching_mode', 'location'
);

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'job_requirements'
AND column_name IN ('profession_category', 'rate_type');
```

- [ ] All 14 columns present on `freelancer_profiles`
- [ ] `profession_category` is `NOT NULL` with default `'technology'`
- [ ] All 12 education-specific columns are nullable with no default
- [ ] `profession_category` and `rate_type` present on `job_requirements`, both `NOT NULL` with defaults `'technology'` / `'hourly'`

### V1.2 — Existing Rows Backfilled Correctly

```sql
SELECT profession_category, COUNT(*) FROM freelancer_profiles GROUP BY profession_category;
SELECT profession_category, rate_type, COUNT(*) FROM job_requirements GROUP BY profession_category, rate_type;
SELECT COUNT(*) FROM freelancer_profiles WHERE education_profession_type IS NOT NULL;
```

- [ ] 100% of pre-existing `freelancer_profiles` rows show `profession_category = 'technology'`
- [ ] 100% of pre-existing `job_requirements` rows show `profession_category = 'technology'`, `rate_type = 'hourly'`
- [ ] 0 rows have `education_profession_type IS NOT NULL` immediately after migration

### V1.3 — Array Column Type Matches `skills`

```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
AND column_name IN ('skills', 'teaching_subjects', 'teaching_levels');
```

- [ ] `teaching_subjects` and `teaching_levels` have the same `data_type`/`udt_name` as `skills`

---

## Phase 2 Validation — Backend

### V2.1 — Talent Vault Filter: No Params (Regression)

```bash
# Capture response BEFORE and AFTER this change for an identical query
curl "http://localhost:8080/api/freelancers?page=1&pageSize=10" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Response shape identical to pre-change (`{data, total, page, pageSize, totalPages}`)
- [ ] Same freelancers returned in the same order for a fixed dataset
- [ ] `professionCategory: 'technology'` and `rateType` fields now present in each returned freelancer/job object (additive — does not break existing consumers that ignore unknown fields)

### V2.2 — Talent Vault Filter: `professionCategory=education`

```bash
curl "http://localhost:8080/api/freelancers?professionCategory=education" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns only freelancers with `professionCategory = 'education'`
- [ ] Returns empty array (not an error) if no education professionals exist yet

### V2.3 — Talent Vault Filter: `teachingSubject` Case-Insensitive Match

Seed one freelancer with `teachingSubjects: ["GCSE Mathematics", "A-Level Physics"]`.

```bash
curl "http://localhost:8080/api/freelancers?professionCategory=education&teachingSubject=mathematics" \
  -H "Authorization: Bearer <employer_token>"
# lowercase query should still match "GCSE Mathematics"
```

- [ ] Case-insensitive substring match works (`mathematics` matches `GCSE Mathematics`)
- [ ] No match returns empty array, not an error

### V2.4 — AI Matching Prompt: Byte-Identical for Technology

Manual diff test per Task 2.3:

- [ ] Prompt generated for a `professionCategory: 'technology'` job, before and after the change, is character-for-character identical
- [ ] No extra blank lines, no leading/trailing whitespace differences

### V2.5 — AI Matching Prompt: Education Context Present

```bash
curl -X POST "http://localhost:8080/api/ai/match-explanation" \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"jobRequirementId": "<education_job_id>", "freelancerId": "<teacher_id>"}'
```

- [ ] Response reflects evaluation against subjects/levels/qualifications, not technical skills
- [ ] No errors when `educationProfessionType` or other education fields are `null` on the freelancer (graceful handling of partially-filled education profiles)

### V2.6 — `PUT /api/freelancers/me` — Partial Update Unaffected

```bash
# Existing-style partial update (technology freelancer updating bio only)
curl -X PUT "http://localhost:8080/api/freelancers/me" \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"bio": "Updated bio text"}'
```

- [ ] Returns `200`, only `bio` changes, all other fields (including new ones, which remain `null`/`'technology'`) untouched
- [ ] `completenessScore` recalculation produces the same value as before this change for an identical profile state

### V2.7 — `PUT /api/freelancers/me` — Education Fields Accepted

```bash
curl -X PUT "http://localhost:8080/api/freelancers/me" \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{
    "professionCategory": "education",
    "educationProfessionType": "school_teacher",
    "teachingSubjects": ["GCSE Mathematics", "A-Level Physics"],
    "teachingLevels": ["Secondary", "Sixth Form"],
    "yearsTeachingExperience": 8,
    "highestDegree": "masters",
    "degreeSubject": "Mathematics",
    "degreeInstitution": "University of Manchester",
    "preferredTeachingMode": "both",
    "location": "Manchester, UK"
  }'
```

- [ ] Returns `200`
- [ ] `GET /api/freelancers/me` reflects all submitted values
- [ ] `dbsCheckStatus` and `teachingLicenceExpiry` remain `null` (not submitted, not required)

### V2.8 — Job Posting: `professionCategory` and `rateType`

```bash
# Default behaviour - omit new fields
curl -X POST "http://localhost:8080/api/job-requirements" \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"title": "React Developer", "description": "...", "skills": ["React"]}'
```

- [ ] Created job has `professionCategory: 'technology'`, `rateType: 'hourly'` by default

```bash
# Education job
curl -X POST "http://localhost:8080/api/job-requirements" \
  -H "Authorization: Bearer <employer_token>" \
  -d '{
    "title": "Supply Maths Teacher",
    "description": "...",
    "professionCategory": "education",
    "rateType": "per_day"
  }'
```

- [ ] Created job has `professionCategory: 'education'`, `rateType: 'per_day'`

### V2.9 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors after codegen

---

## Phase 3 Validation — Frontend

### V3.1 — Employer Onboarding Unchanged

Log in as a new employer:

- [ ] Onboarding shows role picker → profile form, with NO profession category step
- [ ] Form fields identical to pre-change

### V3.2 — Freelancer Onboarding: Technology Path

Log in as a new freelancer, select "Technology":

- [ ] Sub-type picker NOT shown
- [ ] Profile form shows NO "Teaching Details" section
- [ ] Submitted profile has `professionCategory: 'technology'`, all education fields `null`
- [ ] Form is visually identical to the pre-change profile form (no extra empty section, no layout shift)

### V3.3 — Freelancer Onboarding: Education Path

Log in as a new freelancer, select "Education":

- [ ] Sub-type picker appears with 4 options
- [ ] Selecting a sub-type enables "Continue"
- [ ] Profile form shows "Teaching Details" section with violet header
- [ ] All Teaching Details fields render correctly, all optional
- [ ] Submitting with only some fields filled succeeds (no required-field errors on empty fields)
- [ ] Submitted profile has `professionCategory: 'education'`, `educationProfessionType` set, and the filled fields persisted

### V3.4 — Onboarding Submits Once

- [ ] Network tab shows exactly ONE `PUT /api/freelancers/me` call on final submit (not one per step)

### V3.5 — Profile Edit Page

For an existing education freelancer:

- [ ] "Teaching Details" section appears on profile edit, pre-filled with saved values
- [ ] Editing and saving updates via `PUT /api/freelancers/me`

For an existing technology freelancer:

- [ ] No "Teaching Details" section appears
- [ ] Page renders identically to before this change

### V3.6 — Talent Vault Filter Row

- [ ] "All / Technology / Education" chips always visible, regardless of whether any education freelancers exist
- [ ] "All" is the default active state
- [ ] Selecting "Education" reveals the subject filter input
- [ ] Selecting "Technology" or "All" hides the subject filter input
- [ ] Existing filters (field, rate, availableFrom, search) render below, unchanged in appearance and behaviour
- [ ] No layout shift/overflow on common viewport widths (1280px, 1440px, mobile 375px)

### V3.7 — Sub-Type Badge

- [ ] Education freelancer cards in Talent Vault show the correct sub-type badge (e.g. "School Teacher")
- [ ] Technology freelancer cards show NO badge
- [ ] Badge renders correctly on `/freelancers/:id` detail page and `/f/:id` public profile

### V3.8 — Rate Formatting

```ts
formatRate(90, 'hourly')        // "$90/hr"
formatRate(180, 'per_day')      // "$180/day"
formatRate(45, 'per_session')   // "$45/session"
formatRate(3500, 'per_course')  // "$3,500/course"
formatRate(90, null)            // "$90/hr" — defaults to hourly
formatRate(90, undefined)       // "$90/hr" — defaults to hourly
```

- [ ] All 6 cases produce expected output
- [ ] Existing hourly-rate technology freelancer cards show `$X/hr` exactly as before (visual regression check)
- [ ] All 9 call sites from Task 3.8 use `formatRate()` (grep confirms no remaining hardcoded `/hr` strings outside the utility)

### V3.9 — Job Posting Form

- [ ] Default state: "Technology" selected, no rate type picker shown, rate field shows `/hr`
- [ ] Selecting "Education" reveals rate type picker
- [ ] Selecting each rate type updates the unit label next to the rate input correctly
- [ ] Submitting without touching these controls produces a job with `professionCategory: 'technology'`, `rateType: 'hourly'` — identical to pre-change jobs

### V3.10 — Build Passes

```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero errors

---

## Regression Validation

### R1 — Existing Technology Freelancer End-to-End Flow Unaffected

Using a pre-existing technology freelancer account:

- [ ] Profile page loads and displays correctly
- [ ] Talent Vault search (no filters) returns this freelancer as before
- [ ] AI Match chat recommends this freelancer with the same explanation quality as before
- [ ] Booking creation, negotiation, agreement generation, signing — all unchanged
- [ ] Earnings Intelligence dashboard renders correctly with `/hr` rates

### R2 — Existing Employer End-to-End Flow Unaffected

- [ ] Onboarding unchanged
- [ ] Job posting form: creating a job without touching new fields produces identical job object shape (plus the two new fields with default values)
- [ ] Talent Vault browsing, filtering, booking — all unchanged

### R3 — Cruise Mode Unaffected

- [ ] Existing Cruise Mode configs continue to evaluate jobs correctly
- [ ] `preFilter()` and evaluation logic untouched — `professionCategory`/`rateType` on `job_requirements` do not affect Cruise Mode in this phase

### R4 — Agreements, Bookings, Meetings, Reviews Unaffected

- [ ] No schema changes detected on `bookings`, `agreements`, `meetings`, `reviews`, `milestones`, `availability_blocks` tables
- [ ] All existing routes for these tables return unchanged response shapes

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Database | | | |
| Phase 2 — Backend | | | |
| Phase 3 — Frontend | | | |
| Regression Checks | | | |
| Feature Complete | | | |

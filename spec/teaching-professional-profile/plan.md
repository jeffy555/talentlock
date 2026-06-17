# TalentLock — Implementation Plan: Teaching Professional Profile

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

```bash
# 1. Confirm skills column type
grep -A 30 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "skills"

# 2. Check for any existing location/timezone columns
grep -A 30 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "location\|city\|timezone\|country"

# 3. Check job_requirements columns for rate/budget naming
grep -A 30 "jobRequirements\s*=" lib/db/src/schema/*.ts | grep -i "rate\|budget\|category\|field"

# 4. Find existing chip/tag input component
grep -rln "ChipInput\|TagInput\|SkillsInput\|chip-input" artifacts/talentlock/src/components/ 2>/dev/null

# 5. Find the AI matching prompt builder
grep -rln "match-explanation\|matchExplanation\|buildMatchPrompt" artifacts/api-server/src/ 2>/dev/null

# 6. Find every rate-rendering call site (for Q4)
grep -rln "\\$.*\\/hr\\|formatRate\\|rate}\\/hr\\|/hr" artifacts/talentlock/src/ 2>/dev/null

# 7. Confirm Onboarding.tsx structure and PUT /api/freelancers/me payload shape
grep -A 10 "PUT.*freelancers/me\|usePutFreelancersMe" artifacts/talentlock/src/pages/Onboarding.tsx 2>/dev/null
```

---

## Resolved Questions

---

### Q1 — Column Type for Array Fields

**Decision: Match `skills` exactly. Inspect first, apply same type.**

If `skills` is `text('skills').array()`:
```ts
teachingSubjects: text('teaching_subjects').array(),
teachingLevels:   text('teaching_levels').array(),
```

If `skills` is `jsonb('skills')`:
```ts
teachingSubjects: jsonb('teaching_subjects').$type<string[]>(),
teachingLevels:   jsonb('teaching_levels').$type<string[]>(),
```

Document the confirmed type in the Phase 1 inspection comment block.

---

### Q2 — Location Column

**Decision: Inspect first.**

- If no existing location-like column exists, add `location: text('location')`, nullable.
- If a `timezone` column already exists (e.g. for Cruise Mode blackout windows), that is a **different concern** (an IANA timezone string like `"Europe/London"` for time-based calculations) and must NOT be reused for `location` (a human-readable place name like `"Manchester, UK"`). Add `location` as a new, separate nullable column regardless.

---

### Q3 — `professionCategory` Backfill

**Decision: Option B — non-null column with database default.**

```ts
// On freelancer_profiles:
professionCategory: text('profession_category').notNull().default('technology'),

// On job_requirements:
professionCategory: text('profession_category').notNull().default('technology'),
rateType: text('rate_type').notNull().default('hourly'),
```

Migration:
```sql
ALTER TABLE freelancer_profiles
  ADD COLUMN profession_category text NOT NULL DEFAULT 'technology';

ALTER TABLE job_requirements
  ADD COLUMN profession_category text NOT NULL DEFAULT 'technology',
  ADD COLUMN rate_type text NOT NULL DEFAULT 'hourly';
```

Both `ALTER TABLE ... ADD COLUMN ... DEFAULT` statements backfill all existing rows to the default value automatically in Postgres — single pass, no separate `UPDATE` needed. After this migration, every existing row has `professionCategory = 'technology'` and every existing job has `rateType = 'hourly'` — application code can read these columns unconditionally without `?? 'technology'` fallbacks.

The remaining education-specific fields (Module 3 of `features.md`) stay **nullable** — they are genuinely absent (not "technology defaults") for non-education professionals:

```ts
educationProfessionType: text('education_profession_type'),
// nullable: 'school_teacher' | 'university_lecturer' | 'tutor' | 'researcher' | null

teachingSubjects: /* array type per Q1 */,
teachingLevels: /* array type per Q1 */,
yearsTeachingExperience: integer('years_teaching_experience'),
highestDegree: text('highest_degree'), // 'bachelors' | 'masters' | 'phd' | 'postdoc' | null
degreeSubject: text('degree_subject'),
degreeInstitution: text('degree_institution'),
teachingLicenceState: text('teaching_licence_state'),
teachingLicenceExpiry: timestamp('teaching_licence_expiry', { withTimezone: true }),
dbsCheckStatus: text('dbs_check_status'),
// nullable; UI only renders when educationProfessionType !== null
researchPublications: text('research_publications'),
preferredTeachingMode: text('preferred_teaching_mode'), // 'in_person' | 'online' | 'both' | null
location: text('location'),
```

---

### Q4 — Centralised Rate Formatting

**Decision: One shared utility, used at every rate-display call site.**

```ts
// artifacts/talentlock/src/lib/rateFormatUtils.ts (create new)

export type RateType = 'hourly' | 'per_day' | 'per_session' | 'per_course';

const RATE_UNIT_LABELS: Record<RateType, string> = {
  hourly:      '/hr',
  per_day:     '/day',
  per_session: '/session',
  per_course:  '/course',
};

export function formatRate(amount: number, rateType: RateType | null | undefined, currencySymbol = '$'): string {
  const unit = RATE_UNIT_LABELS[rateType ?? 'hourly'];
  return `${currencySymbol}${amount.toLocaleString()}${unit}`;
}

export function rateUnitLabel(rateType: RateType | null | undefined): string {
  return RATE_UNIT_LABELS[rateType ?? 'hourly'];
}
```

`task.md` Task 3.x enumerates every call site discovered in pre-implementation check #6. Each is updated to call `formatRate(amount, rateType)` instead of hardcoding `/hr`. For `rateType: 'hourly'` (the default for all existing data), `formatRate()` returns the exact same string as today (`"$90/hr"`) — zero visual change for existing technology freelancers and jobs.

---

### Q5 — No New Columns on `bookings` / `agreements`

**Decision: Confirmed — `professionCategory` and `rateType` live only on `job_requirements`.**

The agreement generation prompt builder (implemented in `specs/teaching-credential-verification/`) reads:
```ts
const jobRequirement = await db.query.jobRequirements.findFirst({
  where: eq(jobRequirements.id, booking.jobRequirementId),
});
const professionCategory = jobRequirement.professionCategory; // 'technology' | 'education'
const rateType = jobRequirement.rateType;
```

No schema change to `bookings` or `agreements` in this spec.

---

### Q6 — Chip Input Component

**Decision: Inspect first. Reuse if it exists; otherwise build one generic component used for all three array fields.**

If no existing component:
```tsx
// artifacts/talentlock/src/components/ChipInput.tsx (create new — only if Q6 inspection finds nothing)

interface ChipInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  maxChips?: number;
}
```

Used for `teachingSubjects` and `teachingLevels`. If `skills` already has a working chip input, do not touch it — only use the new/existing component for the two new fields to avoid regression risk on the existing `skills` UI.

---

## AI Matching Prompt — Exact Injection Pattern

Resolves Risk 2 (byte-identical prompt for technology jobs).

```ts
// In the existing match-explanation / AI Match chat prompt builder:

function buildProfessionContext(jobRequirement: JobRequirement): string {
  if (jobRequirement.professionCategory !== 'education') {
    return ''; // Empty string — see template usage below
  }
  return 'This is an education hiring request. Evaluate teaching subjects, levels, qualifications, and DBS/licence status as the primary match criteria instead of technical skills.\n\n';
}

// Template usage — the empty string must collapse to nothing, not leave a blank line:
const prompt = `${buildProfessionContext(jobRequirement)}${existingPromptBody}`;
```

The trailing `\n\n` is inside the education branch only — when `professionContext === ''`, the template literal produces `${existingPromptBody}` with no leading whitespace, identical to the current hardcoded prompt. The Phase 2 validation includes a literal string-diff test: capture the current prompt output for a sample technology job today, apply the change, regenerate the same prompt for the same job, and assert the two strings are identical.

---

## Profile Completeness — Education Fields Are Additive, Not Required

**Decision: `calculateCompletenessScore()` is NOT modified to require education fields in Phase 1.**

The existing completeness formula (photo, bio, skills, rate, field, availability) continues to determine the ≥60% gate for Talent Vault visibility, unchanged, for ALL freelancers including education professionals. Module 4's "required documents" checklist is a separate, informational UI element on the profile page — it does not feed into `completenessScore` and does not gate anything in Phase 1.

This keeps the change additive: an education professional who fills in the existing fields (bio, skills/subjects via `skills`, rate, fieldOfWork, availability) reaches the same ≥60% threshold the same way a technology freelancer does, with or without uploading degree certificates.

---

## Onboarding Flow — Exact Implementation

Resolves Risk 1.

```tsx
// Onboarding.tsx — additive step, no new backend endpoint

// Existing state machine (unchanged):
// step: 'role' | 'profile'

// New state machine (freelancers only):
// step: 'role' | 'profession_category' | 'profile'

// Employers: 'role' -> 'profile' (unchanged — no profession_category step)

// Freelancers:
// 'role' -> 'profession_category' -> 'profile'
//
// 'profession_category' step:
//   - Two cards: "Technology" / "Education"
//   - Selecting "Education" reveals educationProfessionType sub-picker
//   - Selection stored in local component state only
//   - On "Continue", proceeds to 'profile' step
//
// 'profile' step:
//   - Existing form, UNCHANGED for Technology
//   - For Education: existing form PLUS a new "Teaching Details" section
//     containing the Module 3 fields
//   - On submit: single PUT /api/freelancers/me call with ALL fields
//     (existing fields + professionCategory + education fields if applicable)
//     — same endpoint, same call pattern as today, larger payload
```

`GET /api/users/me` 404 detection, `Landing.tsx` redirect logic, and `Onboarding.tsx`'s "new user" handling are untouched — the new step is purely client-side state inserted before the existing final submission.

---

## Talent Vault Filter — Exact Query Param Behaviour

```ts
// GET /api/freelancers handler — additive query params

const { professionCategory, teachingSubject, ...existingParams } = req.query;

let query = /* existing query builder, unchanged */;

if (professionCategory) {
  query = query.where(eq(freelancerProfiles.professionCategory, professionCategory as string));
}

if (teachingSubject) {
  // Case-insensitive array containment check
  query = query.where(
    sql`EXISTS (
      SELECT 1 FROM unnest(${freelancerProfiles.teachingSubjects}) AS subject
      WHERE subject ILIKE ${'%' + teachingSubject + '%'}
    )`
  );
}

// existing filters (field, rate, availableFrom, q) applied exactly as before
```

When neither param is present, the query is identical to today's — same WHERE clauses, same result set, same pagination behaviour.

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full
- [ ] All 6 spec files read
- [ ] Codebase inspection complete — Q1, Q2, Q6 findings documented in a comment block
- [ ] `skills` column type confirmed and matched for new array columns
- [ ] Existing rate-display call sites enumerated (Q4) — list captured in `task.md`
- [ ] AI matching prompt builder location confirmed
- [ ] Chip input component existence confirmed

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Database — `professionCategory`/`rateType` (non-null + default) on 2 tables, education fields (nullable) on `freelancer_profiles` | Not started |
| Phase 2 | Backend — Talent Vault filter params, AI matching prompt context injection, OpenAPI + codegen | Not started |
| Phase 3 | Frontend — onboarding profession picker, teaching details form section, Talent Vault filter UI, formatRate() rollout | Not started |

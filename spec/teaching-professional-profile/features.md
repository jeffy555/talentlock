# TalentLock — Features Specification: Teaching Professional Profile

## Overview

TalentLock today serves software freelancers exclusively — `freelancer_profiles` stores `skills`, `fieldOfWork`, and an hourly `rate`, and every AI prompt (matching, agreement generation, rate suggestions) assumes a technology engagement.

This feature is **Phase 1 of the Teaching Professionals expansion**: it makes the platform able to represent, discover, and AI-match teaching professionals — school teachers, university lecturers, private tutors, and researchers — **without changing the application flow** described in the universal platform model (Post → Discover → Meet → Book → Agree → Deliver → Review).

The same 7-step flow that works for a React developer must work identically for a GCSE Maths teacher. What changes is **the data captured about the professional and the job**, not the steps, routes, or screens they move through.

This spec covers the foundation: profile schema, onboarding, Talent Vault discovery, and AI matching context. Credential document verification and education-specific agreement templates are covered separately in `specs/teaching-credential-verification/`.

---

## Feature Modules

### Module 1 — Profession Category System

A new top-level concept: `professionCategory`. For Phase 1, only two values exist:

```ts
type ProfessionCategory = 'technology' | 'education';
```

- Existing freelancers (all currently software-focused): `professionCategory` defaults to `'technology'` via backfill — **zero behaviour change**.
- New freelancers choose their category during onboarding.
- `professionCategory` lives on `freelancer_profiles` (the professional's category) and on `job_requirements` (what category of professional the job is for).

This is designed as an **extensible enum** — adding `'healthcare'`, `'trades'`, `'fitness'` later follows the exact same pattern established here.

---

### Module 2 — Education Sub-Type

Within `professionCategory: 'education'`, four sub-types exist, each with different credential expectations (detailed in Module 4):

```ts
type EducationProfessionType =
  | 'school_teacher'       // K-12 / secondary school teacher
  | 'university_lecturer'  // Adjunct professor, lecturer
  | 'tutor'                 // Private tutor (any subject/level)
  | 'researcher';          // Contract/visiting researcher
```

This field is **only meaningful when `professionCategory === 'education'`**. For `'technology'` freelancers it is always `null`.

---

### Module 3 — Teaching Profile Fields

New structured fields on `freelancer_profiles`, populated only for education professionals:

| Field | Type | Example |
|---|---|---|
| `teachingSubjects` | string array | `["GCSE Mathematics", "A-Level Physics"]` |
| `teachingLevels` | string array | `["Secondary", "Sixth Form"]` |
| `yearsTeachingExperience` | integer | `8` |
| `highestDegree` | enum | `'bachelors' \| 'masters' \| 'phd' \| 'postdoc'` |
| `degreeSubject` | string | `"Mathematics"` |
| `degreeInstitution` | string | `"University of Manchester"` |
| `teachingLicenceState` | string nullable | `"England"` (null for tutors/professors where no state licence applies) |
| `teachingLicenceExpiry` | date nullable | `2027-08-31` |
| `dbsCheckStatus` | enum | `'not_uploaded' \| 'uploaded' \| 'verified' \| 'expired'` |
| `researchPublications` | string nullable | ORCID or Google Scholar URL |
| `preferredTeachingMode` | enum | `'in_person' \| 'online' \| 'both'` |
| `location` | string nullable | `"Manchester, UK"` |

For `professionCategory: 'technology'` freelancers, **every one of these fields remains `null` forever**. The existing `skills` array continues to hold tech stack entries (`["React", "TypeScript"]`); for education professionals, `skills` can optionally hold additional free-text specialisations not captured by `teachingSubjects`.

---

### Module 4 — Required Documents Per Education Sub-Type

Each `educationProfessionType` implies a different credential checklist, shown on the profile as a completion list (full verification flow is in `specs/teaching-credential-verification/` — this spec only defines *which documents are expected*):

| Sub-Type | Required | Recommended |
|---|---|---|
| `school_teacher` | Bachelor's degree, Teaching Licence, DBS Check | Master's degree, Subject endorsement |
| `university_lecturer` | Master's degree (PhD for research universities) | Transcripts, Teaching statement |
| `tutor` | None mandatory | Degree certificate, DBS Check (if tutoring minors) |
| `researcher` | PhD | ORCID profile, Publication list |

This checklist is a **static lookup table** consumed by the profile completeness UI — it does not gate booking creation in Phase 1 (that enforcement, if desired, belongs to a future phase).

---

### Module 5 — Onboarding Flow Change

**Current onboarding (unchanged for `professionCategory: 'technology'`):**
```
Role picker (Freelancer / Employer) → Profile form
```

**New onboarding for freelancers:**
```
Role picker → Profession category picker → Profile form
                     │
                     ├─ Technology → existing form, byte-identical
                     └─ Education  → existing form + education section:
                                       - Education sub-type picker
                                       - Teaching subjects (chip input)
                                       - Teaching levels (chip input)
                                       - Years of experience
                                       - Highest degree + subject + institution
                                       - Teaching licence (state + expiry, if applicable)
                                       - Preferred teaching mode
                                       - Location
```

Employers are unaffected — they do not pick a profession category for themselves (a school posting a vacancy specifies the category on the **job**, not on their own profile).

---

### Module 6 — Talent Vault Discovery for Education

`GET /api/freelancers` gains two new **optional** query parameters:

```
?professionCategory=education
?teachingSubject=Mathematics
```

- Omitted entirely → current behaviour, unchanged (returns all freelancers regardless of category)
- `professionCategory=education` → filters to education professionals only
- `teachingSubject=Mathematics` → further filters to freelancers whose `teachingSubjects` array contains a case-insensitive match

The Talent Vault UI shows a **Profession Category** filter chip row (Technology / Education) above the existing field/rate/availability filters. Selecting "Education" reveals a secondary "Subject" filter.

---

### Module 7 — AI Matching Context for Education

The AI Match chat and `GET /api/ai/match-explanation` inject one additional context line into the existing prompt when the job's `professionCategory === 'education'`:

> "This is an education hiring request. Evaluate teaching subjects, levels, qualifications, and DBS/licence status as the primary match criteria instead of technical skills."

For `professionCategory: 'technology'` (or `null`), this context line is an empty string — **the prompt sent to OpenAI is byte-identical to today's prompt**. No regression risk to existing matching quality.

---

### Module 8 — Job Posting: Profession Category + Rate Type

`job_requirements` gains two new optional fields, set when an employer (school, college, parent) creates a posting:

```ts
professionCategory: 'technology' | 'education' | null  // null = 'technology' (default)
rateType: 'hourly' | 'per_day' | 'per_session' | 'per_course' | null  // null = 'hourly' (default)
```

The job posting form shows a profession category picker (defaulting to "Technology" for existing users' muscle memory) and, when "Education" is selected, a rate type picker appears alongside the existing rate field. The rate field itself is unchanged — only its *unit label* changes based on `rateType` (e.g. "$ per hour" vs "£ per day" vs "£ per session").

---

## Non-Goals

- Credential document upload, verification, and expiry badges — covered in `specs/teaching-credential-verification/`
- Education-specific agreement templates (session schedules, safeguarding clauses) — covered in `specs/teaching-credential-verification/` (Phase 2 bundles both, per the build-order recommendation)
- Location-radius matching / distance calculations — explicitly deferred; `location` is stored as free text in this phase, not geocoded
- Cruise Mode location pre-filter — deferred to a future phase
- Profession categories beyond `technology` and `education` (healthcare, trades, fitness, etc.) — future phases follow this same pattern but are out of scope here
- Gating booking creation on document verification status — Phase 1 is discovery and matching only
- Changing `bookings`, `agreements`, `meetings`, `reviews`, `milestones`, `availability_blocks`, or any existing route's request/response shape
- Renaming "Employer" → "Client" or "Freelancer" → "Professional" in UI copy — separate terminology decision, not bundled here

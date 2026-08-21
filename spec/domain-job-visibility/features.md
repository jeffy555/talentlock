# TalentLock — Features Specification: Domain Job Visibility

## Overview

TalentLock onboarded verticals are **Technology**, **Education**, **Healthcare**, and **Legal & Finance** (`professionCategory` on `freelancer_profiles` and `job_requirements`). Until this feature, a healthcare freelancer still saw technology (and every other) job on `/jobs`, and Cruise Mode evaluated every new posting against every active freelancer.

This feature **hard-locks freelancer job discovery and Cruise Mode to the profession the freelancer onboarded with**. A healthcare freelancer never sees technology jobs. Cruise Mode never spends AI budget or sends DMs for a job outside that freelancer’s domain.

**Does not change:** employer job posting, employer “my jobs” list, Talent Vault (employers still filter talent by category), TalentSearch (already has a `professionCategory` rule).

**Prerequisite:** `professionCategory` columns from `spec/teaching-professional-profile/` (extended by healthcare + legal/finance specs).

```
Freelancer professionCategory = healthcare
  → GET /api/job-requirements returns only healthcare jobs
  → GET /api/job-requirements/:id is 404 for a technology job
  → Cruise Mode skips technology jobs (no activity row, no DM)
```

---

## Feature Modules

### Module 1 — Job board (freelancer)

`GET /api/job-requirements` when the caller is a signed-in **freelancer**:

- Resolve `freelancer_profiles.professionCategory` for that Clerk user.
- Add `WHERE job_requirements.profession_category = <that value>`.
- Freelancer **cannot** pass a query param to see another domain.
- No profile row → empty list (not all jobs).

Employers listing their own jobs (`?employerId=`) and unauthenticated list callers are **unchanged** (integration test: public list still 200).

### Module 2 — Job detail + express interest

`GET /api/job-requirements/:id` for a freelancer whose category does not match the job → **404** (same body as missing job — do not leak other-domain titles).

`POST /api/job-requirements/:id/interest` → **404** on domain mismatch so a stale URL cannot pitch a technology role from a healthcare account.

Employers / anonymous GET-by-id remain as today.

### Module 3 — Cruise Mode

On `evaluateCruiseModeForNewJob`:

1. Join active Cruise configs to `freelancer_profiles`.
2. Drop configs where `freelancer.professionCategory !== job.professionCategory` **before** `preFilter` and **before** OpenAI.
3. Silent skip — **do not** write `cruise_mode_activity` (avoids flooding the feed with other-domain skips).
4. Defense in depth inside `evaluateSingleCandidate` and the evaluation prompt (hard skip if domains differ).

Cruise Mode rules (`preferredFields`, keywords) never override this lock.

### Module 4 — Jobs UI

`/jobs` copy for freelancers states the board is profession-scoped. Empty state: no open roles **in your profession**. Job detail 404 for freelancers explains the role is outside their profession or gone.

---

## Out of scope

- Letting a freelancer hold two `professionCategory` values
- Changing how employers filter Talent Vault
- Backfilling historical Cruise activity rows

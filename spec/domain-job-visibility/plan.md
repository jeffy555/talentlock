# TalentLock — Implementation Plan: Domain Job Visibility

> **Status: ✅ Complete**
> If this file and `task.md` conflict, **this file wins**.

## Pre-Implementation Checks

```bash
rg "professionCategory" lib/db/src/schema/freelancerProfiles.ts lib/db/src/schema/jobRequirements.ts
rg "router.get\\(\"/job-requirements\"" artifacts/api-server/src/routes/jobRequirements.ts
rg "evaluateCruiseModeForNewJob|preFilter" artifacts/api-server/src/lib
```

No schema change. Columns already exist.

## Resolved decisions

- Hard lock from `freelancer_profiles.professionCategory` vs `job_requirements.professionCategory`.
- Null/empty category normalises to `technology` (legacy default).
- Freelancer cannot override via query string.
- Cruise: filter before AI; silent skip; prompt still states the lock.
- Employers / anonymous: no new filter.
- New spec folder (not an append to teaching/healthcare/cruise).

## Implementation

1. `artifacts/api-server/src/lib/professionDomain.ts` — `isSameProfessionDomain`.
2. `GET /job-requirements` + `GET /job-requirements/:id` — freelancer filter / 404.
3. `POST /job-requirements/:id/interest` — 404 on mismatch.
4. `cruiseModeEvaluator.ts` — join profile, drop other domains before `preFilter`.
5. Jobs UI copy; OpenAPI description on list endpoint (no new params → no codegen required).

## Phases

| Phase | Work |
|-------|------|
| 1 | Shared helper + job list/detail/interest |
| 2 | Cruise Mode evaluator + prompt |
| 3 | Jobs UI copy |
| 4 | Specs + `project.md` + `spec/spec.md` |

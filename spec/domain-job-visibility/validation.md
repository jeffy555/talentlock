# TalentLock — Validation: Domain Job Visibility

Validated 2026-08-21 against unit tests + code review after implementation.

## V1 — Helper

- [x] Same category → true; healthcare vs technology → false
- [x] Null category treated as `technology`  
  `artifacts/api-server/tests/unit/professionDomain.test.ts`

## V2 — Job list / detail

- [x] `GET /api/job-requirements` with freelancer auth adds `profession_category` predicate
- [x] `GET /api/job-requirements/:id` returns 404 when freelancer domain mismatches
- [x] Public `GET /api/job-requirements` still 200 (no domain lock) — existing jobs crud test

## V3 — Interest

- [x] `POST /api/job-requirements/:id/interest` 404 when domains differ

## V4 — Cruise Mode

- [x] Evaluator joins freelancer profile and drops other-domain configs before AI
- [x] No activity insert on domain skip
- [x] Prompt includes profession domain hard lock

## V5 — UI

- [x] Freelancer `/jobs` subtitle + empty state mention profession
- [x] Freelancer job 404 copy

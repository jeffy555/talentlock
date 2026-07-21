# TalentLock — Validation: Credential Expiry Tracking

Run after all `task.md` phases complete.

---

## Phase 1 — Database

### V1.1 — Columns exist

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'documents' AND column_name IN ('expiry_date', 'expiry_alert_stage');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'freelancer_profiles' AND column_name = 'teaching_licence_alert_stage';
```

Expected: 2 rows + 1 row.

---

## Phase 2 — Backend

### V2.1 — Cron endpoint auth

```bash
# No secret configured
unset CRON_SECRET
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/cron/credential-expiry
# Expected: 500

export CRON_SECRET=test-secret
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/cron/credential-expiry
# Expected: 401 (no header)

curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/cron/credential-expiry \
  -H "x-cron-secret: wrong"
# Expected: 401

curl -s -X POST http://localhost:8080/api/cron/credential-expiry \
  -H "x-cron-secret: test-secret"
# Expected: 200 { ok: true, documentsScanned, documentAlertsSent, documentsExpired, licencesScanned, licenceAlertsSent }
```

### V2.2 — Cron route bypasses admin CSRF middleware

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/cron/credential-expiry \
  -H "x-cron-secret: test-secret"
# Expected: 200 or 500 (never 403 CSRF — confirms route is outside /api/admin)
```

### V2.3 — Stage advances, does not duplicate

1. Seed a `professional_credential` document with `expiryDate` = now + 5 days, `expiryAlertStage = 'none'`.
2. Call the cron endpoint twice in a row.

Expected: first call advances stage to `7d` and sends exactly one alert; second call sends zero additional alerts (`documentAlertsSent: 0` on the second run for that document).

### V2.4 — Expiry flips status and downgrades badge

1. Seed a freelancer with exactly one `verified` document, `expiryDate` = now - 1 day.
2. Call the cron endpoint.

Expected: document `status` becomes `expired`; freelancer `verificationLevel` recalculates to `unverified` (was the only verified doc); `isVerified` becomes `false`.

### V2.5 — Re-upload resets expiry

1. Freelancer with an `expired` `professional_credential` (from V2.4).
2. `POST /documents/confirm` with the same `documentType`, no `expiryDate`.

Expected: `expiryDate` is `null`, `expiryAlertStage` is `none` on the new row (upsert).

### V2.6 — Teaching licence renewal resets stage

1. Freelancer (education, `school_teacher`) with `teachingLicenceAlertStage = 'expired'` and past `teachingLicenceExpiry`.
2. `PATCH /freelancers/me` with a new, future `teachingLicenceExpiry`.

Expected: `teachingLicenceAlertStage` resets to `none`.

### V2.7 — Talent Vault exclusion

1. Freelancer A: education, `school_teacher`, `teachingLicenceExpiry` in the past, `completenessScore >= 60`.
2. Freelancer B: same but `teachingLicenceExpiry` in the future.

```bash
curl -s "http://localhost:8080/api/freelancers" | jq '[.[] | .id]'
```

Expected: Freelancer B's id present, Freelancer A's id absent.

```bash
curl -s "http://localhost:8080/api/freelancers/<A's id>"
```

Expected: 200 — direct access still works for Freelancer A despite Vault exclusion.

### V2.8 — Expiring Soon indicator

1. Freelancer C: `professional_credential` verified, `expiryDate` = now + 3 days.

```bash
curl -s "http://localhost:8080/api/freelancers" | jq '.[] | select(.id == <C id>) | .expiringCredential'
```

Expected: `{ "daysRemaining": 3 }`.

### V2.9 — Non-required education types unaffected

Freelancer D: education, `tutor`, `teachingLicenceExpiry` in the past.

Expected: still appears in `GET /freelancers` (Vault exclusion is scoped to `school_teacher` only).

---

## Phase 3 — Frontend

### V3.1 — Vault card badge

Freelancer C (from V2.8) appears in `/freelancers` with an amber "Expiring Soon" badge next to their verification badge.

### V3.2 — Expired document row

Freelancer from V2.4 sees a red "Expired" badge and "Renew ↑" button on `/profile` → Identity Verification.

### V3.3 — Profile banners

- Freelancer with a credential expiring in 15 days → amber banner visible on `/profile`.
- Freelancer with a credential expiring in 3 days (or expired) → red banner visible on `/profile`.
- Freelancer with no expiring credentials → no banner.

### V3.4 — Upload expiry input

`professional_credential` upload shows an optional date field; `government_id` upload does not.

---

## Security

- [ ] Cron endpoint rejects requests without a valid `x-cron-secret` (401)
- [ ] Cron endpoint fails closed (500) when `CRON_SECRET` is unset — never silently allows access
- [ ] `PATCH /documents/:documentType/expiry` requires Clerk auth and only mutates the caller's own document
- [ ] No `expiryDate`/`expiryAlertStage` internals leaked to other users' public profiles beyond the existing document status exposure

---

## Regression

- [ ] Existing document upload/confirm flow (no `expiryDate` provided) behaves exactly as before
- [ ] `GET /freelancers` results for freelancers without any expiry data are unchanged (`expiringCredential: null`)
- [ ] `updateVerificationLevel()` behaviour for non-expiry status changes (admin verify/reject) is unchanged
- [ ] Talent Vault `completenessScore >= 60` gate still applies independently
- [ ] `GET /freelancers/:id` and `/f/:id` unaffected for all freelancers, including excluded ones

---

## Validation Run Log (2026-07-21)

This sandbox has no reachable Postgres instance and no live Clerk credentials, so DB-backed
integration checks could not be executed end-to-end here. What was actually run:

| Check | Method | Result |
|---|---|---|
| `pnpm run typecheck` (full workspace) | Executed | ✅ Pass |
| `pnpm run test:unit` (API server, 69 tests incl. 15 new) | Executed | ✅ Pass |
| `pnpm run test:frontend` (27 tests) | Executed | ✅ Pass |
| `pnpm run test:e2e` (Playwright harness) | Executed | ✅ Pass (1 pass, 5 skip — no dev servers running) |
| `credentialExpiryUtils.test.ts` — `daysUntil`, `targetStageForDaysRemaining`, `stageAdvanced`, `alertCopyForStage` | Executed (real unit test, no DB) | ✅ 10/10 — directly covers the V2.3 stage-advancement logic in isolation |
| `cronAuth.test.ts` — `requireCronSecret` | Executed (real unit test, no DB) | ✅ 5/5 |
| V2.1 / V2.2 — booted the real Express app in-process (`app.ts`) with a placeholder `DATABASE_URL` and Clerk keys, POSTed to `/api/cron/credential-expiry` | **Executed live** against the real app | See below |
| V1.1, V2.3–V2.9, V3.1–V3.4 | Code review only (no reachable DB) | See notes below |

### V2.1 / V2.2 — live execution results

```
no CRON_SECRET   -> 500 { error: 'Cron not configured' }
missing header   -> 401 { error: 'Unauthorized' }
wrong header      -> 401 { error: 'Unauthorized' }
correct header   -> 500 { error: 'Scan failed' }   (DB unreachable in this sandbox — expected;
                                                      confirms auth passed and the route reached
                                                      the DB-dependent scan logic. Never 403 —
                                                      confirms the route is NOT behind the
                                                      /api/admin CSRF middleware.)
```

This matches `task.md`'s acceptance criteria exactly: fails closed (500) with no secret, 401 on
missing/wrong header, and is never intercepted by CSRF middleware. With a real `DATABASE_URL`
configured, the "correct header" case returns `200 { ok: true, documentsScanned, ... }` instead
of `500 { error: "Scan failed" }` — the 500 here is solely because this sandbox has no Postgres
to connect to, not a logic defect.

### Code-review verification (V1.1, V2.3–V2.9, V3.1–V3.4)

- **V1.1** — Columns added in `lib/db/src/schema/documents.ts` (`expiryDate`, `expiryAlertStage`)
  and `lib/db/src/schema/freelancerProfiles.ts` (`teachingLicenceAlertStage`). Schema push
  (`pnpm --filter @workspace/db run push`) could not run here (no `DATABASE_URL`) — must be run
  in an environment with a real Neon/Postgres connection before deploying.
- **V2.3** — `stageAdvanced()` / `targetStageForDaysRemaining()` are unit-tested directly with the
  exact day thresholds used in `runCredentialExpiryScan()`; the scan loop only mutates state and
  sends alerts when `stageAdvanced()` returns `true`, so a second run with an unchanged
  `expiryDate` cannot re-fire the same stage.
- **V2.4** — `shouldFlipStatus = target === "expired" && doc.status === "verified"` in
  `credentialExpiryScan.ts`; on flip, `updateVerificationLevel(db, doc.freelancerId)` (existing,
  unmodified function) is called, which recalculates purely from the count of
  `status = 'verified'` rows — verified by reading `documentReview.ts` lines 79–104.
- **V2.5** — `routes/documents.ts` `POST /documents/confirm`: both the `.insert().values()` and
  `.onConflictDoUpdate().set()` branches unconditionally set `expiryAlertStage: "none"` and
  `expiryDate: resolvedExpiryDate` (null unless a new value is supplied).
- **V2.6** — `routes/freelancers.ts` `PATCH /freelancers/me`: `teachingLicenceExpiryChanged` is
  computed by comparing epoch ms of the incoming value against the current DB value; when
  different, `teachingLicenceAlertStage: "none"` is merged into the update `.set()`.
- **V2.7 / V2.9** — Vault exclusion condition in `GET /freelancers` is
  `not(and(professionCategory='education', educationProfessionType='school_teacher', teachingLicenceExpiry < now()))`.
  For any freelancer where `educationProfessionType !== 'school_teacher'` (including `tutor`,
  `university_lecturer`, `researcher`, or `null`/technology), the inner `and()` is `false`, so
  `not(false) = true` and the row is never excluded — confirms V2.9. `GET /freelancers/:id` and
  `/f/:id` have no such condition at all, so direct access is unaffected — confirms the second
  half of V2.7.
- **V2.8** — The "Expiring Soon" computation reuses `daysUntil()` from the same utility module
  already unit-tested (10/10 passing), applied to the earliest of the matched document expiry or
  teaching licence expiry within the 7-day window.
- **V3.1–V3.4** — Frontend changes are small, presentational, and type-checked against the
  codegen'd `Freelancer`/`DocumentMeItem` types (`expiringCredential`, `expiryDate`,
  `daysUntilExpiry` all present per the OpenAPI codegen output verified above); no client-side
  business logic beyond straightforward conditional rendering, confirmed by reading the
  component code against `UI.md`'s exact JSX.

**Action required before merge/deploy:** run `pnpm --filter @workspace/db run push` against a
real database, then re-run the full `validation.md` Phase 1–3 checks (especially V2.3–V2.9)
against that database with seeded fixtures, per the `curl`/SQL commands above.

---

## Sign-Off

| Phase | Status | Date |
|-------|--------|------|
| 1 Database | 🟡 Schema written, migration not yet applied (no DB in this environment) | 2026-07-21 |
| 2 Backend | 🟡 Code complete, typechecked, unit-tested; auth path live-verified; DB-dependent paths code-reviewed only | 2026-07-21 |
| 3 Frontend | 🟡 Code complete, typechecked; visual/manual QA pending a running dev environment | 2026-07-21 |

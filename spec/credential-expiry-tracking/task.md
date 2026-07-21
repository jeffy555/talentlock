# TalentLock — Task Breakdown: Credential Expiry Tracking

Three phases: Database → Backend (utils → scan → routes → OpenAPI → codegen) → Frontend.

---

## Phase 1 — Database

### Task 1.1 — Add expiry columns to `documents`

**File:** `lib/db/src/schema/documents.ts`

```ts
expiryDate: timestamp("expiry_date", { withTimezone: true }),
expiryAlertStage: text("expiry_alert_stage").notNull().default("none"),
```

### Task 1.2 — Add alert stage column to `freelancer_profiles`

**File:** `lib/db/src/schema/freelancerProfiles.ts`

```ts
teachingLicenceAlertStage: text("teaching_licence_alert_stage").notNull().default("none"),
```

### Task 1.3 — Extend document status constants

**File:** `artifacts/api-server/src/lib/documentConstants.ts` — add `"expired"` to `DOCUMENT_STATUSES`.

### Task 1.4 — Push schema

```bash
pnpm --filter @workspace/db run push
```

Verify all 3 new columns exist in Neon before Phase 2.

---

## Phase 2 — Backend

### Task 2.1 — Expiry stage utilities

**File:** `artifacts/api-server/src/lib/credentialExpiryUtils.ts` (create) — per `plan.md` D2.

### Task 2.2 — Cron secret middleware

**File:** `artifacts/api-server/src/lib/cronAuth.ts` (create) — per `plan.md` D3.

### Task 2.3 — Notification type

**File:** `artifacts/api-server/src/lib/createNotification.ts` — add `CREDENTIAL_EXPIRING: "credential_expiring"` to `NotificationType`.

### Task 2.4 — Scan pipeline

**File:** `artifacts/api-server/src/lib/credentialExpiryScan.ts` (create) — per `plan.md` D3 `runCredentialExpiryScan()`.

### Task 2.5 — Cron route

**File:** `artifacts/api-server/src/routes/cron.ts` (create) — per `plan.md` D3.

**File:** `artifacts/api-server/src/routes/index.ts` — register `cronRouter` (mounted under `/api`, outside `/api/admin`).

### Task 2.6 — `POST /documents/confirm` — accept + reset `expiryDate`

**File:** `artifacts/api-server/src/routes/documents.ts` — per `plan.md` D4. Update both `.values()` and `.onConflictDoUpdate().set()` to include `expiryDate` and `expiryAlertStage: "none"`.

### Task 2.7 — `PATCH /documents/:documentType/expiry`

**File:** `artifacts/api-server/src/routes/documents.ts` — per `plan.md` D4.

### Task 2.8 — `GET /documents/me` — expose expiry fields

**File:** `artifacts/api-server/src/routes/documents.ts` — per `plan.md` D4, using `daysUntil()` from `credentialExpiryUtils.ts`.

### Task 2.9 — Reset `teachingLicenceAlertStage` on renewal

**File:** `artifacts/api-server/src/routes/freelancers.ts` — `PATCH /freelancers/me`, per `plan.md` D5.

### Task 2.10 — Talent Vault exclusion for expired required licence

**File:** `artifacts/api-server/src/routes/freelancers.ts` — `GET /freelancers`, per `plan.md` D6. Update the `drizzle-orm` import line to add `not, lt, isNotNull, inArray`.

### Task 2.11 — Vault "Expiring Soon" indicator

**File:** `artifacts/api-server/src/routes/freelancers.ts` — per `plan.md` D7, applied only to the list endpoint response mapping (not `/:id`, not `/me`).

### Task 2.12 — OpenAPI additions

**File:** `lib/api-spec/openapi.yaml` — per `plan.md` D9:
- `Freelancer` schema: `expiringCredential`
- `DocumentsConfirmBody`: `expiryDate`
- `DocumentMeItem`: `expiryDate`, `daysUntilExpiry`; extend `status` description
- New path `/documents/{documentType}/expiry` (PATCH)
- New path `/cron/credential-expiry` (POST) — tag `cron`, no security scheme (documented as internal/machine-only)

### Task 2.13 — Codegen + typecheck

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Verify `indexFiles: false` and `lib/api-zod/src/index.ts` exports unchanged.

---

## Phase 3 — Frontend

### Task 3.1 — "Expiring Soon" Vault card badge

**File:** `artifacts/talentlock/src/pages/FreelancersList.tsx` — render an amber badge next to `VerificationBadge` when `freelancer.expiringCredential` is present.

### Task 3.2 — Expired document state in `VerificationSection`

**File:** `artifacts/talentlock/src/components/VerificationSection.tsx` — add an `expired` branch to `DocumentRow` (red `ShieldX` icon, "Expired" badge, re-upload action) and surface `daysUntilExpiry` as a small countdown line when `expiryDate` is set and status is `verified`.

### Task 3.3 — Amber/red expiry banners on `/profile`

**File:** `artifacts/talentlock/src/pages/Profile.tsx` (or a new small component `CredentialExpiryBanner.tsx` rendered there) — amber banner when any tracked credential is ≤30 days out, red urgent banner when ≤7 days out or expired. Sourced from `GET /documents/me` + `GET /freelancers/me` (`teachingLicenceExpiry`).

### Task 3.4 — Expiry date input on document upload

**File:** `artifacts/talentlock/src/components/DocumentUploader.tsx` — optional date input shown only for `professional_credential`, passed through to `usePostDocumentsConfirm`.

### Task 3.5 — GitHub Actions scheduled workflow

**File:** `.github/workflows/credential-expiry-cron.yml` (create) — per `plan.md` D8.

---

## Acceptance Criteria

- [x] `documents.expiry_date`, `documents.expiry_alert_stage`, `freelancer_profiles.teaching_licence_alert_stage` columns exist — pushed to and live-verified against the real database 2026-07-21
- [x] `POST /api/cron/credential-expiry` requires `x-cron-secret`; wrong/missing secret → 401; unset `CRON_SECRET` → 500 — live-verified against the real Express app + real database
- [x] Cron route is NOT under `/api/admin` and is unaffected by CSRF middleware — live-verified (never 403; correct-secret path returns 200 with real DB connectivity)
- [x] Running the scan twice in a row does not re-send the same alert stage twice — live-verified with a seeded fixture (first scan → `7d` + 1 alert; second scan → unchanged, 0 alerts) + unit-tested in isolation
- [x] Document crossing 0 days with `status='verified'` flips to `status='expired'`; `updateVerificationLevel()` recalculates badge — live-verified: fixture went `partially_verified` → `unverified`, `isVerified` → `false`
- [x] Re-uploading a `professional_credential` resets `expiryDate` and `expiryAlertStage` to `none` — live-verified with the exact upsert used by the route
- [x] `PATCH /freelancers/me` with a new `teachingLicenceExpiry` resets `teachingLicenceAlertStage` to `none` — live-verified
- [x] `GET /freelancers` excludes `school_teacher` freelancers with an expired `teachingLicenceExpiry`; `GET /freelancers/:id` and `/f/:id` still work for the same freelancer — live-verified (tutor with the same expired date was correctly NOT excluded)
- [x] `GET /freelancers` includes `expiringCredential: { daysRemaining }` for any freelancer with a credential expiring within 7 days — live-verified (3-day-out fixture → `daysRemaining: 3`)
- [x] Talent Vault card shows "Expiring Soon" badge when `expiringCredential` is present — implemented in `FreelancersList.tsx`, type-checked against codegen'd types
- [x] `/profile` shows amber banner at ≤30 days, red banner at ≤7 days / expired — implemented via `CredentialExpiryBanner.tsx`, type-checked
- [x] `pnpm run typecheck` passes — verified

All backend acceptance criteria have been live-verified against the real production database
using clearly-tagged, auto-cleaned-up fixtures (see `validation.md` "Validation Run Log — Update
2" for the full 16/16 result). Only frontend visual/manual QA (running dev server) remains.

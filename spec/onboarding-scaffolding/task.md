# TalentLock — Task Breakdown: Onboarding Scaffolding

Three phases: Database → Backend (OpenAPI + route) → Frontend.

---

## Phase 1 — Database

### Task 1.1 — Add onboarding columns to `users`

**File:** `lib/db/src/schema/users.ts`

```ts
onboardingRole: text("onboarding_role"), // freelancer | employer | null
onboardingStep: text("onboarding_step"), // role | profession_category | location | freelancer_details | employer_details | employer_documents | null
```

Both nullable. No default.

### Task 1.2 — Push schema

```bash
pnpm --filter @workspace/db run push
```

---

## Phase 2 — Backend

### Task 2.1 — Extend `completenessUtils.ts` (api-server)

**File:** `artifacts/api-server/src/lib/completenessUtils.ts`

Add `COMPLETENESS_WEIGHTS`, `COMPLETENESS_THRESHOLD_DASHBOARD`, `getCompletenessBreakdown()` per `plan.md`.

### Task 2.2 — OpenAPI: User schema + PATCH route

**File:** `lib/api-spec/openapi.yaml`

Add to `User` properties:
```yaml
onboardingRole:
  type: ["string", "null"]
  description: "freelancer | employer — in-progress onboarding role"
onboardingStep:
  type: ["string", "null"]
  description: "role | profession_category | location | freelancer_details | employer_details | employer_documents"
```

Add path `/users/me/onboarding-step`:
- `operationId: patchOnboardingStep`
- Request: `PatchOnboardingStepBody`
- Response 200: `User`

`PatchOnboardingStepBody` required: `onboardingRole`, `onboardingStep`, `email`, `name`; optional `avatarUrl`.

### Task 2.3 — Codegen + checks

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Verify `indexFiles: false` and `lib/api-zod/src/index.ts` exports.

### Task 2.4 — Implement PATCH route

**File:** `artifacts/api-server/src/routes/users.ts`

- Zod validate body (import generated schema from `@workspace/api-zod`)
- Upsert user with `role: "pending"`, set onboarding fields
- `req.log.info` on save
- Return updated user

### Task 2.5 — Clear onboarding fields on completion

**File:** `artifacts/api-server/src/routes/users.ts` — `PUT /users/me`

When `role` is `freelancer` or `employer`, set `onboardingRole: null`, `onboardingStep: null`.

---

## Phase 3 — Frontend

### Task 3.1 — Extend frontend `completenessUtils.ts`

**File:** `artifacts/talentlock/src/lib/completenessUtils.ts`

Mirror weights, threshold, `getCompletenessBreakdown()`, and `COMPLETENESS_LABELS` with `label`, `href` (`/profile#anchor`).

### Task 3.2 — `ProfileStrengthChecklist` component

**File:** `artifacts/talentlock/src/components/onboarding/ProfileStrengthChecklist.tsx` (create)

Props: `score: number`, `profile`, `avatarUrl: string | null`.

- Return `null` if `score >= 80`
- Render card with progress bar, list of incomplete factors with `+N%` badges, links to profile sections

### Task 3.3 — Dashboard integration

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx`

- `useGetMyFreelancerProfile` when freelancer
- Render `<ProfileStrengthChecklist />` below welcome header, above metrics

### Task 3.4 — Onboarding persistence + resume

**File:** `artifacts/talentlock/src/pages/Onboarding.tsx`

- Import `usePatchOnboardingStep` from codegen
- `persistOnboardingStep(role, step)` helper — PATCH with Clerk user fields
- On role select: await PATCH then advance step
- On freelancer work category continue: advance UI to Location **without** PATCH (server stays at `profession_category`)
- On location continue: await PATCH with `countryCode` then advance step
- On employer company profile submit:
  1. `PATCH` → `employer_details` (ensure pending user exists)
  2. `PUT /employers/me`
  3. `PATCH` → `employer_documents`
  4. Advance to document upload step (do **not** set `role: employer` yet)
- `useEffect` when `dbUser?.role === "pending"`: restore `role` + `step` from server without regressing local step
- Fix step indicator for 4-step freelancer / 4-step employer paths (includes location from multi-currency spec)
- Pre-fill employer form from `GET /employers/me` when profile already saved
- Remove or demote `localStorage` intended role when server state exists
- **Resume import:** `handleResumeParsed` sets `bio` from parser output; include `bio` in both auto-create (`POST /freelancers` after parse) and manual freelancer submit so completeness bio factor is satisfied without a separate onboarding bio field

### Task 3.5 — Employer mandatory document onboarding step

**File:** `artifacts/talentlock/src/components/onboarding/EmployerDocumentOnboardingStep.tsx` (create)

- Single required upload: `representative_id`
- Reuse employer document upload hooks (`POST upload-url`, `POST confirm`, `GET me`)
- "Finish registration" disabled until one document row exists (any status except not uploaded)
- On finish: `PUT /api/users/me` with `role: employer` → redirect `/dashboard`

See `spec/employee-verification/` Module 10 and `UI.md` onboarding section.

---

## Acceptance Criteria

- [ ] `onboarding_role` and `onboarding_step` columns exist on `users`
- [ ] `PATCH /api/users/me/onboarding-step` upserts pending user and returns User
- [ ] `GET /api/users/me` includes nullable `onboardingRole` and `onboardingStep`
- [ ] Completing onboarding clears onboarding columns
- [ ] `/onboarding` resumes from saved step after refresh
- [ ] Employer path: company profile saves on first submit (pending user created before `PUT /employers/me`)
- [ ] Employer path: cannot finish registration without uploading Representative ID
- [ ] Employer path: `PUT /users/me` with `role: employer` only runs after document upload
- [ ] Freelancer dashboard shows checklist when score < 80% with point labels and profile links
- [ ] Checklist hidden when score >= 80%
- [ ] Employers never see checklist
- [ ] `pnpm run typecheck` passes

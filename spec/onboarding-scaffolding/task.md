# TalentLock — Task Breakdown: Onboarding Scaffolding

Three phases: Database → Backend (OpenAPI + route) → Frontend.

---

## Phase 1 — Database

### Task 1.1 — Add onboarding columns to `users`

**File:** `lib/db/src/schema/users.ts`

```ts
onboardingRole: text("onboarding_role"), // freelancer | employer | null
onboardingStep: text("onboarding_step"), // role | profession_category | freelancer_details | employer_details | null
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
  description: "role | profession_category | freelancer_details | employer_details"
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
- On role select: PATCH then advance step
- On profession continue: PATCH `freelancer_details`
- On employer path from role: PATCH `employer_details`
- `useEffect` when `dbUser?.role === "pending"`: restore `role` + `step` from server
- Fix step indicator for 3-step freelancer / 2-step employer paths
- Remove or demote `localStorage` intended role when server state exists

---

## Acceptance Criteria

- [ ] `onboarding_role` and `onboarding_step` columns exist on `users`
- [ ] `PATCH /api/users/me/onboarding-step` upserts pending user and returns User
- [ ] `GET /api/users/me` includes nullable `onboardingRole` and `onboardingStep`
- [ ] Completing onboarding clears onboarding columns
- [ ] `/onboarding` resumes from saved step after refresh
- [ ] Freelancer dashboard shows checklist when score < 80% with point labels and profile links
- [ ] Checklist hidden when score >= 80%
- [ ] Employers never see checklist
- [ ] `pnpm run typecheck` passes

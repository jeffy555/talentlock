# TalentLock — Implementation Plan: Onboarding Scaffolding

> **Status: APPROVED — Ready for implementation**
> Resolves all questions from `clarify.md`. Wins over `task.md` on conflict.

---

## Resolved Questions

### Q1 — Stub user creation

**Decision:** `PATCH /api/users/me/onboarding-step` upserts by `clerkId`. If no row exists, `INSERT` with `role: "pending"`.

```ts
await db.insert(usersTable).values({
  clerkId,
  role: "pending",
  email: body.email,
  name: sanitiseText(body.name),
  avatarUrl: body.avatarUrl ?? null,
  onboardingRole: body.onboardingRole,
  onboardingStep: body.onboardingStep,
}).onConflictDoUpdate({ ... });
```

Use Drizzle `onConflictDoUpdate` on `clerkId` unique constraint.

---

### Q2 — Step enum

**Decision:** Store these exact strings in `onboarding_step`:

```ts
export const ONBOARDING_STEPS = [
  "role",
  "profession_category",
  "location",
  "freelancer_details",
  "employer_details",
  "employer_documents",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
```

Zod: `z.enum(ONBOARDING_STEPS)` for `onboardingStep`; `z.enum(["freelancer", "employer"])` for `onboardingRole`.

---

### Q3 — Clear on completion

**Decision:** In `PUT /api/users/me`, when `parsed.data.role` is `freelancer` or `employer`:

```ts
onboardingRole: null,
onboardingStep: null,
```

---

### Q4 — Dashboard profile fetch

**Decision:** `Dashboard.tsx` calls `useGetMyFreelancerProfile({ query: { enabled: user?.role === "freelancer" } })`.

---

### Q5 — Feature 2 overlap

**Decision:** Export shared factor metadata from frontend `completenessUtils.ts` only. No new API endpoint for breakdown — compute client-side from profile fields already returned by `GET /freelancers/me` + `GET /users/me`.

---

## Completeness factor metadata (shared)

Add to `artifacts/talentlock/src/lib/completenessUtils.ts` and mirror in `artifacts/api-server/src/lib/completenessUtils.ts`:

```ts
export const COMPLETENESS_WEIGHTS = {
  photo: 15,
  bio: 20,
  skills: 20,
  rate: 15,
  field: 15,
  availability: 15,
} as const;

export const COMPLETENESS_THRESHOLD_DASHBOARD = 80;

export function getCompletenessBreakdown(
  profile: Parameters<typeof getMissingCompletenessFields>[0],
  avatarUrl?: string | null,
) {
  const missing = new Set(getMissingCompletenessFields(profile, avatarUrl));
  return (Object.keys(COMPLETENESS_WEIGHTS) as CompletenessField[])
    .filter((f) => missing.has(f))
    .map((field) => ({
      field,
      points: COMPLETENESS_WEIGHTS[field],
      ...COMPLETENESS_LABELS[field],
    }));
}
```

`COMPLETENESS_LABELS` matches `CompletenessBanner` copy + `/profile` anchors.

---

## PATCH /api/users/me/onboarding-step

**Request body:**

```ts
{
  onboardingRole: "freelancer" | "employer";
  onboardingStep: OnboardingStep;
  email: string;
  name: string;
  avatarUrl?: string | null;
}
```

**Response:** Full `User` object (200).

**Auth:** Clerk required (401 if missing).

---

## Onboarding resume mapping

```ts
function resolveOnboardingStep(dbUser: User): OnboardingStep | "role" {
  if (dbUser.role !== "pending") return null; // redirect dashboard
  return (dbUser.onboardingStep as OnboardingStep) ?? "role";
}
```

On mount when `dbUser.role === "pending"`:
- Set `role` state from `dbUser.onboardingRole`
- Set `step` from `dbUser.onboardingStep` (default `role`)
- **Never regress** local step when server `onboardingStep` is behind (compare step order)

### Resume import → profile fields (freelancer profile step)

`POST /api/freelancers/parse-resume` returns structured fields including `bio`. On first upload during `/onboarding`:

| Parsed field | Onboarding state | Persisted via |
|---|---|---|
| `tagline`, `fieldOfWork`, `skills`, rates, `resumeAnalysis` | Form state + auto `POST /freelancers` | Existing create payload |
| **`bio`** | `bio` state (no separate onboarding field) | **`POST /freelancers` `bio` on auto-create and final submit** |

**Contract:** `CreateFreelancerProfileBody` accepts optional `bio`. When the resume parser returns a bio (typically ≥50 chars), it is saved on profile create so completeness scoring and the dashboard checklist do **not** re-prompt for bio after a successful resume import.

Manual profile submit without resume may still leave bio empty — checklist nudge remains valid in that case.

---

## Employer company profile save (Q6)

**Decision:** Before `PUT /api/employers/me` during onboarding:

```ts
await persistOnboardingStep("employer", "employer_details");
await upsertEmployerProfile.mutateAsync({ ... });
await persistOnboardingStep("employer", "employer_documents");
setStep("employer-documents");
```

Do **not** call `PUT /api/users/me` with `role: employer` until document upload step completes.

`PATCH /onboarding-step` upserts the pending user row — this must run before the first employer profile save.

---

## Step indicator (freelancer vs employer)

| Path | Steps |
|------|-------|
| Freelancer | 1 Account type → 2 Work category → 3 Location → 4 Profile details |
| Employer | 1 Account type → 2 Location → 3 Company profile → 4 Verification |

Compute `progressStep` from current `step` + `onboardingRole`, not a hardcoded 2-step array.

---

## Freelancer work category → location (Q7)

**Decision:** Advancing from the Work category screen to the Location screen is **UI-only** — do **not** call `PATCH /onboarding-step` with `onboardingStep: "location"` until the user selects a country.

Reason: `location` PATCH requires `countryCode` (see `spec/multi-currency-location/`). Calling PATCH early returns **400** and shows a false "Could not save progress" warning.

Server `onboardingStep` remains `profession_category` until Location Continue succeeds with `countryCode` + `stateCode`.

---

## Pre-Implementation Checklist

- [ ] Confirm `users.clerk_id` has UNIQUE constraint (for upsert)
- [ ] Confirm `CompletenessBanner` anchor IDs match Profile page section IDs
- [ ] Run `pnpm --filter @workspace/db run push` after schema edit
- [ ] Run codegen + typecheck before frontend

---

## Phase Sign-Off

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Database — `onboarding_role`, `onboarding_step` on `users` | ✅ |
| 2 | Backend — PATCH route, OpenAPI (`employer_documents` step), codegen, clear on PUT | ✅ |
| 3 | Frontend — resume onboarding, dashboard checklist, employer 4-step flow + mandatory doc gate, company profile first-save fix | ✅ |

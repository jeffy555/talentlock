# TalentLock — Features Specification: Onboarding Scaffolding

## Overview

New TalentLock users complete registration at `/onboarding`, but progress today is fragile: the intended role is stored only in `localStorage` (`talentlock_intended_role`), and refreshing or switching devices loses the user's place. After onboarding, freelancers have no central prompt on the dashboard explaining how to raise their profile completeness score.

**Onboarding Scaffolding** adds two low-effort improvements from Sprint 1 of the product roadmap:

1. **Server-side onboarding persistence** — save role and step to the database as the user progresses, so onboarding resumes on any device.
2. **Dashboard completion nudge** — a freelancer-only checklist on `/dashboard` that breaks the existing completeness score into actionable items with point values and deep links to `/profile` sections. Hidden when `completenessScore >= 80%`.

All plans. No token consumption. No new subscription gates.

---

## Feature Modules

### Module 1 — Server-Side Onboarding Persistence

New nullable columns on `users`:

| Column | Type | Values |
|--------|------|--------|
| `onboardingRole` | text, nullable | `freelancer` \| `employer` |
| `onboardingStep` | text, nullable | `role` \| `profession_category` \| `location` \| `freelancer_details` \| `employer_details` \| `employer_documents` |

New endpoint:

```
PATCH /api/users/me/onboarding-step
```

Body: `{ onboardingRole, onboardingStep }` plus Clerk identity fields (`email`, `name`, `avatarUrl`) used to upsert a stub user row on first save.

Behaviour:

- Creates or updates the `users` row with `role: "pending"` until final profile submission.
- `GET /api/users/me` returns `onboardingRole` and `onboardingStep` so the frontend can resume.
- On successful final onboarding (`PUT /api/users/me` with `role: freelancer|employer`), both onboarding columns are cleared to `null`.
- Replaces reliance on `localStorage` for role persistence (localStorage may remain as a fallback for pre-login marketing CTAs only).

### Module 2 — Onboarding Resume UX

`/onboarding` reads `onboardingRole` + `onboardingStep` from `GET /api/users/me` on mount:

| Saved step | Screen shown |
|------------|--------------|
| `role` or null | Role picker |
| `profession_category` | Profession category (freelancer) |
| `location` | Country / state / currency (freelancer and employer) |
| `freelancer_details` | Freelancer profile form |
| `employer_details` | Employer company profile form |
| `employer_documents` | Employer mandatory Representative ID upload |

Step indicator reflects actual paths:

| Path | Steps |
|------|-------|
| Freelancer | 1 Account type → 2 Work category → 3 Location → 4 Profile details |
| Employer | 1 Account type → 2 Location → 3 Company profile → 4 Verification (1 document) |

`PATCH /api/users/me/onboarding-step` is awaited on each step transition where server persistence is required. Step advances only after PATCH succeeds where ordering matters.

**Freelancer PATCH rules:**

| UI transition | PATCH? | `onboardingStep` | Notes |
|---------------|--------|------------------|-------|
| Role → Work category | Yes | `profession_category` | Creates pending user row |
| Work category → Location (UI only) | **No** | — | Client advances UI; server stays at `profession_category` until country is chosen |
| Location → Profile details | Yes | `location` | Must include `countryCode` (+ `stateCode` when required) |
| Profile submit | — | cleared via `PUT /users/me` | — |

**Employer PATCH rules:** role → `location` (with country) → `employer_details` → `employer_documents` → `PUT /users/me`.

### Module 2b — Employer Registration Completion Order

Employer onboarding does **not** call `PUT /api/users/me` with `role: employer` until after company profile **and** mandatory document upload:

1. `PATCH /onboarding-step` through `location` and `employer_details` (creates/updates pending user).
2. `PUT /api/employers/me` — company profile (requires existing `users` row).
3. `PATCH /onboarding-step` → `employer_documents`.
4. Upload Representative ID via `/api/employer-documents/*` (allowed while `role: pending`, `onboardingRole: employer`).
5. `PUT /api/users/me` with `role: employer` — clears onboarding columns and unlocks dashboard.

**First-attempt company profile save:** frontend must call `PATCH /onboarding-step` with `employer_details` immediately before `PUT /employers/me` so the pending user row exists (avoids 400 `User profile not found`).

Form pre-fills from `GET /api/employers/me` when returning to the company profile step after a partial save.

### Module 3 — Dashboard Profile Strength Checklist

Freelancer dashboard shows a card when `completenessScore < 80`:

- Title: **Strengthen your profile**
- Subtitle: current score and target (80%)
- Checklist rows for each **incomplete** factor from `calculateCompletenessScore()` weights:
  - Add a profile photo **+15%**
  - Add a bio (50+ characters) **+20%**
  - Add at least 2 skills **+20%**
  - Set your rate **+15%**
  - Set your field of work **+15%**
  - Set your availability **+15%**
- Each row links to `/profile#{anchor}` (same anchors as `CompletenessBanner`).
- Card hidden when `completenessScore >= 80`.
- Employers never see this card.

---

## Non-Goals

- Employer dashboard completeness checklist (employers have no completeness score) — **Note:** employer onboarding now includes a mandatory document upload step (see Module 2b); full 5-document verification remains optional on `/profile`
- New completeness scoring weights or fields — reuse existing `completenessUtils.ts` formula
- Profile Strength Nudges on `/profile` (separate roadmap Feature 2) — this feature only adds the **dashboard** nudge
- Email reminders or push notifications for incomplete profiles
- Forcing users through onboarding steps they already completed (resume is best-effort, user can always go Back)
- Admin console changes
- Changing Talent Vault 60% visibility gate (unchanged)

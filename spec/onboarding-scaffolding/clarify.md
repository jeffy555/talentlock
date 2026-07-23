# TalentLock — Clarification & Verification: Onboarding Scaffolding

---

## Verified — Consistent with Existing Architecture

| Item | Verified Against |
|------|------------------|
| `/onboarding` route exists; 404 from `GET /api/users/me` means new user | `project.md`, `Onboarding.tsx` |
| `role: "pending"` already used to keep users on onboarding | `Onboarding.tsx` |
| `PUT /api/users/me` upserts user on final submit | `users.ts` route |
| `calculateCompletenessScore()` + `getMissingCompletenessFields()` exist | `completenessUtils.ts` (api-server + talentlock) |
| `completenessScore` column on `freelancer_profiles` | `project.md` Product Gaps |
| `CompletenessBanner` on `/profile` with anchor links | `CompletenessBanner.tsx` |
| `useGetMyFreelancerProfile` hook available | OpenAPI `/freelancers/me` |
| Clerk provides email, name, avatar on client | `@clerk/react` |

---

## Open Questions

### Q1 — When is the stub `users` row created?

**Question:** Should `PATCH /onboarding-step` create the row on first role selection, or only update an existing row?

**Impact:** New users currently get 404 until `PUT /api/users/me` at the end. Persistence requires upsert on first PATCH.

**Recommendation:** Upsert on PATCH — insert with `role: "pending"` if no row exists for `clerkId`.

---

### Q2 — Onboarding step enum values

**Question:** Should step values match frontend state names exactly?

**Recommendation:** Use snake_case API values: `role`, `profession_category`, `location`, `freelancer_details`, `employer_details`, `employer_documents`. Map in `Onboarding.tsx` 1:1 with existing `step` state union. (`location` from multi-currency spec; `employer_documents` from employee-verification Module 10.)

---

### Q3 — Clear onboarding columns on completion

**Question:** Who clears `onboardingRole` / `onboardingStep`?

**Recommendation:** Server clears both to `null` inside `PUT /api/users/me` when `role` is `freelancer` or `employer` (not `pending`).

---

### Q4 — Dashboard data source for completeness

**Question:** Does dashboard already fetch freelancer profile?

**Impact:** Need `useGetMyFreelancerProfile` on dashboard for freelancers.

**Recommendation:** Enable query when `user.role === "freelancer"`; pass profile + `user.avatarUrl` to checklist component.

---

### Q5 — Overlap with Profile Strength Nudges (Feature 2)

**Question:** Feature 2 is "per-factor completeness breakdown — zero schema change" on profile. Does Feature 1 duplicate it?

**Recommendation:** Feature 1 scope is **dashboard only**. Profile page keeps existing `CompletenessBanner`. Feature 2 can enhance profile later without conflict.

---

## Risks & Notes

### Risk 1 — localStorage intended role

`Landing.tsx` / sign-up may still set `talentlock_intended_role`. Keep reading it once on mount, but prefer server `onboardingStep` when user row exists.

### Risk 2 — Resume auto-create profile path

Resume importer auto-creates profile without visiting intermediate steps — must still clear onboarding columns via normal `PUT /users/me` + `POST freelancers`.

### Risk 3 — OpenAPI User schema

`GET /api/users/me` must expose new nullable fields. Codegen required before frontend hooks.

---

## Summary of Blockers

| ID | Blocker | Gates |
|----|---------|-------|
| Q1 | Upsert on PATCH | Phase 2 route |
| Q2 | Step enum | Phase 2 + 3 |
| Q3 | Clear on completion | Phase 2 PUT handler |
| Q4 | Dashboard profile fetch | Phase 3 |

All resolved in `plan.md`.

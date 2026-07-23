# TalentLock — Validation: Onboarding Scaffolding

Run after all `task.md` phases complete.

---

## Phase 1 — Database

### V1.1 — Columns exist

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name IN ('onboarding_role', 'onboarding_step');
```

Expected: 2 rows.

---

## Phase 2 — API

### V2.1 — PATCH creates pending user

```bash
# Authenticated as new Clerk user (no users row yet)
curl -s -X PATCH /api/users/me/onboarding-step \
  -H "Content-Type: application/json" \
  -d '{"onboardingRole":"freelancer","onboardingStep":"profession_category","email":"test@example.com","name":"Test User"}'
```

Expected: 200, `role: "pending"`, `onboardingRole: "freelancer"`, `onboardingStep: "profession_category"`.

### V2.2 — GET returns onboarding fields

```bash
curl -s /api/users/me
```

Expected: includes `onboardingRole`, `onboardingStep` on pending user.

### V2.3 — PUT clears onboarding fields

Complete onboarding via `PUT /api/users/me` with `role: "freelancer"`.

Expected: `onboardingRole: null`, `onboardingStep: null`.

### V2.4 — Invalid step rejected

PATCH with `onboardingStep: "invalid"` → 400.

### V2.5 — `employer_documents` step accepted

```bash
curl -s -X PATCH /api/users/me/onboarding-step \
  -H "Authorization: Bearer <employer_pending_token>" \
  -H "Content-Type: application/json" \
  -d '{"onboardingRole":"employer","onboardingStep":"employer_documents","email":"emp@example.com","name":"Emp User"}'
```

Expected: 200, `onboardingStep: "employer_documents"`.

### V2.6 — Employer profile requires pending user

Attempt `PUT /api/employers/me` with no `users` row → 400 `User profile not found`.

After `PATCH /onboarding-step` with any valid step → `PUT /api/employers/me` succeeds.

---

## Phase 3 — Frontend

### V3.1 — Resume after refresh

1. Sign in as new user, select Freelancer, reach profession category.
2. Refresh page.

Expected: profession category step shown (not role picker).

### V3.2 — Cross-device resume

1. Save step on device A.
2. Sign in on device B.

Expected: same step restored.

### V3.3 — Dashboard checklist

1. Freelancer with `completenessScore` 45.
2. Open `/dashboard`.

Expected: checklist visible with incomplete items and `+N%` labels.

### V3.4 — Checklist hidden at 80%+

Freelancer with score >= 80 → no checklist card.

### V3.5 — Freelancer work category → location (no false save warning)

1. New freelancer: select account type → pick Technology or Education → click Continue.

Expected: advances to Location step with **no** "Could not save progress" toast.

2. Network tab: no `PATCH /api/users/me/onboarding-step` with `onboardingStep: "location"` until country is selected on Location step.

### V3.5b — Resume import persists bio

1. New freelancer: reach Profile details step, upload a resume via `ResumeImporter`.
2. Complete onboarding.

Expected:
- `POST /freelancers` request body includes `bio` when parser returned one.
- `GET /freelancers/me` returns `bio` with length ≥ 50 when parser produced a valid summary.
- Dashboard profile strength checklist does **not** show "Add a bio" when bio factor is already satisfied.

### V3.6 — Employer dashboard

Employer login → no checklist card.

### V3.7 — Employer company profile first save

1. New employer: complete role + location, fill company profile, click Continue once.

Expected: advances to Verification step without error toast; `GET /employers/me` returns saved company.

### V3.8 — Employer mandatory document gate

1. On Verification step, click Finish without uploading.

Expected: button disabled.

2. Upload Representative ID (JPEG/PNG/WebP), click Finish.

Expected: redirect to `/dashboard`; `GET /users/me` shows `role: employer`, onboarding fields null.

### V3.9 — Profile links

Click checklist row → navigates to `/profile#bio` (or correct anchor).

---

## Security

- [ ] PATCH requires Clerk auth (401 without)
- [ ] Users can only PATCH their own row (clerkId from token)
- [ ] `sanitiseText()` applied to `name` on PATCH

---

## Regression

- [ ] Existing onboarding completion flow still works (freelancer + employer with document step)
- [ ] Resume importer auto-create still redirects to dashboard
- [ ] `CompletenessBanner` on `/profile` unchanged
- [ ] Talent Vault 60% gate unchanged

---

## Sign-Off

| Phase | Status | Date |
|-------|--------|------|
| 1 Database | ⬜ | |
| 2 Backend | ⬜ | |
| 3 Frontend | ⬜ | |

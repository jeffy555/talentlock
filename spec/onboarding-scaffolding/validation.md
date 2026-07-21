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

### V3.5 — Employer dashboard

Employer login → no checklist card.

### V3.6 — Profile links

Click checklist row → navigates to `/profile#bio` (or correct anchor).

---

## Security

- [ ] PATCH requires Clerk auth (401 without)
- [ ] Users can only PATCH their own row (clerkId from token)
- [ ] `sanitiseText()` applied to `name` on PATCH

---

## Regression

- [ ] Existing onboarding completion flow still works (freelancer + employer)
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

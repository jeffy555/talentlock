# TalentLock — UI Specification: Onboarding Scaffolding

Frontend surfaces: `/onboarding` (account type + single registration form), `/dashboard` profile strength card.

**Design tokens:** Navy primary (`#0d1f3c`), gold accent (`#c9a84c`) — match existing onboarding and dashboard.

---

## Surface 1 — Account type

**File:** `artifacts/talentlock/src/pages/Onboarding.tsx`

Two cards: Freelancer / Employer. On click → `PATCH onboarding-step` with `onboardingStep: role`, then show the single registration form.

No multi-step progress indicator.

---

## Surface 2 — Single registration form

One card per role after account type is chosen.

### Freelancer

Sections (top to bottom):

1. Work category (Technology / Education + education subtype)
2. Location (`CountryStateFields` once)
3. Profile (resume import optional, tagline, field, skills, rate, teaching details if education)
4. Identity verification (embedded `FreelancerDocumentOnboardingStep` — Aadhaar required)

Footer: Back (to account type) | **Finish registration →** (disabled until Aadhaar uploaded)

### Employer

Sections:

1. Location
2. Company profile
3. Identity verification (embedded `EmployerDocumentOnboardingStep` — Aadhaar required; optional other ID)

Footer: Back | **Finish registration →** (disabled until Aadhaar uploaded)

### Document components

**Files:**

- `FreelancerDocumentOnboardingStep.tsx` — `embedded` prop for inline section
- `EmployerDocumentOnboardingStep.tsx` — `embedded` prop; onboarding shows Aadhaar + optional representative ID only

Both accept `ensureProfile` so upload can create the pending profile first.

---

## Surface 3 — Profile Strength Checklist (Dashboard)

Unchanged — see prior checklist card spec on `/dashboard` for freelancers with score &lt; 80.

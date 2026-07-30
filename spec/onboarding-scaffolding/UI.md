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

1. Contact details (required email + phone with **country calling code** selector — E.164 storage; used for meeting invites / calendar guests)
2. Work category (Technology / Education + education subtype)
3. Location (`CountryStateFields` once)
4. Profile (resume import optional, tagline, field, skills, rate, teaching details if education)
5. Identity verification (embedded `FreelancerDocumentOnboardingStep` — Aadhaar required)

Footer: Back (to account type) | **Finish registration →** (disabled until Aadhaar uploaded)

### Employer

Sections:

1. Contact details (required email + phone with **country calling code** selector — E.164 storage; used for meeting invites / calendar guests)
2. Location
3. Company profile
4. Identity verification (embedded `EmployerDocumentOnboardingStep` — Aadhaar required; optional other ID)

Footer: Back | **Finish registration →** (disabled until Aadhaar uploaded)

### Contact phone control

**File:** `artifacts/talentlock/src/components/onboarding/PhoneWithCountryFields.tsx`

- Country dial-code select (from `/api/countries` `dialCode`) + national number input
- Emits full E.164 string (`+{dial}{national}`) to parent state
- Same control on `/profile#account` for **existing users**

### Existing users (parity with onboarding)

Whenever onboarding gains a required contact field, existing `freelancer` / `employer` accounts get:

1. Editable fields on `/profile` Account card
2. Amber banner on `/dashboard` → Update now → `/profile#account`
3. In-app notification `contact_update_required` (entityType `user_contact` → `/profile#account`), created on `GET /api/users/me` when phone is missing (unread deduped)

### Document components

**Files:**

- `FreelancerDocumentOnboardingStep.tsx` — `embedded` prop for inline section
- `EmployerDocumentOnboardingStep.tsx` — `embedded` prop; onboarding shows Aadhaar + optional representative ID only

Both accept `ensureProfile` so upload can create the pending profile first.

---

## Surface 3 — Profile Strength Checklist (Dashboard)

Unchanged — see prior checklist card spec on `/dashboard` for freelancers with score &lt; 80.

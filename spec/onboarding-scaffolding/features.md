# TalentLock — Features Specification: Onboarding Scaffolding

## Overview

New TalentLock users complete registration at `/onboarding`. Progress is persisted server-side so refresh or another device can resume. After onboarding, freelancers see a dashboard checklist to raise profile completeness (hidden at `completenessScore >= 80%`).

**UX (current):** Account type picker, then a **single registration form** (not a multi-step wizard) that includes location, profile/company fields, and mandatory Aadhaar verification on the same page.

---

## Feature Modules

### Module 1 — Server-Side Onboarding Persistence

New nullable columns on `users`:

| Column | Type | Values |
|--------|------|--------|
| `onboardingRole` | text, nullable | `freelancer` \| `employer` |
| `onboardingStep` | text, nullable | `role` \| `profession_category` \| `location` \| `freelancer_details` \| `freelancer_documents` \| `employer_details` \| `employer_documents` |

API enum values are unchanged for backward compatibility. The **UI** only uses:

| UI | Server `onboardingStep` written |
|----|----------------------------------|
| Account type chosen | `role` |
| Single registration form (in progress / resume) | `freelancer_details` or `employer_details` (with `countryCode` when location is saved) |

```
PATCH /api/users/me/onboarding-step
```

Behaviour:

- Creates or updates the `users` row with `role: "pending"` until final profile submission.
- `GET /api/users/me` returns `onboardingRole` and `onboardingStep` so the frontend can resume.
- On successful final onboarding (`PUT /api/users/me` with `role: freelancer|employer`), both onboarding columns are cleared to `null`.
- Any legacy multi-step value (`location`, `profession_category`, `*_documents`, etc.) resumes on the **single form**.

### Module 2 — Single-Form Registration UX

`/onboarding` flow:

1. **Account type** — Freelancer or Employer cards (persists `onboardingStep: role`).
2. **One registration document** — scrollable form with all required sections + Finish.

| Path | Form sections |
|------|----------------|
| Freelancer | Contact (email + phone w/ country dial) → Work category → Location → Profile (optional resume import) → Identity (Aadhaar required) |
| Employer | Contact (email + phone w/ country dial) → Location → Company profile → Identity (Aadhaar required) |

- No step indicator / no Continue between sections.
- One primary CTA: **Finish registration →** (disabled until Aadhaar is uploaded).
- Document upload may call `ensureProfile` first so a pending profile exists (required by `/api/documents/*` and `/api/employer-documents/*`).
- `PUT /users/me` with final role + email + phone (E.164) runs only after profile save + Aadhaar present.
- Phone is collected via `PhoneWithCountryFields` (country calling code + national number) and stored as E.164 on `users.phone`.

### Module 2d — Existing-user parity for onboarding contact fields

Rule: **any new mandatory onboarding contact field must also ship for existing users.**

| Surface | Behaviour |
|---------|-----------|
| `PATCH /api/users/me/contact` | Update email + phone for completed accounts |
| `/profile#account` | Same email + phone-with-dial UI as onboarding |
| `/dashboard` | Amber banner when phone missing → Update now |
| `GET /api/users/me` | Creates unread `contact_update_required` notification (deduped) when role is freelancer/employer and phone invalid/missing |
| Notification click | Routes to `/profile#account` (`entityType: user_contact`) |
| After contact save | Marks `contact_update_required` notifications read |

### Module 2b / 2c — Completion order (unchanged rules, single page)

**Employer**

1. `PATCH` pending user (`role` then `employer_details` + country).
2. `PUT /api/employers/me` (before or as part of document upload ensure).
3. Upload Aadhaar via `/api/employer-documents/*` while `role: pending`.
4. `PUT /api/users/me` with `role: employer`.

**Freelancer**

1. `PATCH` pending user (`role` then `freelancer_details` + country).
2. `POST /api/freelancers` while `role: pending`.
3. Upload Aadhaar via `/api/documents/*` while pending.
4. `PUT /api/users/me` with `role: freelancer`.

**Talent Vault:** only users with `users.role = freelancer` are listed/detailable.

### Module 3 — Dashboard Profile Strength Checklist

Unchanged — freelancer dashboard card when `completenessScore < 80`.

---

## Non-Goals

- Allowing finish without Aadhaar
- Multi-step wizard UI (removed)
- Separate Location / Work category / Verification stages in the UI
- Changing Talent Vault 60% gate (pending-role profiles still hidden)

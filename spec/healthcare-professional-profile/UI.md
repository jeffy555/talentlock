# TalentLock — UI Specification: Healthcare Professional Profile

## Overview

Healthcare extends four surfaces already changed by the Teaching spec: Onboarding (third category card + mandatory Aadhaar), Profile (healthcare section + credential checklist), Talent Vault (Healthcare filter + specialty), Job Posting (healthcare rate types). Technology and Education UIs remain pixel-identical when those categories are selected.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter.

**Accent:** Emerald/teal clinical palette — distinct from Education violet and TalentSearch teal employer accent.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Healthcare card (selected) | `border-emerald-500 ring-2 ring-emerald-200 bg-emerald-50` | Selected Healthcare category card |
| Healthcare badge | `bg-emerald-50 text-emerald-800 border-emerald-200` | Sub-type badge on cards ("Physician", "Registered Nurse") |
| Aadhaar verified | `bg-green-100 text-green-800` + `CheckCircle` icon | Verified Aadhaar status |
| Aadhaar pending | `bg-amber-100 text-amber-800` | Pending review |
| Aadhaar rejected | `bg-red-100 text-red-800` | Re-upload required |
| Filter chip (active healthcare) | `bg-emerald-600 text-white` | Talent Vault Healthcare filter |
| Credential checklist required | `text-red-600` + asterisk | Aadhaar row |
| Credential future | `text-slate-400` + "Planned" pill | Phase 2 documents |

---

## Surface 1 — Onboarding: Healthcare Category Card

**File:** `artifacts/talentlock/src/pages/Onboarding.tsx`

Extend profession category grid to **three cards** (`grid-cols-1 md:grid-cols-3`).

```
What kind of work do you do?

[ Technology ]     [ Education ]      [ Healthcare ]
Software, design   Teaching, tutoring Doctors, nurses,
data, DevOps       lecturing          allied health, care

                              [Continue →]
```

Healthcare card:

```tsx
<button
  onClick={() => setProfessionCategory("healthcare")}
  className={cn(
    "rounded-lg border-2 p-5 text-left transition-colors",
    professionCategory === "healthcare"
      ? "border-emerald-500 ring-2 ring-emerald-200 bg-emerald-50"
      : "border-slate-200 hover:border-slate-300"
  )}
>
  <Stethoscope className="h-6 w-6 mb-2 text-emerald-700" />
  <p className="font-semibold text-slate-800">Healthcare</p>
  <p className="text-sm text-slate-500 mt-1">
    Doctors, nurses, allied health, care workers
  </p>
</button>
```

Continue disabled until a category is selected. Education sub-type rules unchanged.

---

## Surface 2 — Healthcare Sub-Type Picker

Shown when `professionCategory === 'healthcare'`:

```
What best describes your role?

( ) Physician / Doctor (MBBS, specialist)
( ) Registered Nurse (RN / RM)
( ) Nurse Practitioner / Advanced Practice
( ) Allied Health (Physio, Radiology, Lab, OT, Pharmacy)
( ) Care Worker / Health Care Assistant

                    [← Back]    [Continue →]
```

Continue disabled until sub-type selected.

---

## Surface 3 — Healthcare Details Section (Profile Form)

**Component:** `HealthcareDetailsSection.tsx`

Rendered during onboarding (and on Profile edit) when healthcare selected.

```
┌─ Healthcare Details ─────────────────────────────────────┐
│ Clinical specialties *    [chip input]                   │
│   e.g. Internal Medicine, ICU, Pediatrics                │
│                                                          │
│ Care settings             [chip input]                   │
│   Hospital, Clinic, Telehealth, Home care                 │
│                                                          │
│ Years of clinical experience  [number]                   │
│                                                          │
│ Highest qualification      [select: MBBS, B.Sc Nursing…] │
│ Specialization             [text]                        │
│ Institution                [text]                        │
│                                                          │
│ Registration council       [text] e.g. Maharashtra SMC     │
│ Registration number        [text] — masked after save    │
│ Registration expiry        [date picker] optional        │
│                                                          │
│ Preferred care mode        ( ) In-person ( ) Telehealth  │
│                            ( ) Both                      │
└──────────────────────────────────────────────────────────┘
```

Chip input: reuse existing `ChipInput` / skills component from Teaching rollout.

---

## Surface 4 — Aadhaar (Registration Form — Not Healthcare-Only)

Aadhaar upload lives on the **unified freelancer registration form** (`FreelancerDocumentOnboardingStep`, embedded). Healthcare freelancers use the same component as technology/education users.

Healthcare-specific UX additions:
- Profile page shows Aadhaar status in healthcare credential checklist
- Vault card shows "Aadhaar ✓" when `aadhaarVerificationStatus === 'verified'`
- Banner on healthcare profile if Aadhaar pending/rejected: "Complete identity verification to appear in Talent Vault"

Do **not** duplicate upload UI inside `HealthcareDetailsSection`.

---

## Surface 5 — Credential Checklist (Profile Page)

**Component:** `HealthcareCredentialChecklist.tsx`

```
Your credentials
──────────────────
✓ Aadhaar (verified)                    [View]
○ Experience letter                     Planned — upload coming soon
○ MBBS degree                           Planned
○ Medical council registration            Planned
```

Phase 1: only Aadhaar row is interactive. Phase 2 rows show muted "Planned" badge (not broken upload buttons).

Lookup: `REQUIRED_DOCUMENTS_BY_HEALTHCARE_TYPE[healthcareProfessionType]`.

---

## Surface 6 — Talent Vault Filters

**File:** `FreelancersList.tsx`

Extend chip row:

```
Profession: [All] [Technology] [Education] [Healthcare]
```

When Healthcare active:

```
Specialty: [________________]  (optional text — filters clinicalSpecialties)
```

Freelancer card additions:
- Emerald sub-type badge (`Physician`, `Registered Nurse`, …)
- Small "Aadhaar ✓" pill when `aadhaarVerificationStatus === 'verified'`
- Rate: `₹2,500/shift` via `formatRate` + `per_shift`

---

## Surface 7 — Freelancer Detail (Employer View)

Show:
- Healthcare sub-type badge
- Clinical specialties as tags
- Care settings
- Registration: `MH-****4521` (masked)
- Registration council name (full)
- `Aadhaar verified` trust pill (boolean — no document image to employers)
- Preferred care mode icon (building / video / both)

**Never show:** Aadhaar image, full Aadhaar number, full registration number.

---

## Surface 8 — Job Posting Form

When employer selects Healthcare profession on job:

```
Profession category: [Healthcare ▼]

Rate type: [Per shift ▼]  (options: hourly, per day, per shift, per session)

Rate amount: [________] per shift
```

Technology default unchanged. Education unchanged.

---

## Surface 9 — PostJob / AiMatch Rate Labels

All healthcare rate displays use centralized `formatRate(amount, rateType, currencyCode)`.

Example: `formatRate(2500, 'per_shift', 'INR')` → `₹2,500/shift`

---

## Accessibility & Copy Notes

- Use "Physician / Doctor" not ambiguous "Doctor" alone (could mean PhD).
- Aadhaar disclaimer always visible near upload — not in tooltip only.
- Hindi optional copy deferred — English only Phase 1.
- Icon: `Stethoscope` (lucide-react) for healthcare category; avoid red cross medical symbols that imply emergency services.

---

## Regression Checklist (Visual)

- [ ] Technology onboarding: 3 cards shown but Technology path identical to pre-healthcare (2-card flow logic unchanged for tech-only selection)
- [ ] Education onboarding: unchanged
- [ ] Technology freelancer Talent Vault card: no healthcare badges
- [ ] Education rate labels still show `/session` default where applicable
- [ ] Existing document upload for `government_id` unchanged

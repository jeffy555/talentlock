# TalentLock — UI Specification: Onboarding Scaffolding

Frontend-only surfaces: `/onboarding` step indicator + resume, `/dashboard` profile strength card.

**Design tokens:** Navy primary (`#0d1f3c`), gold accent (`#c9a84c`), cream background — match existing onboarding and dashboard.

---

## Surface 1 — Onboarding Step Indicator

**File:** `artifacts/talentlock/src/pages/Onboarding.tsx`

### Freelancer path (3 steps)

| Step | Label | Active when |
|------|-------|-------------|
| 1 | Account type | `step === "role"` |
| 2 | Work category | `step === "profession_category"` |
| 3 | Profile details | `step === "freelancer-details"` |

### Employer path (2 steps)

| Step | Label | Active when |
|------|-------|-------------|
| 1 | Account type | `step === "role"` |
| 2 | Profile details | `step === "employer-details"` |

Visual: existing gold/navy circular indicators — extend to 3 circles for freelancers (third hidden on employer path).

---

## Surface 2 — Profile Strength Checklist (Dashboard)

**File:** `artifacts/talentlock/src/components/onboarding/ProfileStrengthChecklist.tsx`

**Placement:** `Dashboard.tsx` — immediately below welcome line (`Welcome back, {name}`), above "Overview" metrics section.

**Visibility:** `user.role === "freelancer"` AND `completenessScore < 80`.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Strengthen your profile                          62% → 80% │
│  Complete these items to improve your Talent Vault ranking. │
│  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  62%   │
│                                                             │
│  ○ Add a profile photo                            +15%  →   │
│  ○ Add a bio (min 50 characters)                  +20%  →   │
│  ○ Set your rate                                  +15%  →   │
│  ...only incomplete items shown...                          │
│                                                             │
│  [ Complete profile → ]  (links to /profile)                │
└─────────────────────────────────────────────────────────────┘
```

### Styling

- Card: `border border-gold/30 bg-gold/5 rounded-xl p-5`
- Title: `font-serif text-lg font-semibold text-foreground`
- Subtitle: `text-sm text-muted-foreground`
- Progress bar: gold fill on muted track (same pattern as `CompletenessBanner`)
- Row: `flex justify-between items-center py-2 text-sm`
- Points badge: `text-xs font-semibold text-gold bg-gold/15 px-2 py-0.5 rounded-full`
- Link arrow: `text-primary underline text-xs` → navigates to `href` from factor metadata
- CTA button: `variant="outline"` → `/profile`

### States

| State | Rendering |
|-------|-----------|
| Loading profile | Do not render (wait for freelancer profile query) |
| score >= 80 | `null` — no card |
| score < 80, all factors complete (edge) | `null` |
| score < 80, missing factors | Full checklist |
| Employer user | Never render |

---

## Surface 3 — Onboarding Resume (no visual change)

When server returns `role: "pending"` + saved step, user lands directly on the correct card without seeing role picker again (unless `onboardingStep === "role"`).

Toast: none on resume (silent).

---

## Copy Reference

| Key | Copy |
|-----|------|
| checklist.title | Strengthen your profile |
| checklist.subtitle | Complete these items to improve your Talent Vault ranking. |
| checklist.target | `{score}% → 80%` |
| checklist.cta | Complete profile → |
| factor.photo | Add a profile photo |
| factor.bio | Add a bio (min 50 characters) |
| factor.skills | Add at least 2 skills |
| factor.rate | Set your rate |
| factor.field | Set your field of work |
| factor.availability | Set your availability |
| step.account_type | Account type |
| step.work_category | Work category |
| step.profile_details | Profile details |

---

## Component Summary

| File | Action | Task |
|------|--------|------|
| `components/onboarding/ProfileStrengthChecklist.tsx` | Create | 3.2 |
| `pages/Dashboard.tsx` | Modified | 3.3 |
| `pages/Onboarding.tsx` | Modified | 3.4 |
| `lib/completenessUtils.ts` | Modified | 3.1 |

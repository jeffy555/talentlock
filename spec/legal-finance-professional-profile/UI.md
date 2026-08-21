# TalentLock — UI Specification: Legal & Finance Professional Profile

## Overview

Legal & Finance extends surfaces already changed by Teaching and Healthcare: Onboarding (fourth category card + **mandatory Aadhaar**), Profile (details + **after-signup** credential checklist), Talent Vault, Job Posting (default per day). Technology / Education / Healthcare UIs stay pixel-identical when those categories are selected.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter.

**Accent:** Navy / slate (legal) — distinct from Education blue, Healthcare emerald, TalentSearch teal.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Category card selected | `border-slate-800 ring-2 ring-slate-200 bg-slate-50` | Selected Legal & Finance card |
| Sub-type badge | `bg-slate-100 text-slate-800 border-slate-300` | Advocate, CA, … |
| Aadhaar verified | `bg-green-100 text-green-800` + `CheckCircle` | Same as Healthcare |
| Aadhaar pending / rejected | amber / red — reuse Healthcare tokens |
| Filter chip active | `bg-slate-800 text-white` | Vault Legal & Finance filter |
| Checklist required now | `text-red-600` + asterisk | Aadhaar row |
| After-signup / planned | `text-slate-400` + "After signup" pill | Phase 2 documents **before** Phase 5 |
| After-signup / uploadable | existing DocumentUploader row | Phase 2 documents **after** Phase 5 |

Icon: Lucide `Scale` (not a gavel emoji). Avoid court-seal imagery.

---

## Surface 1 — Onboarding: Fourth Category Card

**File:** `artifacts/talentlock/src/pages/Onboarding.tsx`

Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.

```
What kind of work do you do?

[ Technology ]  [ Education ]  [ Healthcare ]  [ Legal & Finance ]
Software, …     Teaching, …    Doctors, …      Advocates, CAs,
                                               CS, tax, advisers
```

```tsx
<button
  type="button"
  onClick={() => setProfessionCategory("legal_finance")}
  className={cn(
    "rounded-lg border-2 p-5 text-left transition-colors",
    professionCategory === "legal_finance"
      ? "border-slate-800 ring-2 ring-slate-200 bg-slate-50"
      : "border-slate-200 hover:border-slate-300",
  )}
>
  <Scale className="h-6 w-6 mb-2 text-slate-800" />
  <p className="font-semibold text-slate-800">Legal & Finance</p>
  <p className="text-sm text-slate-500 mt-1">
    Advocates, CAs, company secretaries, tax, advisers
  </p>
</button>
```

Continue disabled until a category is selected. Other categories’ sub-type rules unchanged.

---

## Surface 2 — Sub-Type Picker

Shown when `professionCategory === 'legal_finance'`:

```
What best describes your role?

( ) Advocate / Lawyer (Bar Council enrolled)
( ) Chartered Accountant (ICAI)
( ) Company Secretary (ICSI)
( ) Tax Consultant (GST / direct tax)
( ) Financial Advisor (SEBI / NISM)
```

Continue / form submit for this category disabled until sub-type selected.

---

## Surface 3 — Legal & Finance Details Section

**Component:** `LegalFinanceDetailsSection.tsx`

Onboarding + Profile edit.

```
┌─ Practice details ───────────────────────────────────────┐
│ Practice areas *          [chip] e.g. Corporate, GST     │
│ Practice settings         [chip] Firm, Chambers, In-house│
│ Years of practice         [number]                       │
│ Highest qualification     [select: LLB, LLM, CA Final…]  │
│ Specialization            [text]                         │
│ Institution               [text]                         │
│ Enrolment body            [text] e.g. Bar Council of MH  │
│ Enrolment / membership no [text] — masked after save     │
│ Enrolment / COP expiry    [date] optional                │
│ Court jurisdictions       [chip] advocates (optional)    │
│ Engagement mode           ( ) In-person ( ) Remote ( ) Both│
│                                                          │
│ Professional certificates (Bar, ICAI, GST) are uploaded  │
│ on your Profile after you finish registration.           │
└──────────────────────────────────────────────────────────┘
```

Chip input: reuse `ChipInput`. Court jurisdictions shown for all types but labelled optional unless `advocate`.

---

## Surface 4 — Aadhaar (Registration Form)

Same `FreelancerDocumentOnboardingStep` as all freelancers. **Do not** put a second Aadhaar uploader inside `LegalFinanceDetailsSection`.

Copy near the shared Aadhaar block when category is legal_finance (optional one-line):

> Identity verification (Aadhaar) is required to finish registration. Bar Council, ICAI, and GST documents can be added on Profile after signup.

---

## Surface 5 — Credential Checklist (Profile — After Signup)

**Component:** `LegalFinanceCredentialChecklist.tsx`

```
Your credentials
──────────────────
✓ Aadhaar (verified)                         [View]
○ Bar enrolment certificate                  After signup — coming soon
○ Certificate of Practice                    After signup — coming soon
○ Experience letter                          After signup — coming soon
```

Phase 1: only Aadhaar is interactive (re-upload if rejected). Phase 2 rows: muted **"After signup"** pill — **not** disabled upload buttons that 400.

**Phase 5:** each `futureRequired` type becomes a real upload row (status, Upload / Re-upload, optional COP expiry, View). Recommended Phase 3 types stay hidden.

Lookup: `REQUIRED_DOCUMENTS_BY_LEGAL_FINANCE_TYPE[legalFinanceProfessionType]`.

Banner if Aadhaar not verified:

> Complete Aadhaar verification to appear in Talent Vault. Professional certificates can be added on this page after signup.

---

## Surface 6 — Talent Vault

**File:** `FreelancersList.tsx`

```
Profession: [All] [Technology] [Education] [Healthcare] [Legal & Finance]
```

When Legal & Finance active:

```
Practice area: [________________]  (optional — filters practiceAreas)
```

Card:
- Slate sub-type badge
- "Aadhaar ✓" when verified
- Rate: `formatRate(..., 'per_day' or profile default)`

---

## Surface 7 — Freelancer Detail + Public Profile

Show:
- Sub-type badge
- Practice area tags
- Practice settings
- Enrolment: masked number + full **body** name
- `Aadhaar verified` pill (no image)
- Engagement mode
- Court jurisdictions (if present)

**Never show:** Aadhaar image/number, full enrolment number, `aadhaarLastFour`.

---

## Surface 8 — Job Posting

```
Profession category: [Legal & Finance ▼]
Rate type:           [Per day ▼]   (hourly, per day, … existing types)
Rate amount:         [________] per day
```

Technology / Education / Healthcare defaults unchanged.

---

## Surface 9 — TalentSearch Rule Builder

When profession = legal_finance:

- Sub-type radios (any + 5 types)
- Practice area text field
- Reuse `requireAadhaarVerified` switch (copy: “Legal & finance profiles with verified Aadhaar only” when this category selected)

Rate type list unchanged (already has per_day).

---

## Copy Reference

| Key | String |
|---|---|
| Category title | Legal & Finance |
| Category subtitle | Advocates, CAs, company secretaries, tax, advisers |
| After-signup hint | Professional certificates (Bar, ICAI, GST) are uploaded on your Profile after you finish registration. |
| Checklist planned | After signup — coming soon |
| Vault empty | No verified Legal & Finance professionals match these filters. |
| Enrolment label | Enrolment / membership number |

English only Phase 1.

---

## Accessibility

- Cards are real `<button>`s with selected `aria-pressed`.
- Enrolment field `autocomplete="off"`.
- Checklist “After signup” is text, not a fake control.

---

## Visual Regression

- [ ] Technology / Education / Healthcare onboarding paths unchanged aside from four cards showing
- [ ] Technology Vault cards: no legal badges
- [ ] Healthcare emerald accents unchanged
- [ ] Aadhaar still required for Technology finish-registration

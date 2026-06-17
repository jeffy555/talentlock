# TalentLock — UI Specification: Teaching Professional Profile

## Overview

Four UI surfaces change: Onboarding (one new step, freelancers only), Profile edit page (one new conditional section), Talent Vault (one new filter row, always visible), and Job Posting form (one new picker pair). Every existing screen for `professionCategory: 'technology'` users renders exactly as it does today — no layout shift, no new required fields, no new steps.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Category card border (selected) | `border-violet-400 ring-2 ring-violet-200` | Selected profession category card |
| Category card border (default) | `border-slate-200` | Unselected category card |
| Education accent | `bg-violet-50 border-violet-200 text-violet-700` | Teaching Details section header, education badges |
| Filter chip (active) | `bg-violet-600 text-white` | Active Talent Vault category filter |
| Filter chip (inactive) | `bg-slate-100 text-slate-600 border-slate-200` | Inactive filter chip |
| Sub-type badge | `bg-blue-50 text-blue-700 border-blue-200` | "School Teacher" / "Tutor" etc. badge on cards |

---

## Surface 1 — Onboarding: Profession Category Step

**File:** `artifacts/talentlock/src/pages/Onboarding.tsx`

Freelancer-only. Inserted between the existing role picker and the profile form. Employers proceed directly from role picker to profile form, unchanged.

### State 1 — Category Picker

```
What kind of work do you do?
This helps us show you the right opportunities.

[ Technology card ]        [ Education card ]
Software development,      Teaching, tutoring,
design, data, DevOps       lecturing, research

                                    [Continue ->]
```

```tsx
<div className="grid grid-cols-2 gap-4 mb-6">
  <button
    onClick={() => setCategory('technology')}
    className={cn(
      "rounded-lg border-2 p-5 text-left transition-colors",
      category === 'technology'
        ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50"
        : "border-slate-200 hover:border-slate-300"
    )}
  >
    <Laptop className="h-6 w-6 mb-2 text-slate-600" />
    <p className="font-semibold text-slate-800">Technology</p>
    <p className="text-sm text-slate-500 mt-1">Software development, design, data, DevOps</p>
  </button>

  <button
    onClick={() => setCategory('education')}
    className={cn(
      "rounded-lg border-2 p-5 text-left transition-colors",
      category === 'education'
        ? "border-violet-400 ring-2 ring-violet-200 bg-violet-50"
        : "border-slate-200 hover:border-slate-300"
    )}
  >
    <GraduationCap className="h-6 w-6 mb-2 text-slate-600" />
    <p className="font-semibold text-slate-800">Education</p>
    <p className="text-sm text-slate-500 mt-1">Teaching, tutoring, lecturing, research</p>
  </button>
</div>
```

### State 2 — Education Sub-Type Picker (Revealed When "Education" Selected)

```
What best describes you?

( ) School Teacher (K-12 / Secondary)
( ) University Lecturer / Professor
( ) Private Tutor
( ) Researcher

                    [<- Back]      [Continue ->]
```

```tsx
{category === 'education' && (
  <div className="mb-6 animate-in fade-in slide-in-from-top-2">
    <p className="text-sm font-medium text-slate-700 mb-3">What best describes you?</p>
    <RadioGroup value={educationType} onValueChange={setEducationType} className="space-y-2">
      <RadioOption value="school_teacher" label="School Teacher (K-12 / Secondary)" />
      <RadioOption value="university_lecturer" label="University Lecturer / Professor" />
      <RadioOption value="tutor" label="Private Tutor" />
      <RadioOption value="researcher" label="Researcher" />
    </RadioGroup>
  </div>
)}
```

"Continue" is disabled until a category is selected (and, if Education, a sub-type is selected).

---

## Surface 2 — Teaching Details Section

**File:** `artifacts/talentlock/src/components/onboarding/TeachingDetailsSection.tsx`

Rendered inside the existing profile form (onboarding) AND on the profile edit page, only when `professionCategory === 'education'`. Appears as a distinct visual section with a violet accent header.

```
Teaching Details
-----------------------------------------------------
Subjects you teach
[GCSE Mathematics x] [A-Level Physics x] [+ Add subject]

Levels you teach
[Secondary x] [Sixth Form x] [+ Add level]

Years of teaching experience
[ 8 ]

Highest degree                 Subject
[Master's v]                   [Mathematics]
Institution
[University of Manchester]

Teaching licence / credential (if applicable)
State/Region: [England]    Expiry: [31 Aug 2027]

Preferred teaching mode
( ) In person  ( ) Online  (x) Both

Location
[Manchester, UK]
```

```tsx
<div className="rounded-lg border border-violet-200 overflow-hidden">
  <div className="bg-violet-50 px-5 py-3 border-b border-violet-200">
    <h3 className="text-sm font-semibold text-violet-800 flex items-center gap-2">
      <GraduationCap className="h-4 w-4" />
      Teaching Details
    </h3>
  </div>

  <div className="p-5 space-y-4">
    <FormField label="Subjects you teach">
      <ChipInput value={teachingSubjects} onChange={setTeachingSubjects}
        placeholder="e.g. GCSE Mathematics" />
    </FormField>

    <FormField label="Levels you teach">
      <ChipInput value={teachingLevels} onChange={setTeachingLevels}
        placeholder="e.g. Secondary, Sixth Form" />
    </FormField>

    <FormField label="Years of teaching experience">
      <Input type="number" min={0} value={yearsTeachingExperience}
        onChange={(e) => setYearsTeachingExperience(Number(e.target.value))} className="w-24" />
    </FormField>

    <div className="grid grid-cols-2 gap-4">
      <FormField label="Highest degree">
        <Select value={highestDegree} onValueChange={setHighestDegree}>
          <SelectItem value="bachelors">Bachelor's</SelectItem>
          <SelectItem value="masters">Master's</SelectItem>
          <SelectItem value="phd">PhD</SelectItem>
          <SelectItem value="postdoc">Postdoc</SelectItem>
        </Select>
      </FormField>
      <FormField label="Subject">
        <Input value={degreeSubject} onChange={(e) => setDegreeSubject(e.target.value)}
          placeholder="e.g. Mathematics" />
      </FormField>
    </div>

    <FormField label="Institution">
      <Input value={degreeInstitution} onChange={(e) => setDegreeInstitution(e.target.value)}
        placeholder="e.g. University of Manchester" />
    </FormField>

    <div className="grid grid-cols-2 gap-4">
      <FormField label="Teaching licence - State/Region (optional)">
        <Input value={teachingLicenceState} onChange={(e) => setTeachingLicenceState(e.target.value)}
          placeholder="e.g. England" />
      </FormField>
      <FormField label="Licence expiry (optional)">
        <DatePicker value={teachingLicenceExpiry} onChange={setTeachingLicenceExpiry} />
      </FormField>
    </div>

    <FormField label="Preferred teaching mode">
      <RadioGroup value={preferredTeachingMode} onValueChange={setPreferredTeachingMode}
        className="flex gap-4">
        <RadioOption value="in_person" label="In person" />
        <RadioOption value="online" label="Online" />
        <RadioOption value="both" label="Both" />
      </RadioGroup>
    </FormField>

    <FormField label="Location">
      <Input value={location} onChange={(e) => setLocation(e.target.value)}
        placeholder="e.g. Manchester, UK" />
    </FormField>

    {educationProfessionType === 'researcher' && (
      <FormField label="ORCID / Google Scholar profile (optional)">
        <Input value={researchPublications} onChange={(e) => setResearchPublications(e.target.value)}
          placeholder="https://orcid.org/..." />
      </FormField>
    )}
  </div>
</div>
```

All fields optional — no red asterisks, no submit-blocking validation beyond the existing profile form's own rules.

---

## Surface 3 — Talent Vault Filter Row

**File:** `artifacts/talentlock/src/pages/Freelancers.tsx`

Always rendered — does not depend on whether any education professionals exist in the data yet.

```
[All]  [Technology]  [Education]

(shown only when "Education" is active)
Subject: [Mathematics]

--- existing filters below, unchanged ---
Field: [...]  Rate: [...]  Available from: [...]  Search: [...]
```

```tsx
<div className="flex gap-2 mb-3">
  <FilterChip active={category === undefined} onClick={() => setCategory(undefined)}>
    All
  </FilterChip>
  <FilterChip active={category === 'technology'} onClick={() => setCategory('technology')}>
    Technology
  </FilterChip>
  <FilterChip active={category === 'education'} onClick={() => setCategory('education')}>
    Education
  </FilterChip>
</div>

{category === 'education' && (
  <div className="mb-3">
    <Input
      placeholder="Filter by subject (e.g. Mathematics)"
      value={teachingSubject}
      onChange={(e) => setTeachingSubject(e.target.value)}
      className="max-w-xs"
    />
  </div>
)}

<div className="flex gap-3 flex-wrap">
  {/* existing field, rate, availableFrom, q filters - unchanged */}
</div>
```

`FilterChip`:
```tsx
function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={cn(
        "text-sm px-3 py-1.5 rounded-full border transition-colors",
        active
          ? "bg-violet-600 text-white border-violet-600"
          : "bg-slate-100 text-slate-600 border-slate-200 hover:border-slate-300"
      )}>
      {children}
    </button>
  );
}
```

---

## Surface 4 — Freelancer Card / Detail Page — Sub-Type Badge

**Files:** `Freelancers.tsx` (card), `FreelancerDetail.tsx`, `PublicProfile.tsx` (`/f/:id`)

When `professionCategory === 'education'`, a small badge appears beside the freelancer's name showing their `educationProfessionType`:

```
Sarah Chen   [School Teacher]
GCSE Mathematics, A-Level Physics
```

```tsx
{freelancer.professionCategory === 'education' && freelancer.educationProfessionType && (
  <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700
    border border-blue-200 rounded px-1.5 py-0.5">
    <GraduationCap className="h-3 w-3" />
    {EDUCATION_TYPE_LABELS[freelancer.educationProfessionType]}
  </span>
)}
```

```ts
const EDUCATION_TYPE_LABELS: Record<EducationProfessionType, string> = {
  school_teacher: 'School Teacher',
  university_lecturer: 'University Lecturer',
  tutor: 'Private Tutor',
  researcher: 'Researcher',
};
```

For `professionCategory === 'technology'`, no badge is rendered — identical to today.

---

## Surface 5 — Job Posting Form

**File:** `artifacts/talentlock/src/pages/JobNew.tsx`

```
Profession Category
(x) Technology   ( ) Education

Rate type (shown only when Education selected)
( ) Hourly  (x) Per day  ( ) Per session  ( ) Per course

Rate
$ [ 90 ]  /day     <- unit label reflects rateType
```

```tsx
<FormField label="Profession Category">
  <RadioGroup value={professionCategory} onValueChange={setProfessionCategory}
    className="flex gap-4">
    <RadioOption value="technology" label="Technology" />
    <RadioOption value="education" label="Education" />
  </RadioGroup>
</FormField>

{professionCategory === 'education' && (
  <FormField label="Rate type">
    <RadioGroup value={rateType} onValueChange={setRateType} className="flex gap-3 flex-wrap">
      <RadioOption value="hourly" label="Hourly" />
      <RadioOption value="per_day" label="Per day" />
      <RadioOption value="per_session" label="Per session" />
      <RadioOption value="per_course" label="Per course" />
    </RadioGroup>
  </FormField>
)}

<FormField label="Rate">
  <div className="flex items-center gap-1">
    <span className="text-slate-500">$</span>
    <Input type="number" value={rateAmount} onChange={(e) => setRateAmount(e.target.value)}
      className="w-28" />
    <span className="text-slate-500 text-sm">{rateUnitLabel(rateType)}</span>
  </div>
</FormField>
```

Defaults: `professionCategory: 'technology'`, `rateType: 'hourly'` — an employer who never touches these controls produces a job identical to today's, with the rate unit reading `/hr` exactly as before.

---

## Copy Reference

| Location | String |
|---|---|
| Onboarding step heading | `What kind of work do you do?` |
| Onboarding step subheading | `This helps us show you the right opportunities.` |
| Category - Technology | `Technology` |
| Category - Technology desc | `Software development, design, data, DevOps` |
| Category - Education | `Education` |
| Category - Education desc | `Teaching, tutoring, lecturing, research` |
| Sub-type heading | `What best describes you?` |
| Sub-type - school teacher | `School Teacher (K-12 / Secondary)` |
| Sub-type - lecturer | `University Lecturer / Professor` |
| Sub-type - tutor | `Private Tutor` |
| Sub-type - researcher | `Researcher` |
| Teaching Details - section title | `Teaching Details` |
| Field - subjects | `Subjects you teach` |
| Field - levels | `Levels you teach` |
| Field - experience | `Years of teaching experience` |
| Field - degree | `Highest degree` |
| Field - degree subject | `Subject` |
| Field - institution | `Institution` |
| Field - licence state | `Teaching licence - State/Region (optional)` |
| Field - licence expiry | `Licence expiry (optional)` |
| Field - teaching mode | `Preferred teaching mode` |
| Field - location | `Location` |
| Field - research profile | `ORCID / Google Scholar profile (optional)` |
| Talent Vault filter - All | `All` |
| Talent Vault filter - Technology | `Technology` |
| Talent Vault filter - Education | `Education` |
| Talent Vault subject filter placeholder | `Filter by subject (e.g. Mathematics)` |
| Job form - profession category label | `Profession Category` |
| Job form - rate type label | `Rate type` |
| Rate unit - hourly | `/hr` |
| Rate unit - per day | `/day` |
| Rate unit - per session | `/session` |
| Rate unit - per course | `/course` |

---

## Loading & Error States Summary

| Surface | State | Behaviour |
|---|---|---|
| Onboarding category step | No selection | "Continue" disabled |
| Onboarding sub-type step | Education selected, no sub-type | "Continue" disabled |
| Teaching Details | All fields empty | Section renders, no validation errors - fields are optional |
| Talent Vault filter | `professionCategory=education`, zero results | Existing empty-state message ("No freelancers match your filters") - unchanged component, just may now trigger more often |
| Job posting form | `professionCategory` untouched | Defaults to `technology` / `hourly` - identical to pre-change form |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/pages/Onboarding.tsx` | Modified | 3.3 |
| `src/components/onboarding/TeachingDetailsSection.tsx` | New | 3.4 |
| `src/components/ChipInput.tsx` | New (if not existing) | 3.5 |
| `src/pages/Profile.tsx` | Modified | 3.6 |
| `src/pages/Freelancers.tsx` | Modified | 3.7 |
| `src/lib/rateFormatUtils.ts` | New | 3.2 |
| `src/pages/FreelancerDetail.tsx` | Modified (badge) | 3.x |
| `src/pages/PublicProfile.tsx` | Modified (badge) | 3.x |
| `src/pages/JobNew.tsx` | Modified | 3.9 |

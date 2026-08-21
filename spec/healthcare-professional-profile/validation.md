# TalentLock — Validation Guide: Healthcare Professional Profile

---

## Phase 1 Validation — Database

### V1.1 — Healthcare Columns Exist

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
AND column_name IN (
  'healthcare_profession_type', 'clinical_specialties', 'clinical_settings',
  'years_clinical_experience', 'highest_qualification', 'qualification_specialization',
  'qualification_institution', 'registration_council', 'registration_number',
  'registration_expiry', 'registration_alert_stage', 'aadhaar_verification_status',
  'aadhaar_last_four', 'preferred_care_mode'
);
```

- [ ] All 14 healthcare-specific columns present
- [ ] `aadhaar_verification_status` NOT NULL DEFAULT `not_uploaded`
- [ ] `registration_alert_stage` NOT NULL DEFAULT `none`
- [ ] All other healthcare columns nullable
- [ ] No duplicate `location` column added

### V1.2 — Existing Rows Unchanged

```sql
SELECT profession_category, COUNT(*) FROM freelancer_profiles GROUP BY profession_category;
SELECT COUNT(*) FROM freelancer_profiles WHERE healthcare_profession_type IS NOT NULL;
SELECT aadhaar_verification_status, COUNT(*) FROM freelancer_profiles GROUP BY aadhaar_verification_status;
```

- [ ] Pre-existing rows still `profession_category = 'technology'` (or `education` if any)
- [ ] 0 rows with `healthcare_profession_type IS NOT NULL` immediately after migration
- [ ] Pre-existing rows `aadhaar_verification_status = 'not_uploaded'`

### V1.3 — Array Column Type Matches `skills`

```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
AND column_name IN ('skills', 'clinical_specialties', 'clinical_settings');
```

- [ ] `clinical_specialties` and `clinical_settings` match `skills` type

---

## Phase 2 Validation — Backend

### V2.1 — Talent Vault Regression (No New Filters)

```bash
curl "http://localhost:8080/api/freelancers?page=1&pageSize=10" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Response shape unchanged
- [ ] Technology freelancers still returned
- [ ] Additive fields on freelancer objects (`healthcareProfessionType`, etc.) null for tech profiles

### V2.2 — Filter `professionCategory=healthcare`

Seed one healthcare physician with Aadhaar verified and completeness ≥ 60.

```bash
curl "http://localhost:8080/api/freelancers?professionCategory=healthcare" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns only `professionCategory = 'healthcare'`
- [ ] Does not return healthcare freelancer without Aadhaar gate passed

### V2.3 — Filter `clinicalSpecialty`

Seed `clinicalSpecialties: ["Cardiology", "Internal Medicine"]`.

```bash
curl "http://localhost:8080/api/freelancers?professionCategory=healthcare&clinicalSpecialty=cardiology" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Case-insensitive match returns profile
- [ ] `clinicalSpecialty=orthopedics` returns empty

### V2.4 — Aadhaar Vault Gate

Healthcare freelancer with completeness ≥ 60 but Aadhaar `pending` (uploaded, not verified):

- [ ] **Not** returned in Vault (healthcare requires `verified`)

Healthcare freelancer with Aadhaar `verified`:

- [ ] Returned when completeness ≥ 60

### V2.5 — AI Prompt Regression

```bash
pnpm --filter @workspace/api-server test -- professionContext
```

- [ ] Technology job: `buildProfessionContext()` returns `""`
- [ ] Education job: unchanged education string
- [ ] Healthcare job: healthcare context string present
- [ ] Byte-identical technology match prompt vs pre-change baseline test

### V2.6 — Aadhaar Document Upload

```bash
# 1. Presigned URL
curl -X POST http://localhost:8080/api/documents/upload-url \
  -H "Authorization: Bearer <healthcare_freelancer_token>" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"aadhaar","mimeType":"image/jpeg","fileSize":102400}'

# 2. Upload file to returned URL (client)

# 3. Confirm
curl -X POST http://localhost:8080/api/documents/confirm \
  -H "Authorization: Bearer <healthcare_freelancer_token>" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"aadhaar","fileUrl":"<storage_path>"}'
```

- [ ] `aadhaar` accepted as document type
- [ ] `freelancer_profiles.aadhaar_verification_status` → `uploaded` or `pending` path
- [ ] AI review fires fire-and-forget
- [ ] After admin/AI verify: status → `verified`

### V2.7 — Registration Number Masking

```bash
curl "http://localhost:8080/api/freelancers/<id>" \
  -H "Authorization: Bearer <employer_token>"
```

Profile with `registrationNumber: "MHREG1234567"`:

- [ ] Response shows masked value, not full string
- [ ] Admin document review route may show full — employer never

### V2.8 — Aadhaar Privacy

Inspect employer API JSON for healthcare profile:

- [ ] No field `aadhaarNumber`
- [ ] No `aadhaarLastFour` in employer-facing schema (or omitted)
- [ ] `aiNotes` from documents never in employer response

### V2.9 — OpenAPI Codegen

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

- [ ] `ProfessionCategory` includes `healthcare`
- [ ] `RateType` includes `per_shift`
- [ ] `useGetFreelancers` accepts `clinicalSpecialty`
- [ ] Document confirm accepts `aadhaar`

### V2.10 — Job Posting Healthcare

```bash
curl -X POST http://localhost:8080/api/job-requirements \
  -H "Authorization: Bearer <employer_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "ICU Locum",
    "description": "...",
    "fieldOfWork": "Medicine & Healthcare",
    "professionCategory": "healthcare",
    "rateType": "per_shift",
    "budget": 3500
  }'
```

- [ ] Created job has `professionCategory: healthcare`, `rateType: per_shift`

---

## Phase 3 Validation — Frontend

### V3.1 — Onboarding Healthcare Path

Manual test with new freelancer account:

1. Select Freelancer → Healthcare → Physician
2. Fill healthcare details + base profile fields
3. Attempt complete without Aadhaar → blocked
4. Upload Aadhaar → confirm → complete enabled
5. Submit

- [ ] `professionCategory: healthcare` on profile
- [ ] `healthcareProfessionType: physician`
- [ ] Profile appears in Vault after Aadhaar gate + completeness ≥ 60

### V3.2 — Onboarding Regression

Technology path:

- [ ] No Aadhaar step shown
- [ ] Same steps as before healthcare feature

Education path:

- [ ] Unchanged

### V3.3 — Rate Display `/shift`

Healthcare profile with `hourlyRate: 2500`, `professionCategory: healthcare`:

- [ ] Talent Vault card shows `/shift` (default rate type for healthcare profiles)
- [ ] Technology profile still shows `/hr`

### V3.4 — Talent Vault UI

- [ ] Healthcare filter chip works
- [ ] Specialty filter visible only when Healthcare selected
- [ ] Sub-type badge on cards

### V3.5 — Profile Credential Checklist

- [ ] Aadhaar row shows required asterisk
- [ ] **Phases 1–4:** Phase 2+ documents show "Planned" not broken upload
- [ ] **Phase 5:** those rows become real uploads — see V5.2

### V3.6 — Post Job UI

- [ ] Healthcare category shows rate type including Per shift
- [ ] Technology job form unchanged

---

## Phase 4 Validation — TalentSearch (if shipped)

### V4.1 — Healthcare Pre-Filter

Employer TalentSearch rules: `professionCategory: healthcare`, `healthcareSubType: physician`, `requireAadhaarVerified: true`

- [ ] Nurse profile pre-filter rejected with reason
- [ ] Physician without verified Aadhaar rejected when require flag true
- [ ] Matching physician with verified Aadhaar passes pre-filter

---

## Phase 5 Validation — Phase 2+ Credentials

### V5.1 — Upload types accepted

```bash
# confirm body documentType=mbbs_degree (physician) — 201, status pending
# documentType=unknown_type — 400
```

- [ ] All six Phase 2+ types accepted
- [ ] `aadhaar` / `government_id` / `professional_credential` still accepted
- [ ] Technology freelancer can still confirm Aadhaar only at registration

### V5.2 — Checklist UI

- [ ] Physician sees Experience, MBBS, Medical council — each has Upload, not “Planned”
- [ ] Care worker sees Experience letter only among Phase 2+ rows
- [ ] Recommended types (BLS, indemnity) **not** shown as upload targets
- [ ] Rejected MBBS allows re-upload; upsert resets expiry alert stage

### V5.3 — Expired registration Vault drop

Seed physician, Aadhaar verified, completeness ≥ 60, `registrationExpiry` yesterday.

```bash
curl "http://localhost:8080/api/freelancers?professionCategory=healthcare" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] That physician **absent** from Vault
- [ ] Allied health with past `registrationExpiry` **still present**
- [ ] `GET /api/freelancers/:id` still 200 for the excluded physician
- [ ] Renewing `registrationExpiry` to next year restores Vault

### V5.4 — Privacy

- [ ] Employer never sees document images or full council numbers
- [ ] AI `aiNotes` admin-only

---

## Security Validation

- [ ] Aadhaar document preview: employer cannot access `/api/storage/` path for another user's Aadhaar
- [ ] Freelancer can view own document via existing signed URL flow
- [ ] Admin can review Aadhaar in Document Review tab (proxied URL pattern from teaching fix)
- [ ] `sanitiseText()` on registration council, specialization, institution fields

---

## Phase 2+ Credentials — Phase 5 checklist

- [ ] `experience_certificate` upload + AI review
- [ ] `mbbs_degree` + `medical_registration_certificate` for physicians
- [ ] `nursing_degree` + `nursing_registration_certificate` for nurses
- [ ] `allied_qualification` for allied health
- [ ] Registration expiry removes physician/nurse from Vault (V5.3)
- [ ] Expiry cron still advances document `expiryAlertStage`; profile `registrationAlertStage` resets on expiry change

---

## Sign-Off Criteria

Phase 1 (profile vertical) complete when:

1. Healthcare professionals can onboard with mandatory Aadhaar
2. Talent Vault discovery filters by healthcare + specialty
3. AI matching includes healthcare context without technology regression
4. Job posts support healthcare + per_shift rates
5. All typecheck + unit tests pass
6. Aadhaar privacy rules verified (V2.8)

Phase 2+ (this spec Phase 5) complete when V5.1–V5.4 are ✅.

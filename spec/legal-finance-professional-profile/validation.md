# TalentLock — Validation Guide: Legal & Finance Professional Profile

---

## Phase 1 Validation — Database

### V1.1 — Columns exist

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
AND column_name IN (
  'legal_finance_profession_type', 'practice_areas', 'practice_settings',
  'years_practice_experience', 'legal_finance_highest_qualification',
  'legal_finance_qualification_specialization', 'legal_finance_qualification_institution',
  'enrolment_body', 'enrolment_number', 'enrolment_expiry', 'enrolment_alert_stage',
  'court_jurisdictions', 'preferred_engagement_mode'
);
```

- [ ] All listed columns present
- [ ] `enrolment_alert_stage` NOT NULL DEFAULT `none`
- [ ] Other new columns nullable
- [ ] No second `aadhaar_verification_status` or `location` column

### V1.2 — Existing rows unchanged

```sql
SELECT profession_category, COUNT(*) FROM freelancer_profiles GROUP BY 1;
SELECT COUNT(*) FROM freelancer_profiles WHERE legal_finance_profession_type IS NOT NULL;
```

- [ ] Pre-existing rows still technology / education / healthcare
- [ ] 0 rows with legal finance type immediately after migration

### V1.3 — Array types match `skills`

```sql
SELECT column_name, udt_name
FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
AND column_name IN ('skills', 'practice_areas', 'practice_settings', 'court_jurisdictions');
```

- [ ] Array columns match `skills`

---

## Phase 2 Validation — Backend

### V2.1 — Vault regression

```bash
curl "http://localhost:8080/api/freelancers?page=1&pageSize=10" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Shape unchanged
- [ ] Tech/education/healthcare still returned per existing gates
- [ ] New fields null on non-legal profiles
- [ ] `enrolmentNumber` masked when present

### V2.2 — Filter `professionCategory=legal_finance`

Seed one advocate, Aadhaar verified, completeness ≥ 60.

```bash
curl "http://localhost:8080/api/freelancers?professionCategory=legal_finance" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Only `legal_finance`
- [ ] Advocate with Aadhaar `uploaded` (not verified) **absent**
- [ ] Same person appears after admin verifies Aadhaar

### V2.3 — `practiceArea`

Seed `practiceAreas: ["GST", "Corporate"]`.

```bash
curl "http://localhost:8080/api/freelancers?professionCategory=legal_finance&practiceArea=gst" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Case-insensitive match
- [ ] `practiceArea=IP` returns empty if not listed

### V2.4 — Profession context

```bash
pnpm --filter @workspace/api-server test -- professionContext
```

- [ ] `legal_finance` injects legal/finance sentence
- [ ] `technology` still `""`
- [ ] education / healthcare strings unchanged

### V2.5 — Documents confirm still Aadhaar-only for Phase 1

```bash
curl -X POST http://localhost:8080/api/documents/confirm \
  -H "Authorization: Bearer <freelancer_token>" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"bar_enrolment_certificate"}'
```

- [ ] 400 / validation error until Phase 5
- [ ] `aadhaar` confirm still succeeds

### V2.6 — OpenAPI codegen

- [ ] `pnpm run typecheck` passes
- [ ] `ProfessionCategory` includes `legal_finance`

---

## Phase 3 Validation — Frontend

### V3.1 — Onboarding

- [ ] Four cards; Legal & Finance selects navy/slate state
- [ ] Sub-type required before finish
- [ ] Details section visible
- [ ] Finish blocked without Aadhaar confirm (same as other categories)
- [ ] Finish **not** blocked for missing Bar/ICAI files
- [ ] Helper copy: certificates after signup

### V3.2 — Profile checklist

- [ ] Aadhaar row interactive
- [ ] Phase 2 rows show “After signup” — no working upload control
- [ ] Enrolment number masked on reload

### V3.3 — Vault

- [ ] Fifth chip Legal & Finance
- [ ] Practice area filter
- [ ] Unverified Aadhaar legal_finance profile hidden from employer list
- [ ] Healthcare / Education chips still work

### V3.4 — Post Job

- [ ] Profession includes Legal & Finance
- [ ] Default rate type per day
- [ ] Healthcare still defaults per shift; education unchanged

### V3.5 — Detail / public

- [ ] Practice tags, masked enrolment, no Aadhaar number

---

## Phase 4 Validation — TalentSearch

### V4.1 — Pre-filter unit tests

```bash
pnpm --filter @workspace/api-server test -- talentSearchUtils
```

- [ ] Sub-type mismatch rejected
- [ ] Practice area mismatch rejected
- [ ] `requireAadhaarVerified` still rejects unverified (shared flag)

### V4.2 — Rule builder

- [ ] Legal & Finance profession shows sub-type + practice area
- [ ] Parse prompt accepts `legal_finance`

---

## Security

- [ ] Employer APIs never return `aadhaarLastFour` or full `enrolmentNumber`
- [ ] Admin may see full enrolment (same as healthcare registration)
- [ ] No UIDAI API keys
- [ ] `sanitiseText` on enrolment body, practice area chips, court names
- [ ] IDOR: freelancer can only PUT own profile

---

## Regression

- [ ] Technology registration still Aadhaar-gated, no extra details section
- [ ] Healthcare Vault Aadhaar gate still applies
- [ ] Education DBS / licence behaviour unchanged
- [ ] Completeness score formula unchanged
- [ ] School-teacher expired-licence Vault exclusion **not** applied to `enrolmentExpiry` in Phase 1

---

## Sign-off

| Phase | Owner | Date | Result |
|---|---|---|---|
| 0 Prerequisites | | | ⬜ |
| 1 Database | | | ⬜ |
| 2 Backend | | | ⬜ |
| 3 Frontend | | | ⬜ |
| 4 TalentSearch | | | ⬜ |
| Security | | | ⬜ |
| Regression | | | ⬜ |

Feature is not complete until every box is ✅. Phase 5 after-signup uploads are **out of this sign-off**.

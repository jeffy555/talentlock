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

### V2.5 — Documents confirm still Aadhaar-only for Phases 1–4

```bash
curl -X POST http://localhost:8080/api/documents/confirm \
  -H "Authorization: Bearer <freelancer_token>" \
  -H "Content-Type: application/json" \
  -d '{"documentType":"bar_enrolment_certificate"}'
```

- [ ] **Phases 1–4:** 400 / validation error for `bar_enrolment_certificate`
- [ ] `aadhaar` confirm still succeeds
- [ ] **Phase 5:** same confirm returns 201 — see V5.1

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
- [ ] **Phases 1–4:** Phase 2 rows show “After signup” — no working upload control
- [ ] **Phase 5:** those rows become real uploads — see V5.2
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

## Phase 5 Validation — After-signup credentials

### V5.1 — Upload types accepted

```bash
# confirm body documentType=bar_enrolment_certificate (advocate) — 201, status pending
# documentType=unknown_type — 400
```

- [ ] All seven Phase 2 types accepted: `experience_certificate`, `bar_enrolment_certificate`, `certificate_of_practice`, `icai_membership_certificate`, `icsi_membership_certificate`, `gst_practitioner_certificate`, `sebi_nism_certificate`
- [ ] `aadhaar` / `government_id` / `professional_credential` still accepted
- [ ] If Healthcare Phase 2+ already added `experience_certificate`, confirm still upserts **one** row per freelancer (UNIQUE `freelancerId, documentType`)
- [ ] Technology freelancer can still confirm Aadhaar only at registration
- [ ] Phase 3 types (`aibe_certificate`, `professional_indemnity_insurance`, `udyin_msme`) still 400

### V5.2 — Checklist UI

- [ ] Advocate sees Bar enrolment, Certificate of Practice, Experience letter — each has Upload, not “After signup”
- [ ] Tax consultant sees GST practitioner + Experience letter among Phase 2 rows
- [ ] Financial adviser sees SEBI/NISM + Experience letter
- [ ] Recommended types (AIBE, PI, Udyam) **not** shown as upload targets
- [ ] Optional expiry on `certificate_of_practice`; rejected Bar enrolment allows re-upload; upsert resets expiry alert stage

### V5.3 — Expired enrolment Vault drop (Q9)

Seed advocate, Aadhaar verified, completeness ≥ 60, `enrolmentExpiry` yesterday.

```bash
curl "http://localhost:8080/api/freelancers?professionCategory=legal_finance" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] That advocate **absent** from Vault
- [ ] Chartered accountant / company secretary with past `enrolmentExpiry` also **absent**
- [ ] Tax consultant / financial adviser with past `enrolmentExpiry` **still present**
- [ ] `GET /api/freelancers/:id` still 200 for the excluded advocate
- [ ] Renewing `enrolmentExpiry` to next year restores Vault
- [ ] Missing Phase 2 uploads never hide a verified-Aadhaar legal/finance profile

### V5.4 — Privacy

- [ ] Employer never sees document images or full enrolment numbers
- [ ] AI `aiNotes` admin-only

---

## Phase 5 checklist

- [ ] Shared `experience_certificate` upload + AI review
- [ ] Advocate: Bar enrolment + Certificate of Practice
- [ ] CA / CS: ICAI / ICSI membership + Certificate of Practice
- [ ] Tax: GST practitioner certificate
- [ ] Adviser: SEBI/NISM certificate
- [ ] Enrolment expiry removes advocate/CA/CS from Vault (V5.3)
- [ ] Expiry cron still advances document `expiryAlertStage`; profile `enrolmentAlertStage` resets when `enrolmentExpiry` changes

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
- [ ] School-teacher expired-licence Vault exclusion **not** applied to `enrolmentExpiry` in Phases 1–4
- [ ] Phase 5 Q9 drop applies only to `advocate` / `chartered_accountant` / `company_secretary` — never tax/advisor, never generic `professional_credential`

---

## Sign-off

| Phase | Owner | Date | Result |
|---|---|---|---|
| 0 Prerequisites | | | ⬜ |
| 1 Database | | | ⬜ |
| 2 Backend | | | ⬜ |
| 3 Frontend | | | ⬜ |
| 4 TalentSearch | | | ⬜ |
| 5 After-signup credentials | | | ⬜ |
| Security | | | ⬜ |
| Regression | | | ⬜ |

Feature is not complete until every box is ✅. Phase 5 (V5.1–V5.4) is **in this sign-off**.

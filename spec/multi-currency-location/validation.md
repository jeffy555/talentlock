# TalentLock — Validation Guide: Multi-Currency & Location

Run after all `task.md` phases complete. Both implementer and reviewer should execute independently.

---

## Phase 1 Validation — Database

### V1.1 — New columns on `users`

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('country_code', 'state_code', 'currency_code');
```

- [ ] `country_code` — text, default `'US'`, NOT NULL
- [ ] `state_code` — text, nullable
- [ ] `currency_code` — text, default `'USD'`, NOT NULL

### V1.2 — New columns on `freelancer_profiles`

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'freelancer_profiles'
  AND column_name IN ('country_code', 'currency_code');
```

- [ ] Both exist with `US` / `USD` defaults

### V1.3 — New columns on `bookings`

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('currency_code', 'exchange_rate_at_creation');
```

- [ ] `currency_code` NOT NULL default `'USD'`
- [ ] `exchange_rate_at_creation` jsonb nullable

### V1.4 — `exchange_rate_cache` table

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'exchange_rate_cache';
```

- [ ] `id`, `base_currency`, `rates`, `fetched_at`, `source` exist

### V1.5 — Existing data unaffected

```sql
SELECT COUNT(*) FROM users WHERE country_code = 'US';
SELECT COUNT(*) FROM bookings WHERE exchange_rate_at_creation IS NOT NULL;
```

- [ ] All pre-migration users have `US`/`USD` defaults
- [ ] `exchange_rate_at_creation` is null on all pre-migration bookings

---

## Phase 2 Validation — Backend

### V2.1 — Public countries endpoint

```bash
curl http://localhost:8080/api/countries
```

- [ ] 200 without auth
- [ ] Returns exactly 10 countries
- [ ] India entry includes `currencyCode: "INR"`, `states` array

### V2.2 — Public exchange rates endpoint

```bash
curl http://localhost:8080/api/exchange-rates
```

- [ ] 200 with `baseCurrency`, `rates`, `fetchedAt`, `source`
- [ ] Second call same day returns cached row (`source` may be `cache`)

### V2.3 — Currency derivation on onboarding

```bash
curl -X PATCH http://localhost:8080/api/users/me/onboarding-step \
  -H "Authorization: Bearer <freelancer_token>" \
  -H "Content-Type: application/json" \
  -d '{"onboardingStep":"location","countryCode":"IN","stateCode":"MH"}'
```

- [ ] User row has `country_code = IN`, `currency_code = INR`
- [ ] Freelancer profile synced to `IN` / `INR`

### V2.4 — Reject client-supplied wrong currency

Attempt to set `currencyCode: "USD"` with `countryCode: "IN"`:

- [ ] Server ignores or rejects — stored currency remains `INR`

### V2.5 — Freelancer list filters

```bash
curl "http://localhost:8080/api/freelancers?countryCode=IN&currencyCode=INR" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Only Indian INR freelancers returned

### V2.6 — Booking currency freeze

Create booking with Indian freelancer:

```sql
SELECT currency_code, exchange_rate_at_creation
FROM bookings WHERE id = <new_booking_id>;
```

- [ ] `currency_code = 'INR'`
- [ ] `exchange_rate_at_creation` populated with rates snapshot

Change freelancer country to DE/EUR; re-query booking:

- [ ] Booking `currency_code` still `INR`

### V2.7 — Agreement generation currency

Generate agreement for INR booking:

- [ ] Agreement content references `INR` / `Indian Rupee` / `₹`
- [ ] No hardcoded `USD` in rate clause (unless booking is USD)

### V2.8 — Market median currency filter

Indian freelancer with INR rate; market median query:

- [ ] Median computed only from INR freelancers in same field

### V2.9 — Spend analytics conversion

Employer (EUR) with completed INR booking:

- [ ] Spend API returns `displayCurrency: "EUR"`
- [ ] Converted amount uses booking-time snapshot
- [ ] `conversionNote` present when conversions applied

### V2.10 — Unit tests

```bash
pnpm --filter @workspace/api-server run test:unit -- currency
pnpm --filter @workspace/api-server run test:unit -- exchangeRate
```

- [ ] All pass

### V2.11 — Integration tests

```bash
pnpm --filter @workspace/api-server run test:integration -- currency
```

- [ ] All pass

### V2.12 — Typecheck

```bash
pnpm run typecheck
```

- [ ] Zero errors

---

## Phase 3 Validation — Frontend

### V3.1 — Onboarding location step (freelancer)

1. New freelancer onboarding
2. Select India → Maharashtra

- [ ] Currency preview shows `₹ Indian Rupee (INR)`
- [ ] Cannot manually edit currency
- [ ] Step persists on refresh

### V3.2 — Onboarding location step (employer)

1. New employer; select Germany → Bavaria

- [ ] Display currency shows `€ Euro (EUR)`
- [ ] Hint copy mentions indicative conversion

### V3.3 — Talent Vault dual display

1. Log in as EUR employer
2. Browse Vault with INR freelancer

- [ ] Primary: `₹800/day` (prominent)
- [ ] Secondary: `≈ €X/day (indicative)` (muted)
- [ ] Location shows India or city

### V3.4 — Talent Vault filters

1. Filter Country = India, Currency = INR

- [ ] List narrows correctly
- [ ] Clear filters restores full list

### V3.5 — Booking currency banner

1. EUR employer opens booking with INR freelancer

- [ ] Blue banner explains INR is governing currency
- [ ] Rate input suffix shows `₹/day` not `$`
- [ ] Indicative EUR updates as employer types

### V3.6 — Domestic same-currency (US/US)

1. US employer books US freelancer

- [ ] Single `$` rate — no indicative second line
- [ ] No confusing conversion copy

### V3.7 — Earnings dashboard (freelancer INR)

- [ ] All amounts show `₹`
- [ ] Market median label mentions INR freelancers

### V3.8 — Spend dashboard (employer EUR)

- [ ] Totals in `€`
- [ ] Footnote about booking-time conversion when mixed currencies

### V3.9 — Agreement PDF

Download PDF for INR booking:

- [ ] Rate shows `₹` symbol in document

### V3.10 — Profile country change

1. Change country on profile
2. Confirm modal appears

- [ ] Existing bookings unchanged in DB

### V3.11 — Frontend unit tests

```bash
pnpm --filter @workspace/talentlock run test:unit
```

- [ ] `rateFormatUtils` INR/GBP/EUR cases pass
- [ ] No regressions

---

## Security Validation

### S1 — Currency cannot be spoofed

- [ ] API rejects `currencyCode` that does not match `countryCode`
- [ ] `exchangeRateAtCreation` not returned in booking API responses

### S2 — Public endpoints safe

- [ ] `GET /api/countries` exposes no PII
- [ ] `GET /api/exchange-rates` exposes no user data

### S3 — Agreement accuracy

- [ ] Non-USD booking never generates USD rate clause

---

## Regression Validation

### R1 — Existing US users unchanged

US freelancer, US employer:

- [ ] Rates display as `$X/hr` everywhere
- [ ] Agreements still say USD
- [ ] No new onboarding step forced on existing completed profiles (optional profile edit only)

### R2 — Completeness gate unaffected

Freelancer without country set:

- [ ] Still visible in Vault if completeness ≥ 60%
- [ ] Defaults to US/USD display

### R3 — Booking completion / debrief / reviews

Complete INR booking:

- [ ] Debrief still generates
- [ ] Review flow unchanged
- [ ] Status notifications unchanged

### R4 — Meeting brief

Confirm meeting with non-USD freelancer:

- [ ] Brief still generates
- [ ] Rate context shows correct currency (if dual display implemented)

### R5 — Token usage / AI features

- [ ] No new token labels added
- [ ] Rate suggestion still works with currency-filtered median

---

## Sign-Off Table

| Phase | Validator | Date | Status |
|-------|-----------|------|--------|
| 1 — Database | | | ⬜ |
| 2 — Backend | | | ⬜ |
| 3 — Frontend | | | ⬜ |
| Security | | | ⬜ |
| Regression | | | ⬜ |

**Feature is not merged until every checkbox above is ✅ and sign-off table is complete.**

# TalentLock — Task Breakdown: Multi-Currency & Location

Five implementation phases: Database → Backend → Frontend → Documentation → Validation. Do not start Phase 2 before Phase 1 push is confirmed in Neon. Do not start Phase 3 before Phase 2 codegen and `pnpm run typecheck` pass.

---

## Phase 1 — Database

### Task 1.1 — Add location columns to `users`

**File:** `lib/db/src/schema/users.ts`

```ts
countryCode: text("country_code").notNull().default("US"),
stateCode: text("state_code"),
currencyCode: text("currency_code").notNull().default("USD"),
```

### Task 1.2 — Add denormalised columns to `freelancer_profiles`

**File:** `lib/db/src/schema/freelancerProfiles.ts`

```ts
countryCode: text("country_code").notNull().default("US"),
currencyCode: text("currency_code").notNull().default("USD"),
```

### Task 1.3 — Add frozen currency to `bookings`

**File:** `lib/db/src/schema/bookings.ts`

Export `ExchangeRateSnapshot` interface per `plan.md` D6.

```ts
currencyCode: text("currency_code").notNull().default("USD"),
exchangeRateAtCreation: jsonb("exchange_rate_at_creation").$type<ExchangeRateSnapshot>(),
```

### Task 1.4 — Create `exchange_rate_cache` table

**File:** `lib/db/src/schema/exchangeRateCache.ts` (create)

Export table + types. Register in `lib/db/src/schema/index.ts`.

### Task 1.5 — Push schema

```bash
pnpm --filter @workspace/db run push
```

Verify columns in Neon before Phase 2.

**Acceptance:**
- [ ] `users.country_code`, `state_code`, `currency_code` exist
- [ ] `freelancer_profiles.country_code`, `currency_code` exist
- [ ] `bookings.currency_code`, `exchange_rate_at_creation` exist
- [ ] `exchange_rate_cache` table exists
- [ ] Existing rows default to US/USD; bookings `exchange_rate_at_creation` null

---

## Phase 2 — Backend

### Task 2.1 — Country & currency constants

**File:** `artifacts/api-server/src/lib/countryData.ts` (create)

- `COUNTRY_DATA` — 10 countries per `features.md` Module 3 with states
- `deriveCurrency(countryCode: string): string`
- `currencySymbol(code: string): string`
- `currencyName(code: string): string`
- `isSupportedCountry(code: string): boolean`

### Task 2.2 — Exchange rate service

**File:** `artifacts/api-server/src/lib/exchangeRateService.ts` (create)

- `FALLBACK_RATES` constant
- `fetchRatesFromApi(): Promise<Record<string, number>>`
- `getOrFetchExchangeRates(db, log): Promise<ExchangeRateSnapshot>`
- `convertAmount(amount, from, to, snapshot): number | null`

### Task 2.3 — Public routes

**File:** `artifacts/api-server/src/routes/countries.ts` (create)

- `GET /countries` → `{ countries: CountryOption[] }`

**File:** `artifacts/api-server/src/routes/exchangeRates.ts` (create)

- `GET /exchange-rates` → cached snapshot

Register both in `artifacts/api-server/src/routes/index.ts`.

### Task 2.4 — User location persistence

**File:** `artifacts/api-server/src/routes/users.ts`

- Extend `PATCH /users/me/onboarding-step` to accept `countryCode`, `stateCode` when `onboardingStep === 'location'`
- Derive `currencyCode` server-side; reject mismatch if client sends `currencyCode`
- Extend `PUT /users/me` (or add `PATCH /users/me/location`) for post-onboarding country change
- On freelancer user update: sync `freelancer_profiles.countryCode` + `currencyCode`

### Task 2.5 — Freelancer list filters

**File:** `artifacts/api-server/src/routes/freelancers.ts`

- Add `countryCode` and `currencyCode` query param filters on `GET /freelancers`
- Include `countryCode`, `currencyCode` in list + detail response mappers

### Task 2.6 — Booking currency freeze

**File:** `artifacts/api-server/src/routes/bookings.ts`

- `POST /api/bookings`: set `currencyCode` from freelancer profile; snapshot `exchangeRateAtCreation`
- All booking response mappers: include `currencyCode`
- Never expose `exchangeRateAtCreation` in API responses

### Task 2.7 — Agreement currency clause

**File:** `artifacts/api-server/src/routes/agreements.ts`

- Replace hardcoded `USD` `rateDisplay` with `buildRateDisplay()` per `plan.md` D4
- Add currency instructions to AI prompt context block

**File:** `artifacts/api-server/src/lib/agreementPdfUtils.ts` + `agreementPdfTemplate.tsx`

- Use `currencySymbol(booking.currencyCode)` in PDF rate rendering

### Task 2.8 — Analytics currency

**File:** `artifacts/api-server/src/lib/rateSuggestionUtils.ts`

- Add optional `currencyCode` filter to `getMarketMedian()`

**File:** `artifacts/api-server/src/lib/earningsIntelligence.ts`

- Return amounts labelled with freelancer `currencyCode`
- Pass `currencyCode` to market median

**File:** `artifacts/api-server/src/lib/spendIntelligence.ts`

- Convert booking amounts to employer `currencyCode` using `exchangeRateAtCreation`
- Add `displayCurrency` + `conversionNote` to response

### Task 2.9 — OpenAPI + codegen

**File:** `lib/api-spec/openapi.yaml`

Add paths, schemas: `Country`, `CountryList`, `ExchangeRates`, extend `User`, `FreelancerProfile`, `Booking`, onboarding body, freelancer list params.

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Post-codegen checks:
- [ ] `lib/api-zod/orval.config.ts` → `indexFiles: false`
- [ ] `lib/api-zod/src/index.ts` → exports only `./generated/api`

### Task 2.10 — Unit tests

**File:** `artifacts/api-server/tests/unit/currencyUtils.test.ts` (create)

- `deriveCurrency` for all 10 countries
- `convertAmount` pivot math
- `formatRate` symbol lookup (if shared testable module)

**File:** `artifacts/api-server/tests/unit/exchangeRateService.test.ts` (create)

- Fallback used when API mock fails
- Cache hit returns same-day row

### Task 2.11 — Integration tests

**File:** `artifacts/api-server/tests/integration/currency/countries.test.ts` (create)

- `GET /api/countries` returns 10 countries without auth
- `GET /api/exchange-rates` returns rates object

**File:** `artifacts/api-server/tests/integration/currency/bookingCurrency.test.ts` (create)

- `POST /api/bookings` sets `currencyCode` from freelancer profile
- Booking GET includes `currencyCode`

---

## Phase 3 — Frontend

### Task 3.1 — Shared currency utilities

**File:** `artifacts/talentlock/src/lib/currencyUtils.ts` (create)

- Re-export symbols/names from generated types or fetch `GET /countries` once
- `useExchangeRates()` React Query hook wrapping `useGetExchangeRates`
- `convertForDisplay(amount, fromCode, toCode, rates): number | null`

### Task 3.2 — Update `formatRate` + earnings formatters

**Files:**
- `artifacts/talentlock/src/lib/rateFormatUtils.ts` — ISO code support per `plan.md`
- `artifacts/talentlock/src/lib/earningsFormat.ts` — accept `currencyCode` param
- `artifacts/talentlock/tests/unit/rateFormatUtils.test.ts` — add INR/GBP/EUR cases

### Task 3.3 — `DualRateDisplay` component

**File:** `artifacts/talentlock/src/components/currency/DualRateDisplay.tsx` (create)

Props: `amount`, `rateType`, `primaryCurrency`, `secondaryCurrency?`, `rates`, `showIndicativeLabel`

### Task 3.4 — Onboarding location step

**File:** `artifacts/talentlock/src/components/onboarding/LocationStep.tsx` (create)

- Country searchable select
- State dependent select
- Read-only currency preview (derived from selected country)
- Different copy for freelancer vs employer

**File:** `artifacts/talentlock/src/pages/Onboarding.tsx`

- Add `location` to step union
- Insert after `profession_category` / after `role`
- Call `PATCH /onboarding-step` with `countryCode`, `stateCode`

### Task 3.5 — Talent Vault

**File:** `artifacts/talentlock/src/pages/FreelancersList.tsx`

- Replace hardcoded `formatRate(..., '$')` with `freelancer.currencyCode`
- Add `<DualRateDisplay />` when employer currency differs
- Add country + currency filter dropdowns
- Show location subtitle: `location ?? countryName`

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`, `PublicProfile.tsx`, `AiMatch.tsx`

- Same `formatRate` + dual display updates

### Task 3.6 — Booking flow

**File:** `artifacts/talentlock/src/pages/BookingDetail.tsx`

- Currency banner when employer views booking
- Rate inputs/display use `booking.currencyCode`
- Live indicative conversion on negotiation input

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx` (book flow)

- Pre-booking banner: rates in freelancer currency

### Task 3.7 — Dashboard analytics

**Files:**
- `artifacts/talentlock/src/components/earnings/*` — use freelancer `currencyCode`
- `artifacts/talentlock/src/components/spend/*` — use employer `displayCurrency` from API; show conversion footnote

### Task 3.8 — Profile location edit

**File:** `artifacts/talentlock/src/pages/Profile.tsx` (or settings section)

- Country/state edit with confirmation modal per `plan.md` Q2

### Task 3.9 — `formatRate` call site sweep

Run and fix every match:

```bash
rg "formatRate\(" artifacts/talentlock/src
rg "\"\\$\"" artifacts/talentlock/src --glob "*.tsx"
```

Known files: `BookingDetail`, `FreelancersList`, `FreelancerDetail`, `PublicProfile`, `AiMatch`, `WatchlistSummaryCard`, `MeetingBriefCard`, `RateSuggestionWidget`, `ProposalGeneratorDrawer`.

### Task 3.10 — Frontend typecheck

```bash
pnpm --filter @workspace/talentlock run typecheck
```

---

## Phase 4 — Documentation

### Task 4.1 — Update `project.md`

- Add columns to `users`, `freelancer_profiles`, `bookings` table descriptions
- Add `exchange_rate_cache` table
- Add `GET /api/countries`, `GET /api/exchange-rates`
- Add feature **#45 Multi-Currency & Location** to Key Features Summary
- Add Cursor notes section from `plan.md`

### Task 4.2 — Update `spec/spec.md`

- Feature index row: `Multi-Currency & Location` → status per execution progress

---

## Acceptance Criteria (flat checklist)

- [ ] `users`, `freelancer_profiles`, `bookings` have location/currency columns
- [ ] `exchange_rate_cache` table populated on first daily fetch
- [ ] Currency derived from country — client cannot set mismatched currency
- [ ] Onboarding location step for both roles
- [ ] Talent Vault shows dual currency when employer ≠ freelancer currency
- [ ] Country + currency filters on Talent Vault
- [ ] Booking `currencyCode` frozen at creation
- [ ] Agreement rate clause uses correct currency (not hardcoded USD)
- [ ] Agreement PDF shows correct symbol
- [ ] Earnings dashboard in freelancer currency; median same-currency only
- [ ] Spend dashboard converted to employer currency with footnote
- [ ] `formatRate('INR')` → `₹800/day`
- [ ] Existing US users unchanged (`$` display)
- [ ] `pnpm run typecheck` passes
- [ ] Unit + integration tests pass
- [ ] `validation.md` sign-off complete

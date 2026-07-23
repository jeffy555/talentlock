# TalentLock — Implementation Plan: Multi-Currency & Location

> **Status: DRAFT — Awaiting approval**
> Resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, **this file wins**.

---

## Pre-Implementation Codebase Checks

```bash
# Rate formatting call sites
rg "formatRate\(" artifacts/talentlock/src --glob "*.tsx" --glob "*.ts"

# Hardcoded USD in agreements
rg "USD" artifacts/api-server/src/routes/agreements.ts

# Earnings/spend hardcoded $
rg '\$' artifacts/talentlock/src/lib/earningsFormat.ts artifacts/talentlock/src/components/earnings artifacts/talentlock/src/components/spend

# Onboarding step enum
rg "onboarding_step|onboardingStep|PatchOnboardingStep" lib/api-spec/openapi.yaml artifacts/talentlock/src/pages/Onboarding.tsx

# Freelancer list query params
rg "professionCategory|availableFrom" artifacts/api-server/src/routes/freelancers.ts lib/api-spec/openapi.yaml
```

---

## Resolved Questions

### Q1 — Onboarding step placement

**Decision:** New step `location` inserted after `profession_category` (freelancers) or after `role` (employers), before details step.

```ts
type OnboardingStep =
  | "role"
  | "profession_category"  // freelancers only
  | "location"             // both roles
  | "freelancer_details"
  | "employer_details"
  | "employer_documents";  // employers only — mandatory Representative ID upload (see employee-verification Module 10)
```

`PATCH /api/users/me/onboarding-step` accepts `location`. Persist `countryCode`, `stateCode`, `currencyCode` on `users` in same request body.

**Validation:** When `onboardingStep === "location"`, `countryCode` is **required** (400 if missing). Frontend must not PATCH `location` when leaving the Work category step — only after the user picks country/region on the Location step.

---

### Q2 — Post-onboarding country edit

**Decision:** Editable on profile (`PUT /api/users/me` or dedicated `PATCH /api/users/me/location`). Confirmation copy required in UI. Sync to `freelancer_profiles` on save. Never mutate `bookings.currencyCode`.

---

### Q3 — `location` text field

**Decision:** Keep optional `freelancer_profiles.location` for city-level display. Vault subtitle: `location ?? countryName(countryCode)`.

---

### Q4 — State codes

**Decision:** Curated static `COUNTRY_DATA` in `artifacts/api-server/src/lib/countryData.ts` (re-export thin copy to frontend `countryData.ts` or fetch via API only).

```ts
export interface CountryOption {
  code: string;           // 'IN'
  name: string;           // 'India'
  currencyCode: string;   // 'INR'
  states: { code: string; name: string }[];
  stateRequired: boolean;
}
```

Phase 1: 10 countries per `features.md` Module 3.

---

### Q5 — Exchange rate cache

**Decision:**

```ts
// exchange_rate_cache.id = '2026-07-22' (UTC date)
const CACHE_ID = new Date().toISOString().slice(0, 10);
```

`getOrFetchExchangeRates(db)` — returns today's row; if missing or `fetchedAt` older than 24h UTC, fetch from `https://open.er-api.com/v6/latest/USD`.

---

### Q6 — `exchangeRateAtCreation` shape

**Decision:** Store full snapshot:

```ts
export interface ExchangeRateSnapshot {
  baseCurrency: "USD";
  rates: Record<string, number>;
  fetchedAt: string;
  source: "api" | "cache" | "fallback";
}
```

Conversion helper (display only):

```ts
export function convertAmount(
  amount: number,
  fromCode: string,
  toCode: string,
  snapshot: ExchangeRateSnapshot,
): number | null {
  if (fromCode === toCode) return amount;
  const fromRate = snapshot.rates[fromCode];
  const toRate = snapshot.rates[toCode];
  if (!fromRate || !toRate) return null;
  const usd = amount / fromRate;
  return usd * toRate;
}
```

---

### Q7 — Booking currency at creation

**Decision:** In `POST /api/bookings`:

```ts
const [freelancerProfile] = await db.select().from(freelancerProfilesTable)
  .where(eq(freelancerProfilesTable.id, freelancerId)).limit(1);

const currencyCode = freelancerProfile.currencyCode ?? "USD";
const exchangeRateAtCreation = await getOrFetchExchangeRates(db);

await db.insert(bookingsTable).values({
  ...fields,
  currencyCode,
  exchangeRateAtCreation,
});
```

---

### Q8 — Negotiation currency

**Decision:** API returns `currencyCode` on all booking responses. No server-side conversion on writes. UI shows rates in booking currency only.

---

### Q9 — Formatter unification

**Decision:** New shared modules:

| File | Purpose |
|------|---------|
| `lib/currency/src/constants.ts` | `SUPPORTED_CURRENCIES`, `COUNTRY_CURRENCY_MAP`, symbols, names |
| `lib/currency/src/convert.ts` | `convertAmount`, `formatWithCode` |
| `artifacts/api-server/src/lib/exchangeRateService.ts` | fetch, cache, fallback |
| `artifacts/talentlock/src/lib/currencyUtils.ts` | re-export + `useExchangeRates()` hook wrapper |

Update `rateFormatUtils.ts`:

```ts
export function formatRate(
  amount: number,
  rateType: RateType | null | undefined,
  currency: string = "USD",  // ISO 4217 code OR legacy symbol
): string {
  const symbol = currency.length === 3 ? currencySymbol(currency) : currency;
  const unit = RATE_UNIT_LABELS[rateType ?? "hourly"];
  return `${symbol}${amount.toLocaleString()}${unit}`;
}
```

---

### Q10 — Job budgets

**Decision:** Non-goal Phase 1. No schema change on `job_requirements.budget`.

---

### Q11 — Meeting brief dual currency

**Decision:** Include in Phase 3 if time permits; use shared `<DualRateDisplay />` component. Not a Phase 2 blocker.

---

### Q12 — Backfill

**Decision:**

```sql
-- After push — existing rows get defaults via column DEFAULT
-- bookings: currency_code already 'USD' via DEFAULT
-- No exchangeRateAtCreation backfill
```

---

## Schema Definitions (D1)

### `users` — add columns

```ts
countryCode: text("country_code").notNull().default("US"),
stateCode: text("state_code"),
currencyCode: text("currency_code").notNull().default("USD"),
```

Server **rejects** client-supplied `currencyCode` that does not match `deriveCurrency(countryCode)`.

### `freelancer_profiles` — add columns

```ts
countryCode: text("country_code").notNull().default("US"),
currencyCode: text("currency_code").notNull().default("USD"),
```

### `bookings` — add columns

```ts
currencyCode: text("currency_code").notNull().default("USD"),
exchangeRateAtCreation: jsonb("exchange_rate_at_creation").$type<ExchangeRateSnapshot>(),
```

### `exchange_rate_cache` — new table

```ts
export const exchangeRateCacheTable = pgTable("exchange_rate_cache", {
  id: text("id").primaryKey(),
  baseCurrency: text("base_currency").notNull().default("USD"),
  rates: jsonb("rates").$type<Record<string, number>>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  source: text("source").notNull(), // api | cache | fallback
});
```

---

## API Definitions (D2)

### `GET /api/countries` (public)

Returns:

```json
{
  "countries": [
    {
      "code": "IN",
      "name": "India",
      "currencyCode": "INR",
      "currencyName": "Indian Rupee",
      "currencySymbol": "₹",
      "stateRequired": true,
      "states": [{ "code": "MH", "name": "Maharashtra" }]
    }
  ]
}
```

### `GET /api/exchange-rates` (public)

Returns:

```json
{
  "baseCurrency": "USD",
  "rates": { "EUR": 0.92, "INR": 83.5, "GBP": 0.79 },
  "fetchedAt": "2026-07-22T06:00:00.000Z",
  "source": "api"
}
```

### `PATCH /api/users/me/onboarding-step` — extend body

```ts
{
  onboardingStep: "location",
  countryCode: "IN",
  stateCode: "MH"
  // currencyCode derived server-side — NOT accepted from client
}
```

### `GET /api/freelancers` — new query params

- `countryCode` — filter `freelancer_profiles.country_code`
- `currencyCode` — filter `freelancer_profiles.currency_code`

### Booking responses — add fields

```ts
currencyCode: string;
// exchangeRateAtCreation NOT returned to client (internal analytics only)
```

---

## Fallback Exchange Rates (D3)

Hardcoded in `exchangeRateService.ts` when API fails:

```ts
const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.5,
  AUD: 1.52,
  CAD: 1.36,
  AED: 3.67,
  SGD: 1.35,
  NGN: 1550,
  ZAR: 18.5,
};
```

UI shows `(estimated rates)` suffix when `source === 'fallback'`.

---

## Agreement Prompt Update (D4)

Replace `rateDisplay` builder in `agreements.ts`:

```ts
function buildRateDisplay(
  booking: { rate: string | null; paymentType: string; currencyCode: string },
): string {
  const amount = booking.rate ?? "0";
  const code = booking.currencyCode ?? "USD";
  const name = currencyName(code);
  const symbol = currencySymbol(code);
  if (booking.paymentType === "hourly") return `${symbol}${amount} (${name}) per hour`;
  if (booking.paymentType === "daily") return `${symbol}${amount} (${name}) per day`;
  return `${symbol}${amount} (${name}) fixed price`;
}
```

Add to system prompt context:

```
Currency: ${booking.currencyCode} (${currencyName(booking.currencyCode)})
Use "${booking.currencyCode}" and "${currencyName(booking.currencyCode)}" in the rate clause.
Do not use "$" or "USD" unless currency is USD.
```

---

## Spend Analytics Update (D5)

In `spendIntelligence.ts`, when summing booking spend for employer dashboard:

1. Load employer `currencyCode` from `users`
2. For each completed booking: if `booking.currencyCode === employerCurrency`, use raw amount
3. Else if `booking.exchangeRateAtCreation`: `convertAmount(amount, booking.currencyCode, employerCurrency, snapshot)`
4. Else (legacy USD booking): treat as USD

Response includes `displayCurrency: employerCurrency` and `conversionNote: "Amounts converted to EUR at booking-time rates."` when any conversion applied.

---

## Earnings Analytics Update (D6)

`getMarketMedian()` gains optional `currencyCode` filter:

```ts
export async function getMarketMedian(
  dbClient: DbClient,
  fieldOfWork: string,
  paymentType: RatePaymentType = "hourly",
  currencyCode?: string,
): Promise<number | null> {
  const conditions = [
    eq(freelancerProfilesTable.fieldOfWork, fieldOfWork),
    isNotNull(rateColumn),
  ];
  if (currencyCode) {
    conditions.push(eq(freelancerProfilesTable.currencyCode, currencyCode));
  }
  // ...
}
```

Dashboard formatters use freelancer's `currencyCode`.

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Database schema + exchange_rate_cache + push | ⬜ |
| 2 | Backend country data, exchange service, routes, booking/agreement/analytics updates, OpenAPI, codegen | ⬜ |
| 3 | Frontend onboarding, Vault dual display, booking banner, formatRate sweep, dashboards | ⬜ |
| 4 | project.md + validation.md sign-off | ⬜ |

---

## Cursor Notes (add to `project.md` after implementation)

- Currency is **derived from country** — never accept `currencyCode` from client without validating against `COUNTRY_CURRENCY_MAP`
- Booking `currencyCode` frozen at creation from freelancer profile — never updated on profile country change
- `exchangeRateAtCreation` on bookings is for employer spend analytics only — not returned in public API
- Conversions are display-only except spend analytics aggregation
- `formatRate()` third arg is ISO 4217 code in new call sites; `'$'` legacy still works
- `GET /api/countries` and `GET /api/exchange-rates` are public (no auth)
- Existing users default to `US`/`USD` — zero behaviour change until they set country

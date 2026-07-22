# TalentLock — Features Specification: Multi-Currency & Location

## Overview

Every rate in TalentLock today is a plain number with a hardcoded `$` symbol. `formatRate()` in `rateFormatUtils.ts` already accepts a `currencySymbol` parameter, but every call site passes `'$'` or relies on the default. There is no `countryCode`, no `stateCode`, and no ISO currency stored anywhere in the database. Agreement generation hardcodes `USD` in the compensation clause.

A European employer hiring an Indian freelancer needs to see the freelancer's rate in **INR** — the currency the freelancer priced themselves in. The employer then sees an **indicative** conversion in EUR for reference. The agreement must say *"₹800/day (Indian Rupees)"*, not *"$800/day"*.

**Multi-Currency & Location** adds country-based location onboarding, server-derived currency assignment, dual-currency display for cross-border discovery, frozen booking currency, correct agreement language, and analytics in each party's preferred currency — without building payment processing.

```
Onboarding (country) → derived currency → Talent Vault dual display → Booking (freelancer currency) → Agreement (INR clause) → Analytics (each party's view)
```

---

## Feature Modules

### Module 1 — Location Onboarding (Both Roles)

After role selection (and `profession_category` for education freelancers), both freelancers and employers complete a **Country & Region** step.

**Freelancer flow:**
- Pick country (searchable select) → pick state/region (dependent dropdown)
- Server derives `currencyCode` from country — **user cannot pick currency manually**
- UI shows read-only preview: *"Your primary currency: 🇮🇳 ₹ Indian Rupee (INR)"*
- Copy: *"This is the currency your rate will be shown in across TalentLock."*

**Employer flow:**
- Same country + state picker
- Server derives **display currency** (for indicative conversions only)
- Copy: *"Freelancer rates will show in their currency with an indicative [EUR] conversion for your reference."*

**Rules:**
- Currency is **always derived from country** via static lookup — never user-selected
- Existing users default to `US` / `USD` — behaviour unchanged
- Country is collected but **not** required for completeness score gate (≥ 60% Vault visibility)

---

### Module 2 — Database Schema

**`users` table** (both roles):

| Column | Type | Notes |
|--------|------|-------|
| `countryCode` | text NOT NULL DEFAULT `'US'` | ISO 3166-1 alpha-2: `IN`, `GB`, `DE`, … |
| `stateCode` | text nullable | ISO 3166-2 subdivision or platform code: `MH`, `ENG`, `BY`, … |
| `currencyCode` | text NOT NULL DEFAULT `'USD'` | ISO 4217 — **server-written only**, derived from `countryCode` |

**`freelancer_profiles` table** (denormalised for Vault queries):

| Column | Type | Notes |
|--------|------|-------|
| `countryCode` | text NOT NULL DEFAULT `'US'` | Synced from `users` on profile create/update |
| `currencyCode` | text NOT NULL DEFAULT `'USD'` | Synced from `users` — primary rate currency |

**`bookings` table** (frozen at creation):

| Column | Type | Notes |
|--------|------|-------|
| `currencyCode` | text NOT NULL DEFAULT `'USD'` | Freelancer's currency at booking creation — **never updated** |
| `exchangeRateAtCreation` | jsonb nullable | Snapshot for employer analytics: `{ baseCurrency, rates, fetchedAt, source }` |

**New `exchange_rate_cache` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Date key: `YYYY-MM-DD` |
| `baseCurrency` | text | Always `'USD'` |
| `rates` | jsonb | `{ GBP: 0.79, INR: 83.5, EUR: 0.92, … }` |
| `fetchedAt` | timestamptz | When snapshot was stored |
| `source` | text | `'api'` \| `'cache'` \| `'fallback'` |

---

### Module 3 — Phase 1 Supported Countries (10)

| Country | Code | Currency | Symbol |
|---------|------|----------|--------|
| United States | US | USD | $ |
| United Kingdom | GB | GBP | £ |
| India | IN | INR | ₹ |
| Germany | DE | EUR | € |
| Australia | AU | AUD | A$ |
| Canada | CA | CAD | C$ |
| UAE | AE | AED | AED |
| Singapore | SG | SGD | S$ |
| Nigeria | NG | NGN | ₦ |
| South Africa | ZA | ZAR | R |

Germany is the representative EU country in Phase 1 (EUR). Additional EU countries can be added later with the same EUR mapping.

Each country has a curated list of states/regions for the dependent dropdown (not all global subdivisions in Phase 1).

---

### Module 4 — Exchange Rate System

- Daily snapshot from [open.er-api.com](https://open.er-api.com) (free, no API key)
- First request of each UTC day triggers fetch; subsequent requests use `exchange_rate_cache`
- If API unavailable: hardcoded fallback rates; UI labels conversions **"estimated rates"**
- Conversions are **display-only** — never written into agreements or bookings as authoritative amounts
- `GET /api/exchange-rates` returns cached rates + `fetchedAt` + `source` (public, no auth)

---

### Module 5 — `formatRate()` & Currency Utilities

Update `artifacts/talentlock/src/lib/rateFormatUtils.ts`:

```ts
// Before (every call site):
formatRate(amount, rateType, '$')

// After:
formatRate(amount, rateType, 'INR')  // → '₹800/day'
formatRate(amount, rateType, 'GBP')  // → '£95/hr'
formatRate(amount, rateType, 'EUR')  // → '€120/hr'
```

- Third parameter accepts ISO 4217 code **or** legacy symbol (`'$'` still works)
- New shared module: `currencyUtils.ts` (frontend + backend) with `COUNTRY_CURRENCY_MAP`, `currencySymbol(code)`, `currencyName(code)`, `formatDualRate(primary, secondary, …)`
- Update `earningsFormat.ts` spend/earnings dashboard formatters to accept currency code (currently hardcoded `$`)

---

### Module 6 — Talent Vault Dual Display & Filters

**Employer browsing Vault** sees each freelancer card as:

```
Priya Sharma
Full Stack Development · Mumbai, India
₹800/day                    ← primary (freelancer currency)
≈ €8.70/day (indicative)    ← secondary (employer display currency, grey, smaller)
```

**New query params on `GET /api/freelancers`:**
- `countryCode` — filter freelancers by `freelancer_profiles.countryCode`
- `currencyCode` — filter freelancers by `freelancer_profiles.currencyCode`

Client-side filters added to Talent Vault filter panel.

---

### Module 7 — Booking & Negotiation Currency Clarity

- Booking `currencyCode` frozen from freelancer's currency at `POST /api/bookings` creation
- `exchangeRateAtCreation` snapshot stored on the booking row
- Booking form shows banner: *"Rates on this booking are in Indian Rupee (INR) — Priya's currency."*
- Rate input, negotiation, and milestone amounts are always in **booking currency**
- Employer sees live indicative conversion below input as they type (client-side from cached rates)
- If freelancer later changes country/currency, **existing bookings unchanged**

---

### Module 8 — Agreements & PDF

Agreement AI prompt updated with explicit currency block:

```
Currency: INR (Indian Rupee)
Rate: ₹800 per day
Use "INR" and "Indian Rupees" in the rate clause.
Do not use "$" or "USD" in this agreement.
```

Replace hardcoded `USD ${booking.rate}` in `agreements.ts` `rateDisplay` builder.

Agreement PDF template uses correct symbol from `booking.currencyCode`.

---

### Module 9 — Analytics (Per-Party Currency View)

**Freelancer — Earnings Intelligence:**
- All amounts in freelancer's `currencyCode`
- Market median filtered to freelancers with **same `currencyCode`** only (`rateSuggestionUtils.ts`)

**Employer — Spend Analytics:**
- Historical spend converted to employer's `currencyCode` using **booking-time** `exchangeRateAtCreation` snapshot
- Footnote: *"Amounts converted to EUR at booking-time rates."*
- Mixed-currency portfolio (e.g. INR + GBP bookings) normalised to employer display currency

---

### Module 10 — Public API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/countries` | Public list of supported countries, states, derived currencies |
| GET | `/api/exchange-rates` | Public cached USD-base rates for client-side conversion |

---

## Plan Gating

| Surface | Gating |
|---------|--------|
| Onboarding location step | All plans |
| Talent Vault dual display | All plans |
| Booking currency banner | All plans |
| Agreement currency clause | All plans |
| Analytics currency views | All plans |
| Exchange rate API | Public (read-only) |

No token consumption. No new subscription tiers.

---

## Explicit Non-Goals (Phase 1)

- **Payment processing** — currency is for display clarity and agreement accuracy only; no Stripe multi-currency checkout
- **Automatic price adjustment** — freelancer sets ₹800; platform does not convert or adjust the rate number
- **User-selected currency** — currency is always derived from country; no manual override
- **Real-time FX trading rates** — daily cache is sufficient; no per-second rates
- **Job post budget currency conversion** — job `budget` remains in employer's display currency (documented; no cross-currency job matching in Phase 1)
- **Completeness score gate on country** — country collected but not required for ≥ 60% Vault threshold
- **All world countries** — Phase 1 limited to 10 countries; expandable via static config
- **Cruise Mode / TalentSearch rule currency conversion** — rules continue to use numeric thresholds in user's local context; full cross-currency rule normalisation deferred
- **Historical booking migration** — existing bookings backfilled to `USD` with null `exchangeRateAtCreation`

---

## Summary Table

| Component | What Changes |
|-----------|--------------|
| Onboarding — freelancer | Country & Region step → INR/etc. auto-assigned |
| Onboarding — employer | Country & Region step → display currency auto-assigned |
| Freelancer profile | `countryCode` + `currencyCode` stored and synced |
| Employer user row | `countryCode` + display `currencyCode` on `users` |
| Talent Vault cards | Dual display: freelancer currency (primary) + employer indicative |
| Talent Vault filters | Country + currency filters |
| Booking creation | Currency banner + rate in freelancer currency + conversion reference |
| Booking negotiation | Same currency throughout |
| Agreements (AI) | Rate clause uses correct currency name and symbol |
| Agreement PDF | Correct currency symbol in rendered document |
| Earnings Intelligence | Amounts in freelancer currency; median same-currency only |
| Spend Analytics | Converted to employer currency at booking-time rates |
| `formatRate()` | Accepts ISO codes; backward-compatible with `$` |
| `rateSuggestionUtils.ts` | Market median filtered by `currencyCode` |
| `exchange_rate_cache` | Daily snapshot, on-demand fetch, fallback |
| `GET /api/countries` | Public country + state data |
| `GET /api/exchange-rates` | Public cached rates |

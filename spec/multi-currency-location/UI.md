# TalentLock — UI Specification: Multi-Currency & Location

## Overview

Multi-currency UI spans onboarding, Talent Vault discovery, booking negotiation, and analytics dashboards. The visual language follows one rule: **the freelancer's currency is always primary**; the employer's currency is always secondary, smaller, grey, and labelled **indicative**.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query (generated hooks), Wouter.

---

## Design Tokens

| Semantic | Value | Used for |
|----------|-------|----------|
| Primary rate | `text-foreground font-semibold` | Freelancer's currency amount |
| Indicative rate | `text-muted-foreground text-sm` | Employer reference conversion |
| Indicative prefix | `≈` (unicode) | Before converted amount |
| Indicative label | `text-xs text-muted-foreground` | "(indicative)" or "(estimated rates)" |
| Currency banner bg | `bg-blue-50 border-blue-200` | Booking currency notice |
| Currency banner text | `text-blue-800 text-sm` | Banner copy |
| Country step accent | `text-primary` | Onboarding location step icons |
| Filter badge | existing Vault filter chip style | Country/currency filters |

---

## Component: `LocationStep`

**File:** `artifacts/talentlock/src/components/onboarding/LocationStep.tsx`

### Props

```ts
interface LocationStepProps {
  role: "freelancer" | "employer";
  countries: CountryOption[];
  countryCode: string;
  stateCode: string | null;
  onCountryChange: (code: string) => void;
  onStateChange: (code: string) => void;
  onContinue: () => void;
  isSubmitting?: boolean;
}
```

### Layout — Freelancer

```
┌─────────────────────────────────────────────────────────────────┐
│  Where are you based?                                            │
│                                                                  │
│  Country                                                         │
│  [ 🔍 India                                              ▾ ]    │
│                                                                  │
│  State                                                           │
│  [ Maharashtra                                           ▾ ]    │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Your primary currency                                   │  │
│  │  🇮🇳  ₹  Indian Rupee (INR)                               │  │
│  │  This is the currency your rate will be shown in across   │  │
│  │  TalentLock.                                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│                                        [ Continue → ]              │
└─────────────────────────────────────────────────────────────────┘
```

### Layout — Employer

Same structure; currency box copy:

> Your display currency  
> 🇩🇪 € Euro (EUR)  
> Freelancer rates will show in their currency with an indicative Euro conversion for your reference.

### Behaviour

- Country select is searchable (`Command` + `Popover` or shadcn `Combobox`)
- State select disabled until country chosen; options from `countries[].states`
- Currency preview updates immediately on country change (client-side from `countries` data — no extra API call)
- Continue disabled until `countryCode` set and (`stateCode` set OR `stateRequired === false`)

---

## Component: `DualRateDisplay`

**File:** `artifacts/talentlock/src/components/currency/DualRateDisplay.tsx`

### Props

```ts
interface DualRateDisplayProps {
  amount: number;
  rateType: RateType;
  primaryCurrency: string;       // ISO 4217 — freelancer/booking currency
  secondaryCurrency?: string;      // employer display currency; omit if same
  rates?: ExchangeRates | null;
  ratesSource?: "api" | "cache" | "fallback";
  layout?: "inline" | "stacked";
  className?: string;
}
```

### Stacked (Vault card)

```
₹800/day
≈ €8.70/day (indicative)
```

### Inline (compact)

```
₹800/day · ≈ €8.70/day
```

When `ratesSource === 'fallback'`, append `(estimated rates)` to indicative line.

When `primaryCurrency === secondaryCurrency` or no `secondaryCurrency`, render primary only.

---

## Component: `BookingCurrencyBanner`

**File:** `artifacts/talentlock/src/components/bookings/BookingCurrencyBanner.tsx`

### Props

```ts
interface BookingCurrencyBannerProps {
  currencyCode: string;
  freelancerName: string;
  viewerRole: "employer" | "freelancer";
  displayCurrency?: string;  // employer only
}
```

### Employer view

```
┌─────────────────────────────────────────────────────────────────┐
│  ℹ Rates on this booking are in Indian Rupee (INR) — Priya's    │
│  currency. Enter your proposed rate in INR.                      │
│  Your Euro estimate appears below for reference only.             │
└─────────────────────────────────────────────────────────────────┘
```

### Freelancer view

```
┌─────────────────────────────────────────────────────────────────┐
│  ℹ This booking is in Indian Rupee (INR) — your currency.       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Page Integrations

### Onboarding (`Onboarding.tsx`)

Insert `LocationStep` in flow:

| Role | Order |
|------|-------|
| Freelancer | role → profession_category → **location** → freelancer_details |
| Employer | role → **location** → employer_details |

Progress indicator updated to include location step.

### Talent Vault (`FreelancersList.tsx`)

**Card rate block** — replace single `$` rate:

```tsx
<DualRateDisplay
  amount={rate}
  rateType={rateType}
  primaryCurrency={freelancer.currencyCode}
  secondaryCurrency={employerCurrency}
  rates={exchangeRates}
  ratesSource={exchangeRates?.source}
  layout="stacked"
/>
```

**Subtitle line:**

```tsx
{freelancer.location ?? countryName(freelancer.countryCode)}
```

**Filter panel** — add two selects after existing filters:

```
Country:  [ All countries ▾ ]
Currency: [ All currencies ▾ ]
```

### Freelancer Detail / Public Profile

- Hero rate uses `DualRateDisplay` for authenticated employer viewers
- Unauthenticated public profile: primary currency only (no employer conversion)

### Booking Detail (`BookingDetail.tsx`)

Placement: above rate negotiation panel / proposed rate input.

```tsx
{booking.currencyCode && (
  <BookingCurrencyBanner
    currencyCode={booking.currencyCode}
    freelancerName={booking.freelancerName ?? "the freelancer"}
    viewerRole={isEmployer ? "employer" : "freelancer"}
    displayCurrency={isEmployer ? userCurrency : undefined}
  />
)}
```

**Rate input suffix:** show `₹/day` not `$/day` from `currencySymbol(booking.currencyCode)`.

**Below input:**

```tsx
<DualRateDisplay amount={parsedRate} ... layout="inline" />
```

### Earnings Dashboard

All monetary values use `formatCurrencyAmount(value, freelancerCurrencyCode)`.

Market median label: `Field median (INR freelancers)`.

### Spend Dashboard

All monetary values use employer `displayCurrency` from API.

Footnote below spend total:

> Amounts converted to EUR at booking-time rates.

Show when `conversionNote` present in API response.

---

## State Variants

### Exchange rates loading

- `DualRateDisplay`: show primary rate only; indicative line shows `…` skeleton or hidden until rates load
- Never block card render on rates

### Exchange rates failed

- Primary rate still shown
- Indicative line hidden; optional tooltip "Conversion unavailable"

### Same currency (domestic)

- No secondary line — single rate display (no visual noise)

### Legacy USD user

- `countryCode: US`, `currencyCode: USD` — identical to today's UI

---

## Copy Reference Table

| Key | String |
|-----|--------|
| `onboarding.location.title` | Where are you based? |
| `onboarding.location.country` | Country |
| `onboarding.location.state` | State |
| `onboarding.location.state.employer` | State / Region |
| `onboarding.currency.primary.title` | Your primary currency |
| `onboarding.currency.primary.hint` | This is the currency your rate will be shown in across TalentLock. |
| `onboarding.currency.display.title` | Your display currency |
| `onboarding.currency.display.hint` | Freelancer rates will show in their currency with an indicative {currencyName} conversion for your reference. |
| `vault.filter.country` | Country |
| `vault.filter.currency` | Currency |
| `rate.indicative` | indicative |
| `rate.estimated` | estimated rates |
| `booking.banner.employer` | Rates on this booking are in {currencyName} ({currencyCode}) — {freelancerName}'s currency. Enter your proposed rate in {currencyCode}. Your {displayCurrencyName} estimate appears below for reference only. |
| `booking.banner.freelancer` | This booking is in {currencyName} ({currencyCode}) — your currency. |
| `profile.location.change.warning` | Changing country updates your display currency. Existing bookings keep their original currency. |
| `analytics.spend.conversionNote` | Amounts converted to {currencyCode} at booking-time rates. |
| `analytics.earnings.medianNote` | Field median ({currencyCode} freelancers) |

---

## Accessibility

- Country/state selects: `aria-label` on combobox triggers
- Currency preview box: `aria-live="polite"` when country changes
- Indicative conversion: `aria-label="Indicative conversion: approximately {amount} in {currency}"`
- Booking banner: `role="status"` with info icon + `aria-label`

---

## Responsive Behaviour

- `DualRateDisplay` stacked on mobile, inline on `sm+` where space allows
- Onboarding location step: full-width selects on all breakpoints
- Vault filters: country/currency stack below field filter on mobile

---

## Component File Summary

| File | Status | Task |
|------|--------|------|
| `components/onboarding/LocationStep.tsx` | New | 3.4 |
| `components/currency/DualRateDisplay.tsx` | New | 3.3 |
| `components/bookings/BookingCurrencyBanner.tsx` | New | 3.6 |
| `lib/currencyUtils.ts` | New | 3.1 |
| `lib/rateFormatUtils.ts` | Modified | 3.2 |
| `lib/earningsFormat.ts` | Modified | 3.2 |
| `pages/Onboarding.tsx` | Modified | 3.4 |
| `pages/FreelancersList.tsx` | Modified | 3.5 |
| `pages/FreelancerDetail.tsx` | Modified | 3.5–3.6 |
| `pages/BookingDetail.tsx` | Modified | 3.6 |
| `components/earnings/*` | Modified | 3.7 |
| `components/spend/*` | Modified | 3.7 |

---

## Non-UI Scope

- No currency selector dropdown (currency is derived, read-only)
- No payment method / Stripe currency UI
- No admin exchange rate management console in Phase 1
- Job post budget fields not restyled in Phase 1 (non-goal)

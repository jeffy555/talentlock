# TalentLock — Implementation Plan: Localized Plan Pricing (USD / EUR / INR)

> **Status: ✅ Complete**
> Resolves questions from `clarify.md`. If this file and `task.md` conflict, **this file wins**.

---

## Pre-Implementation Checks

```bash
rg "priceMonthly|\\\$\{plan" artifacts/api-server/src/lib/plans.ts artifacts/talentlock/src/pages/Pricing.tsx
rg "GET.*plans|/plans" lib/api-spec/openapi.yaml artifacts/api-server/src/routes
rg "currencyCode" artifacts/api-server/src/lib/countryData.ts
```

---

## Resolved Decisions

### Q1 — Fixed regional price book (not live FX)

Canonical amounts live in `artifacts/api-server/src/lib/planPrices.ts`:

```ts
export type PlanDisplayCurrency = "USD" | "EUR" | "INR";

export const PLAN_PRICE_MONTHLY: Record<
  Exclude<PlanId, "free" | "employer_enterprise">,
  Record<PlanDisplayCurrency, number>
> = {
  freelancer_free: { USD: 0, EUR: 0, INR: 0 },
  freelancer_pro: { USD: 19, EUR: 19, INR: 1499 },
  employer_starter: { USD: 49, EUR: 49, INR: 4099 },
  employer_growth: { USD: 199, EUR: 199, INR: 16499 },
};
```

`PLANS[id].priceMonthly` remains the **USD** canonical field for backwards compatibility; API responses set `priceMonthly` to the **selected display currency** amount.

Enterprise: `priceMonthly: null` / UI “Custom” in all currencies.

---

### Q2 — Display bucket mapping

```ts
export function planDisplayCurrency(userCurrencyCode: string | null | undefined): PlanDisplayCurrency {
  if (userCurrencyCode === "INR") return "INR";
  if (userCurrencyCode === "EUR") return "EUR";
  return "USD";
}
```

---

### Q3 — API

Extend existing plans list endpoint (locate current route — typically `GET /api/plans`):

1. OpenAPI: add query `currency` enum `USD|EUR|INR`; response fields `displayCurrency`, `currencySymbol`.
2. Codegen + typecheck.
3. Handler: resolve currency from query → else auth user → else `USD`; attach localized `priceMonthly`.

Respect `PREMIUM_FEATURES_FREE`: when true, Growth/Pro `priceMonthly` forced to `0` in **all** display currencies (existing behaviour).

---

### Q4 — Frontend

1. `formatPlanPrice(amount, currency)` in `artifacts/talentlock/src/lib/planPriceFormat.ts` using `currencySymbol()` from `currencyUtils.ts`.
2. `Pricing.tsx` uses API fields only — no hardcoded `$`.
3. Currency switcher: three buttons; persist choice in `sessionStorage` key `tl_pricing_currency`.
4. Audit other `$` + plan price call sites (upgrade banners) — replace with shared formatter + plans query currency.

---

### Q5 — No schema / no Stripe

No DB migration. No Stripe Price IDs in this phase.

---

### Q6 — Docs

Update `project.md` Subscription Plans table to show USD / EUR / INR columns. Cross-link from `spec/multi-currency-location/features.md`.

---

## Phase Order

| Phase | Scope |
|-------|--------|
| 1 | Backend `planPrices.ts` + plans route + OpenAPI + codegen |
| 2 | Frontend Pricing + shared formatter + CTA audit |
| 3 | `project.md` / validation pass |

Never start Phase 2 before Phase 1 typecheck passes.

---

## Explicit Non-Goals

- Live FX conversion of plan prices
- GBP / AUD / AED dedicated price books
- Changing freelancer engagement rate currency rules
- Stripe Checkout
- Changing plan **limits** (tokens, bookings) by currency

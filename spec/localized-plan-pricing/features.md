# TalentLock — Features Specification: Localized Plan Pricing (USD / EUR / INR)

## Overview

**Multi-Currency & Location** (`spec/multi-currency-location/`) already derives engagement currency from country (freelancer rates, booking freeze, dual-currency Vault display, agreement clauses). That work does **not** cover **TalentLock subscription / plan pricing**.

Today `/pricing` and `plans.ts` always present **USD** list prices with a hardcoded `$` (e.g. Employer Starter `$49/mo`). Indian and European users still see dollars even when their account `currencyCode` is `INR` or `EUR`.

This feature adds **localized platform costing** for the three primary commercial markets:

| Market | Currency | Symbol | Country trigger (examples) |
|--------|----------|--------|----------------------------|
| United States (default) | USD | $ | `US` (+ any country whose derived currency is not EUR/INR) |
| Eurozone (Phase 1) | EUR | € | `DE` (and later other EUR countries sharing the same price book) |
| India | INR | ₹ | `IN` |

**Out of scope:** Stripe Checkout / payment capture (still deferred). This ships **display + API contract** so Pricing, plan cards, and any upgrade CTAs show the correct regional price. When Stripe lands, each `(planId, currency)` row maps to a Stripe Price ID.

**Prerequisite:** `spec/multi-currency-location/` complete (`users.currencyCode` from country).

```
User country → currencyCode (USD|EUR|INR display bucket)
  → GET /api/plans?currency=INR
  → /pricing shows ₹4,099/mo (not $49)
```

---

## Feature Modules

### Module 1 — Display currency buckets

Not every country in `COUNTRY_DATA` needs its own price book. Phase 1 maps to **three price books**:

| `users.currencyCode` | Plan price book |
|----------------------|-----------------|
| `INR` | INR |
| `EUR` | EUR |
| Everything else (`USD`, `GBP`, `AUD`, …) | **USD** (Phase 1 default book) |

**Rationale:** User asked for dollars / euros / rupees as the costing triad. GBP and other FX markets keep USD list prices until a later price-book expansion. Dual-currency rate display for engagements is unchanged (multi-currency-location).

---

### Module 2 — Canonical regional price table

Server-owned static table (not live FX at render time — subscription prices must be stable and auditable):

| Plan ID | USD / mo | EUR / mo | INR / mo |
|---------|----------|----------|----------|
| `freelancer_free` | 0 | 0 | 0 |
| `freelancer_pro` | 19 | 19 | 1,499 |
| `employer_starter` | 49 | 49 | 4,099 |
| `employer_growth` | 199 | 199 | 16,499 |
| `employer_enterprise` | null (Custom) | null | null |

Notes:
- Amounts are **integers** in major units (no paise/cents fractions in UI).
- INR uses Indian digit grouping in UI (`₹4,099`) via existing currency formatters.
- While `PREMIUM_FEATURES_FREE` is on, Growth/Pro may still list as `$0` / `Start Free` in **all** currencies — restore regional paid amounts when the flag flips off.
- Enterprise remains “Custom / Contact us” in all currencies.

---

### Module 3 — Plans API contract

Extend `GET /api/plans` (or equivalent plans list used by `/pricing`):

**Request**
- Optional query `currency` — `USD` | `EUR` | `INR`
- If omitted: derive from authenticated user’s `users.currencyCode` mapped through Module 1 buckets; unauthenticated → `USD`

**Response** (each plan)
```ts
{
  id: PlanId;
  name: string;
  tagline: string;
  features: string[];
  // existing
  priceMonthly: number;          // amount in displayCurrency major units (0 for free)
  // new
  displayCurrency: "USD" | "EUR" | "INR";
  currencySymbol: string;        // "$" | "€" | "₹"
  priceMonthlyByCurrency?: {     // optional full matrix for admin/debug
    USD: number | null;
    EUR: number | null;
    INR: number | null;
  };
}
```

OpenAPI + codegen required. Do not hand-edit generated clients.

---

### Module 4 — Pricing UI

`artifacts/talentlock/src/pages/Pricing.tsx`:
- Stop hardcoding `$` before `plan.priceMonthly`
- Render `{currencySymbol}{formattedAmount}` from API `displayCurrency`
- Optional currency switcher (USD | EUR | INR) for logged-out visitors; logged-in users default to their bucket with switcher override stored in **sessionStorage** only (never `localStorage`)
- Copy footnote: *“Prices shown in {currency}. Billing currency at paid launch will match your account location.”*

Upgrade CTAs elsewhere that show a dollar amount must use the same helper (`formatPlanPrice(plan, currency)`).

---

### Module 5 — Relationship to engagement multi-currency

| Concern | Spec | Currency source |
|---------|------|-----------------|
| Freelancer listed rate | multi-currency-location | Freelancer `currencyCode` |
| Booking / agreement | multi-currency-location | Frozen booking `currencyCode` |
| Vault dual display | multi-currency-location | Freelancer + employer display FX |
| **TalentLock subscription price** | **this spec** | User bucket USD / EUR / INR |

Never convert plan prices with `exchange_rate_cache` at request time for the primary listed amount — use the static regional table. Indicative FX footnotes are optional and secondary.

---

## Success Criteria

1. Indian user (`currencyCode: INR`) sees Starter as **₹4,099/mo** (when premium free flag is off), not `$49`.
2. German user (`EUR`) sees **€49/mo** Starter.
3. US / other users see **$49/mo**.
4. OpenAPI documents `displayCurrency` and codegen hooks compile.
5. No Stripe / payment-processor work in this feature.
6. Engagement rate display remains governed by multi-currency-location (unchanged).

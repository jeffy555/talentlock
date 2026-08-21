# TalentLock — Task Breakdown: Localized Plan Pricing

## Summary

Backend price book + plans API localization → Pricing UI + shared formatter → docs/validation.

**Prerequisite:** Multi-currency location (`users.currencyCode`) shipped.

---

## Phase 1 — Backend + OpenAPI

### Task 1.1 — Locate plans endpoint

```bash
rg "plans|priceMonthly" artifacts/api-server/src/routes lib/api-spec/openapi.yaml
```

Document the current `GET` path and response shape in a comment at top of `planPrices.ts`.

- [x] Path identified — `GET /api/subscriptions/plans`
- [x] OpenAPI schema name identified — `PlanDef`

### Task 1.2 — Add `planPrices.ts`

**File:** `artifacts/api-server/src/lib/planPrices.ts`

- [x] `PlanDisplayCurrency`, `PLAN_PRICE_MONTHLY`, `planDisplayCurrency()`, `currencySymbolForPlan()`
- [x] Amounts match `features.md` Module 2
- [x] Unit tests in `artifacts/api-server/tests/unit/planPrices.test.ts`

### Task 1.3 — Wire `plans.ts`

- [x] Keep USD `priceMonthly` on `PlanDef` as canonical USD
- [x] Export helper `resolvePlanPrice(planId, currency)` used by route
- [x] `PREMIUM_FEATURES_FREE` zeros Growth/Pro for all currencies

### Task 1.4 — OpenAPI + codegen

- [x] Query param `currency: USD|EUR|INR`
- [x] Response: `displayCurrency`, `currencySymbol`; `priceMonthly` = localized amount
- [x] `pnpm --filter @workspace/api-spec run codegen`
- [x] Post-codegen checks (`indexFiles: false`, `index.ts` exports)
- [x] `pnpm run typecheck`

### Task 1.5 — Route handler

- [x] Resolve currency: query → user → USD
- [x] Return localized plans
- [x] Unauthenticated requests default USD
- [x] Invalid currency → 400

---

## Phase 2 — Frontend

### Task 2.1 — `planPriceFormat.ts`

**File:** `artifacts/talentlock/src/lib/planPriceFormat.ts`

- [x] `formatPlanPrice(amount, currency)` → `$49`, `€49`, `₹4,099`
- [x] Enterprise / null → `Custom`

### Task 2.2 — Pricing page

**File:** `artifacts/talentlock/src/pages/Pricing.tsx`

- [x] Remove hardcoded `$`
- [x] Pass `currency` into plans hook
- [x] Switcher USD | EUR | INR; `sessionStorage` key `tl_pricing_currency`
- [x] Footnote about billing currency

### Task 2.3 — CTA audit

```bash
rg "\\\$\{.*price|priceMonthly|/pricing" artifacts/talentlock/src --glob "*.tsx"
```

- [x] Every plan price display uses `formatPlanPrice` or API symbol (Pricing + Billing)
- [x] No new `localStorage` usage

### Task 2.4 — Typecheck

- [x] `pnpm --filter @workspace/talentlock run typecheck`

---

## Phase 3 — Docs & Validation

### Task 3.1 — Update `project.md` Subscription Plans table with USD/EUR/INR

- [x] Done — table + cursor notes + utility registry; feature marked ✅ Complete

### Task 3.2 — Run `validation.md` checklist

- [x] Unit tests + live API curls (INR/EUR/USD/GBP 400) + typecheck; checklist updated 2026-08-21

---

## Explicitly Out of Scope

- [ ] Stripe Price IDs
- [ ] DB migrations
- [ ] GBP price book
- [ ] Engagement rate FX changes

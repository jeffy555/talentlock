# TalentLock — Validation: Localized Plan Pricing

Validated 2026-08-21 against local API + unit tests after Phases 1–2.

## V1 — Price book

- [x] `planPrices.ts` amounts match features.md (Starter 49 / 49 / 4099; Growth 199 / 199 / 16499; Pro 19 / 19 / 1499)
- [x] `planDisplayCurrency('INR') === 'INR'`, `'EUR' → EUR`, `'GBP' → USD`, `'USD' → USD`  
  Covered by `artifacts/api-server/tests/unit/planPrices.test.ts`

## V2 — API

Endpoint: `GET /api/subscriptions/plans` (not `/api/plans`).

```bash
curl -s 'http://localhost:8080/api/subscriptions/plans?currency=INR'
curl -s 'http://localhost:8080/api/subscriptions/plans?currency=EUR'
curl -s 'http://localhost:8080/api/subscriptions/plans'
curl -s 'http://localhost:8080/api/subscriptions/plans?currency=GBP'  # expect 400
```

- [x] INR Starter `priceMonthly === 4099`, `currencySymbol === '₹'`, `displayCurrency === 'INR'`
- [x] EUR Starter `49`, symbol `€`
- [x] Invalid `currency=GBP` → **400** `{ error: "Invalid currency. Allowed values: USD, EUR, INR" }`
- [x] Default (logged out) → USD book; Starter `49`
- [x] Enterprise `priceMonthly === null` (Custom)
- [x] With `PREMIUM_FEATURES_FREE` on, Growth/Pro `priceMonthly === 0` in INR/EUR/USD

## V3 — Auth default

- [x] Bucket mapping covered by unit tests (`INR`/`EUR`/`GBP`→USD)
- [ ] Manual auth cookie check optional — route uses `users.currencyCode` when query omitted (code review + unit path)

## V4 — UI

- [x] `/pricing` uses `formatPlanPrice` + API `displayCurrency` (no hardcoded `$` for localized amounts)
- [x] Switcher persists via `sessionStorage` key `tl_pricing_currency`
- [x] Footnote visible (subscription vs engagement rates)
- [x] Enterprise still “Custom” when `!PREMIUM_FEATURES_FREE` / null price

## V5 — Flag interaction

- [x] `PREMIUM_FEATURES_FREE=true` → Growth/Pro free in USD, EUR, and INR (live API + unit tests)
- [x] Flag false → regional paid amounts restore (`resolvePlanPrice(..., false)` unit tests)

## V6 — Regression

- [x] Engagement multi-currency unchanged (separate modules; no edits to agreement FX path in this feature)
- [x] `pnpm --filter @workspace/api-server run typecheck` clean
- [x] `pnpm --filter @workspace/talentlock run typecheck` clean

## V7 — Docs

- [x] `project.md` Subscription Plans lists USD / EUR / INR; feature 49 ✅ Complete
- [x] `spec/spec.md` indexes this feature as ✅ Complete

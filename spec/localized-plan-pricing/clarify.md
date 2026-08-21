# TalentLock — Clarification & Verification: Localized Plan Pricing

---

## Verified — Consistent with Existing Architecture

| Item | Verified Against |
|------|------------------|
| `users.currencyCode` derived from country | `spec/multi-currency-location/`, `PATCH /api/users/me/location` |
| Country → currency includes `IN→INR`, `DE→EUR`, `US→USD` | `artifacts/api-server/src/lib/countryData.ts` |
| Plans defined as USD-only `priceMonthly` | `artifacts/api-server/src/lib/plans.ts` |
| Pricing UI hardcodes `$` | `artifacts/talentlock/src/pages/Pricing.tsx` |
| FX cache exists for engagement dual-display | `exchange_rate_cache`, `GET /api/exchange-rates` |
| Stripe / paid checkout deferred | `project.md` Subscription Plans |
| `PREMIUM_FEATURES_FREE` zeros Growth/Pro display | `plans.ts`, `planAccess.ts` |
| No `localStorage` in React components | workspace rules — use `sessionStorage` for visitor currency override |

---

## Open Questions — Resolved in `plan.md`

### Q1 — Live FX vs fixed regional prices

**Question:** Should `/pricing` convert `$49` via `exchange_rate_cache` into INR each day?

**Recommendation:** **No.** Use a **fixed regional price book** (USD / EUR / INR). Live FX would make subscription marketing prices jitter and confuse future Stripe Price IDs.

---

### Q2 — GBP / AUD / other countries

**Question:** UK user has `currencyCode: GBP`. Show £ prices?

**Recommendation:** Phase 1 **bucket to USD** book. Expand GBP (and others) only in a later price-book phase. Document clearly in UI footnote when showing USD to a non-USD engagement-currency user.

---

### Q3 — Who picks the Pricing currency?

**Question:** Can users manually pick INR while their account is US?

**Recommendation:** Logged-in → default from account bucket. Optional **session** override on `/pricing` for comparison. Override does **not** change `users.currencyCode`. Logged-out → USD default + switcher.

---

### Q4 — Exact INR / EUR amounts

**Question:** What are the commercial numbers?

**Recommendation:** Lock Phase 1 table in `features.md` Module 2 (Starter USD 49 / EUR 49 / INR 4099; Growth 199 / 199 / 16499; Pro 19 / 19 / 1499). Product may edit the constants file later without schema migration.

---

### Q5 — Stripe mapping

**Question:** Do we create Stripe products now?

**Recommendation:** **No** — out of scope. Spec reserves `(planId, displayCurrency)` → future `stripePriceId` column or config map.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Hardcoded `$` outside Pricing | Task audit of `priceMonthly` / `$` plan CTAs |
| PREMIUM_FEATURES_FREE masks regional prices | Same flag behaviour in all currencies; validation covers flag on/off |
| Confusing engagement INR rate vs plan INR price | Distinct copy; plan footnote on `/pricing` only |
| Drift between frontend and backend tables | Single source of truth on **server** (`plans.ts` or `planPrices.ts`); UI consumes API |

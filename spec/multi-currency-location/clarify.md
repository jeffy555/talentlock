# TalentLock — Clarification & Verification: Multi-Currency & Location

---

## Verified — Consistent with Existing Architecture

| Item | Verified Against |
|------|------------------|
| `formatRate(amount, rateType, currencySymbol)` exists with `$` default | `artifacts/talentlock/src/lib/rateFormatUtils.ts` |
| ~15+ call sites pass `'$'` or omit third arg | `FreelancersList`, `BookingDetail`, `FreelancerDetail`, `AiMatch`, `PublicProfile`, `WatchlistSummaryCard`, … |
| Agreement generation hardcodes `USD ${booking.rate}` | `artifacts/api-server/src/routes/agreements.ts` ~line 245 |
| `freelancer_profiles.location` exists as free-text nullable | `lib/db/src/schema/freelancerProfiles.ts` |
| `teachingLicenceState` exists for education professionals | same schema — state concept already in product |
| Onboarding has step machine: `role` → `profession_category` → `freelancer_details` / `employer_details` | `Onboarding.tsx`, `PATCH /users/me/onboarding-step` |
| `users.onboardingRole` / `onboardingStep` persistence | `lib/db/src/schema/users.ts` |
| Talent Vault filters: field, rate range, availability, verified, `professionCategory` | `GET /api/freelancers`, `FreelancersList.tsx` |
| `getMarketMedian()` filters by `fieldOfWork` only — no currency | `rateSuggestionUtils.ts` |
| Earnings/spend dashboards use separate `earningsFormat.ts` with hardcoded `$` | `RateBenchmarkCard.tsx` (earnings + spend) |
| Meeting brief `rateContext` uses `getMarketMedian` | `meetingBriefGenerator.ts` |
| Bookings store numeric `rate` only — no currency column | `lib/db/src/schema/bookings.ts` |
| Completeness score does not include country | `completenessUtils.ts` |
| OpenAPI → Orval codegen workflow | `project.md` |
| Existing users unaffected by column defaults `US` / `USD` | Drizzle `DEFAULT` on new columns |

---

## Open Questions

### Q1 — Onboarding step placement

**Question:** Where does the Country & Region step sit in the existing onboarding flow?

**Impact:** Affects `onboardingStep` enum, `Onboarding.tsx` state machine, and `PATCH /onboarding-step` values.

**Recommendation:** Insert **after** `profession_category` (freelancers) or **after** `role` (employers), **before** `freelancer_details` / `employer_details`. New API step value: `location`.

---

### Q2 — Can users change country after onboarding?

**Question:** Is country editable on `/profile` post-onboarding?

**Impact:** If yes, freelancer `currencyCode` could change — but existing bookings must stay frozen.

**Recommendation:** Allow country change on profile with confirmation modal: *"Changing country updates your display currency. Existing bookings keep their original currency."* Sync denormalised `freelancer_profiles.countryCode` / `currencyCode` on save. Do **not** retroactively update `bookings.currencyCode`.

---

### Q3 — `freelancer_profiles.location` text field

**Question:** The existing free-text `location` field (e.g. "Mumbai, India") overlaps with structured `countryCode`. Keep both?

**Impact:** Talent Vault card subtitle currently may use `location` text.

**Recommendation:** Keep `location` as optional display text (city-level). Auto-populate a default from country name on onboarding if empty. Vault card shows `location` if set, else `countryName(countryCode)`.

---

### Q4 — State codes for Phase 1 countries

**Question:** Use full ISO 3166-2 subdivisions or curated short lists?

**Impact:** `GET /api/countries` payload size and UX complexity.

**Recommendation:** Curated static lists per country in `countryData.ts` (~5–15 states each for Phase 1). Store as short codes (`MH`, `ENG`, `BY`). `stateCode` nullable — required in UI for IN/US/CA/AU; optional for smaller countries.

---

### Q5 — Exchange rate cache key and TTL

**Question:** What is the `exchange_rate_cache.id` format?

**Impact:** Cache invalidation logic.

**Recommendation:** `id = YYYY-MM-DD` (UTC date). One row per day. Upsert on first fetch. `GET /api/exchange-rates` returns today's row or triggers fetch.

---

### Q6 — `exchangeRateAtCreation` jsonb shape

**Question:** What exactly is stored on the booking for historical analytics?

**Impact:** Spend analytics conversion accuracy.

**Recommendation:**

```ts
interface ExchangeRateSnapshot {
  baseCurrency: "USD";
  rates: Record<string, number>;  // full snapshot from cache
  fetchedAt: string;              // ISO timestamp
  source: "api" | "cache" | "fallback";
}
```

Employer spend conversion: `amountInBookingCurrency * (rates[employerCurrency] / rates[bookingCurrency])` using USD as pivot.

---

### Q7 — Booking creation currency source

**Question:** Which row is authoritative for booking currency — freelancer profile or user?

**Impact:** Race if profile denorm drifts from users.

**Recommendation:** At `POST /api/bookings`, read `currencyCode` from `freelancer_profiles.currencyCode` (denormalised). Reject if null (should not happen with defaults). Snapshot `exchangeRateAtCreation` from current cache in same transaction.

---

### Q8 — Negotiation PATCH currency

**Question:** Does `PATCH /bookings/:id` negotiation validate rate is still in booking currency?

**Impact:** No schema change needed — numeric rate stays in booking currency. UI must not show employer currency as editable rate.

**Recommendation:** UI-only enforcement in Phase 1. API returns `currencyCode` on booking responses; clients display with correct symbol. No server-side currency conversion on write paths.

---

### Q9 — Earnings vs spend formatter unification

**Question:** `earningsFormat.ts` duplicates `formatRate` with hardcoded `$`. Merge or extend?

**Impact:** Two formatter modules to update.

**Recommendation:** Add `formatCurrencyAmount(amount, currencyCode)` to shared `currencyUtils.ts`. Update `earningsFormat.ts` to delegate. Keep `earningsFormat.ts` as thin wrappers for dashboard components.

---

### Q10 — Job post budgets

**Question:** Are job `budget` fields in employer currency?

**Impact:** Out of scope for booking flow but affects employer UX consistency.

**Recommendation:** Document as non-goal for Phase 1. Job budgets remain numeric without currency column; displayed in employer's `currencyCode` on job forms only (future addendum).

---

### Q11 — Meeting brief rate context

**Question:** Should meeting brief show dual currency?

**Impact:** `MeetingBriefCard` rate context section.

**Recommendation:** Phase 1 minimum — brief shows freelancer rate in **freelancer currency**. Add employer indicative conversion in brief rate context card if employer `currencyCode` differs (same dual-display component as Vault). Not a blocker for launch.

---

### Q12 — Backfill for existing bookings

**Question:** What defaults for historical bookings?

**Recommendation:** `currencyCode = 'USD'`, `exchangeRateAtCreation = null`. Spend analytics for pre-migration bookings show USD amounts without conversion footnote.

---

## Risks & Notes

### Risk 1 — Agreement prompt regression

Hardcoded `USD` appears in `rateDisplay` template string. Missing this update ships legally incorrect contracts for non-USD bookings.

### Risk 2 — Denormalisation drift

`freelancer_profiles.currencyCode` must stay in sync with `users.currencyCode`. Every profile update path must call `syncFreelancerCurrencyFromUser()` or derive in a transaction.

### Risk 3 — FX API availability

open.er-api.com outage must not block booking creation. Fallback rates + "estimated" label only affects display conversions, not stored booking amounts.

### Risk 4 — Call site sweep scope

`formatRate` is used in 15+ files. Missing one call site leaves `$` on a non-USD profile. Task.md must include exhaustive grep checklist.

### Risk 5 — OpenAPI surface area

`currencyCode` must appear on `User`, `FreelancerProfile`, `Booking`, and list query params. Codegen + typecheck gate before frontend work.

### Risk 6 — `freelancer_profiles.location` vs `countryCode` filter

Country filter uses structured code; legacy profiles with only text `location` won't match until user completes location step or backfill sets `countryCode = 'US'`.

---

## Summary of Blockers

| # | Blocker | Gates |
|---|---------|-------|
| Q1 | Onboarding step placement | Phase 3 onboarding UI |
| Q4 | State list curation | `GET /api/countries` |
| Q6 | Exchange snapshot shape | Phase 1 schema + spend analytics |
| Q7 | Booking currency source | Phase 2 booking create |

All blockers have recommendations above — resolve in `plan.md` before `task.md` execution.

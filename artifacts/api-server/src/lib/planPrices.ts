/**
 * Localized subscription price book (USD / EUR / INR).
 *
 * Consumed by GET /api/subscriptions/plans?currency=USD|EUR|INR
 * OpenAPI schema: PlanDef (priceMonthly = amount in displayCurrency).
 *
 * Engagement freelancer rates use multi-currency-location — not this module.
 * Do not convert plan prices via exchange_rate_cache.
 */
import type { PlanId } from "./plans";

export type PlanDisplayCurrency = "USD" | "EUR" | "INR";

export const PLAN_DISPLAY_CURRENCIES: PlanDisplayCurrency[] = ["USD", "EUR", "INR"];

export const PLAN_CURRENCY_SYMBOLS: Record<PlanDisplayCurrency, string> = {
  USD: "$",
  EUR: "€",
  INR: "₹",
};

/** Fixed regional list prices (major units). Enterprise is Custom (null). */
export const PLAN_PRICE_MONTHLY: Record<
  Exclude<PlanId, "free" | "employer_enterprise">,
  Record<PlanDisplayCurrency, number>
> = {
  freelancer_free: { USD: 0, EUR: 0, INR: 0 },
  freelancer_pro: { USD: 19, EUR: 19, INR: 1499 },
  employer_starter: { USD: 49, EUR: 49, INR: 4099 },
  employer_growth: { USD: 199, EUR: 199, INR: 16499 },
};

export function isPlanDisplayCurrency(value: string): value is PlanDisplayCurrency {
  return (PLAN_DISPLAY_CURRENCIES as string[]).includes(value);
}

/** Map account currencyCode → Phase 1 plan price book. */
export function planDisplayCurrency(
  userCurrencyCode: string | null | undefined,
): PlanDisplayCurrency {
  if (userCurrencyCode === "INR") return "INR";
  if (userCurrencyCode === "EUR") return "EUR";
  return "USD";
}

export function currencySymbolForPlan(currency: PlanDisplayCurrency): string {
  return PLAN_CURRENCY_SYMBOLS[currency];
}

/**
 * Resolve list price for a plan in a display currency.
 * Returns null for enterprise (Custom). Applies PREMIUM_FEATURES_FREE zeros for Growth/Pro.
 */
export function resolvePlanPrice(
  planId: PlanId,
  currency: PlanDisplayCurrency,
  premiumFeaturesFree: boolean,
): number | null {
  if (planId === "employer_enterprise") return null;
  if (planId === "free") return 0;

  const book = PLAN_PRICE_MONTHLY[planId as Exclude<PlanId, "free" | "employer_enterprise">];
  if (!book) return 0;

  if (
    premiumFeaturesFree &&
    (planId === "freelancer_pro" || planId === "employer_growth")
  ) {
    return 0;
  }

  return book[currency];
}

import { currencySymbol, CURRENCY_NAMES } from "./currencyUtils";

export type PlanDisplayCurrency = "USD" | "EUR" | "INR";

export const PLAN_DISPLAY_CURRENCIES: PlanDisplayCurrency[] = ["USD", "EUR", "INR"];

export const PRICING_CURRENCY_STORAGE_KEY = "tl_pricing_currency";

/** Map account currencyCode → Phase 1 plan price book (mirrors api-server planPrices). */
export function planDisplayCurrency(
  userCurrencyCode: string | null | undefined,
): PlanDisplayCurrency {
  if (userCurrencyCode === "INR") return "INR";
  if (userCurrencyCode === "EUR") return "EUR";
  return "USD";
}

export function isPlanDisplayCurrency(value: string): value is PlanDisplayCurrency {
  return (PLAN_DISPLAY_CURRENCIES as string[]).includes(value);
}

export function readStoredPricingCurrency(): PlanDisplayCurrency | null {
  try {
    const raw = sessionStorage.getItem(PRICING_CURRENCY_STORAGE_KEY);
    if (raw && isPlanDisplayCurrency(raw)) return raw;
  } catch {
    /* sessionStorage unavailable */
  }
  return null;
}

export function storePricingCurrency(currency: PlanDisplayCurrency): void {
  try {
    sessionStorage.setItem(PRICING_CURRENCY_STORAGE_KEY, currency);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Format a subscription list price.
 * null → "Custom" (enterprise). Uses en-IN grouping for INR (₹4,099).
 */
export function formatPlanPrice(
  amount: number | null | undefined,
  currency: PlanDisplayCurrency,
): string {
  if (amount == null) return "Custom";
  const symbol = currencySymbol(currency);
  const formatted = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${symbol}${formatted}`;
}

/** Visually hidden label for screen readers, e.g. "49 US dollars per month". */
export function formatPlanPriceSrLabel(
  amount: number | null | undefined,
  currency: PlanDisplayCurrency,
): string {
  if (amount == null) return "Custom pricing";
  const name = CURRENCY_NAMES[currency] ?? currency;
  const formatted = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${formatted} ${name}s per month`;
}

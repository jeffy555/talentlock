import { describe, expect, it } from "vitest";
import {
  PLAN_PRICE_MONTHLY,
  currencySymbolForPlan,
  isPlanDisplayCurrency,
  planDisplayCurrency,
  resolvePlanPrice,
} from "../../src/lib/planPrices";

describe("planPrices", () => {
  it("maps account currency to Phase 1 price books", () => {
    expect(planDisplayCurrency("INR")).toBe("INR");
    expect(planDisplayCurrency("EUR")).toBe("EUR");
    expect(planDisplayCurrency("USD")).toBe("USD");
    expect(planDisplayCurrency("GBP")).toBe("USD");
    expect(planDisplayCurrency(null)).toBe("USD");
    expect(planDisplayCurrency(undefined)).toBe("USD");
  });

  it("validates display currency query values", () => {
    expect(isPlanDisplayCurrency("USD")).toBe(true);
    expect(isPlanDisplayCurrency("EUR")).toBe(true);
    expect(isPlanDisplayCurrency("INR")).toBe(true);
    expect(isPlanDisplayCurrency("GBP")).toBe(false);
  });

  it("matches features.md Module 2 amounts", () => {
    expect(PLAN_PRICE_MONTHLY.employer_starter).toEqual({ USD: 49, EUR: 49, INR: 4099 });
    expect(PLAN_PRICE_MONTHLY.employer_growth).toEqual({ USD: 199, EUR: 199, INR: 16499 });
    expect(PLAN_PRICE_MONTHLY.freelancer_pro).toEqual({ USD: 19, EUR: 19, INR: 1499 });
  });

  it("returns currency symbols", () => {
    expect(currencySymbolForPlan("USD")).toBe("$");
    expect(currencySymbolForPlan("EUR")).toBe("€");
    expect(currencySymbolForPlan("INR")).toBe("₹");
  });

  it("resolves localized prices and null for enterprise", () => {
    expect(resolvePlanPrice("employer_starter", "INR", false)).toBe(4099);
    expect(resolvePlanPrice("employer_starter", "EUR", false)).toBe(49);
    expect(resolvePlanPrice("employer_enterprise", "USD", false)).toBeNull();
    expect(resolvePlanPrice("freelancer_free", "INR", false)).toBe(0);
  });

  it("zeros Growth/Pro when premium features are free", () => {
    expect(resolvePlanPrice("freelancer_pro", "INR", true)).toBe(0);
    expect(resolvePlanPrice("employer_growth", "EUR", true)).toBe(0);
    expect(resolvePlanPrice("employer_starter", "INR", true)).toBe(4099);
    expect(resolvePlanPrice("freelancer_pro", "USD", false)).toBe(19);
  });
});

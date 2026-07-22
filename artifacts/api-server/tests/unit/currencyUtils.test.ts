import { describe, expect, it } from "vitest";
import {
  deriveCurrency,
  convertAmount,
  currencySymbol,
  buildRateDisplay,
} from "../../src/lib/countryData";

describe("countryData currency utils", () => {
  it("deriveCurrency returns correct code for all 10 supported countries", () => {
    expect(deriveCurrency("US")).toBe("USD");
    expect(deriveCurrency("GB")).toBe("GBP");
    expect(deriveCurrency("IN")).toBe("INR");
    expect(deriveCurrency("DE")).toBe("EUR");
    expect(deriveCurrency("AU")).toBe("AUD");
    expect(deriveCurrency("CA")).toBe("CAD");
    expect(deriveCurrency("AE")).toBe("AED");
    expect(deriveCurrency("SG")).toBe("SGD");
    expect(deriveCurrency("NG")).toBe("NGN");
    expect(deriveCurrency("ZA")).toBe("ZAR");
  });

  it("convertAmount pivots through USD base rates", () => {
    const rates = { USD: 1, EUR: 0.5, INR: 83 };
    expect(convertAmount(100, "USD", "EUR", rates)).toBe(50);
    expect(convertAmount(8300, "INR", "USD", rates)).toBeCloseTo(100, 5);
    expect(convertAmount(100, "USD", "USD", rates)).toBe(100);
    expect(convertAmount(100, "USD", "XXX", rates)).toBeNull();
  });

  it("currencySymbol and buildRateDisplay use ISO codes", () => {
    expect(currencySymbol("INR")).toBe("₹");
    expect(currencySymbol("GBP")).toBe("£");
    expect(
      buildRateDisplay({
        rate: "800",
        paymentType: "daily",
        currencyCode: "INR",
      }),
    ).toContain("₹800");
  });
});

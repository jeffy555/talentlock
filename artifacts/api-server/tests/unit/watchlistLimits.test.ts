import { describe, expect, it } from "vitest";
import { WATCHLIST_LIMITS, watchlistLimitForPlan } from "../../src/lib/watchlistLimits";

describe("watchlistLimits", () => {
  it("defines starter and growth limits", () => {
    expect(WATCHLIST_LIMITS.employer_starter).toBe(25);
    expect(WATCHLIST_LIMITS.employer_growth).toBe(100);
  });

  it("returns limit for known plans", () => {
    expect(watchlistLimitForPlan("employer_starter")).toBe(25);
    expect(watchlistLimitForPlan("employer_growth")).toBe(100);
  });

  it("returns null for enterprise and unknown plans", () => {
    expect(watchlistLimitForPlan("employer_enterprise")).toBeNull();
    expect(watchlistLimitForPlan("free")).toBeNull();
  });
});

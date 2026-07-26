import { describe, expect, it } from "vitest";
import {
  PLANS,
  getPlan,
  hasEmployerGrowthFeatures,
  hasEmployerEnterpriseFeatures,
  hasFreelancerProFeatures,
  PREMIUM_FEATURES_FREE,
} from "../../src/lib/plans";

describe("plans", () => {
  it("defines all subscription tiers from project.md", () => {
    const ids = [
      "freelancer_free",
      "freelancer_pro",
      "employer_starter",
      "employer_growth",
      "employer_enterprise",
    ] as const;
    for (const id of ids) {
      expect(PLANS[id]).toBeDefined();
      expect(PLANS[id].id).toBe(id);
    }
  });

  it("employer_starter has token quota", () => {
    expect(getPlan("employer_starter").limits.monthlyTokenLimit).toBeGreaterThan(0);
  });

  it("freelancer plans have no token quota", () => {
    expect(getPlan("freelancer_free").limits.monthlyTokenLimit).toBeNull();
    expect(getPlan("freelancer_pro").limits.monthlyTokenLimit).toBeNull();
  });

  it("lists Growth and Pro at $0 while premium features are free", () => {
    expect(PLANS.employer_growth.priceMonthly).toBe(0);
    expect(PLANS.freelancer_pro.priceMonthly).toBe(0);
  });

  it("opens Growth/Pro/Enterprise feature gates while PREMIUM_FEATURES_FREE is on", () => {
    expect(PREMIUM_FEATURES_FREE).toBe(true);
    expect(hasEmployerGrowthFeatures("employer_starter")).toBe(true);
    expect(hasEmployerGrowthFeatures("free")).toBe(true);
    expect(hasEmployerEnterpriseFeatures("employer_starter")).toBe(true);
    expect(hasFreelancerProFeatures("freelancer_free")).toBe(true);
  });
});

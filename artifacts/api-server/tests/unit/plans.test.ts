import { describe, expect, it } from "vitest";
import { PLANS, getPlan } from "../../src/lib/plans";

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
});

import { describe, expect, it } from "vitest";
import {
  aggregateTokenUsageRows,
  getUtcTokenResetDate,
} from "../../src/lib/subscriptionGating";
import { TOKEN_FEATURES } from "../../src/lib/tokenLogger";

describe("aggregateTokenUsageRows", () => {
  it("sums tokens and fills breakdown keys", () => {
    const { tokensUsed, breakdown } = aggregateTokenUsageRows([
      { feature: "ai_match", totalTokens: 100 },
      { feature: "job_description_assistant", totalTokens: 50 },
    ]);
    expect(tokensUsed).toBe(150);
    expect(breakdown.ai_match).toBe(100);
    expect(breakdown.job_description_assistant).toBe(50);
    for (const f of TOKEN_FEATURES) {
      expect(typeof breakdown[f]).toBe("number");
    }
  });

  it("ignores unknown feature keys", () => {
    const { tokensUsed, breakdown } = aggregateTokenUsageRows([
      { feature: "unknown_feature", totalTokens: 999 },
    ]);
    expect(tokensUsed).toBe(999);
    expect(breakdown.ai_match).toBe(0);
  });
});

describe("getUtcTokenResetDate", () => {
  it("returns first day of next UTC month", () => {
    const reset = getUtcTokenResetDate(new Date("2026-06-15T12:00:00Z"));
    expect(reset.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("rolls year in December", () => {
    const reset = getUtcTokenResetDate(new Date("2026-12-01T00:00:00Z"));
    expect(reset.getUTCFullYear()).toBe(2027);
    expect(reset.getUTCMonth()).toBe(0);
  });
});

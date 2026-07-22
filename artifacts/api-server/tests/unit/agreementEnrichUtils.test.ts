import { describe, expect, it } from "vitest";
import { buildEnrichPrompt } from "../../src/lib/agreementEnrichUtils";

describe("agreementEnrichUtils", () => {
  it("buildEnrichPrompt includes booking dates and rate", () => {
    const { user } = buildEnrichPrompt({
      originalContent: "Original agreement body.",
      amendments: [{ id: "1", text: "Add confidentiality clause.", addedAt: "2026-01-01T00:00:00Z" }],
      startDate: "2026-08-01",
      endDate: "2026-10-31",
      rateDisplay: "₹800/day",
      currencyCode: "INR",
      currencyName: "Indian Rupee",
      freelancerName: "Priya",
      employerName: "Acme Corp",
      truncated: false,
    });

    expect(user).toContain("2026-08-01");
    expect(user).toContain("2026-10-31");
    expect(user).toContain("₹800/day");
    expect(user).toContain("Add confidentiality clause.");
    expect(user).toContain("Original agreement body.");
  });
});

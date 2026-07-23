import { describe, expect, it } from "vitest";
import {
  buildEmployerSummaryPrompt,
  validateEmployerSummaryResponse,
} from "../../src/lib/employerAgreementSummaryUtils";

describe("employerAgreementSummaryUtils", () => {
  it("buildEmployerSummaryPrompt includes contract text", () => {
    const prompt = buildEmployerSummaryPrompt("Sample contract clause.", false);
    expect(prompt).toContain("Sample contract clause.");
    expect(prompt).toContain("scopeAndDeliverables");
  });

  it("buildEmployerSummaryPrompt notes truncation", () => {
    const prompt = buildEmployerSummaryPrompt("x".repeat(100), true);
    expect(prompt).toContain("truncated");
  });

  it("validateEmployerSummaryResponse accepts valid shape", () => {
    const valid = {
      sections: {
        scopeAndDeliverables: { title: "Scope", content: "Do work." },
        paymentTerms: { title: "Pay", content: "Monthly." },
        ipAndOwnership: { title: "IP", content: "Client owns." },
        termination: { title: "End", content: "Notice." },
        restrictions: { title: "Restrictions", content: "None." },
        keyDates: { title: "Dates", content: "Start soon." },
      },
      attentionFlags: { exists: false, items: [] },
    };
    expect(validateEmployerSummaryResponse(valid)).toBe(true);
  });

  it("validateEmployerSummaryResponse rejects invalid shape", () => {
    expect(validateEmployerSummaryResponse(null)).toBe(false);
    expect(validateEmployerSummaryResponse({ sections: {} })).toBe(false);
  });
});

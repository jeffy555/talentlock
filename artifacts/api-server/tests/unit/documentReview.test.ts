import { describe, expect, it } from "vitest";

import { buildDocumentReviewUserPrompt } from "../../src/lib/documentReviewPrompts";

describe("buildDocumentReviewUserPrompt", () => {
  it("returns non-empty healthcare prompt for mbbs_degree", () => {
    const prompt = buildDocumentReviewUserPrompt("mbbs_degree");
    expect(prompt.length).toBeGreaterThan(20);
    expect(prompt).toContain("mbbs_degree");
    expect(prompt.toLowerCase()).toContain("mbbs");
  });

  it("returns non-empty legal-finance prompt for bar_enrolment_certificate", () => {
    const prompt = buildDocumentReviewUserPrompt("bar_enrolment_certificate");
    expect(prompt.length).toBeGreaterThan(20);
    expect(prompt).toContain("bar_enrolment_certificate");
    expect(prompt.toLowerCase()).toContain("bar");
  });

  it("returns shared experience_certificate prompt", () => {
    const prompt = buildDocumentReviewUserPrompt("experience_certificate");
    expect(prompt).toContain("experience_certificate");
    expect(prompt.toLowerCase()).toContain("letterhead");
  });
});

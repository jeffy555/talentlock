import { describe, expect, it } from "vitest";
import {
  AGREEMENT_SUMMARY_DISCLAIMER,
  SECTION_ICONS,
  SECTION_ORDER,
} from "@/lib/agreementSummaryUtils";

describe("agreementSummaryUtils", () => {
  it("SECTION_ORDER has six sections", () => {
    expect(SECTION_ORDER).toEqual([
      "whatYouDo",
      "howYouGetPaid",
      "whoOwnsTheWork",
      "howItCanEnd",
      "restrictions",
      "keyDates",
    ]);
  });

  it("every section has an icon", () => {
    for (const key of SECTION_ORDER) {
      expect(SECTION_ICONS[key]).toBeTruthy();
    }
  });

  it("disclaimer warns not legal advice", () => {
    expect(AGREEMENT_SUMMARY_DISCLAIMER).toMatch(/not legal advice/i);
  });
});

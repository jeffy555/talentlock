import { describe, expect, it } from "vitest";
import { isSameProfessionDomain, normalizeProfessionCategory } from "../../src/lib/professionDomain";

describe("isSameProfessionDomain", () => {
  it("matches the same vertical", () => {
    expect(isSameProfessionDomain("healthcare", "healthcare")).toBe(true);
    expect(isSameProfessionDomain("technology", "technology")).toBe(true);
    expect(isSameProfessionDomain("legal_finance", "legal_finance")).toBe(true);
  });

  it("rejects a different vertical", () => {
    expect(isSameProfessionDomain("healthcare", "technology")).toBe(false);
    expect(isSameProfessionDomain("education", "legal_finance")).toBe(false);
  });

  it("treats missing category as technology (legacy backfill)", () => {
    expect(normalizeProfessionCategory(null)).toBe("technology");
    expect(isSameProfessionDomain(null, "technology")).toBe(true);
    expect(isSameProfessionDomain(undefined, "healthcare")).toBe(false);
  });
});

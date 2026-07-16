import { describe, expect, it } from "vitest";
import { buildProfessionContext } from "../../src/lib/professionContext";

describe("buildProfessionContext", () => {
  it("returns empty string for technology jobs (byte-identical prompt regression)", () => {
    expect(buildProfessionContext({ professionCategory: "technology" })).toBe("");
  });

  it("returns non-empty context for education jobs", () => {
    const ctx = buildProfessionContext({ professionCategory: "education" });
    expect(ctx.length).toBeGreaterThan(0);
    expect(ctx).toContain("education");
  });
});

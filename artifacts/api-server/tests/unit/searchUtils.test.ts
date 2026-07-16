import { describe, expect, it } from "vitest";
import { sanitiseSearchQuery } from "../../src/lib/searchUtils";

describe("sanitiseSearchQuery", () => {
  it("returns null for empty or too-short tokens", () => {
    expect(sanitiseSearchQuery("")).toBeNull();
    expect(sanitiseSearchQuery("a")).toBeNull();
  });

  it("strips special characters", () => {
    expect(sanitiseSearchQuery("react<script>")).toBe("reactscript");
  });

  it("joins terms with tsquery AND operator", () => {
    expect(sanitiseSearchQuery("react typescript")).toBe("react & typescript");
  });

  it("limits to 10 terms", () => {
    const q = "one two three four five six seven eight nine ten eleven";
    const result = sanitiseSearchQuery(q)!;
    expect(result.split(" & ").length).toBeLessThanOrEqual(10);
  });
});

import { describe, expect, it } from "vitest";
import {
  DIMENSION_ORDER,
  getHealthGrade,
  verdictColour,
} from "@/lib/contractHealthUtils";

describe("contractHealthUtils", () => {
  it("maps score boundaries to grades A–F", () => {
    expect(getHealthGrade(95).grade).toBe("A");
    expect(getHealthGrade(90).grade).toBe("A");
    expect(getHealthGrade(89).grade).toBe("B");
    expect(getHealthGrade(75).grade).toBe("B");
    expect(getHealthGrade(60).grade).toBe("C");
    expect(getHealthGrade(45).grade).toBe("D");
    expect(getHealthGrade(44).grade).toBe("F");
  });

  it("defines five dimension keys in order", () => {
    expect(DIMENSION_ORDER).toHaveLength(5);
    expect(DIMENSION_ORDER[0]).toBe("clarity");
  });

  it("verdictColour returns tailwind class per verdict", () => {
    expect(verdictColour("Strong")).toContain("emerald");
    expect(verdictColour("Weak")).toContain("red");
  });
});

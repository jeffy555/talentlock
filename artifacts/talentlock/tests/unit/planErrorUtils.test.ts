import { describe, expect, it } from "vitest";
import {
  isPlanLimitError,
  isTokenLimitError,
  planErrorAction,
} from "@/lib/planErrorUtils";

describe("planErrorUtils", () => {
  it("TOKEN_LIMIT shows inline error (no pricing redirect)", () => {
    expect(planErrorAction(402, "TOKEN_LIMIT")).toBe("inline");
    expect(isTokenLimitError(402, "TOKEN_LIMIT")).toBe(true);
    expect(isPlanLimitError(402, "TOKEN_LIMIT")).toBe(false);
  });

  it("PLAN_LIMIT redirects to pricing", () => {
    expect(planErrorAction(402, "PLAN_LIMIT")).toBe("redirect");
    expect(isPlanLimitError(402, "PLAN_LIMIT")).toBe(true);
  });

  it("non-402 returns none", () => {
    expect(planErrorAction(403, "PLAN_LIMIT")).toBe("none");
  });
});

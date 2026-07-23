import { describe, expect, it, vi } from "vitest";
import { getMarketMedian } from "../../src/lib/rateSuggestionUtils";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

const db = {
  select: mockSelect,
} as any;

function chainWhere(rows: unknown[]) {
  mockWhere.mockResolvedValue(rows);
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
}

describe("rateSuggestionUtils", () => {
  it("getMarketMedian filters by currencyCode when provided", async () => {
    chainWhere([
      { rate: "800" },
      { rate: "900" },
      { rate: "1000" },
    ]);

    const median = await getMarketMedian(db, "Software Development", "hourly", "INR");
    expect(median).toBe(900);
    expect(mockWhere).toHaveBeenCalledOnce();
  });

  it("getMarketMedian returns null when fewer than 3 rates", async () => {
    chainWhere([{ rate: "800" }, { rate: "900" }]);
    const median = await getMarketMedian(db, "Software Development", "hourly", "INR");
    expect(median).toBeNull();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { FALLBACK_RATES, fetchRatesFromApi, getOrFetchExchangeRates } from "../../src/lib/exchangeRateService";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();

const db = {
  select: mockSelect,
  insert: mockInsert,
} as any;

function chainLimit(result: unknown[]) {
  mockLimit.mockResolvedValue(result);
  mockWhere.mockReturnValue({ limit: mockLimit });
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
}

describe("exchangeRateService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSelect.mockReset();
    mockFrom.mockReset();
    mockWhere.mockReset();
    mockLimit.mockReset();
    mockInsert.mockReset();
    mockValues.mockReset();
    mockOnConflictDoUpdate.mockReset();
  });

  it("uses fallback rates when API fetch fails", async () => {
    chainLimit([]);
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network"));

    const snapshot = await getOrFetchExchangeRates(db, { warn: vi.fn() });
    expect(snapshot.source).toBe("fallback");
    expect(snapshot.rates.USD).toBe(FALLBACK_RATES.USD);
    expect(snapshot.rates.INR).toBe(FALLBACK_RATES.INR);
  });

  it("returns cache hit without refetching API", async () => {
    const cached = {
      id: new Date().toISOString().slice(0, 10),
      rates: { USD: 1, EUR: 0.91 },
      fetchedAt: new Date(),
      source: "api",
    };
    chainLimit([cached]);

    const fetchSpy = vi.spyOn(global, "fetch");
    const snapshot = await getOrFetchExchangeRates(db);
    expect(snapshot.source).toBe("cache");
    expect(snapshot.rates.EUR).toBe(0.91);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetchRatesFromApi throws on non-OK response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(fetchRatesFromApi()).rejects.toThrow("503");
  });
});

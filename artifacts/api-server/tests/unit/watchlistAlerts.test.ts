import { describe, expect, it } from "vitest";
import {
  ALERT_DEBOUNCE_MS,
  isWithinAlertDebounce,
  shouldNotifyAvailability,
  shouldNotifyRateChange,
} from "../../src/lib/watchlistAlerts";

describe("watchlistAlerts", () => {
  const base = {
    isAvailable: false,
    hourlyRate: "100",
    dailyRate: null,
    name: "Jane Cooper",
  };

  describe("shouldNotifyAvailability", () => {
    it("fires only on false → true", () => {
      expect(shouldNotifyAvailability(base, { ...base, isAvailable: true })).toBe(true);
      expect(shouldNotifyAvailability({ ...base, isAvailable: true }, base)).toBe(false);
      expect(shouldNotifyAvailability(base, base)).toBe(false);
    });
  });

  describe("shouldNotifyRateChange", () => {
    it("fires when rate is newly set", () => {
      expect(shouldNotifyRateChange(
        { ...base, hourlyRate: null },
        { ...base, hourlyRate: "100" },
      )).toBe(true);
    });

    it("fires at ≥ 5% relative change", () => {
      expect(shouldNotifyRateChange(base, { ...base, hourlyRate: "106" })).toBe(true);
      expect(shouldNotifyRateChange(base, { ...base, hourlyRate: "104" })).toBe(false);
    });

    it("checks dailyRate as well", () => {
      expect(shouldNotifyRateChange(
        { ...base, hourlyRate: null, dailyRate: "200" },
        { ...base, hourlyRate: null, dailyRate: "220" },
      )).toBe(true);
    });
  });

  describe("isWithinAlertDebounce", () => {
    it("returns true within 24 h window", () => {
      const recent = new Date(Date.now() - ALERT_DEBOUNCE_MS + 60_000);
      expect(isWithinAlertDebounce(recent)).toBe(true);
    });

    it("returns false after 24 h", () => {
      const old = new Date(Date.now() - ALERT_DEBOUNCE_MS - 1);
      expect(isWithinAlertDebounce(old)).toBe(false);
    });

    it("returns false when never alerted", () => {
      expect(isWithinAlertDebounce(null)).toBe(false);
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  alertCopyForStage,
  daysUntil,
  stageAdvanced,
  targetStageForDaysRemaining,
} from "../../src/lib/credentialExpiryUtils";

describe("credentialExpiryUtils", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  describe("daysUntil", () => {
    it("computes whole days remaining, rounding up", () => {
      expect(daysUntil(new Date("2026-01-08T00:00:00.000Z"), now)).toBe(7);
      expect(daysUntil(new Date("2026-01-08T01:00:00.000Z"), now)).toBe(8);
    });

    it("returns negative for past dates", () => {
      expect(daysUntil(new Date("2025-12-31T00:00:00.000Z"), now)).toBe(-1);
    });
  });

  describe("targetStageForDaysRemaining", () => {
    it("maps day thresholds to stages", () => {
      expect(targetStageForDaysRemaining(120)).toBe("none");
      expect(targetStageForDaysRemaining(90)).toBe("90d");
      expect(targetStageForDaysRemaining(45)).toBe("90d");
      expect(targetStageForDaysRemaining(30)).toBe("30d");
      expect(targetStageForDaysRemaining(15)).toBe("30d");
      expect(targetStageForDaysRemaining(7)).toBe("7d");
      expect(targetStageForDaysRemaining(1)).toBe("7d");
      expect(targetStageForDaysRemaining(0)).toBe("expired");
      expect(targetStageForDaysRemaining(-5)).toBe("expired");
    });
  });

  describe("stageAdvanced", () => {
    it("advances forward only", () => {
      expect(stageAdvanced("none", "90d")).toBe(true);
      expect(stageAdvanced("90d", "30d")).toBe(true);
      expect(stageAdvanced("30d", "30d")).toBe(false);
      expect(stageAdvanced("7d", "30d")).toBe(false);
      expect(stageAdvanced("expired", "7d")).toBe(false);
    });

    it("treats null/invalid current stage as none", () => {
      expect(stageAdvanced(null, "90d")).toBe(true);
      expect(stageAdvanced("garbage", "90d")).toBe(true);
    });

    it("allows skipping stages when a day was missed", () => {
      expect(stageAdvanced("none", "7d")).toBe(true);
      expect(stageAdvanced("none", "expired")).toBe(true);
    });
  });

  describe("alertCopyForStage", () => {
    it("returns null for none", () => {
      expect(alertCopyForStage("none", "Your credential", 120)).toBeNull();
    });

    it("returns email-only copy for 90d", () => {
      const copy = alertCopyForStage("90d", "Your credential", 88);
      expect(copy).not.toBeNull();
      expect(copy!.email).toBe(true);
      expect(copy!.inApp).toBe(false);
    });

    it("returns email + in-app copy for 30d and 7d", () => {
      expect(alertCopyForStage("30d", "Your credential", 25)?.inApp).toBe(true);
      expect(alertCopyForStage("7d", "Your credential", 3)?.inApp).toBe(true);
    });

    it("returns expired copy", () => {
      const copy = alertCopyForStage("expired", "Your credential", -2);
      expect(copy?.message).toMatch(/expired/i);
    });
  });
});

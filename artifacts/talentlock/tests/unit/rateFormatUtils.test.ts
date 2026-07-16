import { describe, expect, it } from "vitest";
import {
  formatRate,
  paymentTypeToRateType,
  profileDefaultRateType,
  rateUnitLabel,
} from "@/lib/rateFormatUtils";

describe("rateFormatUtils", () => {
  it("formatRate uses correct unit for each rateType", () => {
    expect(formatRate(100, "hourly")).toBe("$100/hr");
    expect(formatRate(500, "per_day")).toBe("$500/day");
    expect(formatRate(80, "per_session")).toBe("$80/session");
    expect(formatRate(1200, "per_course")).toBe("$1,200/course");
  });

  it("defaults to hourly when rateType is null", () => {
    expect(rateUnitLabel(null)).toBe("/hr");
  });

  it("profileDefaultRateType returns per_session for education", () => {
    expect(profileDefaultRateType("education")).toBe("per_session");
    expect(profileDefaultRateType("technology")).toBe("hourly");
  });

  it("paymentTypeToRateType maps daily payment to per_day", () => {
    expect(paymentTypeToRateType("daily")).toBe("per_day");
    expect(paymentTypeToRateType("hourly", "per_session")).toBe("per_session");
  });
});

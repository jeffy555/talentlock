import { describe, expect, it } from "vitest";
import {
  DEBRIEF_REGEN_COOLDOWN_MS,
  isWithinDebriefRegenCooldown,
  validateDebriefResponse,
} from "../../src/lib/bookingDebriefGenerator";

const validDebriefJson = JSON.stringify({
  employer: {
    engagementSnapshot: {
      freelancerName: "Jane Cooper",
      field: "Technology",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-04-01T00:00:00.000Z",
      rate: 95,
      rateType: "hourly",
      milestonesCompleted: 2,
      milestonesTotal: 2,
    },
    outcomeSummary: "Delivered the dashboard milestones on schedule.",
    performanceSignals: ["All milestones completed", "Review pending"],
    rehireRecommendation: {
      verdict: "strong_rehire",
      reasons: ["Strong React delivery", "Clear communication"],
    },
    internalNotesTemplate: "Engagement completed successfully with Jane Cooper.",
  },
  freelancer: {
    engagementSnapshot: {
      companyName: "Acme Corp",
      jobTitle: "React Developer",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-04-01T00:00:00.000Z",
      rate: 95,
      rateType: "hourly",
    },
    whatYouDelivered: "Built and shipped the employer dashboard.",
    strengthsDemonstrated: ["React", "TypeScript"],
    growthAreas: ["Add more portfolio case studies"],
    profileSuggestions: ["Highlight the dashboard project in your portfolio"],
  },
  generatedAt: "2026-04-02T12:00:00.000Z",
});

describe("bookingDebriefGenerator utils", () => {
  describe("validateDebriefResponse", () => {
    it("parses valid debrief JSON", () => {
      const result = validateDebriefResponse(validDebriefJson);
      expect(result.employer.rehireRecommendation.verdict).toBe("strong_rehire");
      expect(result.freelancer.profileSuggestions).toHaveLength(1);
    });

    it("rejects invalid verdict enum", () => {
      const bad = JSON.parse(validDebriefJson) as Record<string, unknown>;
      const employer = bad.employer as Record<string, unknown>;
      const rehire = employer.rehireRecommendation as Record<string, unknown>;
      rehire.verdict = "maybe";
      expect(() => validateDebriefResponse(JSON.stringify(bad))).toThrow();
    });

    it("rejects missing employer section", () => {
      const bad = JSON.parse(validDebriefJson) as Record<string, unknown>;
      delete bad.employer;
      expect(() => validateDebriefResponse(JSON.stringify(bad))).toThrow();
    });
  });

  describe("isWithinDebriefRegenCooldown", () => {
    it("returns false when never regenerated", () => {
      expect(isWithinDebriefRegenCooldown(null)).toBe(false);
    });

    it("returns true inside 24h window", () => {
      const recent = new Date(Date.now() - 60 * 60 * 1000);
      expect(isWithinDebriefRegenCooldown(recent)).toBe(true);
    });

    it("returns false after 24h", () => {
      const old = new Date(Date.now() - DEBRIEF_REGEN_COOLDOWN_MS - 1000);
      expect(isWithinDebriefRegenCooldown(old)).toBe(false);
    });
  });
});

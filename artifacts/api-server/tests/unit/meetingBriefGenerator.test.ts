import { describe, expect, it } from "vitest";
import { buildMeetingBriefPrompt } from "../../src/lib/meetingBriefGenerator";

describe("buildMeetingBriefPrompt", () => {
  it("formats INR rates without hardcoded USD symbols", () => {
    const prompt = buildMeetingBriefPrompt({
      freelancer: {
        name: "Priya Sharma",
        fieldOfWork: "Software Development",
        educationProfessionType: null,
        skills: ["React"],
        teachingSubjects: [],
        yearsExperience: 5,
        bio: "Full-stack engineer",
        completenessScore: 80,
        averageRating: "4.5",
        reviewCount: 3,
      } as any,
      jobRequirement: null,
      meeting: { scheduledAt: new Date("2026-08-01") } as any,
      rate: 1500,
      rateType: "hourly",
      currencyCode: "INR",
      marketMedian: 1200,
      employerAvg: 1100,
      jobBudget: 2000,
      verifiedCredentials: [],
    });

    expect(prompt).toContain("₹1500");
    expect(prompt).toContain("₹1200");
    expect(prompt).toContain("all amounts in INR");
    expect(prompt).not.toMatch(/Market median for Software Development: \$/);
  });
});

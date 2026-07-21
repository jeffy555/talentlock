import { describe, expect, it } from "vitest";
import {
  normaliseFreelancer,
  talentSearchPreFilter,
  validateTalentSearchResponse,
  defaultTalentSearchRules,
} from "../../src/lib/talentSearchUtils";
import type { FreelancerProfile } from "@workspace/db";

const baseProfile = {
  id: 1,
  userId: 1,
  clerkId: "user_test",
  name: "Jane Teacher",
  professionCategory: "education",
  educationProfessionType: "school_teacher",
  skills: ["Mathematics", "Physics"],
  teachingSubjects: ["Mathematics"],
  teachingLevels: ["GCSE"],
  fieldOfWork: "Education",
  hourlyRate: "80",
  dailyRate: null,
  bio: "Experienced teacher",
  dbsCheckStatus: "verified",
  location: "London",
  completenessScore: 90,
  isAvailable: true,
} as FreelancerProfile;

describe("talentSearchPreFilter", () => {
  it("passes when profession and rate match", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "education";
    rules.maxRate = 100;
    rules.minRate = 50;
    const fl = normaliseFreelancer(baseProfile, true);
    expect(talentSearchPreFilter(rules, fl)).toBe(true);
  });

  it("rejects profession category mismatch", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "technology";
    const fl = normaliseFreelancer(baseProfile, true);
    expect(talentSearchPreFilter(rules, fl)).toBe(false);
  });

  it("rejects when freelancer rate exceeds maxRate", () => {
    const rules = defaultTalentSearchRules();
    rules.maxRate = 50;
    const fl = normaliseFreelancer(baseProfile, true);
    expect(talentSearchPreFilter(rules, fl)).toBe(false);
  });
});

describe("validateTalentSearchResponse", () => {
  it("accepts valid skip response", () => {
    const valid = {
      score: 40,
      decision: "skip",
      reasons: { matched: [], concerns: ["Rate"], blockers: [] },
      proposedMessage: null,
    };
    expect(validateTalentSearchResponse(valid)).toBe(true);
  });

  it("rejects invalid score", () => {
    expect(
      validateTalentSearchResponse({
        score: 150,
        decision: "skip",
        reasons: { matched: [], concerns: [], blockers: [] },
        proposedMessage: null,
      }),
    ).toBe(false);
  });
});

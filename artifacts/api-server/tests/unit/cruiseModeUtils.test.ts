import { describe, expect, it } from "vitest";
import {
  isInBlackoutWindow,
  normaliseJob,
  preFilter,
  validateEvaluationResponse,
} from "../../src/lib/cruiseModeUtils";
import type { CruiseModeRules, JobRequirement } from "@workspace/db";

const baseRules: CruiseModeRules = {
  requiredSkills: ["React"],
  preferredSkills: [],
  minRate: 50,
  maxRate: 200,
  excludedKeywords: ["blockword"],
  matchThreshold: 70,
  messageTone: "professional",
  blackoutWindows: null,
  dryRun: false,
  dailyDigest: false,
};

const sampleJob = normaliseJob({
  id: 1,
  employerId: 1,
  title: "React Developer",
  description: "Build UI components",
  requiredSkills: ["React", "TypeScript"],
  budget: "100",
  paymentType: "hourly",
  fieldOfWork: "Engineering",
  startDate: new Date("2026-08-01"),
  endDate: new Date("2026-10-01"),
  status: "open",
  professionCategory: "technology",
  rateType: "hourly",
} as JobRequirement);

describe("preFilter", () => {
  it("passes when skills and rate match", () => {
    expect(preFilter(baseRules, sampleJob)).toBe(true);
  });

  it("rejects excluded keywords", () => {
    const job = { ...sampleJob, description: "Contains blockword here" };
    expect(preFilter(baseRules, job)).toBe(false);
  });

  it("rejects when max job rate below min rule rate", () => {
    const rules = { ...baseRules, minRate: 500 };
    expect(preFilter(rules, sampleJob)).toBe(false);
  });
});

describe("isInBlackoutWindow", () => {
  it("returns false when no blackout windows configured", () => {
    expect(isInBlackoutWindow(baseRules)).toBe(false);
  });
});

describe("validateEvaluationResponse", () => {
  it("accepts valid send response", () => {
    const valid = {
      score: 85,
      decision: "send",
      reasons: { matched: ["React"], concerns: [], blockers: [] },
      proposedMessage: "Hello, I am interested in this role.",
    };
    expect(validateEvaluationResponse(valid)).toBe(true);
  });

  it("rejects send without proposedMessage", () => {
    const invalid = {
      score: 85,
      decision: "send",
      reasons: { matched: [], concerns: [], blockers: [] },
      proposedMessage: "",
    };
    expect(validateEvaluationResponse(invalid)).toBe(false);
  });
});

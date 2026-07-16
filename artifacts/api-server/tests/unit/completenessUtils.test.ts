import { describe, expect, it } from "vitest";
import {
  calculateCompletenessScore,
  getMissingCompletenessFields,
  hasMinSkills,
} from "../../src/lib/completenessUtils";

describe("hasMinSkills", () => {
  it("counts array and comma-separated skills", () => {
    expect(hasMinSkills(["a", "b"], 2)).toBe(true);
    expect(hasMinSkills("a,b", 2)).toBe(true);
    expect(hasMinSkills(["a"], 2)).toBe(false);
  });
});

describe("calculateCompletenessScore", () => {
  const fullProfile = {
    bio: "x".repeat(50),
    skills: ["React", "Node"],
    hourlyRate: "100",
    paymentPreference: "hourly",
    fieldOfWork: "Engineering",
    isAvailable: true,
  };

  it("returns 100 for a complete profile with avatar", () => {
    expect(calculateCompletenessScore(fullProfile, "https://cdn/avatar.png")).toBe(100);
  });

  it("returns 0 for an empty profile", () => {
    expect(calculateCompletenessScore({}, null)).toBe(0);
  });

  it("Talent Vault gate: incomplete profile below 60", () => {
    const score = calculateCompletenessScore({ bio: "short", skills: ["one"] }, null);
    expect(score).toBeLessThan(60);
  });
});

describe("getMissingCompletenessFields", () => {
  it("lists all missing fields for empty profile", () => {
    const missing = getMissingCompletenessFields({}, null);
    expect(missing).toEqual(["photo", "bio", "skills", "rate", "field", "availability"]);
  });
});

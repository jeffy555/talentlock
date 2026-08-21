import { describe, expect, it } from "vitest";
import {
  normaliseFreelancer,
  talentSearchPreFilter,
  talentSearchPreFilterReason,
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
  paymentPreference: "hourly",
  hourlyRate: "80",
  dailyRate: null,
  bio: "Experienced teacher",
  dbsCheckStatus: "verified",
  location: "London",
  countryCode: "GB",
  completenessScore: 90,
  isAvailable: true,
} as FreelancerProfile;

describe("talentSearchPreFilter", () => {
  it("passes when profession and rate match", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "education";
    rules.maxRate = 100;
    rules.minRate = 50;
    const fl = normaliseFreelancer(baseProfile, true, null);
    expect(talentSearchPreFilter(rules, fl)).toBe(true);
  });

  it("rejects profession category mismatch", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "technology";
    const fl = normaliseFreelancer(baseProfile, true, null);
    expect(talentSearchPreFilter(rules, fl)).toBe(false);
  });

  it("rejects when freelancer rate exceeds maxRate", () => {
    const rules = defaultTalentSearchRules();
    rules.maxRate = 50;
    const fl = normaliseFreelancer(baseProfile, true, null);
    expect(talentSearchPreFilter(rules, fl)).toBe(false);
  });

  it("rejects location country mismatch when locationRequired", () => {
    const rules = defaultTalentSearchRules();
    rules.locationRequired = true;
    rules.countryCode = "US";
    rules.stateCode = "CA";
    rules.location = "California, United States";
    const fl = normaliseFreelancer(baseProfile, true, "ENG");
    expect(talentSearchPreFilter(rules, fl)).toBe(false);
  });

  it("passes location country and state match when locationRequired", () => {
    const rules = defaultTalentSearchRules();
    rules.locationRequired = true;
    rules.countryCode = "US";
    rules.stateCode = "CA";
    rules.location = "California, United States";
    const usProfile = { ...baseProfile, countryCode: "US", location: "California" } as FreelancerProfile;
    const fl = normaliseFreelancer(usProfile, true, "CA");
    expect(talentSearchPreFilter(rules, fl)).toBe(true);
  });
});

describe("talentSearchPreFilter healthcare rules", () => {
  const healthcareProfile = {
    ...baseProfile,
    id: 2,
    name: "Dr. Patel",
    professionCategory: "healthcare",
    educationProfessionType: null,
    healthcareProfessionType: "physician",
    clinicalSpecialties: ["Cardiology", "Internal Medicine"],
    clinicalSettings: ["Hospital"],
    aadhaarVerificationStatus: "verified",
    fieldOfWork: "Healthcare",
    hourlyRate: "5000",
  } as FreelancerProfile;

  it("passes when healthcare sub-type and specialty match", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "healthcare";
    rules.healthcareSubType = "physician";
    rules.clinicalSpecialty = "cardiology";
    const fl = normaliseFreelancer(healthcareProfile, true, null);
    expect(talentSearchPreFilter(rules, fl)).toBe(true);
  });

  it("rejects healthcare sub-type mismatch", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "healthcare";
    rules.healthcareSubType = "registered_nurse";
    const fl = normaliseFreelancer(healthcareProfile, true, null);
    expect(talentSearchPreFilterReason(rules, fl)).toContain("Healthcare sub-type");
  });

  it("rejects when Aadhaar verified required but missing", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "healthcare";
    rules.requireAadhaarVerified = true;
    const unverified = {
      ...healthcareProfile,
      aadhaarVerificationStatus: "uploaded",
    } as FreelancerProfile;
    const fl = normaliseFreelancer(unverified, true, null);
    expect(talentSearchPreFilterReason(rules, fl)).toContain("Aadhaar");
  });
});

describe("talentSearchPreFilter legal_finance rules", () => {
  const legalProfile = {
    ...baseProfile,
    id: 3,
    name: "Advocate Sharma",
    professionCategory: "legal_finance",
    educationProfessionType: null,
    legalFinanceProfessionType: "advocate",
    practiceAreas: ["GST", "Corporate"],
    practiceSettings: ["Chambers"],
    courtJurisdictions: ["Bombay High Court"],
    aadhaarVerificationStatus: "verified",
    fieldOfWork: "Law & Legal Services",
    hourlyRate: "8000",
  } as FreelancerProfile;

  it("passes when legal sub-type and practice area match", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "legal_finance";
    rules.legalFinanceSubType = "advocate";
    rules.practiceArea = "gst";
    const fl = normaliseFreelancer(legalProfile, true, null);
    expect(talentSearchPreFilter(rules, fl)).toBe(true);
  });

  it("rejects legal finance sub-type mismatch", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "legal_finance";
    rules.legalFinanceSubType = "chartered_accountant";
    const fl = normaliseFreelancer(legalProfile, true, null);
    expect(talentSearchPreFilterReason(rules, fl)).toContain("Legal & finance sub-type");
  });

  it("rejects practice area mismatch", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "legal_finance";
    rules.practiceArea = "Insolvency";
    const fl = normaliseFreelancer(legalProfile, true, null);
    expect(talentSearchPreFilterReason(rules, fl)).toContain("Practice area");
  });

  it("rejects unverified Aadhaar when requireAadhaarVerified is set", () => {
    const rules = defaultTalentSearchRules();
    rules.professionCategory = "legal_finance";
    rules.requireAadhaarVerified = true;
    const unverified = {
      ...legalProfile,
      aadhaarVerificationStatus: "uploaded",
    } as FreelancerProfile;
    const fl = normaliseFreelancer(unverified, true, null);
    expect(talentSearchPreFilterReason(rules, fl)).toContain("Aadhaar");
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

import { describe, expect, it } from "vitest";

import {
  isExcludedFromVaultByHealthcareRegistration,
  isExcludedFromVaultByLegalEnrolment,
  type VaultProfileExpiryFields,
} from "../../src/lib/vaultVisibilityUtils";

const baseProfile = (): VaultProfileExpiryFields => ({
  professionCategory: "technology",
  educationProfessionType: null,
  teachingLicenceExpiry: null,
  healthcareProfessionType: null,
  registrationExpiry: null,
  legalFinanceProfessionType: null,
  enrolmentExpiry: null,
});

describe("vaultVisibilityUtils", () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  it("excludes physician with past registrationExpiry from Vault", () => {
    expect(
      isExcludedFromVaultByHealthcareRegistration({
        ...baseProfile(),
        professionCategory: "healthcare",
        healthcareProfessionType: "physician",
        registrationExpiry: yesterday,
      }),
    ).toBe(true);
  });

  it("keeps allied_health with past registrationExpiry in Vault", () => {
    expect(
      isExcludedFromVaultByHealthcareRegistration({
        ...baseProfile(),
        professionCategory: "healthcare",
        healthcareProfessionType: "allied_health",
        registrationExpiry: yesterday,
      }),
    ).toBe(false);
  });

  it("keeps care_worker with past registrationExpiry in Vault", () => {
    expect(
      isExcludedFromVaultByHealthcareRegistration({
        ...baseProfile(),
        professionCategory: "healthcare",
        healthcareProfessionType: "care_worker",
        registrationExpiry: yesterday,
      }),
    ).toBe(false);
  });

  it("excludes advocate with past enrolmentExpiry from Vault", () => {
    expect(
      isExcludedFromVaultByLegalEnrolment({
        ...baseProfile(),
        professionCategory: "legal_finance",
        legalFinanceProfessionType: "advocate",
        enrolmentExpiry: yesterday,
      }),
    ).toBe(true);
  });

  it("keeps tax_consultant with past enrolmentExpiry in Vault", () => {
    expect(
      isExcludedFromVaultByLegalEnrolment({
        ...baseProfile(),
        professionCategory: "legal_finance",
        legalFinanceProfessionType: "tax_consultant",
        enrolmentExpiry: yesterday,
      }),
    ).toBe(false);
  });

  it("keeps financial_advisor with past enrolmentExpiry in Vault", () => {
    expect(
      isExcludedFromVaultByLegalEnrolment({
        ...baseProfile(),
        professionCategory: "legal_finance",
        legalFinanceProfessionType: "financial_advisor",
        enrolmentExpiry: yesterday,
      }),
    ).toBe(false);
  });
});

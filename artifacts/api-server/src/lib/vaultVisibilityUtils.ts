/**
 * Pure helpers for Talent Vault profile-expiry exclusions.
 * SQL in GET /api/freelancers must stay aligned with these rules.
 */

export interface VaultProfileExpiryFields {
  professionCategory: string;
  educationProfessionType: string | null;
  teachingLicenceExpiry: Date | null;
  healthcareProfessionType: string | null;
  registrationExpiry: Date | null;
  legalFinanceProfessionType: string | null;
  enrolmentExpiry: Date | null;
}

const HEALTHCARE_REGISTRATION_VAULT_DROP_TYPES = new Set([
  "physician",
  "registered_nurse",
  "nurse_practitioner",
]);

const LEGAL_FINANCE_ENROLMENT_VAULT_DROP_TYPES = new Set([
  "advocate",
  "chartered_accountant",
  "company_secretary",
]);

export function isExcludedFromVaultByTeachingLicence(
  profile: VaultProfileExpiryFields,
  now: Date = new Date(),
): boolean {
  return (
    profile.professionCategory === "education" &&
    profile.educationProfessionType === "school_teacher" &&
    profile.teachingLicenceExpiry != null &&
    profile.teachingLicenceExpiry < now
  );
}

/** Q8 — allied/care_worker never dropped; missing Phase 2+ uploads never dropped. */
export function isExcludedFromVaultByHealthcareRegistration(
  profile: VaultProfileExpiryFields,
  now: Date = new Date(),
): boolean {
  if (profile.professionCategory !== "healthcare") return false;
  if (!profile.healthcareProfessionType) return false;
  if (!HEALTHCARE_REGISTRATION_VAULT_DROP_TYPES.has(profile.healthcareProfessionType)) {
    return false;
  }
  return profile.registrationExpiry != null && profile.registrationExpiry < now;
}

/** Q9 — tax/advisor never dropped; missing Phase 2 uploads never dropped. */
export function isExcludedFromVaultByLegalEnrolment(
  profile: VaultProfileExpiryFields,
  now: Date = new Date(),
): boolean {
  if (profile.professionCategory !== "legal_finance") return false;
  if (!profile.legalFinanceProfessionType) return false;
  if (!LEGAL_FINANCE_ENROLMENT_VAULT_DROP_TYPES.has(profile.legalFinanceProfessionType)) {
    return false;
  }
  return profile.enrolmentExpiry != null && profile.enrolmentExpiry < now;
}

export function isExcludedFromVaultByProfileExpiry(
  profile: VaultProfileExpiryFields,
  now: Date = new Date(),
): boolean {
  return (
    isExcludedFromVaultByTeachingLicence(profile, now) ||
    isExcludedFromVaultByHealthcareRegistration(profile, now) ||
    isExcludedFromVaultByLegalEnrolment(profile, now)
  );
}

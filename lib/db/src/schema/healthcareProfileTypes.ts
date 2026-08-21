// Healthcare Professional Profile — shared types and document lookup

export type HealthcareProfessionType =
  | "physician"
  | "registered_nurse"
  | "nurse_practitioner"
  | "allied_health"
  | "care_worker";

export type HealthcareQualification =
  | "mbbs"
  | "bds"
  | "md_ms"
  | "dnb"
  | "diploma_medical"
  | "bsc_nursing"
  | "msc_nursing"
  | "gnm"
  | "anm"
  | "post_basic_bsc"
  | "bpt"
  | "mph"
  | "other";

export type PreferredCareMode = "in_person" | "telehealth" | "both";

export type AadhaarVerificationStatus =
  | "not_uploaded"
  | "uploaded"
  | "verified"
  | "rejected"
  | "expired";

export const HEALTHCARE_DOCUMENT_TYPES_PHASE1 = ["aadhaar"] as const;

export const HEALTHCARE_DOCUMENT_TYPES_PHASE2 = [
  "experience_certificate",
  "mbbs_degree",
  "medical_registration_certificate",
  "nursing_degree",
  "nursing_registration_certificate",
  "allied_qualification",
] as const;

export const REQUIRED_DOCUMENTS_BY_HEALTHCARE_TYPE: Record<
  HealthcareProfessionType,
  { required: string[]; futureRequired: string[]; recommended: string[] }
> = {
  physician: {
    required: ["aadhaar"],
    futureRequired: [
      "mbbs_degree",
      "medical_registration_certificate",
      "experience_certificate",
    ],
    recommended: [
      "specialist_qualification",
      "medical_indemnity_insurance",
      "bls_acls_certificate",
    ],
  },
  registered_nurse: {
    required: ["aadhaar"],
    futureRequired: [
      "nursing_registration_certificate",
      "nursing_degree",
      "experience_certificate",
    ],
    recommended: ["bls_acls_certificate"],
  },
  nurse_practitioner: {
    required: ["aadhaar"],
    futureRequired: [
      "nursing_registration_certificate",
      "nursing_degree",
      "experience_certificate",
    ],
    recommended: ["specialist_qualification", "bls_acls_certificate"],
  },
  allied_health: {
    required: ["aadhaar"],
    futureRequired: ["allied_qualification", "experience_certificate"],
    recommended: ["allied_registration"],
  },
  care_worker: {
    required: ["aadhaar"],
    futureRequired: ["experience_certificate"],
    recommended: ["nursing_degree"],
  },
};

export function maskRegistrationNumber(value: string | null | undefined): string | null {
  if (!value || value.length < 4) return value ?? null;
  if (value.length <= 6) return `${value.slice(0, 1)}****`;
  return `${value.slice(0, 2)}****${value.slice(-4)}`;
}

export function documentStatusToAadhaarVerificationStatus(
  status: string | null | undefined,
): AadhaarVerificationStatus {
  if (!status) return "not_uploaded";
  switch (status) {
    case "verified":
      return "verified";
    case "rejected":
      return "rejected";
    case "expired":
      return "expired";
    case "pending":
    case "needs_review":
      return "uploaded";
    default:
      return "not_uploaded";
  }
}

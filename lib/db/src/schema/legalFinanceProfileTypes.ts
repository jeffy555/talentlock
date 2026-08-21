// Legal & Finance Professional Profile — shared types and document lookup
// Inspection:
// - Array columns (practiceAreas / practiceSettings / courtJurisdictions) match skills / clinicalSpecialties (text().array())
// - Reuse location and aadhaarVerificationStatus — do not duplicate
// - Do not reuse healthcare registration_* columns — enrolment_* is a separate set
// - ChipInput: artifacts/talentlock/src/components/ChipInput.tsx
// - buildProfessionContext: artifacts/api-server/src/lib/professionContext.ts
// - Vault Aadhaar helper: artifacts/api-server/src/routes/freelancers.ts

export type LegalFinanceProfessionType =
  | "advocate"
  | "chartered_accountant"
  | "company_secretary"
  | "tax_consultant"
  | "financial_advisor";

export type LegalFinanceQualification =
  | "llb"
  | "llm"
  | "ca_final"
  | "cs_professional"
  | "cma_final"
  | "mba_finance"
  | "cfa"
  | "other";

export type PreferredEngagementMode = "in_person" | "remote" | "both";

export const LEGAL_FINANCE_DOCUMENT_TYPES_PHASE1 = ["aadhaar"] as const;

export const LEGAL_FINANCE_DOCUMENT_TYPES_PHASE2 = [
  "experience_certificate",
  "bar_enrolment_certificate",
  "certificate_of_practice",
  "icai_membership_certificate",
  "icsi_membership_certificate",
  "gst_practitioner_certificate",
  "sebi_nism_certificate",
] as const;

export const REQUIRED_DOCUMENTS_BY_LEGAL_FINANCE_TYPE: Record<
  LegalFinanceProfessionType,
  { required: string[]; futureRequired: string[]; recommended: string[] }
> = {
  advocate: {
    required: ["aadhaar"],
    futureRequired: [
      "bar_enrolment_certificate",
      "certificate_of_practice",
      "experience_certificate",
    ],
    recommended: ["aibe_certificate", "professional_indemnity_insurance"],
  },
  chartered_accountant: {
    required: ["aadhaar"],
    futureRequired: [
      "icai_membership_certificate",
      "certificate_of_practice",
      "experience_certificate",
    ],
    recommended: ["professional_indemnity_insurance"],
  },
  company_secretary: {
    required: ["aadhaar"],
    futureRequired: [
      "icsi_membership_certificate",
      "certificate_of_practice",
      "experience_certificate",
    ],
    recommended: ["professional_indemnity_insurance"],
  },
  tax_consultant: {
    required: ["aadhaar"],
    futureRequired: ["gst_practitioner_certificate", "experience_certificate"],
    recommended: ["icai_membership_certificate", "bar_enrolment_certificate"],
  },
  financial_advisor: {
    required: ["aadhaar"],
    futureRequired: ["sebi_nism_certificate", "experience_certificate"],
    recommended: ["professional_indemnity_insurance"],
  },
};

export const AADHAAR_VAULT_CATEGORIES = ["healthcare", "legal_finance"] as const;

export function requiresVerifiedAadhaarForVault(category: string | null | undefined): boolean {
  return AADHAAR_VAULT_CATEGORIES.includes(
    category as (typeof AADHAAR_VAULT_CATEGORIES)[number],
  );
}

import type { EmployerDocumentType } from "@workspace/api-client-react";

export type EmployerDocumentDefinition = {
  type: EmployerDocumentType;
  label: string;
  description: string;
  required: boolean;
};

export const EMPLOYER_DOCUMENT_DEFINITIONS: EmployerDocumentDefinition[] = [
  {
    type: "aadhaar",
    label: "Aadhaar Card",
    description: "UIDAI Aadhaar card of the company director or authorised representative (required)",
    required: true,
  },
  {
    type: "representative_id",
    label: "Other Government ID",
    description: "Passport, driving licence, or other government photo ID (optional if Aadhaar is uploaded)",
    required: false,
  },
  {
    type: "company_registration",
    label: "Company Registration Certificate",
    description: "Official company registration document",
    required: true,
  },
  {
    type: "tax_vat_certificate",
    label: "Tax / VAT Certificate",
    description: "VAT registration or equivalent tax document",
    required: true,
  },
  {
    type: "business_licence",
    label: "Business Licence",
    description: "Trading licence or sector-specific permit",
    required: false,
  },
  {
    type: "proof_of_business_address",
    label: "Proof of Business Address",
    description: "Utility bill or bank statement (less than 3 months old)",
    required: false,
  },
];

export const COMPANY_SIZE_OPTIONS = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-200", label: "51–200 employees" },
  { value: "201-500", label: "201–500 employees" },
  { value: "500+", label: "500+ employees" },
] as const;

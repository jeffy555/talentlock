import type { LegalFinanceProfessionType, LegalFinanceQualification } from "@workspace/api-client-react";

export const LEGAL_FINANCE_TYPE_LABELS: Record<LegalFinanceProfessionType, string> = {
  advocate: "Advocate / Lawyer",
  chartered_accountant: "Chartered Accountant",
  company_secretary: "Company Secretary",
  tax_consultant: "Tax Consultant",
  financial_advisor: "Financial Advisor",
};

export const LEGAL_FINANCE_QUALIFICATION_LABELS: Record<LegalFinanceQualification, string> = {
  llb: "LL.B",
  llm: "LL.M",
  ca_final: "CA Final",
  cs_professional: "CS Professional",
  cma_final: "CMA Final",
  mba_finance: "MBA (Finance)",
  cfa: "CFA",
  other: "Other",
};

export const PREFERRED_ENGAGEMENT_MODE_LABELS: Record<string, string> = {
  in_person: "In-person",
  remote: "Remote",
  both: "In-person & remote",
};

/** Phase 2 document labels keyed by documentType for checklist uploads. */
export const LEGAL_FINANCE_CREDENTIAL_DOCUMENT_LABELS: Record<string, string> = {
  experience_certificate: "Experience letter",
  bar_enrolment_certificate: "Bar enrolment certificate",
  certificate_of_practice: "Certificate of Practice",
  icai_membership_certificate: "ICAI membership certificate",
  icsi_membership_certificate: "ICSI membership certificate",
  gst_practitioner_certificate: "GST practitioner certificate",
  sebi_nism_certificate: "SEBI / NISM certificate",
};

export const LEGAL_FINANCE_CREDENTIAL_DOCUMENT_HINTS: Record<string, string> = {
  experience_certificate: "Firm or chambers letter on letterhead with role and dates",
  bar_enrolment_certificate: "State Bar Council enrolment / sanad",
  certificate_of_practice: "BCI / ICAI / ICSI Certificate of Practice",
  icai_membership_certificate: "ICAI membership certificate",
  icsi_membership_certificate: "ICSI membership certificate",
  gst_practitioner_certificate: "GSTN GST Practitioner enrolment",
  sebi_nism_certificate: "SEBI RIA acknowledgement or NISM pass certificate",
};

export const LEGAL_FINANCE_CREDENTIALS_WITH_EXPIRY = new Set(["certificate_of_practice"]);

/** @deprecated Use LEGAL_FINANCE_CREDENTIAL_DOCUMENT_LABELS with documentType keys. */
export const LEGAL_FINANCE_FUTURE_DOC_LABELS: Record<LegalFinanceProfessionType, string[]> = {
  advocate: ["Bar enrolment certificate", "Certificate of Practice", "Experience letter"],
  chartered_accountant: ["ICAI membership certificate", "Certificate of Practice", "Experience letter"],
  company_secretary: ["ICSI membership certificate", "Certificate of Practice", "Experience letter"],
  tax_consultant: ["GST practitioner certificate", "Experience letter"],
  financial_advisor: ["SEBI / NISM certificate", "Experience letter"],
};

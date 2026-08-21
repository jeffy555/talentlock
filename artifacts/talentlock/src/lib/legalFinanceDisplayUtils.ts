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

/** Phase 2 document labels — checklist only until Phase 5 opens uploads. */
export const LEGAL_FINANCE_FUTURE_DOC_LABELS: Record<LegalFinanceProfessionType, string[]> = {
  advocate: ["Bar enrolment certificate", "Certificate of Practice", "Experience letter"],
  chartered_accountant: ["ICAI membership certificate", "Certificate of Practice", "Experience letter"],
  company_secretary: ["ICSI membership certificate", "Certificate of Practice", "Experience letter"],
  tax_consultant: ["GST practitioner certificate", "Experience letter"],
  financial_advisor: ["SEBI / NISM certificate", "Experience letter"],
};

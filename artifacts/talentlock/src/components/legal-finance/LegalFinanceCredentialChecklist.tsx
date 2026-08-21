import { CheckCircle2, Circle, Clock } from "lucide-react";
import type {
  DocumentMeItem,
  DocumentType,
  LegalFinanceProfessionType,
  AadhaarVerificationStatus,
} from "@workspace/api-client-react";

import { CredentialDocumentRow } from "@/components/CredentialDocumentRow";
import { aadhaarStatusLabel } from "@/lib/healthcareDisplayUtils";
import {
  LEGAL_FINANCE_CREDENTIAL_DOCUMENT_HINTS,
  LEGAL_FINANCE_CREDENTIAL_DOCUMENT_LABELS,
  LEGAL_FINANCE_CREDENTIALS_WITH_EXPIRY,
} from "@/lib/legalFinanceDisplayUtils";

const FUTURE_REQUIRED_BY_TYPE: Record<LegalFinanceProfessionType, DocumentType[]> = {
  advocate: [
    "bar_enrolment_certificate",
    "certificate_of_practice",
    "experience_certificate",
  ],
  chartered_accountant: [
    "icai_membership_certificate",
    "certificate_of_practice",
    "experience_certificate",
  ],
  company_secretary: [
    "icsi_membership_certificate",
    "certificate_of_practice",
    "experience_certificate",
  ],
  tax_consultant: ["gst_practitioner_certificate", "experience_certificate"],
  financial_advisor: ["sebi_nism_certificate", "experience_certificate"],
};

interface LegalFinanceCredentialChecklistProps {
  legalFinanceProfessionType: LegalFinanceProfessionType | null;
  aadhaarVerificationStatus: AadhaarVerificationStatus | string;
  documents?: DocumentMeItem[];
  onRefreshDocuments?: () => void;
}

export function LegalFinanceCredentialChecklist({
  legalFinanceProfessionType,
  aadhaarVerificationStatus,
  documents = [],
  onRefreshDocuments,
}: LegalFinanceCredentialChecklistProps) {
  const docMap = new Map(documents.map((d) => [d.documentType, d]));
  const futureTypes = legalFinanceProfessionType
    ? FUTURE_REQUIRED_BY_TYPE[legalFinanceProfessionType]
    : [];
  const onRefresh = onRefreshDocuments ?? (() => {});

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Your credentials</h3>
      <div className="flex items-start gap-2 text-sm">
        {aadhaarVerificationStatus === "verified" ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
        ) : aadhaarVerificationStatus === "uploaded" ? (
          <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        )}
        <div>
          <p className="font-medium">
            Aadhaar <span className="text-red-600">*</span>
          </p>
          <p className="text-xs text-muted-foreground">{aadhaarStatusLabel(aadhaarVerificationStatus)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Upload Aadhaar in Identity Verification below.
          </p>
        </div>
      </div>

      {futureTypes.map((documentType) => (
        <CredentialDocumentRow
          key={documentType}
          documentType={documentType}
          label={LEGAL_FINANCE_CREDENTIAL_DOCUMENT_LABELS[documentType] ?? documentType}
          hint={LEGAL_FINANCE_CREDENTIAL_DOCUMENT_HINTS[documentType] ?? "Upload a clear scan or PDF"}
          doc={docMap.get(documentType)}
          onRefresh={onRefresh}
          allowExpiry={LEGAL_FINANCE_CREDENTIALS_WITH_EXPIRY.has(documentType)}
        />
      ))}

      <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
        Complete Aadhaar verification to appear in Talent Vault. Bar, ICAI, GST, and NISM documents can be added here — they are not required for Vault visibility.
      </p>
    </div>
  );
}

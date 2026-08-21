import { CheckCircle2, Circle, Clock } from "lucide-react";
import type {
  DocumentMeItem,
  DocumentType,
  HealthcareProfessionType,
  AadhaarVerificationStatus,
} from "@workspace/api-client-react";

import { CredentialDocumentRow } from "@/components/CredentialDocumentRow";
import {
  aadhaarStatusLabel,
  HEALTHCARE_CREDENTIAL_DOCUMENT_HINTS,
  HEALTHCARE_CREDENTIAL_DOCUMENT_LABELS,
  HEALTHCARE_CREDENTIALS_WITH_EXPIRY,
} from "@/lib/healthcareDisplayUtils";

const FUTURE_REQUIRED_BY_TYPE: Record<HealthcareProfessionType, DocumentType[]> = {
  physician: [
    "mbbs_degree",
    "medical_registration_certificate",
    "experience_certificate",
  ],
  registered_nurse: [
    "nursing_registration_certificate",
    "nursing_degree",
    "experience_certificate",
  ],
  nurse_practitioner: [
    "nursing_registration_certificate",
    "nursing_degree",
    "experience_certificate",
  ],
  allied_health: ["allied_qualification", "experience_certificate"],
  care_worker: ["experience_certificate"],
};

interface HealthcareCredentialChecklistProps {
  healthcareProfessionType: HealthcareProfessionType | null;
  aadhaarVerificationStatus: AadhaarVerificationStatus | string;
  documents?: DocumentMeItem[];
  onRefreshDocuments?: () => void;
}

export function HealthcareCredentialChecklist({
  healthcareProfessionType,
  aadhaarVerificationStatus,
  documents = [],
  onRefreshDocuments,
}: HealthcareCredentialChecklistProps) {
  const docMap = new Map(documents.map((d) => [d.documentType, d]));
  const futureTypes = healthcareProfessionType
    ? FUTURE_REQUIRED_BY_TYPE[healthcareProfessionType]
    : [];
  const onRefresh = onRefreshDocuments ?? (() => {});

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-emerald-900">Healthcare credentials</h3>
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
          label={HEALTHCARE_CREDENTIAL_DOCUMENT_LABELS[documentType] ?? documentType}
          hint={HEALTHCARE_CREDENTIAL_DOCUMENT_HINTS[documentType] ?? "Upload a clear scan or PDF"}
          doc={docMap.get(documentType)}
          onRefresh={onRefresh}
          allowExpiry={HEALTHCARE_CREDENTIALS_WITH_EXPIRY.has(documentType)}
        />
      ))}

      <p className="text-xs text-emerald-900/80 bg-emerald-50 border border-emerald-100 rounded px-2 py-1.5">
        Complete Aadhaar verification to appear in Talent Vault. Degree and council certificates can be added here — they are not required for Vault visibility. Set registration expiry on your profile if your council licence expires.
      </p>
    </div>
  );
}

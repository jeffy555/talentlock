import { CheckCircle2, Circle, Clock } from "lucide-react";
import type { LegalFinanceProfessionType, AadhaarVerificationStatus } from "@workspace/api-client-react";
import { aadhaarStatusLabel } from "@/lib/healthcareDisplayUtils";
import { LEGAL_FINANCE_FUTURE_DOC_LABELS } from "@/lib/legalFinanceDisplayUtils";

interface LegalFinanceCredentialChecklistProps {
  legalFinanceProfessionType: LegalFinanceProfessionType | null;
  aadhaarVerificationStatus: AadhaarVerificationStatus | string;
}

export function LegalFinanceCredentialChecklist({
  legalFinanceProfessionType,
  aadhaarVerificationStatus,
}: LegalFinanceCredentialChecklistProps) {
  const futureDocs = legalFinanceProfessionType
    ? LEGAL_FINANCE_FUTURE_DOC_LABELS[legalFinanceProfessionType]
    : [];

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
          <p className="font-medium">Aadhaar <span className="text-red-600">*</span></p>
          <p className="text-xs text-muted-foreground">{aadhaarStatusLabel(aadhaarVerificationStatus)}</p>
        </div>
      </div>
      {futureDocs.map((label) => (
        <div key={label} className="flex items-center gap-2 text-sm text-slate-400">
          <Circle className="h-4 w-4 shrink-0" />
          <span>{label}</span>
          <span className="text-[10px] uppercase tracking-wide font-medium text-slate-400">
            After signup — coming soon
          </span>
        </div>
      ))}
      {aadhaarVerificationStatus !== "verified" && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Complete Aadhaar verification to appear in Talent Vault. Professional certificates are optional until we open uploads on this page.
        </p>
      )}
    </div>
  );
}

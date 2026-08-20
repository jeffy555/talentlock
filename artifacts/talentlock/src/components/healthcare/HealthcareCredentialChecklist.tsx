import { CheckCircle2, Circle, Clock } from "lucide-react";
import type { HealthcareProfessionType, AadhaarVerificationStatus } from "@workspace/api-client-react";
import { aadhaarStatusLabel } from "@/lib/healthcareDisplayUtils";

const PHASE2_DOCS: Record<HealthcareProfessionType, string[]> = {
  physician: ["Experience letter", "MBBS degree", "Medical council registration"],
  registered_nurse: ["Experience letter", "Nursing degree", "SNRC registration"],
  nurse_practitioner: ["Experience letter", "Nursing degree", "SNRC registration"],
  allied_health: ["Experience letter", "Allied health qualification"],
  care_worker: ["Experience letter"],
};

interface HealthcareCredentialChecklistProps {
  healthcareProfessionType: HealthcareProfessionType | null;
  aadhaarVerificationStatus: AadhaarVerificationStatus | string;
}

export function HealthcareCredentialChecklist({
  healthcareProfessionType,
  aadhaarVerificationStatus,
}: HealthcareCredentialChecklistProps) {
  const futureDocs = healthcareProfessionType ? PHASE2_DOCS[healthcareProfessionType] : [];

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
          <p className="font-medium">Aadhaar</p>
          <p className="text-xs text-muted-foreground">{aadhaarStatusLabel(aadhaarVerificationStatus)}</p>
        </div>
      </div>
      {futureDocs.map((label) => (
        <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
          <Circle className="h-4 w-4 shrink-0" />
          <span>{label}</span>
          <span className="text-[10px] uppercase tracking-wide font-medium text-slate-400">Planned</span>
        </div>
      ))}
      {aadhaarVerificationStatus !== "verified" && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Verified Aadhaar is required to appear in Talent Vault for healthcare profiles.
        </p>
      )}
    </div>
  );
}

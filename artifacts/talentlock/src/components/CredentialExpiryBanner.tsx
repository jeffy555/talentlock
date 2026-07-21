import { AlertTriangle } from "lucide-react";
import type { DocumentMeItem } from "@workspace/api-client-react";

function daysUntil(dateIso: string, now: Date = new Date()): number {
  return Math.ceil((new Date(dateIso).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

interface CredentialExpiryBannerProps {
  documents?: DocumentMeItem[];
  teachingLicenceExpiry?: string | null;
}

export default function CredentialExpiryBanner({
  documents,
  teachingLicenceExpiry,
}: CredentialExpiryBannerProps) {
  const candidates: number[] = [];

  for (const doc of documents ?? []) {
    if (doc.status === "verified" && doc.daysUntilExpiry != null) {
      candidates.push(doc.daysUntilExpiry);
    }
  }
  if (teachingLicenceExpiry) {
    candidates.push(daysUntil(teachingLicenceExpiry));
  }

  if (candidates.length === 0) return null;

  const minDays = Math.min(...candidates);
  if (minDays > 30) return null;

  const isExpired = minDays <= 0;
  const isUrgent = minDays <= 7;

  if (!isUrgent) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-900">
            A credential expires in {minDays} day{minDays === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            Renew it before it expires to keep your verified status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-red-900">
          {isExpired ? "A credential has expired" : `Urgent: a credential expires in ${minDays} day${minDays === 1 ? "" : "s"}`}
        </p>
        <p className="text-xs text-red-800 mt-0.5">
          {isExpired
            ? "Renew it now to restore your verified status and Talent Vault visibility."
            : "Renew it now to avoid losing your verified status and Talent Vault visibility."}
        </p>
      </div>
    </div>
  );
}

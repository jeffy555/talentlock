import type { ReactNode } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Clock,
  Shield,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import type { DocumentMeItem, DocumentType } from "@workspace/api-client-react";

import DocumentUploader from "@/components/DocumentUploader";

interface CredentialDocumentRowProps {
  label: string;
  hint: string;
  documentType: DocumentType;
  doc?: DocumentMeItem;
  onRefresh: () => void;
  allowExpiry?: boolean;
}

export function CredentialDocumentRow({
  label,
  hint,
  documentType,
  doc,
  onRefresh,
  allowExpiry = false,
}: CredentialDocumentRowProps) {
  const status = doc?.status ?? "not_submitted";

  let icon = <Shield className="h-5 w-5 text-slate-300" />;
  let statusBadge = (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium text-slate-400 bg-slate-100 border border-slate-200">
      Not submitted
    </span>
  );
  let detail = hint;
  let action: ReactNode = (
    <DocumentUploader
      documentType={documentType}
      onSuccess={onRefresh}
      label="Upload ↑"
      allowExpiry={allowExpiry}
    />
  );

  if (status === "pending") {
    icon = <Clock className="h-5 w-5 text-slate-400" />;
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium text-slate-500 bg-slate-100 border border-slate-200">
        <span className="animate-pulse h-2 w-2 rounded-full bg-slate-400" />
        Reviewing...
      </span>
    );
    detail = "AI review in progress — usually takes under a minute";
    action = null;
  } else if (status === "verified") {
    icon = <ShieldCheck className="h-5 w-5 text-emerald-600" />;
    statusBadge = (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium text-emerald-700 bg-emerald-100 border border-emerald-200">
        ✓ Verified
      </span>
    );
    detail = doc?.updatedAt
      ? `Verified on ${format(new Date(doc.updatedAt), "MMMM d, yyyy")}`
      : "Verified";
    action = (
      <DocumentUploader
        documentType={documentType}
        onSuccess={onRefresh}
        variant="ghost"
        label="Re-upload ↑"
        allowExpiry={allowExpiry}
      />
    );
  } else if (status === "rejected") {
    icon = <ShieldX className="h-5 w-5 text-red-600" />;
    statusBadge = (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium text-red-700 bg-red-100 border border-red-200">
        ✗ Rejected
      </span>
    );
    detail = doc?.adminNotes || doc?.aiNotes || "Please upload a clearer photo.";
    action = (
      <DocumentUploader
        documentType={documentType}
        onSuccess={onRefresh}
        label="Re-upload ↑"
        allowExpiry={allowExpiry}
      />
    );
  } else if (status === "needs_review") {
    icon = <AlertTriangle className="h-5 w-5 text-amber-600" />;
    statusBadge = (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium text-amber-700 bg-amber-100 border border-amber-200">
        Under Review
      </span>
    );
    detail = "Sent for manual review — usually resolved within 24 hours";
    action = null;
  } else if (status === "expired") {
    icon = <ShieldX className="h-5 w-5 text-red-600" />;
    statusBadge = (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium text-red-700 bg-red-100 border border-red-200">
        Expired
      </span>
    );
    detail = "This credential has expired — upload a renewed document.";
    action = (
      <DocumentUploader
        documentType={documentType}
        onSuccess={onRefresh}
        label="Renew ↑"
        allowExpiry={allowExpiry}
      />
    );
  }

  const showCountdown =
    status === "verified" && doc?.daysUntilExpiry != null && doc.daysUntilExpiry <= 30;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <p className="font-medium text-sm text-foreground">{label}</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {statusBadge}
            {action}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{detail}</p>
        {showCountdown && (
          <p
            className={`text-xs mt-1 font-medium ${doc!.daysUntilExpiry! <= 7 ? "text-red-600" : "text-amber-600"}`}
          >
            Expires in {doc!.daysUntilExpiry} day{doc!.daysUntilExpiry === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );
}

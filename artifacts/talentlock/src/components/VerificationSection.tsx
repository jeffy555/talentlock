import type { ReactNode } from "react";
import type { Query } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  useGetDocumentsMe,
  type DocumentMeItem,
  type DocumentsMeResponse,
  type DocumentType,
  type VerificationLevel,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  Clock,
  Shield,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import DocumentUploader from "@/components/DocumentUploader";
import { resolveVerificationLevel } from "@/lib/verification";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const DOCUMENT_TYPES: {
  type: DocumentType;
  label: string;
  hint: string;
}[] = [
  {
    type: "government_id",
    label: "Government ID",
    hint: "Passport, driving licence, or national ID",
  },
  {
    type: "professional_credential",
    label: "Professional Credential",
    hint: "Degree certificate, professional licence, or certification",
  },
];

function overallStatusBadge(level: VerificationLevel) {
  if (level === "fully_verified") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
        <ShieldCheck className="h-4 w-4" />
        Fully Verified
      </span>
    );
  }
  if (level === "partially_verified") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">
        <Shield className="h-4 w-4" />
        Partially Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full font-medium text-slate-500 bg-slate-100 border border-slate-200">
      <Shield className="h-4 w-4" />
      Not Verified
    </span>
  );
}

function DocumentRow({
  label,
  hint,
  documentType,
  doc,
  onRefresh,
}: {
  label: string;
  hint: string;
  documentType: DocumentType;
  doc?: DocumentMeItem;
  onRefresh: () => void;
}) {
  const status = doc?.status ?? "not_submitted";

  let icon = <Shield className="h-5 w-5 text-slate-300" />;
  let statusBadge = (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium text-slate-400 bg-slate-100 border border-slate-200">
      Not submitted
    </span>
  );
  let detail = hint;
  let action: ReactNode = (
    <DocumentUploader documentType={documentType} onSuccess={onRefresh} label="Upload ↑" />
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
      <DocumentUploader documentType={documentType} onSuccess={onRefresh} label="Re-upload ↑" />
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
    detail = "This credential has expired — upload a renewed document to restore your verified status.";
    action = (
      <DocumentUploader documentType={documentType} onSuccess={onRefresh} label="Renew ↑" />
    );
  }

  const showCountdown = status === "verified" && doc?.daysUntilExpiry != null && doc.daysUntilExpiry <= 30;

  return (
    <div className="flex items-start gap-3 py-4 border-b border-border/50 last:border-0">
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
          <p className={`text-xs mt-1 font-medium ${doc!.daysUntilExpiry! <= 7 ? "text-red-600" : "text-amber-600"}`}>
            Expires in {doc!.daysUntilExpiry} day{doc!.daysUntilExpiry === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );
}

function documentsRefetchInterval(query: Query<DocumentsMeResponse>): number | false {
  const docs = query.state.data?.documents ?? [];
  return docs.some((d) => d.status === "pending") ? 3000 : false;
}

export default function VerificationSection() {
  const { data, isLoading, isError, refetch } = useGetDocumentsMe({
    query: {
      refetchInterval: documentsRefetchInterval,
    } as any,
  });

  const level = resolveVerificationLevel({ verificationLevel: data?.verificationLevel });
  const docMap = new Map((data?.documents ?? []).map((d) => [d.documentType, d]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Identity Verification</CardTitle>
        <CardDescription>
          Submit documents to earn a Verified badge on your profile and build trust with employers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Overall status:</span>
          {isLoading ? (
            <Skeleton className="h-7 w-36 rounded-full" />
          ) : (
            overallStatusBadge(level)
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">Could not load verification status.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div>
            {DOCUMENT_TYPES.map((item) => (
              <DocumentRow
                key={item.type}
                label={item.label}
                hint={item.hint}
                documentType={item.type}
                doc={docMap.get(item.type)}
                onRefresh={() => refetch()}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

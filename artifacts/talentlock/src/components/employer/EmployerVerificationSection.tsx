import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import {
  useGetEmployerDocumentsMe,
  usePostEmployerDocumentsConfirm,
  usePostEmployerDocumentsUploadUrl,
  type EmployerDocumentType,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EMPLOYER_DOCUMENT_DEFINITIONS } from "@/lib/employerDocuments";

const DOCUMENTS = EMPLOYER_DOCUMENT_DEFINITIONS;

type Status = "pending" | "verified" | "rejected" | "needs_review" | "not_uploaded";

function StatusPill({ status }: { status: Status }) {
  const config = {
    pending: ["Under review", "border-amber-200 bg-amber-50 text-amber-700"],
    needs_review: ["Needs review", "border-amber-300 bg-amber-50 text-amber-700"],
    verified: ["Verified", "border-emerald-200 bg-emerald-50 text-emerald-700"],
    rejected: ["Action required", "border-red-200 bg-red-50 text-red-700"],
    not_uploaded: ["Not uploaded", "border-slate-200 bg-slate-100 text-slate-500"],
  }[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs", config[1])}>
      {status === "pending" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "verified" && <CheckCircle2 className="h-3 w-3" />}
      {status === "rejected" && <XCircle className="h-3 w-3" />}
      {config[0]}
    </span>
  );
}

export function EmployerVerificationSection() {
  const { toast } = useToast();
  const documentsQuery = useGetEmployerDocumentsMe();
  const uploadUrl = usePostEmployerDocumentsUploadUrl();
  const confirm = usePostEmployerDocumentsConfirm();
  const [uploadingType, setUploadingType] = useState<EmployerDocumentType | null>(null);
  const response = documentsQuery.data;
  const documentByType = new Map((response?.documents ?? []).map((doc) => [doc.documentType, doc]));
  const level = response?.verificationLevel ?? "unverified";

  async function handleUpload(documentType: EmployerDocumentType, file: File) {
    setUploadingType(documentType);
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Unsupported file type");
      }
      const { uploadUrl: signedUrl, fileUrl } = await uploadUrl.mutateAsync({
        data: {
          documentType,
          filename: file.name,
          mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
        },
      });
      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadResponse.ok) throw new Error("GCS upload failed");
      await confirm.mutateAsync({ data: { documentType, fileUrl } });
      await documentsQuery.refetch();
      toast({ title: "Document uploaded", description: "We will review it shortly." });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploadingType(null);
    }
  }

  return (
    <Card id="verification">
      <CardHeader>
        <CardTitle>Business Verification</CardTitle>
        <CardDescription>Build trust with freelancers by verifying your organisation.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p><span className="font-semibold">AI document review is for platform trust purposes only.</span>{" "}
            It does not constitute legal identity or KYC verification. Documents are reviewed by our team and are never shared with freelancers.</p>
        </div>

        <div className="mb-5 flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Overall status</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {level === "fully_verified"
                ? "Your required business documents are verified."
                : level === "partially_verified"
                  ? "Upload your company registration and tax certificate to become Fully Verified."
                  : "Start with your Representative ID to become Partially Verified."}
            </p>
          </div>
          <span className={cn(
            "rounded-full border px-3 py-1 text-sm font-medium",
            level === "fully_verified" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            level === "partially_verified" && "border-amber-200 bg-amber-50 text-amber-700",
            level === "unverified" && "border-slate-200 bg-slate-100 text-slate-500",
          )}>
            {level === "fully_verified" ? "✓ Fully Verified" : level === "partially_verified" ? "◐ Partially Verified" : "○ Unverified"}
          </span>
        </div>

        {documentsQuery.isLoading ? (
          <div className="space-y-4">{DOCUMENTS.map((doc) => <div key={doc.type} className="h-16 animate-pulse rounded bg-muted" />)}</div>
        ) : documentsQuery.isError ? (
          <p className="py-6 text-sm text-destructive">Could not load verification status. Try again.</p>
        ) : (
          <div className="divide-y divide-border">
            {DOCUMENTS.map((definition) => {
              const document = documentByType.get(definition.type);
              const status = (document?.status as Status | undefined) ?? "not_uploaded";
              const isUploading = uploadingType === definition.type;
              return (
                <div key={definition.type} className="flex items-start gap-3 py-4">
                  <div className="mt-0.5 shrink-0 text-muted-foreground">
                    {status === "verified" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      : status === "rejected" ? <XCircle className="h-5 w-5 text-red-500" />
                        : status === "pending" ? <Clock className="h-5 w-5 text-amber-500" />
                          : status === "needs_review" ? <AlertCircle className="h-5 w-5 text-amber-500" />
                            : <Circle className="h-5 w-5 text-slate-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{definition.label}</span>
                      {definition.required && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Required</span>}
                      <StatusPill status={status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{definition.description}</p>
                    {document?.employerNotes && status !== "pending" && <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{document.employerNotes}</p>}
                  </div>
                  {(status === "not_uploaded" || status === "rejected") && (
                    <label className={cn(
                      "shrink-0 cursor-pointer rounded border px-3 py-1.5 text-xs font-medium",
                      status === "rejected" ? "border-red-200 bg-red-50 text-red-700" : "border-slate-800 bg-slate-800 text-white",
                    )}>
                      {isUploading ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Uploading...</span> : status === "rejected" ? "Re-upload →" : "Upload →"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={isUploading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleUpload(definition.type, file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-5 text-xs text-muted-foreground">Upload as a JPEG, PNG, or WebP image (photograph or scan of your document).</p>
      </CardContent>
    </Card>
  );
}

export default EmployerVerificationSection;

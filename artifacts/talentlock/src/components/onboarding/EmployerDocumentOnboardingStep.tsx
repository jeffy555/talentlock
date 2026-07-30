import { useEffect, useState } from "react";
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  FileCheck,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  useGetEmployerDocumentsMe,
  usePostEmployerDocumentsConfirm,
  usePostEmployerDocumentsUploadUrl,
  type EmployerDocumentType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EMPLOYER_DOCUMENT_DEFINITIONS } from "@/lib/employerDocuments";

type DocStatus = "pending" | "verified" | "rejected" | "needs_review" | "not_uploaded";

/** Onboarding only needs Aadhaar (+ optional other ID); full set remains on Profile. */
const ONBOARDING_DOCS = EMPLOYER_DOCUMENT_DEFINITIONS.filter(
  (d) => d.type === "aadhaar" || d.type === "representative_id",
);

export interface EmployerDocumentOnboardingStepProps {
  embedded?: boolean;
  onContinue?: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
  onReadyChange?: (ready: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  ensureProfile?: () => Promise<void>;
}

export function EmployerDocumentOnboardingStep({
  embedded = false,
  onContinue,
  onBack,
  isSubmitting,
  onReadyChange,
  onBusyChange,
  ensureProfile,
}: EmployerDocumentOnboardingStepProps) {
  const { toast } = useToast();
  const documentsQuery = useGetEmployerDocumentsMe();
  const uploadUrl = usePostEmployerDocumentsUploadUrl();
  const confirm = usePostEmployerDocumentsConfirm();
  const [uploadingType, setUploadingType] = useState<EmployerDocumentType | null>(null);

  const documentByType = new Map(
    (documentsQuery.data?.documents ?? []).map((doc) => [doc.documentType, doc]),
  );
  const hasUploadedAadhaar = documentByType.has("aadhaar");
  const definitions = embedded ? ONBOARDING_DOCS : EMPLOYER_DOCUMENT_DEFINITIONS;

  useEffect(() => {
    onReadyChange?.(hasUploadedAadhaar);
  }, [hasUploadedAadhaar, onReadyChange]);

  useEffect(() => {
    onBusyChange?.(!!uploadingType);
  }, [uploadingType, onBusyChange]);

  async function handleUpload(documentType: EmployerDocumentType, file: File) {
    setUploadingType(documentType);
    try {
      if (ensureProfile) await ensureProfile();
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
      if (!uploadResponse.ok) {
        throw new Error(`Storage upload failed (${uploadResponse.status})`);
      }
      await confirm.mutateAsync({ data: { documentType, fileUrl } });
      if (documentType === "aadhaar") {
        onReadyChange?.(true);
      }
      await documentsQuery.refetch();
      toast({
        title: "Document uploaded",
        description:
          documentType === "aadhaar"
            ? "Aadhaar submitted. You can finish registration now."
            : "We will review it shortly.",
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message === "Unsupported file type"
          ? "Please upload a JPEG, PNG, or WebP image."
          : err instanceof Error && err.message
            ? err.message
            : "Please try again.";
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    } finally {
      setUploadingType(null);
    }
  }

  const body = (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p>
            <span className="font-semibold">Aadhaar card is required</span> to finish registration.
            You can add company documents later from your profile.
          </p>
        </div>
      )}

      {documentsQuery.isLoading ? (
        <div className="space-y-4">
          {definitions.map((doc) => (
            <div key={doc.type} className="h-16 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {documentsQuery.isError && (
            <p className="text-xs text-muted-foreground">
              Upload will save your company profile first if needed, then store your document.
            </p>
          )}
          <div className="divide-y divide-border rounded-lg border border-border">
          {definitions.map((definition) => {
            const document = documentByType.get(definition.type);
            const status: DocStatus = (document?.status as DocStatus | undefined) ?? "not_uploaded";
            const isUploading = uploadingType === definition.type;

            return (
              <div key={definition.type} className="flex items-start gap-3 p-4">
                <div className="mt-0.5 shrink-0 text-muted-foreground">
                  {status === "verified" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : status === "rejected" ? (
                    <XCircle className="h-5 w-5 text-red-500" />
                  ) : status === "pending" ? (
                    <Clock className="h-5 w-5 text-amber-500" />
                  ) : status === "needs_review" ? (
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{definition.label}</span>
                    {definition.type === "aadhaar" && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Required
                      </span>
                    )}
                    {status !== "not_uploaded" && (
                      <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        Uploaded
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{definition.description}</p>
                </div>
                {(status === "not_uploaded" || status === "rejected") && (
                  <label
                    className={cn(
                      "shrink-0 cursor-pointer rounded border px-3 py-1.5 text-xs font-medium",
                      status === "rejected"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-slate-800 bg-slate-800 text-white hover:bg-slate-700",
                    )}
                  >
                    {isUploading ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Uploading…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Upload className="h-3 w-3" />
                        {status === "rejected" ? "Re-upload" : "Upload"}
                      </span>
                    )}
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
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        JPEG, PNG, or WebP image (photograph or scan of your document).
      </p>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <FileCheck className="h-5 w-5 text-primary" />
            Identity Verification
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Aadhaar is required to finish registration. Other documents can be added later from Profile.
          </p>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-primary" />
          Business Verification
        </CardTitle>
        <CardDescription>
          Upload at least one document so freelancers can trust who they are working with.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
      <CardFooter className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting || !!uploadingType}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!hasUploadedAadhaar || isSubmitting || !!uploadingType}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Finishing…
            </>
          ) : (
            "Finish registration →"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

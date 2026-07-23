import { useRef, useState } from "react";
import {
  usePostAgreementsUploadUrl,
  usePostAgreementsUploadConfirm,
} from "@workspace/api-client-react";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
] as const;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function resolveMimeType(file: File): string | null {
  if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt")) return "text/plain";
  return null;
}

type UploadStep = "idle" | "preparing" | "uploading" | "processing" | "error";

function uploadWithProgress(
  file: File,
  uploadUrl: string,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

export interface EmployerAgreementUploadPanelProps {
  bookingId: number;
  disabled?: boolean;
  onSuccess: (agreementId: number) => void;
  onError?: (message: string) => void;
}

export default function EmployerAgreementUploadPanel({
  bookingId,
  disabled = false,
  onSuccess,
  onError,
}: EmployerAgreementUploadPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadUrlMutation = usePostAgreementsUploadUrl();
  const confirmMutation = usePostAgreementsUploadConfirm();

  const [step, setStep] = useState<UploadStep>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const isBusy = step !== "idle" && step !== "error";

  const handleFile = async (file: File) => {
    setErrorMessage(null);
    const mimeType = resolveMimeType(file);
    if (!mimeType) {
      const msg = "Only PDF, DOCX, DOC, or TXT files are accepted.";
      setErrorMessage(msg);
      setStep("error");
      onError?.(msg);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const msg = "File must be 10MB or smaller.";
      setErrorMessage(msg);
      setStep("error");
      onError?.(msg);
      return;
    }

    try {
      setStep("preparing");
      const { uploadUrl, storagePath } = await uploadUrlMutation.mutateAsync({
        data: {
          bookingId,
          filename: file.name,
          mimeType,
          fileSize: file.size,
        },
      });

      setStep("uploading");
      setProgress(0);
      await uploadWithProgress(file, uploadUrl, mimeType, setProgress);

      setStep("processing");
      const agreement = await confirmMutation.mutateAsync({
        data: {
          bookingId,
          storagePath,
          filename: file.name,
          mimeType,
        },
      });

      onSuccess(agreement.id);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Upload failed. Please try again.";
      setErrorMessage(msg);
      setStep("error");
      onError?.(msg);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const stepLabel =
    step === "preparing" ? "Preparing upload…" :
    step === "uploading" ? "Uploading…" :
    step === "processing" ? "Extracting text and generating summary…" :
    null;

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" && !isBusy && !disabled) fileRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (isBusy || disabled) return;
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        onClick={() => { if (!isBusy && !disabled) fileRef.current?.click(); }}
        className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/40"
        } ${disabled || isBusy ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {isBusy ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">{stepLabel}</p>
            {step === "uploading" && <Progress value={progress} className="w-full max-w-xs" />}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Upload your agreement</p>
            <p className="text-xs text-muted-foreground">PDF, DOCX, or TXT — max 10 MB</p>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {step === "error" && (
        <Button variant="outline" size="sm" onClick={() => { setStep("idle"); setErrorMessage(null); }}>
          Try again
        </Button>
      )}
    </div>
  );
}

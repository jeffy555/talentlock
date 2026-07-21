import { useRef, useState } from "react";
import {
  usePostDocumentsConfirm,
  usePostDocumentsUploadUrl,
  type DocumentType,
} from "@workspace/api-client-react";
import { AlertCircle, CheckCircle, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/x-pdf"];
const INVALID_FILE_TYPE_ERROR = "Only JPEG, PNG, WebP, and PDF files are accepted.";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function resolveMimeType(file: File): string | null {
  if (file.type === "application/x-pdf") return "application/pdf";
  if (ALLOWED_MIME_TYPES.includes(file.type)) {
    return file.type === "application/x-pdf" ? "application/pdf" : file.type;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (/\.jpe?g$/.test(lower)) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

type UploadStep = "idle" | "preparing" | "uploading" | "saving" | "success" | "error";

export interface DocumentUploaderProps {
  documentType: DocumentType;
  onSuccess: () => void;
  disabled?: boolean;
  variant?: "outline" | "ghost";
  label?: string;
}

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

export default function DocumentUploader({
  documentType,
  onSuccess,
  disabled = false,
  variant = "outline",
  label = "Upload ↑",
}: DocumentUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadUrlMutation = usePostDocumentsUploadUrl();
  const confirmMutation = usePostDocumentsConfirm();

  const [step, setStep] = useState<UploadStep>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState("");

  const reset = () => {
    setStep("idle");
    setProgress(0);
    setErrorMessage(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage("File must be 10MB or smaller.");
      setStep("error");
      return;
    }
    const mimeType = resolveMimeType(file);
    if (!mimeType) {
      setErrorMessage(INVALID_FILE_TYPE_ERROR);
      setStep("error");
      return;
    }

    try {
      setStep("preparing");
      setErrorMessage(null);
      const { uploadUrl, storagePath } = await uploadUrlMutation.mutateAsync({
        data: { documentType, mimeType, fileSize: file.size },
      });

      setStep("uploading");
      setProgress(0);
      await uploadWithProgress(file, uploadUrl, mimeType, setProgress);

      setStep("saving");
      await confirmMutation.mutateAsync({
        data: {
          documentType,
          storagePath,
          expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
        },
      });

      setStep("success");
      onSuccess();
      setTimeout(reset, 1500);
    } catch (err: unknown) {
      const body = (err as { data?: { error?: string } })?.data;
      setErrorMessage(body?.error ?? "Upload failed.");
      setStep("error");
    }
  };

  if (step === "preparing") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing upload...
      </div>
    );
  }

  if (step === "uploading") {
    return (
      <div className="min-w-[140px] space-y-1.5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading... {progress}%
        </div>
        <Progress value={progress} className="h-1.5 [&>div]:bg-blue-500" />
      </div>
    );
  }

  if (step === "saving") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Saving...
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle className="h-4 w-4" />
        Uploaded! AI review in progress...
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{errorMessage ?? "Upload failed."}</span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      {documentType === "professional_credential" && (
        <div className="space-y-1 mb-2">
          <Label htmlFor={`expiry-${documentType}`} className="text-xs text-muted-foreground">
            Expiry date (optional)
          </Label>
          <Input
            id={`expiry-${documentType}`}
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="h-8 text-sm w-40"
          />
        </div>
      )}
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={disabled}
        className="gap-1.5"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" />
        {label}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </>
  );
}

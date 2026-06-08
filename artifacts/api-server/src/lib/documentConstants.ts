export const DOCUMENT_TYPES = [
  "government_id",
  "professional_credential",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = [
  "pending",
  "verified",
  "rejected",
  "needs_review",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const ALLOWED_FILE_TYPES_LABEL = "JPEG, PNG, WebP, and PDF";

export const INVALID_FILE_TYPE_ERROR = `Only ${ALLOWED_FILE_TYPES_LABEL} files are accepted.`;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const MIME_TO_EXT: Record<(typeof ALLOWED_MIME_TYPES)[number], string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export function isAllowedDocumentMimeType(mimeType: string): boolean {
  return (
    (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType) ||
    mimeType === "application/x-pdf"
  );
}

export function isPdfStoragePath(storagePath: string): boolean {
  return storagePath.toLowerCase().endsWith(".pdf");
}

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function buildDocumentStoragePath(
  userId: number,
  documentType: DocumentType,
  filename: string,
): string {
  return `documents/${userId}/${documentType}/${filename}`;
}

export function isValidDocumentStoragePath(
  storagePath: string,
  userId: number,
  documentType: DocumentType,
): boolean {
  const prefix = `documents/${userId}/${documentType}/`;
  if (!storagePath.startsWith(prefix)) return false;
  const filename = storagePath.slice(prefix.length);
  return filename.length > 0 && !filename.includes("..") && !filename.includes("/");
}

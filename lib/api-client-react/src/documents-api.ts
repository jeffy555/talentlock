import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";

import { customFetch } from "./custom-fetch";

export type VerificationLevel = "unverified" | "partially_verified" | "fully_verified";
export type DocumentType = "government_id" | "professional_credential";

export interface DocumentMeItem {
  documentType: string;
  status: string;
  confidence: number | null;
  aiNotes: string | null;
  adminNotes: string | null;
  updatedAt: string;
}

export interface DocumentsMeResponse {
  verificationLevel: VerificationLevel;
  documents: DocumentMeItem[];
}

export interface DocumentsUploadUrlBody {
  documentType: DocumentType;
  mimeType: string;
  fileSize: number;
}

export interface DocumentsUploadUrlResponse {
  uploadUrl: string;
  storagePath: string;
}

export interface DocumentsConfirmBody {
  documentType: DocumentType;
  storagePath: string;
}

export interface FreelancerVerification {
  level: VerificationLevel;
  verifiedDocumentCount: number;
}

export interface FreelancerProfileDetail {
  verification?: FreelancerVerification;
  verificationLevel?: VerificationLevel;
  email?: string | null;
}

const DOCUMENTS_ME_KEY = ["/api/documents/me"] as const;

export async function getDocumentsMe(options?: RequestInit): Promise<DocumentsMeResponse> {
  return customFetch<DocumentsMeResponse>("/api/documents/me", {
    ...options,
    method: "GET",
  });
}

export function useGetDocumentsMe(options?: {
  query?: Omit<UseQueryOptions<DocumentsMeResponse>, "queryKey" | "queryFn">;
}) {
  return useQuery({
    queryKey: DOCUMENTS_ME_KEY,
    queryFn: ({ signal }) => getDocumentsMe({ signal }),
    ...options?.query,
  });
}

export async function postDocumentsUploadUrl(
  body: DocumentsUploadUrlBody,
): Promise<DocumentsUploadUrlResponse> {
  return customFetch<DocumentsUploadUrlResponse>("/api/documents/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function usePostDocumentsUploadUrl(
  options?: UseMutationOptions<DocumentsUploadUrlResponse, Error, DocumentsUploadUrlBody>,
) {
  return useMutation({
    mutationFn: (body) => postDocumentsUploadUrl(body),
    ...options,
  });
}

export async function postDocumentsConfirm(
  body: DocumentsConfirmBody,
): Promise<{ status: string }> {
  return customFetch<{ status: string }>("/api/documents/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function usePostDocumentsConfirm(
  options?: UseMutationOptions<{ status: string }, Error, DocumentsConfirmBody>,
) {
  return useMutation({
    mutationFn: (body) => postDocumentsConfirm(body),
    ...options,
  });
}

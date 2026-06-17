import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { ObjectStorageService } from "./objectStorage";
import { ensureDancingScriptFont } from "./agreementPdfFonts";

export interface AgreementPdfData {
  agreementId: string;
  generatedAt: string;
  employerDisplayName: string;
  employerCompany: string;
  employerSignatureUrl: string | null;
  employerTypedName: string | null;
  employerSignedAt: string;
  freelancerDisplayName: string;
  freelancerField: string;
  freelancerSignatureUrl: string | null;
  freelancerTypedName: string | null;
  freelancerSignedAt: string;
  contentParagraphs: string[];
}

export function preprocessAgreementContent(content: string): string[] {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/\r\n/g, "\n")
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function formatSignedAt(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";

  const datePart = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${datePart} at ${timePart} UTC`;
}

export async function resolveSignatureImageUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored?.trim()) return null;
  const url = stored.trim();
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  let relativeKey = url;
  if (url.startsWith("/objects/")) {
    relativeKey = url.slice("/objects/".length);
  }

  try {
    const objectStorageService = new ObjectStorageService();
    return await objectStorageService.getSignedReadUrlForKey(relativeKey, 3600);
  } catch {
    return null;
  }
}

export async function generateAgreementPdf(data: AgreementPdfData): Promise<Buffer> {
  ensureDancingScriptFont();
  const { AgreementPdf } = await import("./agreementPdfTemplate");
  const element = React.createElement(AgreementPdf, { data }) as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}

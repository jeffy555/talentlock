import { createRequire } from "node:module";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const _mammothMod = require("mammoth");
const mammoth = (_mammothMod.default ?? _mammothMod) as {
  extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
};

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
] as const;

export type AgreementDocumentMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedAgreementMimeType(mime: string): mime is AgreementDocumentMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

export async function extractDocumentText(file: Express.Multer.File): Promise<string> {
  const mime = file.mimetype;
  if (mime === "application/pdf") {
    const { PDFParse } = require("pdf-parse") as {
      PDFParse: new (opts: { url: string }) => { getText: () => Promise<{ text: string }> };
    };
    const tmp = join(tmpdir(), `agreement-${Date.now()}.pdf`);
    try {
      writeFileSync(tmp, file.buffer);
      const parser = new PDFParse({ url: `file://${tmp}` });
      const result = await parser.getText();
      return result.text;
    } finally {
      try { unlinkSync(tmp); } catch { /* ignore */ }
    }
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }
  return file.buffer.toString("utf-8");
}

export async function extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  const fakeFile = { buffer, mimetype: mimeType } as Express.Multer.File;
  return extractDocumentText(fakeFile);
}

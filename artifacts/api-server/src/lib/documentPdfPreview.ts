import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type PdfScreenshotPage = { dataUrl?: string };
type PdfParser = {
  getScreenshot: (params?: {
    partial?: number[];
    scale?: number;
    imageDataUrl?: boolean;
    imageBuffer?: boolean;
  }) => Promise<{ pages: PdfScreenshotPage[] }>;
  destroy: () => Promise<void>;
};

const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer }) => PdfParser;
};

/** Render the first page of a PDF to a PNG data URL for OpenAI vision review. */
export async function pdfFirstPageDataUrl(pdfBuffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const result = await parser.getScreenshot({
      partial: [1],
      scale: 1.5,
      imageDataUrl: true,
      imageBuffer: false,
    });
    const dataUrl = result.pages[0]?.dataUrl;
    if (!dataUrl) {
      throw new Error("Failed to render PDF first page");
    }
    return dataUrl;
  } finally {
    await parser.destroy();
  }
}

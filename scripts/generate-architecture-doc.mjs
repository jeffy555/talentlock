#!/usr/bin/env node
/**
 * Renders docs/TalentLock-Technical-Architecture.html to a print-ready PDF.
 *
 * Two passes are required because Chromium paints header/footer templates on
 * every page and offers no way to suppress them on the first one:
 *
 *   pass 1  .only-cover  zero margins, no chrome  -> full-bleed cover sheet
 *   pass 2  .no-cover    reserved margins + chrome -> numbered body pages
 *
 * The passes are concatenated with `pdfunite`. Body pages carry the visible
 * numbering (the cover is unnumbered front matter), so the contents listing
 * refers to body page numbers.
 *
 * Run: node scripts/generate-architecture-doc.mjs
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(root, "docs/TalentLock-Technical-Architecture.html");
const pdfPath = join(root, "docs/TalentLock-Technical-Architecture.pdf");

const NAVY = "#0C1E33";
const GRAY = "#8496A9";
const TEAL = "#0D9488";
const LINE = "#DBE3EC";
const FONTS = "'Inter','Helvetica Neue',Arial,sans-serif";

const headerTemplate = `
<div style="font-family:${FONTS};font-size:7pt;color:${GRAY};width:100%;
            padding:0 18mm;margin-top:8mm;display:flex;align-items:baseline;
            justify-content:space-between;border-bottom:.5pt solid ${LINE};
            padding-bottom:2.5mm;letter-spacing:.055em;text-transform:uppercase;
            font-weight:600;">
  <span>TalentLock &middot; System Architecture &amp; Component Reference</span>
  <span style="color:${TEAL};">Confidential</span>
</div>`;

const footerTemplate = `
<div style="font-family:${FONTS};font-size:7pt;color:${GRAY};width:100%;
            padding:0 18mm;margin-bottom:7mm;display:flex;align-items:center;
            justify-content:space-between;border-top:.5pt solid ${LINE};
            padding-top:2.5mm;">
  <span style="letter-spacing:.05em;">main &#64; 23d405b</span>
  <span style="color:${NAVY};font-weight:600;letter-spacing:.06em;font-size:6.6pt;
               text-transform:uppercase;">Architecture Reference</span>
  <span style="font-weight:700;color:${NAVY};font-size:7.6pt;">
    <span class="pageNumber"></span><span style="color:${TEAL};margin:0 1.5mm;">/</span><span class="totalPages"></span>
  </span>
</div>`;

const work = mkdtempSync(join(tmpdir(), "tl-arch-"));
const coverPdf = join(work, "cover.pdf");
const bodyPdf = join(work, "body.pdf");
const mergedPdf = join(work, "merged.pdf");

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });

  // Pass 1 — full-bleed cover, no running chrome.
  await page.evaluate(() => {
    document.body.classList.add("only-cover");
    document.body.classList.remove("no-cover");
  });
  await page.pdf({
    path: coverPdf,
    format: "A4",
    printBackground: true,
    margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
  });

  // Pass 2 — numbered body.
  await page.evaluate(() => {
    document.body.classList.remove("only-cover");
    document.body.classList.add("no-cover");
  });
  await page.pdf({
    path: bodyPdf,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
    margin: { top: "17mm", bottom: "16mm", left: "0mm", right: "0mm" },
  });
} finally {
  await browser.close();
}

execFileSync("pdfunite", [coverPdf, bodyPdf, mergedPdf]);
copyFileSync(mergedPdf, pdfPath);
rmSync(work, { recursive: true, force: true });

const pages = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" })
  .split("\n")
  .find((l) => l.startsWith("Pages:"));

console.log(`PDF written to ${pdfPath} (${pages?.trim() ?? "page count unavailable"})`);

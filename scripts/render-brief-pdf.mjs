#!/usr/bin/env node
/**
 * Renders a docs/<slug>.html brief to a print-ready docs/<slug>.pdf.
 *
 * Two passes are required because Chromium paints header/footer templates on
 * every page and offers no way to suppress them on the first one:
 *
 *   pass 1  .only-cover  zero margins, no chrome  -> full-bleed cover sheet
 *   pass 2  .no-cover    reserved margins + chrome -> numbered body pages
 *
 * The passes are concatenated with `pdfunite`. Body pages carry the visible
 * numbering (the cover is unnumbered front matter), so a document's contents
 * listing refers to body page numbers.
 *
 * The accent colour used in the running footer is read from the document's own
 * `--accent-print` custom property so each brief's chrome matches its palette.
 *
 * Usage:
 *   node scripts/render-brief-pdf.mjs TalentLock-Commercial-Strategy \
 *     --title "TalentLock · Commercial Strategy & Sales Brief" \
 *     --tag "Commercial Strategy"
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const slug = process.argv[2];
if (!slug || slug.startsWith("--")) {
  console.error("Usage: node scripts/render-brief-pdf.mjs <slug> [--title T] [--tag T] [--accent #hex]");
  process.exit(1);
}

const htmlPath = join(root, `docs/${slug}.html`);
const pdfPath = join(root, `docs/${slug}.pdf`);
if (!existsSync(htmlPath)) {
  console.error(`No such document: ${htmlPath}`);
  process.exit(1);
}

const headerTitle = arg("title", `TalentLock · ${slug.replace(/^TalentLock-/, "").replace(/-/g, " ")}`);
const footerTag = arg("tag", "Reference");
const accent = arg("accent", "#B08422");
const revision = arg("rev", "main @ 23d405b");

const NAVY = "#0C1E33";
const GRAY = "#8496A9";
const LINE = "#DBE3EC";
const FONTS = "'Inter','Helvetica Neue',Arial,sans-serif";

const headerTemplate = `
<div style="font-family:${FONTS};font-size:7pt;color:${GRAY};width:100%;
            padding:0 18mm;margin-top:8mm;display:flex;align-items:baseline;
            justify-content:space-between;border-bottom:.5pt solid ${LINE};
            padding-bottom:2.5mm;letter-spacing:.055em;text-transform:uppercase;
            font-weight:600;">
  <span>${headerTitle}</span>
  <span style="color:${accent};">Confidential</span>
</div>`;

const footerTemplate = `
<div style="font-family:${FONTS};font-size:7pt;color:${GRAY};width:100%;
            padding:0 18mm;margin-bottom:7mm;display:flex;align-items:center;
            justify-content:space-between;border-top:.5pt solid ${LINE};
            padding-top:2.5mm;">
  <span style="letter-spacing:.05em;">${revision}</span>
  <span style="color:${NAVY};font-weight:600;letter-spacing:.06em;font-size:6.6pt;
               text-transform:uppercase;">${footerTag}</span>
  <span style="font-weight:700;color:${NAVY};font-size:7.6pt;">
    <span class="pageNumber"></span><span style="color:${accent};margin:0 1.5mm;">/</span><span class="totalPages"></span>
  </span>
</div>`;

const work = mkdtempSync(join(tmpdir(), "tl-brief-"));
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

console.log(`PDF written to docs/${slug}.pdf (${pages?.trim() ?? "page count unavailable"})`);

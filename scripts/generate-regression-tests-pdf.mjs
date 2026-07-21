#!/usr/bin/env node
/**
 * Generates spec/api-testing/regression-tests-guide.pdf from the HTML guide.
 * Run: node scripts/generate-regression-tests-pdf.mjs
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(root, "spec/api-testing/regression-tests-guide.html");
const pdfPath = join(root, "spec/api-testing/regression-tests-guide.pdf");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
});
await browser.close();

console.log(`PDF written to ${pdfPath}`);

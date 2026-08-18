#!/usr/bin/env node
/**
 * Dev-only visual check for the architecture brief. Rasterises the print
 * layout into A4-sized PNG slices under /tmp so the rendered result can be
 * inspected without a PDF viewer.
 *
 * Run: node scripts/preview-architecture-doc.mjs [maxPages]
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(root, "docs/TalentLock-Technical-Architecture.html");
const outDir = "/tmp/arch-preview";
const maxPages = Number(process.argv[2] ?? 6);

// A4 at 96dpi CSS pixels.
const A4_W = 794;
const A4_H = 1123;

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: A4_W, height: A4_H },
  deviceScaleFactor: 2,
});

await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.emulateMedia({ media: "print" });

const total = await page.evaluate(() => document.documentElement.scrollHeight);
const count = Math.min(Math.ceil(total / 1123), maxPages);

for (let i = 0; i < count; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), i * A4_H);
  await page.screenshot({ path: join(outDir, `p${String(i + 1).padStart(2, "0")}.png`) });
}

await browser.close();
console.log(`${count} preview page(s) written to ${outDir} (docHeight=${total}px)`);

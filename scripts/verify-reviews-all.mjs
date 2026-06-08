#!/usr/bin/env node
/** Run all Reviews & Ratings validation scripts and summarize. */
import { spawn } from "node:child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const scripts = [
  "verify-reviews-phase1.mjs",
  "verify-reviews-phase2.mjs",
  "verify-reviews-phase2-live.mjs",
  "verify-reviews-phase3.mjs",
  "verify-reviews-phase4.mjs",
];

function run(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(ROOT, "scripts", script)], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; process.stdout.write(d); });
    child.stderr.on("data", (d) => { out += d; process.stderr.write(d); });
    child.on("close", (code) => resolve({ script, code: code ?? 1, out }));
  });
}

console.log("=== Reviews & Ratings — Full Validation ===\n");
const results = [];
for (const s of scripts) {
  console.log(`\n--- ${s} ---\n`);
  results.push(await run(s));
}

const failed = results.filter((r) => r.code !== 0);
console.log("\n=== Summary ===");
for (const r of results) {
  console.log(`${r.code === 0 ? "✅" : "❌"} ${r.script}`);
}
if (failed.length) {
  console.log(`\n${failed.length} script(s) failed.`);
  process.exit(1);
}
console.log("\nAll automated checks passed.");
process.exit(0);

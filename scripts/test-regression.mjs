#!/usr/bin/env node
/**
 * Orchestrates legacy validate-*.mjs scripts until fully replaced by Vitest.
 * Vitest coverage map: artifacts/api-server/tests/regression/legacy-map.ts
 * Run: pnpm run test:validate
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCRIPTS = [
  "artifacts/api-server/validate-auth-hardening.mjs",
  "artifacts/api-server/validate-security-hardening.mjs",
  "artifacts/api-server/validate-product-gaps-utils.mjs",
  "lib/db/scripts/validate-product-gaps.mjs",
  "artifacts/api-server/validate-availability-calendar.mjs",
  "artifacts/api-server/validate-smart-rate-suggestions.mjs",
  "artifacts/api-server/validate-ai-proposal-generator.mjs",
  "artifacts/api-server/validate-team-accounts.mjs",
  "artifacts/api-server/validate-notification-scenario.mjs",
  "artifacts/api-server/validate-resend-booking-email.mjs",
  "artifacts/api-server/validate-resend-e2e.mjs",
  "scripts/validate-smarter-matching.mjs",
  "scripts/validate-per-conversation-token-breakdown.mjs",
  "scripts/validate-contract-health-score.mjs",
  "scripts/validate-agreement-redlining.mjs",
  "scripts/validate-agreement-ai-summary.mjs",
  "scripts/test-agreement-pdf-download.mjs",
  "scripts/verify-notifications-phase1.mjs",
  "scripts/verify-notifications-phase2.mjs",
  "scripts/verify-notifications-phase3.mjs",
  "scripts/verify-notifications-phase4.mjs",
  "scripts/verify-reviews-phase1.mjs",
  "scripts/verify-reviews-phase2.mjs",
  "scripts/verify-reviews-phase3.mjs",
  "scripts/verify-reviews-phase4.mjs",
  "scripts/verify-reviews-all.mjs",
  "scripts/verify-earnings-intelligence.mjs",
  "lib/db/scripts/verify-security-phase2.mjs",
];

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const list = only ? SCRIPTS.filter((s) => s.includes(only)) : SCRIPTS;

let failed = 0;
let skipped = 0;
console.log(`\n=== Legacy regression scripts (${list.length}) ===\n`);
console.log("Vitest ports: artifacts/api-server/tests/regression/legacy-map.ts\n");

for (const rel of list) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    skipped += 1;
    console.log(`SKIP  ${rel} — file not found`);
    continue;
  }
  console.log(`\n--- ${rel} ---\n`);
  const result = spawnSync("node", [path], { stdio: "inherit", cwd: root });
  if (result.status !== 0) {
    failed += 1;
    console.error(`FAILED: ${rel}`);
  }
}

console.log(`\n=== Done: ${list.length - failed - skipped}/${list.length} passed (${skipped} skipped) ===\n`);
process.exit(failed > 0 ? 1 : 0);

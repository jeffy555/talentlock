#!/usr/bin/env node
/**
 * Orchestrates legacy validate-*.mjs scripts until ported to Vitest.
 * Run: pnpm run test:validate
 * Requires: running API (localhost:8080), .env with DATABASE_URL + Clerk keys.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCRIPTS = [
  "artifacts/api-server/validate-auth-hardening.mjs",
  "artifacts/api-server/validate-security-hardening.mjs",
  "artifacts/api-server/validate-product-gaps-utils.mjs",
  "artifacts/api-server/validate-availability-calendar.mjs",
  "artifacts/api-server/validate-smart-rate-suggestions.mjs",
  "artifacts/api-server/validate-ai-proposal-generator.mjs",
  "artifacts/api-server/validate-team-accounts.mjs",
  "scripts/validate-smarter-matching.mjs",
  "scripts/validate-per-conversation-token-breakdown.mjs",
  "scripts/validate-contract-health-score.mjs",
  "scripts/validate-agreement-redlining.mjs",
  "scripts/validate-agreement-ai-summary.mjs",
];

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const list = only ? SCRIPTS.filter((s) => s.includes(only)) : SCRIPTS;

let failed = 0;
console.log(`\n=== Legacy regression scripts (${list.length}) ===\n`);

for (const rel of list) {
  const path = join(root, rel);
  console.log(`\n--- ${rel} ---\n`);
  const result = spawnSync("node", [path], { stdio: "inherit", cwd: root });
  if (result.status !== 0) {
    failed += 1;
    console.error(`FAILED: ${rel}`);
  }
}

console.log(`\n=== Done: ${list.length - failed}/${list.length} passed ===\n`);
process.exit(failed > 0 ? 1 : 0);

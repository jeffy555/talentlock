#!/usr/bin/env node
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const scripts = [
  "verify-notifications-phase1.mjs",
  "verify-notifications-phase2.mjs",
  "verify-notifications-phase3.mjs",
  "verify-notifications-phase4.mjs",
];

let allOk = true;
for (const script of scripts) {
  console.log(`\n--- ${script} ---`);
  const result = spawnSync("node", [join(dir, script)], { stdio: "inherit" });
  if (result.status !== 0) allOk = false;
}

console.log(allOk ? "\n✅ All notification validation scripts passed" : "\n❌ Some validation scripts failed");
process.exit(allOk ? 0 : 1);

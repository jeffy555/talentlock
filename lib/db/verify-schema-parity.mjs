#!/usr/bin/env node
/**
 * Pre-push schema reconciliation for Drizzle.
 *
 * Run before `pnpm --filter @workspace/db run push` to catch the common failure mode
 * where Neon already has columns from a prior feature push, but the local Drizzle
 * schema files on disk are stale (missing those columns). Drizzle-kit then proposes
 * dropping live data — always cancel and reconcile first.
 *
 * Usage:
 *   DATABASE_URL=... node lib/db/verify-schema-parity.mjs
 *   pnpm --filter @workspace/db run verify-schema
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.join(__dirname, "src", "schema");

/** Columns that must exist in BOTH local Drizzle schema files and (after push) Neon. */
const COLUMN_MANIFEST = [
  {
    feature: "Onboarding Scaffolding",
    table: "users",
    schemaFile: "users.ts",
    /** Drizzle TS property names that must appear in the schema file */
    schemaMarkers: ['onboardingRole: text("onboarding_role")', 'onboardingStep: text("onboarding_step")'],
    dbColumns: ["onboarding_role", "onboarding_step"],
  },
  {
    feature: "Credential Expiry Tracking",
    table: "documents",
    schemaFile: "documents.ts",
    schemaMarkers: ['expiryDate: timestamp("expiry_date"', 'expiryAlertStage: text("expiry_alert_stage")'],
    dbColumns: ["expiry_date", "expiry_alert_stage"],
  },
  {
    feature: "Credential Expiry Tracking",
    table: "freelancer_profiles",
    schemaFile: "freelancerProfiles.ts",
    schemaMarkers: ['teachingLicenceAlertStage: text("teaching_licence_alert_stage")'],
    dbColumns: ["teaching_licence_alert_stage"],
  },
  {
    feature: "Freelancer Watchlist",
    table: "saved_freelancers",
    schemaFile: "savedFreelancers.ts",
    schemaMarkers: ['notes: text("notes")', 'lastAlertAt: timestamp("last_alert_at"'],
    dbColumns: ["notes", "last_alert_at"],
    optionalInDb: false,
  },
];

function checkLocalSchema() {
  const failures = [];
  for (const entry of COLUMN_MANIFEST) {
    const filePath = path.join(schemaDir, entry.schemaFile);
    if (!existsSync(filePath)) {
      failures.push({ ...entry, reason: `schema file missing: ${entry.schemaFile}` });
      continue;
    }
    const content = readFileSync(filePath, "utf8");
    for (const marker of entry.schemaMarkers) {
      if (!content.includes(marker)) {
        failures.push({
          ...entry,
          reason: `local schema missing marker: ${marker}`,
        });
      }
    }
  }
  return failures;
}

async function checkDatabase(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const failures = [];
  const pending = [];

  try {
    for (const entry of COLUMN_MANIFEST) {
      for (const col of entry.dbColumns) {
        const { rows } = await client.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
          [entry.table, col],
        );
        if (rows.length === 0) {
          pending.push({ ...entry, column: col, reason: "column not yet in database (push will ADD)" });
        }
      }
    }
  } finally {
    await client.end();
  }

  return { failures, pending };
}

async function main() {
  console.log("TalentLock — schema parity check\n");

  const localFailures = checkLocalSchema();
  if (localFailures.length > 0) {
    console.error("❌ LOCAL SCHEMA OUT OF DATE\n");
    console.error("Your Drizzle schema files are missing columns that exist in Neon.");
    console.error("If you run `db push` now, Drizzle will try to DROP those DB columns.\n");
    for (const f of localFailures) {
      console.error(`  • [${f.feature}] ${f.table} — ${f.reason}`);
    }
    console.error("\nReconcile:");
    console.error("  1. git fetch origin && git checkout main && git pull");
    console.error("  2. git checkout <your-branch> && git merge origin/main");
    console.error("  3. Re-run this script until local schema passes");
    console.error("  4. Then run: pnpm --filter @workspace/db run push");
    console.error("\nDo NOT use push --force.\n");
    process.exit(1);
  }

  console.log("✅ Local Drizzle schema files include all required column markers.\n");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("ℹ️  DATABASE_URL not set — skipping live database check.");
    console.log("   Set DATABASE_URL and re-run to verify Neon before push.\n");
    process.exit(0);
  }

  const { pending } = await checkDatabase(dbUrl);

  if (pending.length > 0) {
    console.log("Pending additive migrations (safe to push):\n");
    for (const p of pending) {
      console.log(`  • [${p.feature}] ${p.table}.${p.column}`);
    }
    console.log("\nRun: pnpm --filter @workspace/db run push");
    console.log("Drizzle should only ADD columns — never confirm a drop prompt.\n");
  } else {
    console.log("✅ Database already has all manifest columns.");
    console.log("   No schema push required unless you changed schema since last push.\n");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

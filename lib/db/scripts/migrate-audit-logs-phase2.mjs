#!/usr/bin/env node
/**
 * Security Hardening Phase 2 — migrate audit_logs metadata text → jsonb
 * and add entity_type / entity_id before drizzle push.
 * Run: node lib/db/scripts/migrate-audit-logs-phase2.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const envPath = join(root, ".env");

for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type text`);
    await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id text`);

    const col = await pool.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'audit_logs'
        AND column_name = 'metadata'
    `);

    if (col.rows[0]?.data_type === "jsonb") {
      console.log("audit_logs.metadata is already jsonb — skipping type migration");
    } else {
      await pool.query(`
        ALTER TABLE audit_logs
        ALTER COLUMN metadata TYPE jsonb
        USING CASE
          WHEN metadata IS NULL OR metadata = '' THEN NULL
          ELSE metadata::jsonb
        END
      `);
      console.log("audit_logs.metadata migrated to jsonb");
    }

    console.log("Phase 2 audit_logs migration complete");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/** Phase 1 schema migration for Notifications Centre — entity_type/entity_id; drop title/link */
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../lib/db/package.json"));
const pg = require("pg");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  const exists = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications' LIMIT 1`,
  );
  if (exists.rows.length === 0) {
    console.log("notifications table does not exist — run pnpm --filter @workspace/db run push");
    process.exit(0);
  }

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name IN ('entity_type', 'title')
  `);
  const names = cols.rows.map((r) => r.column_name);
  if (names.includes("entity_type") && !names.includes("title")) {
    console.log("Already migrated — entity_type present, title absent");
    process.exit(0);
  }

  console.log("Adding entity_type, entity_id...");
  await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type text`);
  await client.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id text`);

  console.log("Backfilling from link column...");
  await client.query(`
    UPDATE notifications SET
      entity_type = 'booking',
      entity_id = regexp_replace(link, '^/bookings/', ''),
      type = CASE WHEN type = 'booking_update' THEN 'booking_created' ELSE type END
    WHERE link LIKE '/bookings/%' AND (entity_type IS NULL OR entity_id IS NULL)
  `);
  await client.query(`
    UPDATE notifications SET
      entity_type = 'job',
      entity_id = regexp_replace(link, '^/jobs/', '')
    WHERE link LIKE '/jobs/%' AND (entity_type IS NULL OR entity_id IS NULL)
  `);
  await client.query(`
    UPDATE notifications SET entity_type = 'booking', entity_id = '0'
    WHERE entity_type IS NULL OR entity_id IS NULL
  `);

  console.log("Dropping legacy columns title, link...");
  await client.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS title`);
  await client.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS link`);

  await client.query(`ALTER TABLE notifications ALTER COLUMN entity_type SET NOT NULL`);
  await client.query(`ALTER TABLE notifications ALTER COLUMN entity_id SET NOT NULL`);

  console.log("Migration complete.");
} finally {
  client.release();
  await pool.end();
}

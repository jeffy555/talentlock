#!/usr/bin/env node
/**
 * Phase 1 schema migration for Reviews & Ratings.
 * Drops legacy reviews table shape (empty) so drizzle push can recreate spec schema.
 */
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
  const tableExists = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews' LIMIT 1`,
  );
  if (tableExists.rows.length > 0) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS c FROM reviews`);
    const count = rows[0]?.c ?? 0;
    if (count > 0) {
      console.error(`Refusing to drop reviews table: ${count} row(s) exist. Back up and migrate manually.`);
      process.exit(1);
    }
    console.log("Dropping legacy reviews table (empty)...");
    await client.query(`DROP TABLE IF EXISTS reviews CASCADE`);
  }

  console.log("Creating reviews table (spec schema)...");
  await client.query(`
    CREATE TABLE reviews (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      employer_id INTEGER NOT NULL REFERENCES users(id),
      freelancer_id INTEGER NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL,
      comment TEXT,
      reply TEXT,
      replied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT reviews_booking_uq UNIQUE (booking_id)
    )
  `);
  await client.query(`CREATE INDEX reviews_freelancer_idx ON reviews (freelancer_id)`);
  await client.query(`CREATE INDEX reviews_booking_idx ON reviews (booking_id)`);

  console.log("Adding rating columns to freelancer_profiles...");
  await client.query(`
    ALTER TABLE freelancer_profiles
      ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3, 2),
      ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0
  `);

  console.log("Phase 1 schema applied.");
} finally {
  client.release();
  await pool.end();
}

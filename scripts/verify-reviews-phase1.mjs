#!/usr/bin/env node
/** Validation checks V1.1–V1.3 from spec/ReviewRatings/validation.md */
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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
let pass = 0;
let fail = 0;

function ok(id, msg) { pass++; console.log(`✅ ${id} — ${msg}`); }
function bad(id, msg) { fail++; console.log(`❌ ${id} — ${msg}`); }

try {
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'reviews'
    ORDER BY ordinal_position
  `);
  const names = cols.rows.map((r) => r.column_name);
  const expected = ["id", "booking_id", "employer_id", "freelancer_id", "rating", "comment", "reply", "replied_at", "created_at"];
  if (expected.every((c) => names.includes(c))) ok("V1.1", `reviews columns: ${names.join(", ")}`);
  else bad("V1.1", `missing columns; got ${names.join(", ")}`);

  const ratingCol = cols.rows.find((r) => r.column_name === "rating");
  if (ratingCol?.is_nullable === "NO") ok("V1.1b", "rating NOT NULL");
  else bad("V1.1b", "rating should be NOT NULL");

  const uq = await client.query(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'reviews' AND constraint_type = 'UNIQUE'
  `);
  if (uq.rows.some((r) => r.constraint_name === "reviews_booking_uq")) ok("V1.2", "UNIQUE on booking_id");
  else bad("V1.2", `UNIQUE missing; found ${uq.rows.map((r) => r.constraint_name).join(", ")}`);

  const fp = await client.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'freelancer_profiles'
    AND column_name IN ('average_rating', 'review_count')
  `);
  const ar = fp.rows.find((r) => r.column_name === "average_rating");
  const rc = fp.rows.find((r) => r.column_name === "review_count");
  if (ar?.data_type === "numeric") ok("V1.3a", "average_rating numeric");
  else bad("V1.3a", "average_rating missing or wrong type");
  if (rc?.data_type === "integer" && String(rc.column_default).includes("0")) ok("V1.3b", "review_count integer default 0");
  else bad("V1.3b", "review_count missing or wrong default");
} finally {
  client.release();
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

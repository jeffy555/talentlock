#!/usr/bin/env node
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../lib/db/package.json"));
const pg = require("pg");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.APP_URL || "http://localhost:25807";

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

try {
  const bookings = await client.query(`
    SELECT
      b.id,
      b.status,
      b.end_date,
      fp.id AS freelancer_profile_id,
      fp.name AS freelancer_name,
      ep.company_name AS employer_company,
      r.id AS review_id,
      r.rating,
      r.reply IS NOT NULL AS has_reply
    FROM bookings b
    JOIN freelancer_profiles fp ON fp.id = b.freelancer_id
    JOIN employer_profiles ep ON ep.id = b.employer_id
    LEFT JOIN reviews r ON r.booking_id = b.id
    ORDER BY b.id DESC
    LIMIT 20
  `);

  const freelancers = await client.query(`
    SELECT id, name, review_count, average_rating
    FROM freelancer_profiles
    ORDER BY review_count DESC NULLS LAST, id ASC
    LIMIT 10
  `);

  console.log(`Base URL: ${BASE}\n`);

  console.log("=== Bookings (employer review flow) ===");
  if (!bookings.rows.length) {
    console.log("No bookings found.");
  } else {
    for (const b of bookings.rows) {
      const reviewNote = b.review_id
        ? `reviewed (${b.rating}★${b.has_reply ? ", has reply" : ""})`
        : "no review yet";
      const promptNote =
        b.status === "completed" && !b.review_id
          ? " ← USE THIS for review prompt"
          : "";
      console.log(
        `${BASE}/bookings/${b.id}  — ${b.status}, ${b.freelancer_name}, ${reviewNote}${promptNote}`,
      );
    }
  }

  const completedNoReview = bookings.rows.find((b) => b.status === "completed" && !b.review_id);
  const withReview = bookings.rows.find((b) => b.review_id);

  console.log("\n=== Freelancer profiles ===");
  for (const f of freelancers.rows) {
    const rating =
      Number(f.review_count) > 0
        ? `${Number(f.average_rating).toFixed(1)}★ (${f.review_count} reviews)`
        : "no reviews";
    console.log(`${BASE}/freelancers/${f.id}  — ${f.name}, ${rating}`);
    console.log(`${BASE}/f/${f.id}  — public profile`);
  }

  console.log("\n=== Other pages ===");
  console.log(`${BASE}/freelancers  — Talent Vault (rating badges)`);
  console.log(`${BASE}/dashboard  — employer review prompts (sign in as employer)`);
  console.log(`${BASE}/profile  — freelancer "Reviews Received" (sign in as freelancer)`);
  console.log(`${BASE}/admin/login  — admin console`);
  console.log(`${BASE}/admin  — Bookings tab (after admin login)`);

  console.log("\n=== Suggested test order ===");
  if (completedNoReview) {
    console.log(`1. Submit review: ${BASE}/bookings/${completedNoReview.id}`);
    console.log(`2. Then check freelancer: ${BASE}/freelancers/${completedNoReview.freelancer_profile_id}`);
    console.log(`3. Public (incognito): ${BASE}/f/${completedNoReview.freelancer_profile_id}`);
  } else {
    console.log("No completed booking without review — mark an active booking complete first.");
  }
  if (withReview) {
    console.log(`Review card already exists: ${BASE}/bookings/${withReview.id}`);
    console.log(`Admin expand this row in ${BASE}/admin → Bookings`);
  }
} finally {
  client.release();
  await pool.end();
}

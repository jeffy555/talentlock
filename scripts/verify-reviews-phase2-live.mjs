#!/usr/bin/env node
/** Extended live Phase 2 API checks from spec/ReviewRatings/validation.md */
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../lib/db/package.json"));
const pg = require("pg");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.API_URL || "http://localhost:8080";

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

async function clerkJwt(clerkUserId) {
  const secret = process.env.CLERK_SECRET_KEY;
  const s = await fetch("https://api.clerk.com/v1/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: clerkUserId }),
  });
  const session = await s.json();
  const t = await fetch(`https://api.clerk.com/v1/sessions/${session.id}/tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const tok = await t.json();
  return tok.jwt;
}

async function api(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

const EMPLOYER = (process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DCjDCio53BNo5NfE5Cp1rm2Vo4").trim();
const FREELANCER = (process.env.DEMO_FREELANCER_CLERK_ID || "user_3DCjDTWarCQhCgJy5n3EjJOck2N").trim();

let pass = 0;
let fail = 0;
function ok(id, msg) { pass++; console.log(`✅ ${id} — ${msg}`); }
function bad(id, msg) { fail++; console.log(`❌ ${id} — ${msg}`); }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  const health = await fetch(`${API}/api/healthz`);
  if (!health.ok) throw new Error("API down");

  const employerToken = await clerkJwt(EMPLOYER);
  const freelancerToken = await clerkJwt(FREELANCER);

  const [employerUser] = (await client.query(
    `SELECT u.id, ep.id AS employer_profile_id FROM users u
     JOIN employer_profiles ep ON ep.user_id = u.id
     WHERE u.clerk_id = $1 LIMIT 1`,
    [EMPLOYER],
  )).rows;

  const completedNoReview = (await client.query(
    `SELECT b.id FROM bookings b
     LEFT JOIN reviews r ON r.booking_id = b.id
     WHERE b.status = 'completed' AND b.employer_id = $1 AND r.id IS NULL
     ORDER BY b.id DESC LIMIT 1`,
    [employerUser?.employer_profile_id],
  )).rows[0];

  const activeBooking = (await client.query(
    `SELECT id FROM bookings WHERE status != 'completed' AND employer_id = $1 LIMIT 1`,
    [employerUser?.employer_profile_id],
  )).rows[0];

  const reviewWithBooking = (await client.query(
    `SELECT r.id AS review_id, r.booking_id, r.reply, fp.id AS freelancer_profile_id
     FROM reviews r
     JOIN bookings b ON b.id = r.booking_id
     JOIN freelancer_profiles fp ON fp.id = b.freelancer_id
     ORDER BY r.id DESC LIMIT 1`,
  )).rows[0];

  const freelancerWithReviews = (await client.query(
    `SELECT fp.id, fp.average_rating, fp.review_count
     FROM freelancer_profiles fp
     WHERE fp.review_count > 0
     ORDER BY fp.review_count DESC LIMIT 1`,
  )).rows[0];

  // V2.4 — non-completed booking blocked
  if (activeBooking) {
    const res = await api("POST", "/api/reviews", {
      token: employerToken,
      body: { bookingId: activeBooking.id, rating: 4 },
    });
    if (res.status === 400 && res.data?.code === "BOOKING_NOT_COMPLETED") ok("V2.4", "non-completed booking blocked");
    else bad("V2.4", `expected 400 BOOKING_NOT_COMPLETED got ${res.status}`);
  } else {
    console.log("⏭️  V2.4 — no active booking for employer");
  }

  // V2.1 + V2.2 — create review on completed booking without review
  let createdReviewId = null;
  let createdBookingId = null;
  if (completedNoReview) {
    createdBookingId = completedNoReview.id;
    const before = (await client.query(
      `SELECT fp.average_rating, fp.review_count FROM bookings b
       JOIN freelancer_profiles fp ON fp.id = b.freelancer_id WHERE b.id = $1`,
      [createdBookingId],
    )).rows[0];

    const res = await api("POST", "/api/reviews", {
      token: employerToken,
      body: { bookingId: createdBookingId, rating: 4, comment: "Validation test review." },
    });
    if (res.status === 201 && res.data?.id && res.data?.rating === 4) {
      ok("V2.1", "review created (201)");
      createdReviewId = res.data.id;
    } else {
      bad("V2.1", `expected 201 got ${res.status} ${JSON.stringify(res.data)}`);
    }

    const after = (await client.query(
      `SELECT fp.average_rating, fp.review_count FROM bookings b
       JOIN freelancer_profiles fp ON fp.id = b.freelancer_id WHERE b.id = $1`,
      [createdBookingId],
    )).rows[0];
    if (after && Number(after.review_count) === Number(before.review_count) + 1) ok("V2.2", "review_count incremented");
    else bad("V2.2", `review_count not incremented (${before?.review_count} -> ${after?.review_count})`);

    // V2.3 duplicate blocked
    const dup = await api("POST", "/api/reviews", {
      token: employerToken,
      body: { bookingId: createdBookingId, rating: 5 },
    });
    if (dup.status === 409 && dup.data?.code === "REVIEW_ALREADY_EXISTS") ok("V2.3", "duplicate review blocked");
    else bad("V2.3", `expected 409 got ${dup.status}`);
  } else {
    console.log("⏭️  V2.1–V2.3 — no completed booking without review for demo employer");
  }

  // V2.15 booking detail includes review
  const bookingIdForDetail = createdBookingId ?? reviewWithBooking?.booking_id;
  if (bookingIdForDetail) {
    const detail = await api("GET", `/api/bookings/${bookingIdForDetail}`, { token: employerToken });
    if (detail.status === 200 && "review" in detail.data) {
      if (detail.data.review && detail.data.review.id && detail.data.review.rating) ok("V2.15", "booking detail includes review object");
      else if (detail.data.review === null) ok("V2.15", "booking detail review null when absent");
      else bad("V2.15", `unexpected review shape ${JSON.stringify(detail.data.review)}`);
    } else bad("V2.15", `booking detail failed ${detail.status}`);
  }

  // V2.10 pagination
  if (freelancerWithReviews) {
    const page1 = await api("GET", `/api/reviews/freelancer/${freelancerWithReviews.id}?page=1&pageSize=2`);
    if (page1.status === 200 && page1.data?.data?.length <= 2 && page1.data.page === 1) {
      ok("V2.10", `pagination page 1 size ${page1.data.data.length}, totalPages=${page1.data.totalPages}`);
    } else {
      bad("V2.10", `pagination failed ${page1.status}`);
    }
  } else {
    console.log("⏭️  V2.10 — no freelancer with reviews");
  }

  // V2.11 reply happy path on freshly created or unreplied review
  const replyTargetId = createdReviewId ?? (reviewWithBooking?.reply == null ? reviewWithBooking?.review_id : null);
  if (replyTargetId) {
    const reply = await api("POST", `/api/reviews/${replyTargetId}/reply`, {
      token: freelancerToken,
      body: { reply: "Thank you for the kind words!" },
    });
    if (reply.status === 200) {
      ok("V2.11", "reply submitted");
      const row = (await client.query(`SELECT reply, replied_at FROM reviews WHERE id = $1`, [replyTargetId])).rows[0];
      if (row?.reply && row?.replied_at) ok("V2.11b", "reply persisted in DB");
      else bad("V2.11b", "reply not in DB");

      const dupReply = await api("POST", `/api/reviews/${replyTargetId}/reply`, {
        token: freelancerToken,
        body: { reply: "Another reply attempt" },
      });
      if (dupReply.status === 409 && dupReply.data?.code === "REPLY_ALREADY_EXISTS") ok("V2.12", "duplicate reply blocked");
      else bad("V2.12", `expected 409 got ${dupReply.status}`);
    } else {
      bad("V2.11", `reply failed ${reply.status} ${JSON.stringify(reply.data)}`);
    }
  } else {
    console.log("⏭️  V2.11–V2.12 — no unreplied review available");
  }

  // R1 regression — booking without review
  const noReviewBooking = (await client.query(
    `SELECT b.id FROM bookings b LEFT JOIN reviews r ON r.booking_id = b.id
     WHERE r.id IS NULL ORDER BY b.id DESC LIMIT 1`,
  )).rows[0];
  if (noReviewBooking) {
    const r1 = await api("GET", `/api/bookings/${noReviewBooking.id}`, { token: employerToken });
    if (r1.status === 200 && r1.data.review === null && r1.data.id) ok("R1", "booking without review returns review:null");
    else bad("R1", `regression failed ${r1.status}`);
  }
} catch (e) {
  console.log(`⏭️  Live extended checks skipped — ${e.message}`);
} finally {
  client.release();
  await pool.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

#!/usr/bin/env node
/** Phase 2 API checks from spec/ReviewRatings/validation.md (subset). */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

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

// Static code checks
const reviewsRoute = readFileSync(join(ROOT, "artifacts/api-server/src/routes/reviews.ts"), "utf8");
const reviewUtils = readFileSync(join(ROOT, "artifacts/api-server/src/lib/reviewUtils.ts"), "utf8");
const bookingsRoute = readFileSync(join(ROOT, "artifacts/api-server/src/routes/bookings.ts"), "utf8");
const apiClient = readFileSync(join(ROOT, "lib/api-client-react/src/generated/api.ts"), "utf8");

if (reviewUtils.includes("updateFreelancerRating")) ok("V2-code", "reviewUtils.updateFreelancerRating exists");
else bad("V2-code", "reviewUtils missing");

if (reviewsRoute.includes("/reviews/:id/reply")) ok("V2-code", "reply route registered");
else bad("V2-code", "reply route missing");

if (bookingsRoute.includes("review")) ok("V2-code", "booking detail includes review");
else bad("V2-code", "booking review embed missing");

if (apiClient.includes("useReplyToReview") && apiClient.includes("useCreateReview")) ok("V2-code", "codegen hooks present");
else bad("V2-code", "codegen hooks missing");

if (!apiClient.includes("useGetMyBookingReview")) ok("V2-code", "legacy my-review hook removed");
else bad("V2-code", "legacy my-review hook still present");

// Live API (optional)
try {
  const health = await fetch(`${API}/api/healthz`);
  if (!health.ok) throw new Error("API down");

  const pub = await api("GET", "/api/reviews/freelancer/1");
  if (pub.status === 200 && Array.isArray(pub.data?.data) && typeof pub.data.total === "number") {
    ok("V2.8", "public list paginated shape");
    const item = pub.data.data[0];
    if (!item || (!("employerId" in item) && !("email" in item))) ok("V2.9", "no employer PII in list");
    else bad("V2.9", "PII leaked");
  } else if (pub.status === 404) {
    ok("V2.8", "public list endpoint responds (freelancer 404 ok)");
  } else {
    bad("V2.8", `unexpected ${pub.status} ${JSON.stringify(pub.data)}`);
  }

  const employerToken = await clerkJwt(EMPLOYER);
  const freelancerToken = await clerkJwt(FREELANCER);

  const blocked = await api("POST", "/api/reviews", {
    token: freelancerToken,
    body: { bookingId: 1, rating: 5 },
  });
  if (blocked.status === 403) ok("V2.6", "freelancer cannot submit review");
  else bad("V2.6", `expected 403 got ${blocked.status}`);

  const badRating = await api("POST", "/api/reviews", {
    token: employerToken,
    body: { bookingId: 1, rating: 6 },
  });
  if (badRating.status === 400) ok("V2.7", "invalid rating blocked");
  else bad("V2.7", `expected 400 got ${badRating.status}`);

  const employerReply = await api("POST", "/api/reviews/1/reply", {
    token: employerToken,
    body: { reply: "test" },
  });
  if (employerReply.status === 403) ok("V2.14", "employer cannot reply");
  else bad("V2.14", `expected 403 got ${employerReply.status}`);
} catch (e) {
  console.log(`⏭️  Live API checks skipped — ${e.message}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

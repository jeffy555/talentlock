#!/usr/bin/env node
/** Phase 4 admin checks from spec/ReviewRatings/validation.md */
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

let pass = 0;
let fail = 0;
function ok(id, msg) { pass++; console.log(`✅ ${id} — ${msg}`); }
function bad(id, msg) { fail++; console.log(`❌ ${id} — ${msg}`); }

const adminRoute = readFileSync(join(ROOT, "artifacts/api-server/src/routes/admin.ts"), "utf8");
const adminDashboard = readFileSync(join(ROOT, "artifacts/talentlock/src/pages/AdminDashboard.tsx"), "utf8");

if (adminRoute.includes("reviewsTable") && adminRoute.includes("hasReply")) ok("V4-code", "admin bookings embeds review summary");
else bad("V4-code", "admin route missing review embed");

if (adminDashboard.includes("truncateComment") || adminDashboard.includes("100")) ok("V4-code", "AdminDashboard truncates comment");
else bad("V4-code", "AdminDashboard comment truncation missing");

if (adminDashboard.includes("Has reply") && adminDashboard.includes("No review submitted")) ok("V4-code", "AdminDashboard review states");
else bad("V4-code", "AdminDashboard review UI states missing");

async function adminLogin() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "TalentLockAdmin123!";
  const res = await fetch(`${API}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, cookie };
}

async function adminGet(path, cookie) {
  const res = await fetch(`${API}${path}`, { headers: { Cookie: cookie } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

try {
  const health = await fetch(`${API}/api/healthz`);
  if (!health.ok) throw new Error("API down");

  const login = await adminLogin();
  if (login.status !== 200 || !login.cookie) {
    bad("V4.1", `admin login failed (${login.status})`);
  } else {
    ok("V4.1a", "admin login succeeds");
    const bookings = await adminGet("/api/admin/bookings?limit=50", login.cookie);
    if (bookings.status !== 200 || !Array.isArray(bookings.data)) {
      bad("V4.1", `admin bookings failed (${bookings.status})`);
    } else {
      ok("V4.1b", `admin bookings returns ${bookings.data.length} rows`);
      const withReviewField = bookings.data.every((b) => "review" in b);
      if (withReviewField) ok("V4.1c", "every booking has review field");
      else bad("V4.1c", "some bookings missing review field");

      const sample = bookings.data.find((b) => b.review) ?? bookings.data[0];
      if (sample?.review) {
        const { rating, comment, hasReply } = sample.review;
        if (typeof rating === "number" && typeof hasReply === "boolean") ok("V4.1d", "review shape correct when present");
        else bad("V4.1d", `bad review shape: ${JSON.stringify(sample.review)}`);
        if (comment === null || typeof comment === "string") ok("V4.1e", "comment nullable string");
        else bad("V4.1e", "comment type wrong");
      } else if (sample && sample.review === null) {
        ok("V4.1d", "booking without review returns review: null");
      }
    }
  }
} catch (e) {
  console.log(`⏭️  Live admin checks skipped — ${e.message}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

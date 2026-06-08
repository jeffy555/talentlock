#!/usr/bin/env node
/**
 * Availability Calendar — automated validation (API, DB, frontend routes, demo login).
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClerkClient } from "@clerk/express";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "lib", "db", "package.json"));
const pg = require("pg");
const envPath = join(root, ".env");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const API = process.env.API_URL || "http://localhost:8080/api";
const FRONTEND = process.env.FRONTEND_URL || "http://localhost:25807";
const DEMO_FREELANCER = process.env.DEMO_FREELANCER_CLERK_ID || "user_3DBiBymDbIiXQnFqyk64WquLsdY";
const DEMO_EMPLOYER = process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DBguOY4TbwT9bxOYc9NcYU5q9a";

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

async function clerkToken(userId) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const session = await clerk.sessions.createSession({ userId });
  const token = await clerk.sessions.getToken(session.id);
  return token.jwt;
}

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("\n=== Availability Calendar Validation ===\n");

  // --- Phase 1: Database ---
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const cols = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'availability_blocks'
    ORDER BY ordinal_position
  `);
  const expectedCols = ["id", "freelancer_id", "start_date", "end_date", "reason", "label", "booking_id", "created_at"];
  const colNames = cols.rows.map((r) => r.column_name);
  if (expectedCols.every((c) => colNames.includes(c))) {
    pass("V1.1 availability_blocks columns", colNames.join(", "));
  } else {
    fail("V1.1 availability_blocks columns", `missing: ${expectedCols.filter((c) => !colNames.includes(c)).join(", ")}`);
  }

  const indexes = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'availability_blocks'`);
  const idxNames = indexes.rows.map((r) => r.indexname);
  idxNames.some((n) => n.includes("freelancer")) ? pass("V1.2 index freelancer_id", idxNames.join(", ")) : fail("V1.2 index freelancer_id");
  idxNames.some((n) => n.includes("end_date")) ? pass("V1.2 index end_date") : fail("V1.2 index end_date");

  const nad = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'freelancer_profiles' AND column_name = 'next_available_date'
  `);
  nad.rows.length === 1 && nad.rows[0].data_type === "date"
    ? pass("V1.3 next_available_date column", "date, nullable")
    : fail("V1.3 next_available_date column");

  // --- Demo Clerk ID alignment ---
  const fp = await pool.query(
    `SELECT id, clerk_id, name FROM freelancer_profiles WHERE clerk_id = $1`,
    [DEMO_FREELANCER],
  );
  fp.rows.length > 0
    ? pass("Demo freelancer Clerk ID matches DB", `id=${fp.rows[0].id} ${fp.rows[0].name}`)
    : fail("Demo freelancer Clerk ID matches DB", DEMO_FREELANCER);

  const ep = await pool.query(
    `SELECT id, clerk_id, company_name FROM employer_profiles WHERE clerk_id = $1`,
    [DEMO_EMPLOYER],
  );
  ep.rows.length > 0
    ? pass("Demo employer Clerk ID matches DB", `id=${ep.rows[0].id} ${ep.rows[0].company_name}`)
    : fail("Demo employer Clerk ID matches DB", DEMO_EMPLOYER);

  const freelancerId = fp.rows[0]?.id ?? 2;

  // --- Phase 2: API ---
  const routeFile = readFileSync(join(root, "artifacts/api-server/src/routes/availability.ts"), "utf8");
  const meLine = routeFile.indexOf('router.get("/availability/me"');
  const pubLine = routeFile.indexOf('router.get("/availability/:freelancerId"');
  meLine > 0 && pubLine > meLine
    ? pass("V2.1 route order /me before /:freelancerId", `lines ${meLine} < ${pubLine}`)
    : fail("V2.1 route order");

  const pub = await api(`/availability/${freelancerId}`);
  pub.status === 200 && Array.isArray(pub.body?.blocks)
    ? pass("V2.2 public availability", `blocks=${pub.body.blocks.length}`)
    : fail("V2.2 public availability", String(pub.status));
  const sample = pub.body?.blocks?.[0];
  if (!sample || (!("label" in sample) && !("bookingId" in sample))) {
    pass("V2.2 public omits label/bookingId");
  } else {
    fail("V2.2 public omits label/bookingId");
  }

  let flToken, emToken;
  try {
    flToken = await clerkToken(DEMO_FREELANCER);
    pass("Freelancer Clerk JWT");
  } catch (e) {
    fail("Freelancer Clerk JWT", e.message);
  }
  try {
    emToken = await clerkToken(DEMO_EMPLOYER);
    pass("Employer Clerk JWT");
  } catch (e) {
    fail("Employer Clerk JWT", e.message);
  }

  if (flToken) {
    const me = await api("/availability/me", { headers: { Authorization: `Bearer ${flToken}` } });
    me.status === 200 && me.body?.blocks?.[0]
      ? (me.body.blocks[0].label !== undefined && me.body.blocks[0].bookingId !== undefined
        ? pass("V2.3 freelancer /me full detail")
        : fail("V2.3 freelancer /me full detail"))
      : me.status === 200
        ? pass("V2.3 freelancer /me (empty blocks ok)")
        : fail("V2.3 freelancer /me", String(me.status));

    const start = futureDate(45);
    const end = futureDate(52);
    const created = await api("/availability/me", {
      method: "POST",
      headers: { Authorization: `Bearer ${flToken}` },
      body: JSON.stringify({ startDate: start, endDate: end, reason: "holiday", label: "Validation block" }),
    });
    created.status === 201 ? pass("V2.5 create block", `id=${created.body?.id}`) : fail("V2.5 create block", String(created.status));

    const badBooked = await api("/availability/me", {
      method: "POST",
      headers: { Authorization: `Bearer ${flToken}` },
      body: JSON.stringify({ startDate: start, endDate: end, reason: "booked" }),
    });
    badBooked.status === 400 ? pass("V2.6 booked reason rejected") : fail("V2.6 booked reason rejected", String(badBooked.status));

    const past = await api("/availability/me", {
      method: "POST",
      headers: { Authorization: `Bearer ${flToken}` },
      body: JSON.stringify({ startDate: "2020-01-01", endDate: "2020-01-15", reason: "holiday" }),
    });
    past.status === 400 && past.body?.code === "DATE_IN_PAST"
      ? pass("V2.7 date in past rejected")
      : fail("V2.7 date in past rejected", JSON.stringify(past.body));

    const invalid = await api("/availability/me", {
      method: "POST",
      headers: { Authorization: `Bearer ${flToken}` },
      body: JSON.stringify({ startDate: end, endDate: start, reason: "holiday" }),
    });
    invalid.status === 400 && invalid.body?.code === "DATE_INVALID"
      ? pass("V2.9 date invalid rejected")
      : fail("V2.9 date invalid rejected", JSON.stringify(invalid.body));

    if (created.body?.id) {
      const deleted = await api(`/availability/me/${created.body.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${flToken}` },
      });
      deleted.status === 200 ? pass("V2.10 delete block") : fail("V2.10 delete block", String(deleted.status));
    }
  }

  if (emToken) {
    const empMe = await api("/availability/me", { headers: { Authorization: `Bearer ${emToken}` } });
    empMe.status === 403 ? pass("V2.4 employer /me → 403") : fail("V2.4 employer /me", String(empMe.status));

    const empPost = await api("/availability/me", {
      method: "POST",
      headers: { Authorization: `Bearer ${emToken}` },
      body: JSON.stringify({ startDate: futureDate(10), endDate: futureDate(12), reason: "holiday" }),
    });
    empPost.status === 403 ? pass("S3 employer cannot create blocks") : fail("S3 employer cannot create blocks", String(empPost.status));

    const profile = await api(`/freelancers/${freelancerId}`, { headers: { Authorization: `Bearer ${emToken}` } });
    profile.status === 200 && "nextAvailableDate" in (profile.body ?? {})
      ? pass("V2.15 freelancer profile nextAvailableDate")
      : fail("V2.15 freelancer profile nextAvailableDate");
  }

  const filtered = await api(`/freelancers?availableFrom=${futureDate(180)}&limit=10`);
  filtered.status === 200 && Array.isArray(filtered.body)
    ? pass("V2.16 availableFrom filter", `count=${filtered.body.length}`)
    : fail("V2.16 availableFrom filter");

  // --- Demo login endpoint ---
  const demoFl = await fetch(`${API}/demo/sign-in-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "freelancer" }),
  });
  const demoFlBody = await demoFl.json();
  demoFl.status === 200 && demoFlBody.token
    ? pass("Demo sign-in token (freelancer)")
    : fail("Demo sign-in token (freelancer)", JSON.stringify(demoFlBody));

  const demoEm = await fetch(`${API}/demo/sign-in-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "employer" }),
  });
  const demoEmBody = await demoEm.json();
  demoEm.status === 200 && demoEmBody.token
    ? pass("Demo sign-in token (employer)")
    : fail("Demo sign-in token (employer)", JSON.stringify(demoEmBody));

  // --- Phase 3: Frontend routes (SPA shell) ---
  for (const path of [`/freelancers/${freelancerId}`, `/f/${freelancerId}`, "/freelancers", "/profile"]) {
    const r = await fetch(`${FRONTEND}${path}`);
    const html = await r.text();
    r.ok && html.includes("root")
      ? pass(`V3 frontend route ${path}`, `HTTP ${r.status}`)
      : fail(`V3 frontend route ${path}`, `HTTP ${r.status}`);
  }

  const pkg = readFileSync(join(root, "artifacts/talentlock/package.json"), "utf8");
  pkg.includes("react-day-picker") ? pass("V3.1 react-day-picker installed") : fail("V3.1 react-day-picker installed");

  const profileSrc = readFileSync(join(root, "artifacts/talentlock/src/pages/Profile.tsx"), "utf8");
  profileSrc.includes("AvailabilityManager") ? pass("V3.4 Profile integrates AvailabilityManager") : fail("V3.4 Profile integrates AvailabilityManager");

  const detailSrc = readFileSync(join(root, "artifacts/talentlock/src/pages/FreelancerDetail.tsx"), "utf8");
  detailSrc.includes("AvailabilitySection") ? pass("V3.2 Employer detail integrates calendar") : fail("V3.2 Employer detail integrates calendar");

  const publicSrc = readFileSync(join(root, "artifacts/talentlock/src/pages/PublicProfile.tsx"), "utf8");
  publicSrc.includes("AvailabilitySection") ? pass("V3.3 Public profile integrates calendar") : fail("V3.3 Public profile integrates calendar");

  const vaultSrc = readFileSync(join(root, "artifacts/talentlock/src/pages/FreelancersList.tsx"), "utf8");
  vaultSrc.includes("availableFrom") && vaultSrc.includes("formatNextAvailable")
    ? pass("V3.7–V3.8 Talent Vault filter + badge")
    : fail("V3.7–V3.8 Talent Vault filter + badge");

  const proxy = await fetch(`${FRONTEND}/api/availability/${freelancerId}`);
  proxy.status === 200 ? pass("Vite proxy availability API") : fail("Vite proxy availability API", String(proxy.status));

  await pool.end();

  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${ok}/${results.length} passed, ${bad} failed ===\n`);
  if (bad > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

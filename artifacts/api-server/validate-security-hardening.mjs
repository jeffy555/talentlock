#!/usr/bin/env node
/**
 * Security Hardening — automated validation (API, DB, code structure, frontend grep).
 * Run: node artifacts/api-server/validate-security-hardening.mjs
 */
import { readFileSync, existsSync } from "fs";
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
const BASE = process.env.API_BASE || "http://localhost:8080";
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
function skip(name, detail = "") {
  results.push({ name, ok: true, skipped: true, detail });
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

async function clerkToken(userId) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const session = await clerk.sessions.createSession({ userId });
  const token = await clerk.sessions.getToken(session.id);
  return token.jwt;
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("\n=== Security Hardening Validation ===\n");

  // --- Phase 1: Middleware ---
  const headRes = await fetch(`${BASE}/api/healthz`, { method: "GET" });
  const xcto = headRes.headers.get("x-content-type-options");
  const xfo = headRes.headers.get("x-frame-options");
  const xpb = headRes.headers.get("x-powered-by");
  xcto?.toLowerCase() === "nosniff" ? pass("V1.1 X-Content-Type-Options") : fail("V1.1 X-Content-Type-Options", xcto ?? "missing");
  xfo ? pass("V1.1 X-Frame-Options", xfo) : fail("V1.1 X-Frame-Options");
  !xpb ? pass("V1.1 X-Powered-By removed") : fail("V1.1 X-Powered-By removed", xpb);

  const bigPayload = JSON.stringify({ data: "x".repeat(2_000_000) });
  const big = await fetch(`${API}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: bigPayload,
  });
  big.status === 413 ? pass("V1.2 oversized body returns 413") : fail("V1.2 oversized body", `status ${big.status}`);

  const small = await fetch(`${API}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ bookingId: 1, rating: 4, comment: "ok" }),
  });
  small.status !== 413 ? pass("V1.3 normal body not 413", `status ${small.status}`) : fail("V1.3 normal body not 413");

  const loggerSrc = read("artifacts/api-server/src/lib/logger.ts");
  loggerSrc.includes('censor: "[REDACTED]"') && loggerSrc.includes("req.headers.authorization")
    ? pass("V1.4 Pino redact config present")
    : fail("V1.4 Pino redact config");

  existsSync(join(root, "artifacts/api-server/src/lib/sanitise.ts"))
    ? pass("V1.5 sanitise.ts exists")
    : fail("V1.5 sanitise.ts exists");

  // --- Phase 2: Database ---
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const auditCols = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'audit_logs'
      AND column_name IN ('ip_address', 'user_agent', 'entity_type', 'entity_id', 'metadata')
    ORDER BY column_name
  `);
  const auditMap = Object.fromEntries(auditCols.rows.map((r) => [r.column_name, r.data_type]));
  const auditOk =
    auditMap.ip_address === "text" &&
    auditMap.user_agent === "text" &&
    auditMap.entity_type === "text" &&
    auditMap.entity_id === "text" &&
    auditMap.metadata === "jsonb";
  auditOk ? pass("V2.1 audit_logs columns") : fail("V2.1 audit_logs columns", JSON.stringify(auditMap));

  const delCols = await pool.query(`
    SELECT column_name, column_default
    FROM information_schema.columns
    WHERE table_name = 'account_deletion_requests'
    ORDER BY ordinal_position
  `);
  const delNames = delCols.rows.map((r) => r.column_name);
  const expectedDel = ["id", "user_id", "status", "reason", "requested_at", "processed_at", "rejection_reason"];
  expectedDel.every((c) => delNames.includes(c))
    ? pass("V2.2 account_deletion_requests columns", delNames.join(", "))
    : fail("V2.2 account_deletion_requests columns");
  const statusDef = delCols.rows.find((r) => r.column_name === "status")?.column_default ?? "";
  statusDef.includes("pending") ? pass("V2.2 status default pending") : fail("V2.2 status default", statusDef);

  // --- Phase 3: CSRF ---
  const csrfRes = await fetch(`${BASE}/api/admin/csrf-token`, { credentials: "include" });
  const csrfBody = await csrfRes.json();
  csrfRes.status === 200 && csrfBody?.token
    ? pass("V3.1 csrf-token endpoint", `len=${csrfBody.token.length}`)
    : fail("V3.1 csrf-token endpoint", String(csrfRes.status));

  const setCookies = csrfRes.headers.getSetCookie?.() ?? [];
  const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
  const noCsrfLogin = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ username: "x", password: "y" }),
  });
  noCsrfLogin.status === 403 ? pass("V3.2 admin POST without CSRF → 403") : fail("V3.2 admin POST without CSRF", String(noCsrfLogin.status));

  const withCsrf = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfBody.token,
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ username: "x", password: "y" }),
  });
  withCsrf.status !== 403 ? pass("V3.3 admin POST with CSRF not 403", String(withCsrf.status)) : fail("V3.3 admin POST with CSRF");

  const agreements = read("artifacts/api-server/src/routes/agreements.ts");
  agreements.includes('action: "agreement.signed"') && agreements.includes('action: "agreement.downloaded"')
    ? pass("V3.5/V3.6 audit hooks in agreements.ts")
    : fail("V3.5/V3.6 audit hooks in agreements.ts");

  read("artifacts/api-server/src/routes/subscriptions.ts").includes('action: "subscription.upgraded"')
    ? pass("V3.7 audit hook in subscriptions.ts")
    : fail("V3.7 audit hook in subscriptions.ts");

  read("artifacts/api-server/src/routes/documents.ts").includes('action: "document.uploaded"')
    ? pass("V3.8 audit hook in documents.ts")
    : fail("V3.8 audit hook in documents.ts");

  const auditRouteFiles = ["agreements.ts", "subscriptions.ts", "documents.ts", "account.ts"];
  const auditMissing = auditRouteFiles.filter(
    (f) => !read(`artifacts/api-server/src/routes/${f}`).includes("audit log write failed"),
  );
  auditMissing.length === 0
    ? pass("V3.8 audit fire-and-forget .catch() in routes")
    : fail("V3.8 audit fire-and-forget", `missing in: ${auditMissing.join(", ")}`);

  // --- Phase 4: Sanitisation (API) ---
  let flToken;
  let emToken;
  try {
    flToken = await clerkToken(DEMO_FREELANCER);
    emToken = await clerkToken(DEMO_EMPLOYER);
  } catch (err) {
    fail("Clerk tokens", err.message);
  }

  if (flToken) {
    const bioPayload = '<img src=x onerror=alert(1)>Senior developer';
    const patchBio = await api("/freelancers/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${flToken}` },
      body: JSON.stringify({ bio: bioPayload }),
    });
    const getFl = await api("/freelancers/me", { headers: { Authorization: `Bearer ${flToken}` } });
    const bio = getFl.body?.bio ?? "";
    !bio.includes("<img") && !bio.includes("onerror") && bio.includes("Senior developer")
      ? pass("V4.1 freelancer bio XSS stripped")
      : fail("V4.1 freelancer bio XSS stripped", bio);

    const start = futureDate(30);
    const end = futureDate(37);
    const createBlock = await api("/availability/me", {
      method: "POST",
      headers: { Authorization: `Bearer ${flToken}` },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        reason: "holiday",
        label: "<script>xss</script>Holiday",
      }),
    });
    const blockLabel = createBlock.body?.label ?? "";
    !blockLabel.includes("<script>") && blockLabel.includes("Holiday")
      ? pass("V4.4 availability label XSS stripped", blockLabel)
      : fail("V4.4 availability label", blockLabel);

    if (createBlock.body?.id) {
      await api(`/availability/me/${createBlock.body.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${flToken}` },
      });
    }
  }

  if (emToken) {
    const titleXss = "<svg onload=alert(1)>Dev Role";
    const start = futureDate(60);
    const end = futureDate(90);
    const createJob = await api("/job-requirements", {
      method: "POST",
      headers: { Authorization: `Bearer ${emToken}` },
      body: JSON.stringify({
        title: titleXss,
        fieldOfWork: "Software Engineering",
        description: "Build things",
        requiredSkills: ["TypeScript"],
        minExperience: 1,
        paymentType: "hourly",
        startDate: start,
        endDate: end,
      }),
    });
    if (createJob.status === 201 && createJob.body?.id) {
      const title = createJob.body.title ?? "";
      !title.includes("<svg") && !title.includes("onload")
        ? pass("V4.2 job title XSS stripped", title)
        : fail("V4.2 job title XSS stripped", title);
      await api(`/job-requirements/${createJob.body.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${emToken}` } });
    } else if (createJob.status === 402) {
      skip("V4.2 job title XSS", "plan limit — code path verified in jobRequirements.ts");
      read("artifacts/api-server/src/routes/jobRequirements.ts").includes("sanitiseText")
        ? pass("V4.2 sanitiseText import in jobRequirements.ts")
        : fail("V4.2 sanitiseText import");
    } else {
      fail("V4.2 create job", `status ${createJob.status}`);
    }
  }

  // --- Phase 5: GDPR deletion ---
  existsSync(join(root, "artifacts/api-server/src/routes/account.ts"))
    ? pass("V5.0 account.ts route file exists")
    : fail("V5.0 account.ts route file");

  read("artifacts/api-server/src/routes/index.ts").includes("accountRouter")
    ? pass("V5.0 account router registered")
    : fail("V5.0 account router registered");

  const activeBooking = await pool.query(`
    SELECT b.id, fp.clerk_id AS fl_clerk, ep.clerk_id AS em_clerk
    FROM bookings b
    LEFT JOIN freelancer_profiles fp ON fp.id = b.freelancer_id
    LEFT JOIN employer_profiles ep ON ep.id = b.employer_id
    WHERE b.status = 'active'
    LIMIT 1
  `);

  if (activeBooking.rows[0]) {
    const clerkId = activeBooking.rows[0].fl_clerk || activeBooking.rows[0].em_clerk;
    try {
      const tok = await clerkToken(clerkId);
      const del = await api("/account/delete-request", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
        body: JSON.stringify({}),
      });
      del.status === 409 && del.body?.code === "ACTIVE_BOOKINGS_EXIST"
        ? pass("V5.1 deletion blocked by active booking", `count=${del.body.bookingCount}`)
        : fail("V5.1 deletion blocked", `status ${del.status} ${JSON.stringify(del.body)}`);
    } catch (e) {
      fail("V5.1 active booking test", e.message);
    }
  } else {
    skip("V5.1 active booking 409", "no active bookings in DB");
  }

  if (flToken) {
    const status = await api("/account/delete-request", { headers: { Authorization: `Bearer ${flToken}` } });
    status.status === 200 && "status" in (status.body ?? {})
      ? pass("V5.3 GET delete-request shape", JSON.stringify(status.body))
      : fail("V5.3 GET delete-request", String(status.status));
  }

  skip("V5.2 deletion happy path", "destructive — manual only (do not delete demo users)");

  const deleteUi = read("artifacts/talentlock/src/components/DeleteAccountSection.tsx");
  deleteUi.includes("Danger Zone") && deleteUi.includes("Delete my account") && deleteUi.includes("confirmEmail")
    ? pass("V5.4/V5.5 DeleteAccountSection UI")
    : fail("V5.4/V5.5 DeleteAccountSection UI");

  read("artifacts/talentlock/src/pages/Profile.tsx").includes("DeleteAccountSection")
    ? pass("V5.4 Profile integrates DeleteAccountSection")
    : fail("V5.4 Profile integration");

  const adminLogin = read("artifacts/talentlock/src/pages/AdminLogin.tsx");
  adminLogin.includes("x-csrf-token") && adminLogin.includes("getAdminCsrfToken")
    ? pass("V5.8 AdminLogin CSRF header")
    : fail("V5.8 AdminLogin CSRF");

  // --- Regression ---
  if (flToken) {
    const me = await api("/users/me", { headers: { Authorization: `Bearer ${flToken}` } });
    me.status === 200 ? pass("SR1 Clerk auth /users/me") : fail("SR1 Clerk auth", String(me.status));
  }

  const appSrc = read("artifacts/api-server/src/app.ts");
  appSrc.includes("helmet()") && appSrc.includes('limit: "1mb"')
    ? pass("SR3 middleware in app.ts")
    : fail("SR3 middleware in app.ts");

  await pool.end();

  const passed = results.filter((r) => r.ok && !r.skipped).length;
  const failed = results.filter((r) => !r.ok).length;
  const skippedN = results.filter((r) => r.skipped).length;
  console.log(`\n=== ${passed} passed, ${failed} failed, ${skippedN} skipped / ${results.length} total ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

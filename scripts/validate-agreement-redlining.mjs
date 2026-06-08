#!/usr/bin/env node
/**
 * Automated checks from spec/agreement-templates-redlining/validation.md
 * Run: node scripts/validate-agreement-redlining.mjs
 */
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../lib/db/package.json"));
const pg = require("pg");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const API = process.env.API_URL || "http://localhost:8080";
const { Pool } = pg;

const results = [];
function pass(id, note = "") {
  results.push({ id, status: "PASS", note });
  console.log(`✅ ${id}${note ? ` — ${note}` : ""}`);
}
function fail(id, note = "") {
  results.push({ id, status: "FAIL", note });
  console.log(`❌ ${id}${note ? ` — ${note}` : ""}`);
}
function skip(id, note = "") {
  results.push({ id, status: "SKIP", note });
  console.log(`⏭️  ${id}${note ? ` — ${note}` : ""}`);
}

async function clerkFetch(path, { method = "GET", body } = {}) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Clerk ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function resolveEmployerClerkId(pool) {
  const fallback = (process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DCjDCio53BNo5NfE5Cp1rm2Vo4").trim();
  const r = await pool.query(
    `SELECT TRIM(u.clerk_id) AS clerk_id FROM users u
     JOIN employer_profiles ep ON ep.user_id = u.id
     JOIN bookings b ON b.employer_id = ep.id AND b.notes = 'tl:redlining-validation'
     LIMIT 1`,
  );
  return (r.rows[0]?.clerk_id || fallback).trim();
}

async function resolveFreelancerClerkId(pool) {
  return (process.env.DEMO_FREELANCER_CLERK_ID || "user_3DCjDTWarCQhCgJy5n3EjJOck2N").trim();
}

async function getClerkJwt(role, clerkUserId) {
  if (!process.env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY not set");
  const userId = clerkUserId;
  const session = await clerkFetch("/sessions", {
    method: "POST",
    body: { user_id: userId },
  });
  const tokenRes = await clerkFetch(`/sessions/${session.id}/tokens`, { method: "POST", body: {} });
  return { token: tokenRes.jwt, sessionId: session.id };
}

async function api(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  console.log("\n--- Phase 1: Database & Static ---\n");

  const tokenLogger = readFileSync(join(ROOT, "artifacts/api-server/src/lib/tokenLogger.ts"), "utf8");
  tokenLogger.includes("contract_redlining") ? pass("V1.3") : fail("V1.3");

  const industryPath = join(ROOT, "artifacts/api-server/src/lib/industryTemplates.ts");
  if (!existsSync(industryPath)) {
    fail("V1.4", "file missing");
  } else {
    const src = readFileSync(industryPath, "utf8");
    const keys = [
      "general",
      "software_development",
      "design_creative",
      "marketing_content",
      "consulting_strategy",
      "data_analytics",
    ];
    const allKeys = keys.every((k) => src.includes(`${k}:`));
    const exportsOk =
      src.includes("buildIndustrySection") &&
      src.includes("buildCustomClausesSection") &&
      src.includes("sanitiseClause");
    allKeys && exportsOk ? pass("V1.4", "6 industries + helpers") : fail("V1.4");
  }

  const apiClient = readFileSync(join(ROOT, "lib/api-client-react/src/generated/api.ts"), "utf8");
  apiClient.includes("usePostAgreementsIdRedline") && apiClient.includes("usePatchAgreementsIdAcceptRedline")
    ? pass("V3.1-hooks")
    : fail("V3.1-hooks");

  if (!process.env.DATABASE_URL) {
    skip("V1.1-V1.2", "DATABASE_URL not set");
  } else {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const col = await pool.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'agreements' AND column_name = 'status'
      `);
      const row = col.rows[0];
      if (row?.data_type === "text" && row?.is_nullable === "NO") {
        pass("V1.1", `${row.data_type}, default=${row.column_default}`);
      } else {
        fail("V1.1", JSON.stringify(row));
      }

      const fs = await pool.query(`
        SELECT COUNT(*)::int c FROM agreements
        WHERE freelancer_signed_at IS NOT NULL AND employer_signed_at IS NOT NULL AND status != 'fully_signed'
      `);
      fs.rows[0].c === 0 ? pass("V1.2-fully_signed") : fail("V1.2-fully_signed", `count=${fs.rows[0].c}`);

      const ps = await pool.query(`
        SELECT COUNT(*)::int c FROM agreements
        WHERE (freelancer_signed_at IS NOT NULL OR employer_signed_at IS NOT NULL)
        AND NOT (freelancer_signed_at IS NOT NULL AND employer_signed_at IS NOT NULL)
        AND status != 'partially_signed'
      `);
      ps.rows[0].c === 0 ? pass("V1.2-partially_signed") : fail("V1.2-partially_signed", `count=${ps.rows[0].c}`);

      const dr = await pool.query(`
        SELECT COUNT(*)::int c FROM agreements
        WHERE freelancer_signed_at IS NULL AND employer_signed_at IS NULL
        AND status NOT IN ('draft', 'redlined')
      `);
      dr.rows[0].c === 0 ? pass("V1.2-unsigned") : fail("V1.2-unsigned", `count=${dr.rows[0].c}`);

      // setup data for API tests
      var freelancerId, employerDbId, draftAgreementId, bookingId;
      const freelancer = await pool.query(`SELECT id FROM freelancer_profiles ORDER BY id LIMIT 1`);
      const employer = await pool.query(`SELECT id, clerk_id FROM users WHERE role = 'employer' LIMIT 1`);
      freelancerId = freelancer.rows[0]?.id;
      employerDbId = employer.rows[0]?.id;

      const draftAg = await pool.query(`
        SELECT a.id, a.booking_id FROM agreements a
        JOIN bookings b ON b.id = a.booking_id
        WHERE a.freelancer_signed_at IS NULL AND a.employer_signed_at IS NULL
        ORDER BY (b.notes = 'tl:redlining-validation') DESC, a.id DESC LIMIT 1
      `);
      draftAgreementId = draftAg.rows[0]?.id;

      const openBooking = await pool.query(`
        SELECT b.id FROM bookings b
        WHERE b.negotiation_status = 'agreed'
        AND NOT EXISTS (SELECT 1 FROM agreements a WHERE a.booking_id = b.id)
        ORDER BY (b.notes = 'tl:redlining-validation') DESC, b.id DESC LIMIT 1
      `);
      bookingId = openBooking.rows[0]?.id;

      console.log("\n--- Phase 2: Backend API ---\n");

      const employerClerkId = await resolveEmployerClerkId(pool);
      const freelancerClerkId = await resolveFreelancerClerkId(pool);
      console.log(`Using employer Clerk ID: ${employerClerkId}`);
      console.log(`Using freelancer Clerk ID: ${freelancerClerkId}`);

      let employerToken, freelancerToken, employerSessionId;
      try {
        const emp = await getClerkJwt("employer", employerClerkId);
        const fre = await getClerkJwt("freelancer", freelancerClerkId);
        employerToken = emp.token;
        employerSessionId = emp.sessionId;
        freelancerToken = fre.token;
        pass("auth-tokens");
      } catch (e) {
        fail("auth-tokens", String(e.message));
        skip("V2.x", "no Clerk tokens");
        return;
      }

      // health
      const health = await api("GET", "/api/healthz");
      if (health.status !== 200) {
        skip("V2.x", `API not reachable at ${API} (healthz=${health.status})`);
        return;
      }
      pass("api-health");

      const noAuth = await api("POST", `/api/agreements/${draftAgreementId || 1}/redline`);
      noAuth.status === 401 ? pass("V2.7-no-auth") : fail("V2.7-no-auth", `got ${noAuth.status}`);

      const f403 = await api("POST", `/api/agreements/${draftAgreementId || 1}/redline`, {
        token: freelancerToken,
      });
      f403.status === 403 ? pass("V2.7-freelancer-403", "S1") : fail("V2.7-freelancer-403", `got ${f403.status}`);

      const fAccept403 = await api("PATCH", `/api/agreements/${draftAgreementId || 1}/accept-redline`, {
        token: freelancerToken,
        body: { newContent: "malicious" },
      });
      fAccept403.status === 403 ? pass("S2-freelancer-accept-403") : fail("S2-freelancer-accept-403", `got ${fAccept403.status}`);

      if (draftAgreementId) {
        const getAg = await api("GET", `/api/agreements/${draftAgreementId}`, { token: employerToken });
        if (getAg.status === 200 && getAg.data?.estimatedRedlineTokens > 0 && getAg.data?.status) {
          pass("V2.6", `tokens=${getAg.data.estimatedRedlineTokens}, status=${getAg.data.status}`);
        } else {
          fail("V2.6", JSON.stringify(getAg.data));
        }

        const redline = await api("POST", `/api/agreements/${draftAgreementId}/redline`, {
          token: employerToken,
        });
        if (redline.status === 200 && Array.isArray(redline.data?.suggestions)) {
          pass("V2.10", `${redline.data.suggestions.length} suggestions`);
          const tok = await pool.query(
            `SELECT feature FROM token_usage WHERE feature = 'contract_redlining' ORDER BY created_at DESC LIMIT 1`,
          );
          tok.rows[0]?.feature === "contract_redlining" ? pass("V2.10-token-log") : fail("V2.10-token-log");
        } else if (redline.status === 402) {
          skip("V2.10", `plan/token limit: ${JSON.stringify(redline.data)}`);
        } else {
          fail("V2.10", `HTTP ${redline.status} ${JSON.stringify(redline.data)}`);
        }
      } else {
        skip("V2.6-V2.10", "no draft agreement in DB");
      }

      if (bookingId) {
        const genDefault = await api("POST", "/api/agreements", {
          token: employerToken,
          body: { bookingId },
        });
        if (genDefault.status === 201) {
          pass("V2.2", "default generation");
          await pool.query(`DELETE FROM agreements WHERE id = $1`, [genDefault.data.id]).catch(() => {});
        } else if (genDefault.status === 402) {
          skip("V2.2", "token limit");
        } else {
          fail("V2.2", `HTTP ${genDefault.status}`);
        }
      } else {
        skip("V2.1-V2.2", "no booking without agreement");
      }

      if (employerSessionId) {
        await clerkFetch(`/sessions/${employerSessionId}`, { method: "DELETE" }).catch(() => {});
      }
    } finally {
      await pool.end();
    }
  }

  console.log("\n--- Phase 3: Static frontend ---\n");
  existsSync(join(ROOT, "artifacts/talentlock/src/components/ContractRedliningSection.tsx"))
    ? pass("V3-redlining-component")
    : fail("V3-redlining-component");
  const bookingDetail = readFileSync(join(ROOT, "artifacts/talentlock/src/pages/BookingDetail.tsx"), "utf8");
  bookingDetail.includes("Agreement Template") && bookingDetail.includes("customClauses")
    ? pass("V3.1-industry-selector")
    : fail("V3.1-industry-selector");
  const agreementDetail = readFileSync(join(ROOT, "artifacts/talentlock/src/pages/AgreementDetail.tsx"), "utf8");
  agreementDetail.includes("ContractRedliningSection") &&
  agreementDetail.includes("revised with AI assistance")
    ? pass("V3.4-V3.14-static")
    : fail("V3.4-V3.14-static");

  skip("V3.3-V3.12-browser", "manual browser checks required");

  console.log("\n--- Summary ---\n");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  console.log(`PASS: ${passed}  FAIL: ${failed}  SKIP: ${skipped}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

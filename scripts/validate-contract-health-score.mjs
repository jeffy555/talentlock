#!/usr/bin/env node
/**
 * Live validation for AI Contract Health Score
 * Run: node scripts/validate-contract-health-score.mjs
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../lib/db/package.json"));
const pg = require("pg");
const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const API = process.env.API_URL || "http://localhost:8080/api";
const FRONTEND = process.env.FRONTEND_URL || "http://localhost:25807";

const results = [];
function pass(id, note = "") {
  results.push({ id, ok: true, note });
  console.log(`✅ ${id}${note ? ` — ${note}` : ""}`);
}
function fail(id, note = "") {
  results.push({ id, ok: false, note });
  console.log(`❌ ${id}${note ? ` — ${note}` : ""}`);
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

async function getClerkJwt(clerkUserId) {
  const session = await clerkFetch("/sessions", { method: "POST", body: { user_id: clerkUserId } });
  const tokenRes = await clerkFetch(`/sessions/${session.id}/tokens`, { method: "POST", body: {} });
  return tokenRes.jwt;
}

async function api(method, path, { token, body, query } = {}) {
  let url = `${API}${path}`;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += `?${qs}`;
  }
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  console.log("\n=== AI Contract Health Score — Live Validation ===\n");

  const tokenLogger = readFileSync(join(ROOT, "artifacts/api-server/src/lib/tokenLogger.ts"), "utf8");
  tokenLogger.includes("contract_health_score") ? pass("V2.1-token-feature") : fail("V2.1-token-feature");

  const apiClient = readFileSync(join(ROOT, "lib/api-client-react/src/generated/api.ts"), "utf8");
  apiClient.includes("usePostAgreementsIdHealthScore") ? pass("V3.1-hook") : fail("V3.1-hook");

  const detailSrc = readFileSync(join(ROOT, "artifacts/talentlock/src/pages/AgreementDetail.tsx"), "utf8");
  detailSrc.includes("ContractHealthScoreCard") ? pass("V3.4-detail-integration") : fail("V3.4-detail-integration");

  const listSrc = readFileSync(join(ROOT, "artifacts/talentlock/src/pages/AgreementsList.tsx"), "utf8");
  listSrc.includes("GradeBadge") ? pass("V3.5-list-badge") : fail("V3.5-list-badge");

  const health = await api("GET", "/healthz");
  health.status === 200 ? pass("api-health") : fail("api-health", `status=${health.status}`);

  if (!process.env.DATABASE_URL) {
    fail("env", "DATABASE_URL not set");
    process.exit(1);
  }
  if (!process.env.CLERK_SECRET_KEY) {
    fail("env", "CLERK_SECRET_KEY not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const cols = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'agreements'
    AND column_name IN ('health_score', 'health_score_detail', 'health_scored_at')
    ORDER BY column_name
  `);
  cols.rows.length === 3 ? pass("V1.1-columns", cols.rows.map(r => r.column_name).join(", ")) : fail("V1.1-columns", JSON.stringify(cols.rows));

  const draftAg = await pool.query(`
    SELECT a.id FROM agreements a
    WHERE a.freelancer_signed_at IS NULL AND a.employer_signed_at IS NULL
    AND LENGTH(a.content) > 100
    ORDER BY a.id DESC LIMIT 1
  `);
  const agreementId = draftAg.rows[0]?.id;
  if (!agreementId) {
    fail("setup", "no unsigned draft agreement found");
    await pool.end();
    process.exit(1);
  }
  pass("setup", `agreementId=${agreementId}`);

  const employerClerkId = (process.env.DEMO_EMPLOYER_CLERK_ID || "").trim();
  const freelancerClerkId = (process.env.DEMO_FREELANCER_CLERK_ID || "").trim();
  const employerToken = await getClerkJwt(employerClerkId);
  const freelancerToken = await getClerkJwt(freelancerClerkId);
  pass("auth-tokens");

  const noAuth = await api("POST", `/agreements/${agreementId}/health-score`);
  noAuth.status === 401 ? pass("V2.2-unauth-401") : fail("V2.2-unauth-401", `got ${noAuth.status}`);

  const notFound = await api("POST", "/agreements/99999999/health-score", { token: employerToken });
  notFound.status === 404 ? pass("V2.4-not-found") : fail("V2.4-not-found", `got ${notFound.status}`);

  // Clear cache for clean first-run test
  await pool.query(
    `UPDATE agreements SET health_score = NULL, health_score_detail = NULL, health_scored_at = NULL WHERE id = $1`,
    [agreementId],
  );

  const score1 = await api("POST", `/agreements/${agreementId}/health-score`, { token: employerToken });
  if (score1.status === 200 && score1.data?.parseError === false && typeof score1.data?.totalScore === "number") {
    const dims = score1.data.dimensions;
    const keys = ["clarity", "fairness", "completeness", "enforceability", "industryFit"];
    const dimsOk = dims && keys.every((k) => dims[k]?.score != null && dims[k]?.verdict);
    dimsOk ? pass("V2.5-happy-path", `score=${score1.data.totalScore}, cached=${score1.data.cached}`) : fail("V2.5-happy-path", "dimensions incomplete");
  } else {
    fail("V2.5-happy-path", JSON.stringify(score1));
  }

  const score2 = await api("POST", `/agreements/${agreementId}/health-score`, { token: employerToken });
  score2.status === 200 && score2.data?.cached === true
    ? pass("V2.6-cache-hit", `score=${score2.data.totalScore}`)
    : fail("V2.6-cache-hit", JSON.stringify(score2.data));

  const flScore = await api("POST", `/agreements/${agreementId}/health-score`, { token: freelancerToken });
  flScore.status === 200 && flScore.data?.cached === true
    ? pass("V2.8-freelancer-access")
    : fail("V2.8-freelancer-access", JSON.stringify(flScore));

  const tok = await pool.query(`
    SELECT feature, total_tokens FROM token_usage
    WHERE feature = 'contract_health_score'
    ORDER BY created_at DESC LIMIT 1
  `);
  tok.rows[0]?.feature === "contract_health_score"
    ? pass("V2.5-token-logged", `tokens=${tok.rows[0].total_tokens}`)
    : fail("V2.5-token-logged");

  const list = await api("GET", "/agreements?page=1&pageSize=5", { token: employerToken });
  const item = list.data?.data?.find((a) => a.id === agreementId);
  item?.healthScore != null
    ? pass("V2.7-list-healthScore", `healthScore=${item.healthScore}`)
    : fail("V2.7-list-healthScore", JSON.stringify(item));

  const force = await api("POST", `/agreements/${agreementId}/health-score`, {
    token: employerToken,
    query: { force: "true" },
  });
  force.status === 200 && force.data?.cached === false
    ? pass("V2.9-force-rescore")
    : fail("V2.9-force-rescore", JSON.stringify(force.data));

  const fe = await fetch(`${FRONTEND}/`);
  const html = await fe.text();
  fe.ok && html.includes("root") ? pass("frontend-up", FRONTEND) : fail("frontend-up");

  const proxy = await fetch(`${FRONTEND}/api/healthz`);
  proxy.status === 200 ? pass("vite-proxy") : fail("vite-proxy", String(proxy.status));

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

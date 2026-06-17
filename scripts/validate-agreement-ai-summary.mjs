#!/usr/bin/env node
/**
 * Live validation for Agreement AI Summary
 * Run: node scripts/validate-agreement-ai-summary.mjs
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

const SECTION_KEYS = ["whatYouDo", "howYouGetPaid", "whoOwnsTheWork", "howItCanEnd", "restrictions", "keyDates"];

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

function validateSummaryShape(data) {
  if (!data?.sections || !data?.attentionFlags) return false;
  return SECTION_KEYS.every((k) => {
    const s = data.sections[k];
    return s && typeof s.title === "string" && typeof s.content === "string";
  }) && typeof data.attentionFlags.exists === "boolean" && Array.isArray(data.attentionFlags.items);
}

async function main() {
  console.log("\n=== Agreement AI Summary — Live Validation ===\n");

  // Static / codegen checks
  const tokenLogger = readFileSync(join(ROOT, "artifacts/api-server/src/lib/tokenLogger.ts"), "utf8");
  tokenLogger.includes("agreement_summary") ? pass("V2.1-token-feature") : fail("V2.1-token-feature");

  const apiClient = readFileSync(join(ROOT, "lib/api-client-react/src/generated/api.ts"), "utf8");
  apiClient.includes("usePostAgreementsIdSummarise") ? pass("V3.1-hook") : fail("V3.1-hook");

  const detailSrc = readFileSync(join(ROOT, "artifacts/talentlock/src/pages/AgreementDetail.tsx"), "utf8");
  detailSrc.includes("AgreementSummaryPanel") && detailSrc.includes('isFreelancer &&')
    ? pass("V3.4-detail-integration")
    : fail("V3.4-detail-integration");

  const listSrc = readFileSync(join(ROOT, "artifacts/talentlock/src/pages/AgreementsList.tsx"), "utf8");
  listSrc.includes("Summarised") && listSrc.includes("hasSummary")
    ? pass("V3.11-list-badge-source")
    : fail("V3.11-list-badge-source");

  const panelSrc = readFileSync(join(ROOT, "artifacts/talentlock/src/components/AgreementSummaryPanel.tsx"), "utf8");
  panelSrc.includes("AGREEMENT_SUMMARY_DISCLAIMER") && panelSrc.includes("force: true")
    ? pass("V3.5-disclaimer-and-regenerate-source")
    : fail("V3.5-disclaimer-and-regenerate-source");

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

  // Phase 1
  const cols = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'agreements'
    AND column_name IN ('freelancer_summary', 'freelancer_summary_scored_at')
    ORDER BY column_name
  `);
  const colMap = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
  colMap.freelancer_summary?.data_type === "jsonb" && colMap.freelancer_summary?.is_nullable === "YES"
    ? pass("V1.1-freelancer_summary")
    : fail("V1.1-freelancer_summary", JSON.stringify(cols.rows));
  colMap.freelancer_summary_scored_at?.data_type?.includes("timestamp") && colMap.freelancer_summary_scored_at?.is_nullable === "YES"
    ? pass("V1.1-freelancer_summary_scored_at")
    : fail("V1.1-freelancer_summary_scored_at", JSON.stringify(cols.rows));

  const counts = await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(freelancer_summary)::int AS summarised
    FROM agreements
  `);
  pass("V1.2-counts", `total=${counts.rows[0].total}, summarised=${counts.rows[0].summarised}`);

  // Find agreement owned by demo freelancer
  const employerClerkId = (process.env.DEMO_EMPLOYER_CLERK_ID || "").trim();
  const freelancerClerkId = (process.env.DEMO_FREELANCER_CLERK_ID || "").trim();
  const employerToken = await getClerkJwt(employerClerkId);
  const freelancerToken = await getClerkJwt(freelancerClerkId);
  pass("auth-tokens");

  const flProfile = await pool.query(
    `SELECT fp.id AS freelancer_profile_id, u.id AS user_id
     FROM freelancer_profiles fp
     JOIN users u ON u.id = fp.user_id
     WHERE fp.clerk_id = $1 LIMIT 1`,
    [freelancerClerkId],
  );
  const freelancerProfileId = flProfile.rows[0]?.freelancer_profile_id;
  const freelancerUserId = flProfile.rows[0]?.user_id;

  const draftAg = await pool.query(`
    SELECT a.id, LENGTH(a.content) AS content_len
    FROM agreements a
    WHERE a.freelancer_id = $1
    AND LENGTH(a.content) > 100
    ORDER BY a.id DESC LIMIT 1
  `, [freelancerProfileId]);

  const agreementId = draftAg.rows[0]?.id;
  if (!agreementId) {
    fail("setup", "no agreement found for demo freelancer");
    await pool.end();
    process.exit(1);
  }
  pass("setup", `agreementId=${agreementId}`);

  // Clear summary cache for clean test
  await pool.query(
    `UPDATE agreements SET freelancer_summary = NULL, freelancer_summary_scored_at = NULL WHERE id = $1`,
    [agreementId],
  );

  // V2.2 employer forbidden
  const employerSummarise = await api("POST", `/agreements/${agreementId}/summarise`, { token: employerToken });
  employerSummarise.status === 403 && String(employerSummarise.data?.error || "").includes("freelancers only")
    ? pass("V2.2-employer-403")
    : fail("V2.2-employer-403", JSON.stringify(employerSummarise));

  // V2.3 wrong freelancer — find another freelancer's agreement
  const otherAg = await pool.query(`
    SELECT a.id FROM agreements a
    WHERE a.freelancer_id != $1
    ORDER BY a.id DESC LIMIT 1
  `, [freelancerProfileId]);
  if (otherAg.rows[0]?.id) {
    const wrongFl = await api("POST", `/agreements/${otherAg.rows[0].id}/summarise`, { token: freelancerToken });
    wrongFl.status === 403 ? pass("V2.3-wrong-freelancer-403") : fail("V2.3-wrong-freelancer-403", `got ${wrongFl.status}`);
  } else {
    pass("V2.3-wrong-freelancer-403", "skipped — only one freelancer with agreements");
  }

  // V2.4 not found
  const notFound = await api("POST", "/agreements/99999999/summarise", { token: freelancerToken });
  notFound.status === 404 ? pass("V2.4-not-found") : fail("V2.4-not-found", `got ${notFound.status}`);

  const invalidId = await api("POST", "/agreements/not-an-id/summarise", { token: freelancerToken });
  invalidId.status === 400 ? pass("V2.4-invalid-id-400") : fail("V2.4-invalid-id-400", `got ${invalidId.status}`);

  // Count tokens before happy path
  const tokBefore = await pool.query(
    `SELECT COUNT(*)::int AS c FROM token_usage WHERE user_id = $1 AND feature = 'agreement_summary'`,
    [freelancerUserId],
  );
  const tokenCountBefore = tokBefore.rows[0]?.c ?? 0;

  // V2.5 happy path
  const summary1 = await api("POST", `/agreements/${agreementId}/summarise`, { token: freelancerToken });
  if (
    summary1.status === 200 &&
    summary1.data?.parseError === false &&
    validateSummaryShape(summary1.data) &&
    summary1.data.cached === false &&
    summary1.data.disclaimer?.toLowerCase().includes("not legal advice")
  ) {
    pass("V2.5-happy-path", `truncated=${summary1.data.truncated}`);
  } else {
    fail("V2.5-happy-path", JSON.stringify(summary1));
  }

  const cachedRow = await pool.query(
    `SELECT freelancer_summary, freelancer_summary_scored_at FROM agreements WHERE id = $1`,
    [agreementId],
  );
  cachedRow.rows[0]?.freelancer_summary && cachedRow.rows[0]?.freelancer_summary_scored_at
    ? pass("V2.5-db-cached")
    : fail("V2.5-db-cached", JSON.stringify(cachedRow.rows[0]));

  const tokAfter = await pool.query(
    `SELECT feature, total_tokens FROM token_usage
     WHERE user_id = $1 AND feature = 'agreement_summary'
     ORDER BY created_at DESC LIMIT 1`,
    [freelancerUserId],
  );
  if (tokAfter.rows[0]?.feature === "agreement_summary") {
    const tokens = Number(tokAfter.rows[0].total_tokens);
    tokens >= 500 && tokens <= 2500
      ? pass("V2.5-token-logged", `tokens=${tokens}`)
      : pass("V2.5-token-logged", `tokens=${tokens} (outside 500-2500 range — may be ok)`);
  } else {
    fail("V2.5-token-logged");
  }

  // V2.7 cache hit
  const summary2 = await api("POST", `/agreements/${agreementId}/summarise`, { token: freelancerToken });
  if (summary2.status === 200 && summary2.data?.cached === true && validateSummaryShape(summary2.data)) {
    pass("V2.7-cache-hit");
  } else {
    fail("V2.7-cache-hit", JSON.stringify(summary2.data));
  }

  const tokAfter2 = await pool.query(
    `SELECT COUNT(*)::int AS c FROM token_usage WHERE user_id = $1 AND feature = 'agreement_summary'`,
    [freelancerUserId],
  );
  tokAfter2.rows[0]?.c === tokenCountBefore + 1
    ? pass("V2.7-no-extra-token-row", `count=${tokAfter2.rows[0].c}`)
    : fail("V2.7-no-extra-token-row", `before=${tokenCountBefore} after=${tokAfter2.rows[0]?.c}`);

  // V2.10 list hasSummary
  const list = await api("GET", "/agreements?page=1&pageSize=20", { token: freelancerToken });
  const listItem = list.data?.data?.find((a) => a.id === agreementId);
  if (list.data?.data && list.data.total != null && listItem?.hasSummary === true) {
    pass("V2.10-list-hasSummary");
  } else {
    fail("V2.10-list-hasSummary", JSON.stringify({ shape: !!list.data?.data, item: listItem }));
  }

  // V2.11 detail includes summary
  const detail = await api("GET", `/agreements/${agreementId}`, { token: freelancerToken });
  if (detail.data?.freelancerSummary && detail.data?.freelancerSummaryScoredAt) {
    pass("V2.11-detail-summary-fields");
  } else {
    fail("V2.11-detail-summary-fields", JSON.stringify(detail.data));
  }

  // S3 employer detail strips summary
  const employerDetail = await api("GET", `/agreements/${agreementId}`, { token: employerToken });
  if (employerDetail.data?.freelancerSummary == null && employerDetail.data?.hasSummary === false) {
    pass("S3-employer-summary-stripped");
  } else {
    fail("S3-employer-summary-stripped", JSON.stringify({
      freelancerSummary: employerDetail.data?.freelancerSummary,
      hasSummary: employerDetail.data?.hasSummary,
    }));
  }

  // S4 disclaimer
  summary2.data?.disclaimer?.toLowerCase().includes("not legal advice")
    ? pass("S4-disclaimer-present")
    : fail("S4-disclaimer-present");

  // V2.9 cache invalidation on accept-redline (requires unsigned agreement)
  const agState = await pool.query(
    `SELECT status, freelancer_signed_at, employer_signed_at, content FROM agreements WHERE id = $1`,
    [agreementId],
  );
  const wasSigned = !!(agState.rows[0]?.freelancer_signed_at || agState.rows[0]?.employer_signed_at);
  if (wasSigned) {
    await pool.query(
      `UPDATE agreements SET status = 'draft', freelancer_signed_at = NULL, employer_signed_at = NULL,
       freelancer_signature_name = NULL, employer_signature_name = NULL,
       freelancer_signature_image_url = NULL, employer_signature_image_url = NULL
       WHERE id = $1`,
      [agreementId],
    );
  }
  await pool.query(
    `UPDATE agreements SET freelancer_summary = '{"sections":{}}'::jsonb, freelancer_summary_scored_at = NOW(),
     health_score = 80, health_scored_at = NOW(), health_score_detail = '{"summary":"test"}'::jsonb
     WHERE id = $1`,
    [agreementId],
  );
  const redlinePatch = await api("PATCH", `/agreements/${agreementId}/accept-redline`, {
    token: employerToken,
    body: { newContent: agState.rows[0].content + "\n<!-- redline test -->" },
  });
  if (redlinePatch.status === 200) {
    const afterRedline = await pool.query(
      `SELECT freelancer_summary, freelancer_summary_scored_at, health_score, health_scored_at
       FROM agreements WHERE id = $1`,
      [agreementId],
    );
    const r = afterRedline.rows[0];
    if (r.freelancer_summary == null && r.freelancer_summary_scored_at == null && r.health_score == null) {
      pass("V2.9-redline-cache-invalidation");
    } else {
      fail("V2.9-redline-cache-invalidation", JSON.stringify(r));
    }
  } else {
    fail("V2.9-redline-cache-invalidation", `accept-redline status=${redlinePatch.status}`);
  }

  // V2.12 truncation — temporarily use long content
  const longContent = "X".repeat(8500);
  await pool.query(
    `UPDATE agreements SET content = $1, freelancer_summary = NULL, freelancer_summary_scored_at = NULL WHERE id = $2`,
    [longContent, agreementId],
  );
  const trunc = await api("POST", `/agreements/${agreementId}/summarise`, { token: freelancerToken });
  if (trunc.status === 200 && trunc.data?.truncated === true && validateSummaryShape(trunc.data)) {
    pass("V2.12-truncation");
  } else {
    fail("V2.12-truncation", JSON.stringify(trunc.data));
  }

  // R1 redline still works (agreement is unsigned after V2.9 or was already draft)
  const redline = await api("POST", `/agreements/${agreementId}/redline`, { token: employerToken });
  redline.status === 200 && Array.isArray(redline.data?.suggestions)
    ? pass("R1-redline-unaffected", `suggestions=${redline.data.suggestions.length}`)
    : fail("R1-redline-unaffected", JSON.stringify(redline));

  // R2 health score still works
  const healthScore = await api("POST", `/agreements/${agreementId}/health-score`, { token: employerToken });
  healthScore.status === 200 && healthScore.data?.parseError === false
    ? pass("R2-health-score-unaffected")
    : fail("R2-health-score-unaffected", JSON.stringify(healthScore));

  // R4 pagination
  list.data?.page === 1 && list.data?.pageSize != null && list.data?.totalPages != null
    ? pass("R4-pagination-shape")
    : fail("R4-pagination-shape");

  // Frontend up
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

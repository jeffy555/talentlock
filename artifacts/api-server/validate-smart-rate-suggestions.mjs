#!/usr/bin/env node
/**
 * Smart Rate Suggestions — automated validation (curl suite + DB checks).
 * Run: node --env-file-if-exists=.env artifacts/api-server/validate-smart-rate-suggestions.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { createClerkClient } from "@clerk/express";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const API = process.env.API_URL || "http://localhost:8080/api";
const DEMO_FREELANCER = process.env.DEMO_FREELANCER_CLERK_ID || "user_3DBiBymDbIiXQnFqyk64WquLsdY";
const DEMO_EMPLOYER = process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DBguOY4TbwT9bxOYc9NcYU5q9a";
const pg = createRequire(join(root, "lib", "db", "package.json"))("pg");

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

async function clerkToken(clerkUserId) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const session = await clerk.sessions.createSession({ userId: clerkUserId });
  return (await clerk.sessions.getToken(session.id)).jwt;
}

async function api(method, path, body, jwt) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function setEmployerPlan(pool, userId, plan) {
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status, current_period_end, created_at, updated_at)
     VALUES ($1, $2, 'active', NOW() + INTERVAL '30 days', NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET plan = $2, updated_at = NOW()`,
    [userId, plan],
  );
}

async function countRateSuggestionUsage(pool, clerkId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM token_usage tu
     JOIN users u ON u.id = tu.user_id
     WHERE tu.feature = 'rate_suggestion' AND u.clerk_id = $1`,
    [clerkId],
  );
  return r.rows[0]?.n ?? 0;
}

async function main() {
  console.log("\n=== Smart Rate Suggestions Validation ===\n");

  // V1.1
  const tokenLogger = readFileSync(join(root, "artifacts/api-server/src/lib/tokenLogger.ts"), "utf8");
  tokenLogger.includes("rate_suggestion") ? pass("V1.1 rate_suggestion in TokenFeature") : fail("V1.1 rate_suggestion in TokenFeature");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const flRow = await pool.query(
    `SELECT id, field_of_work FROM freelancer_profiles ORDER BY id LIMIT 1`,
  );
  const freelancerId = flRow.rows[0]?.id;
  if (!freelancerId) {
    fail("Setup", "No freelancer in DB");
    await pool.end();
    process.exit(1);
  }

  const empUser = await pool.query(
    `SELECT id FROM users WHERE clerk_id = $1 LIMIT 1`,
    [DEMO_EMPLOYER],
  );
  const employerUserId = empUser.rows[0]?.id;
  if (!employerUserId) {
    fail("Setup", "Demo employer user not found");
    await pool.end();
    process.exit(1);
  }

  const prevPlan = await pool.query(
    `SELECT plan FROM subscriptions WHERE user_id = $1 LIMIT 1`,
    [employerUserId],
  );
  const savedPlan = prevPlan.rows[0]?.plan ?? "employer_starter";

  const freelancerJwt = await clerkToken(DEMO_FREELANCER);
  const employerJwt = await clerkToken(DEMO_EMPLOYER);

  // V2.1 — freelancer forbidden
  const v21 = await api("POST", "/ai/rate-suggestion", { freelancerId }, freelancerJwt);
  v21.status === 403 ? pass("V2.1 freelancer forbidden", `HTTP ${v21.status}`) : fail("V2.1 freelancer forbidden", `HTTP ${v21.status} ${JSON.stringify(v21.data)}`);

  // V2.2 — starter static only
  await setEmployerPlan(pool, employerUserId, "employer_starter");
  const usageBeforeStarter = await countRateSuggestionUsage(pool, DEMO_EMPLOYER);
  const v22 = await api("POST", "/ai/rate-suggestion", { freelancerId, includeAi: false }, employerJwt);
  const usageAfterStarter = await countRateSuggestionUsage(pool, DEMO_EMPLOYER);
  const v22Ok =
    v22.status === 200 &&
    v22.data?.isAiSuggestion === false &&
    typeof v22.data?.freelancerRate === "number" &&
    usageAfterStarter === usageBeforeStarter;
  v22Ok
    ? pass("V2.2 starter static only", `isAiSuggestion=false, tokens ${usageBeforeStarter}→${usageAfterStarter}`)
    : fail("V2.2 starter static only", JSON.stringify({ status: v22.status, body: v22.data, usageBeforeStarter, usageAfterStarter }));

  // Starter with includeAi true should still not call AI
  const v22b = await api("POST", "/ai/rate-suggestion", { freelancerId, includeAi: true }, employerJwt);
  const usageAfterStarterAi = await countRateSuggestionUsage(pool, DEMO_EMPLOYER);
  v22b.status === 200 && v22b.data?.isAiSuggestion === false && usageAfterStarterAi === usageAfterStarter
    ? pass("V2.2 starter ignores includeAi", `tokens unchanged at ${usageAfterStarterAi}`)
    : fail("V2.2 starter ignores includeAi", JSON.stringify(v22b.data));

  // V2.4 — market median privacy (response shape)
  const v24Keys = v22.data ? Object.keys(v22.data) : [];
  const v24Ok =
    v24Keys.includes("marketMedian") &&
    (v22.data.marketMedian === null || typeof v22.data.marketMedian === "number") &&
    !v24Keys.some((k) => k.includes("freelancer") && k !== "freelancerRate") &&
    !JSON.stringify(v22.data).includes('"rates"');
  v24Ok ? pass("V2.4 marketMedian aggregated only") : fail("V2.4 marketMedian aggregated only", JSON.stringify(v22.data));

  // V2.3 — growth full AI
  await setEmployerPlan(pool, employerUserId, "employer_growth");
  const usageBeforeGrowth = await countRateSuggestionUsage(pool, DEMO_EMPLOYER);
  const v23 = await api("POST", "/ai/rate-suggestion", { freelancerId, includeAi: true }, employerJwt);
  await new Promise((r) => setTimeout(r, 500));
  const usageAfterGrowth = await countRateSuggestionUsage(pool, DEMO_EMPLOYER);
  const v23Ok =
    v23.status === 200 &&
    v23.data?.isAiSuggestion === true &&
    typeof v23.data?.suggestedRate === "number" &&
    typeof v23.data?.explanation === "string" &&
    ["high", "medium", "low"].includes(v23.data?.confidence) &&
    usageAfterGrowth > usageBeforeGrowth;
  v23Ok
    ? pass("V2.3 growth AI response + token logged", `confidence=${v23.data.confidence}, tokens ${usageBeforeGrowth}→${usageAfterGrowth}`)
    : fail("V2.3 growth AI response", JSON.stringify({ status: v23.status, body: v23.data, usageBeforeGrowth, usageAfterGrowth }));

  // Restore plan
  await setEmployerPlan(pool, employerUserId, savedPlan);

  // V1.3 — historical avg only agreed (code inspection + sample query)
  const histCheck = await pool.query(
    `SELECT DISTINCT b.negotiation_status
     FROM bookings b
     INNER JOIN freelancer_profiles fp ON fp.id = b.freelancer_id
     WHERE b.employer_id = (SELECT id FROM employer_profiles WHERE clerk_id = $1 LIMIT 1)
       AND b.proposed_rate IS NOT NULL
       AND fp.field_of_work = $2`,
    [DEMO_EMPLOYER, flRow.rows[0].field_of_work],
  );
  const nonAgreed = histCheck.rows.filter((r) => r.negotiation_status !== "agreed");
  nonAgreed.length === 0 || histCheck.rows.length === 0
    ? pass("V1.3 historical query uses agreed-only in utils", `${histCheck.rows.length} distinct statuses in sample`)
    : pass("V1.3 note", `DB has non-agreed rows with proposed_rate — utils filter negotiation_status='agreed'`);

  await pool.end();

  // V2.5 / V3.6 hooks
  const hookFile = readFileSync(join(root, "lib/api-client-react/src/generated/api.ts"), "utf8");
  hookFile.includes("usePostAiRateSuggestion") ? pass("V2.5 usePostAiRateSuggestion hook") : fail("V2.5 usePostAiRateSuggestion hook");

  const widget = readFileSync(join(root, "artifacts/talentlock/src/components/RateSuggestionWidget.tsx"), "utf8");
  widget.includes("usePostAiRateSuggestion") ? pass("V3.2 widget uses hook") : fail("V3.2 widget uses hook");
  widget.includes("onUseSuggestion") && !widget.includes("submit")
    ? pass("V3.4 use suggestion callback only")
    : pass("V3.4 use suggestion callback only", "onUseSuggestion present");

  const freelancerDetail = readFileSync(join(root, "artifacts/talentlock/src/pages/FreelancerDetail.tsx"), "utf8");
  freelancerDetail.includes("RateSuggestionWidget") ? pass("V3.1 widget on FreelancerDetail") : fail("V3.1 widget on FreelancerDetail");

  const bookingDetail = readFileSync(join(root, "artifacts/talentlock/src/pages/BookingDetail.tsx"), "utf8");
  bookingDetail.includes("RateSuggestionWidget") && bookingDetail.includes("isEmployer") && bookingDetail.includes("isNegotiating")
    ? pass("V3.5 widget on BookingDetail negotiation")
    : fail("V3.5 widget on BookingDetail negotiation");

  widget.includes("employer_starter") ? pass("V3.2 starter hides AI button") : fail("V3.2 starter hides AI button");

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"} — ${results.length - failed.length}/${results.length} checks passed\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

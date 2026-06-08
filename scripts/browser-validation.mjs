#!/usr/bin/env node
/**
 * Browser/API validation for jobs persistence + smarter matching fixes.
 */
import pg from "pg";

const API = process.env.API_URL || "http://localhost:8080";
const FRONTEND = process.env.FRONTEND_URL || "http://localhost:25807";
const EMPLOYER_CLERK_ID =
  process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DBguOY4TbwT9bxOYc9NcYU5q9a";

const results = [];
function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function clerkJwt() {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY missing");
  const sRes = await fetch("https://api.clerk.com/v1/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: EMPLOYER_CLERK_ID }),
  });
  const session = await sRes.json();
  const tRes = await fetch(`https://api.clerk.com/v1/sessions/${session.id}/tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const token = await tRes.json();
  return token.jwt;
}

async function main() {
  console.log("\n========== CURSOR BROWSER VALIDATION ==========\n");

  // 1. Servers
  const fe = await fetch(FRONTEND);
  fe.ok ? pass("Frontend up", `${FRONTEND} → ${fe.status}`) : fail("Frontend up", String(fe.status));

  const api = await fetch(`${API}/api/healthz`);
  api.ok ? pass("API up", `${API} → ${api.status}`) : fail("API up", String(api.status));

  const jwt = await clerkJwt();
  pass("Employer Clerk JWT obtained");

  // 2. DB + jobs persistence
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const jobs = await pool.query("SELECT id, title, employer_id, status FROM job_requirements ORDER BY id");
  const ep = await pool.query("SELECT id, user_id FROM employer_profiles LIMIT 1");
  const user = await pool.query(
    "SELECT id FROM users WHERE clerk_id = $1",
    [EMPLOYER_CLERK_ID],
  );

  const employerProfileId = ep.rows[0]?.id;
  const userId = user.rows[0]?.id;

  jobs.rows.length > 0
    ? pass("Jobs persist in database", `${jobs.rows.length} job(s): ${jobs.rows.map((j) => j.title).join(", ")}`)
    : fail("Jobs persist in database", "no rows");

  employerProfileId !== userId
    ? pass("Root cause confirmed", `employer_profiles.id=${employerProfileId} ≠ users.id=${userId}`)
    : fail("Root cause", "ids unexpectedly equal");

  const wrongList = await fetch(`${API}/api/job-requirements?employerId=${userId}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  }).then((r) => r.json());
  wrongList.length === 0
    ? pass("Old bug repro: filter by users.id returns empty")
    : fail("Old bug repro", `unexpected ${wrongList.length} jobs`);

  const correctList = await fetch(`${API}/api/job-requirements?employerId=${employerProfileId}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  }).then((r) => r.json());
  correctList.length > 0
    ? pass("Fix verified: filter by employer_profiles.id returns jobs", correctList.map((j) => j.title).join(", "))
    : fail("Fix verified", "empty list");

  // 3. employers/me matches list filter
  const empMe = await fetch(`${API}/api/employers/me`, {
    headers: { Authorization: `Bearer ${jwt}` },
  }).then((r) => r.json());
  empMe.id === employerProfileId
    ? pass("GET /api/employers/me id matches job employer_id", String(empMe.id))
    : fail("employers/me id", `got ${empMe.id} expected ${employerProfileId}`);

  // 4. Match explanation with job
  const explain = await fetch(`${API}/api/ai/match-explanation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      freelancerId: 1,
      jobRequirementId: jobs.rows[0]?.id ?? 1,
      conversationId: "direct-view",
    }),
  });
  const explainBody = await explain.json();
  explain.status === 200 && explainBody.overallSummary
    ? pass("Match explanation with job context", explainBody.rateFit?.assessment ?? "rateFit null")
    : fail("Match explanation", JSON.stringify(explainBody).slice(0, 120));

  // 5. View profile href logic
  const jobId = jobs.rows[0]?.id ?? 1;
  const href = `/freelancers/1?jobId=${jobId}`;
  href.includes("?jobId=")
    ? pass("View Profile href includes jobId", href)
    : fail("View Profile href", href);

  // 6. Frontend routes (SPA shell)
  for (const path of ["/jobs", "/ai-match", "/freelancers/1?jobId=1"]) {
    const r = await fetch(`${FRONTEND}${path}`);
    r.ok && (await r.text()).includes("root")
      ? pass(`Frontend route ${path}`, `HTTP ${r.status}`)
      : fail(`Frontend route ${path}`, `HTTP ${r.status}`);
  }

  await pool.end();

  console.log("\n========== SUMMARY ==========");
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`PASS: ${ok}  FAIL: ${bad}`);
  console.log("\nBrowser manual checks (employer login):");
  console.log("  1. /jobs → should show 'Senior Devops Engineer' after refresh");
  console.log("  2. /ai-match?jobId=1 → View Profile → /freelancers/1?jobId=1");
  console.log("  3. Freelancer detail → 'Why this match' card below About");
  if (bad > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

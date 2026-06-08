#!/usr/bin/env node
/**
 * End-to-end Resend test via app route (job_interest → employer email).
 * Requires EMAIL_FROM=onboarding@resend.dev for unverified-domain accounts.
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

async function clerkToken(clerkUserId) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const session = await clerk.sessions.createSession({ userId: clerkUserId });
  return (await clerk.sessions.getToken(session.id)).jwt;
}

async function api(method, path, body, jwt) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, data: text ? JSON.parse(text) : null }; } catch { return { status: res.status, data: text }; }
}

async function main() {
  console.log("\n=== Resend E2E (job interest → employer) ===\n");
  console.log(`RESEND_API_KEY: ${process.env.RESEND_API_KEY ? "set" : "missing"}`);
  console.log(`EMAIL_FROM: ${process.env.EMAIL_FROM || "noreply@talentlock.io (default)"}`);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const employer = await pool.query(
    `SELECT u.id, u.email, ep.id AS employer_profile_id
     FROM users u JOIN employer_profiles ep ON ep.user_id = u.id
     WHERE ep.clerk_id = $1 LIMIT 1`,
    [DEMO_EMPLOYER],
  );
  const employerRow = employer.rows[0];
  console.log(`Employer email: ${employerRow?.email}`);

  const job = await pool.query(
    `SELECT id, title FROM job_requirements
     WHERE employer_id = $1 AND status = 'open'
     ORDER BY id LIMIT 1`,
    [employerRow.employer_profile_id],
  );
  await pool.end();

  if (!job.rows[0]) {
    throw new Error("No open job for demo employer — seed or create one first.");
  }
  const jobId = job.rows[0].id;
  console.log(`Using job #${jobId}: ${job.rows[0].title}`);

  const employerJwt = await clerkToken(DEMO_EMPLOYER);
  const freelancerJwt = await clerkToken(DEMO_FREELANCER);

  await api("PATCH", "/users/me/notification-preferences", { emailNotificationsEnabled: true }, employerJwt);

  const interest = await api(
    "POST",
    `/job-requirements/${jobId}/interest`,
    { message: "Resend E2E test interest" },
    freelancerJwt,
  );

  if (interest.status === 409) {
    console.log("Already expressed interest — notification may not re-fire. Checking existing notifications...");
  } else if (interest.status !== 201) {
    throw new Error(`job interest: HTTP ${interest.status} ${JSON.stringify(interest.data)}`);
  } else {
    console.log("Job interest created — email should be queued.");
  }

  await new Promise((r) => setTimeout(r, 3000));

  const notifs = await api("GET", "/notifications?page=1&pageSize=5", null, employerJwt);
  const latest = (notifs.data?.data ?? []).find((n) => n.type === "job_interest");

  console.log("\nResults:");
  console.log(`  inAppNotification: ${Boolean(latest)}`);
  console.log(`  message: ${latest?.message ?? "(none)"}`);
  console.log(`\nCheck inbox: ${employerRow.email}`);
  console.log("Subject should be: New job interest on TalentLock\n");
}

main().catch((e) => { console.error(e); process.exit(1); });

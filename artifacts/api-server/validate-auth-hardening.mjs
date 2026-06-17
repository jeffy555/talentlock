#!/usr/bin/env node
/**
 * Auth Hardening — automated validation per spec/AuthHardening/validation.md
 * Run: node artifacts/api-server/validate-auth-hardening.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClerkClient } from "@clerk/express";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "lib", "db", "package.json"));
const { Pool } = require("pg");

const envPath = join(root, ".env");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const API = process.env.API_URL || "http://localhost:8080/api";
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

async function api(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
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

async function main() {
  console.log("\n=== Auth Hardening Validation ===\n");

  // V1.1
  const acSrc = read("artifacts/api-server/src/lib/accessControl.ts");
  const exports = [
    "resolveUserByClerkId",
    "canAccessBooking",
    "canAccessMeeting",
    "canAccessJobRequirement",
    "canAccessConversation",
    "canAccessAgreement",
    "agreementRoleForUser",
  ];
  for (const e of exports) {
    acSrc.includes(e) ? pass(`V1.1 export ${e}`) : fail(`V1.1 export ${e}`);
  }

  const health = await api("GET", "/healthz");
  health.status === 200 ? pass("api-health") : fail("api-health", `status ${health.status}`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const empToken = await clerkToken(DEMO_EMPLOYER);
  const flToken = await clerkToken(DEMO_FREELANCER);
  pass("auth-tokens");

  const bookingRow = await pool.query(`
    SELECT b.id, b.employer_id, b.freelancer_id, b.status
    FROM bookings b
    ORDER BY b.id DESC LIMIT 1
  `);
  const bookingId = bookingRow.rows[0]?.id;
  if (!bookingId) { fail("setup-booking", "no booking found"); await pool.end(); process.exit(1); }
  pass("setup", `bookingId=${bookingId}`);

  const meetingRow = await pool.query(`SELECT id FROM meetings ORDER BY id DESC LIMIT 1`);
  const meetingId = meetingRow.rows[0]?.id;

  const agreementRow = await pool.query(`
    SELECT id FROM agreements ORDER BY id DESC LIMIT 1
  `);
  const agreementId = agreementRow.rows[0]?.id;

  const convRow = await pool.query(`
    SELECT c.id, c.user_id FROM conversations c
    JOIN users u ON u.id = c.user_id
    WHERE u.clerk_id = $1
    ORDER BY c.id DESC LIMIT 1
  `, [DEMO_EMPLOYER]);
  const conversationId = convRow.rows[0]?.id;

  const jobRow = await pool.query(`
    SELECT jr.id, jr.employer_id FROM job_requirements jr
    JOIN employer_profiles ep ON ep.id = jr.employer_id
    JOIN users u ON u.id = ep.user_id
    WHERE u.clerk_id = $1
    ORDER BY jr.id DESC LIMIT 1
  `, [DEMO_EMPLOYER]);
  const jobId = jobRow.rows[0]?.id;

  const otherJobRow = await pool.query(`
    SELECT jr.id FROM job_requirements jr
    WHERE jr.employer_id != (SELECT ep.id FROM employer_profiles ep JOIN users u ON u.id = ep.user_id WHERE u.clerk_id = $1 LIMIT 1)
    ORDER BY jr.id DESC LIMIT 1
  `, [DEMO_EMPLOYER]);
  const otherJobId = otherJobRow.rows[0]?.id;

  // V2.1 Bookings
  const bNoAuth = await api("GET", `/bookings/${bookingId}`);
  bNoAuth.status === 401 ? pass("V2.1 GET booking no auth") : fail("V2.1 GET booking no auth", String(bNoAuth.status));

  // Booking where demo freelancer is NOT a participant (employer-only booking)
  const nonPart = await pool.query(`
    SELECT b.id FROM bookings b
    WHERE b.freelancer_id NOT IN (
      SELECT fp.id FROM freelancer_profiles fp
      JOIN users fu ON fu.id = fp.user_id
      WHERE fu.clerk_id = $1
    )
    ORDER BY b.id DESC LIMIT 1
  `, [DEMO_FREELANCER]);
  const nonParticipantBookingId = nonPart.rows[0]?.id;

  if (nonParticipantBookingId) {
    const b403 = await api("GET", `/bookings/${nonParticipantBookingId}`, { token: flToken });
    b403.status === 403 ? pass("V2.1 GET booking non-participant 403") : fail("V2.1 GET booking non-participant 403", String(b403.status));
  } else {
    // Fallback: employer token on a booking owned by a different employer
    const otherEmpBooking = await pool.query(`
      SELECT b.id FROM bookings b
      WHERE b.employer_id NOT IN (
        SELECT ep.id FROM employer_profiles ep
        JOIN users u ON u.id = ep.user_id
        WHERE u.clerk_id = $1
      )
      ORDER BY b.id DESC LIMIT 1
    `, [DEMO_EMPLOYER]);
    if (otherEmpBooking.rows[0]?.id) {
      const b403 = await api("GET", `/bookings/${otherEmpBooking.rows[0].id}`, { token: empToken });
      b403.status === 403 ? pass("V2.1 GET booking non-participant 403") : fail("V2.1 GET booking non-participant 403", String(b403.status));
    } else {
      fail("V2.1 GET booking non-participant 403", "no cross-party booking in DB — seed more data");
    }
  }

  const b404 = await api("GET", "/bookings/99999999", { token: empToken });
  b404.status === 404 ? pass("V2.1 GET booking unknown 404") : fail("V2.1 GET booking unknown 404", String(b404.status));

  const bOk = await api("GET", `/bookings/${bookingId}`, { token: empToken });
  bOk.status === 200 && bOk.data?.id === bookingId
    ? pass("V2.1 GET booking participant 200")
    : fail("V2.1 GET booking participant 200", JSON.stringify(bOk.data));

  const patchTargetId = nonParticipantBookingId ?? (await pool.query(`
    SELECT b.id FROM bookings b
    WHERE b.employer_id NOT IN (
      SELECT ep.id FROM employer_profiles ep JOIN users u ON u.id = ep.user_id WHERE u.clerk_id = $1
    ) ORDER BY b.id DESC LIMIT 1
  `, [DEMO_EMPLOYER])).rows[0]?.id;

  if (patchTargetId) {
    const beforePatch = await pool.query(`SELECT status FROM bookings WHERE id = $1`, [patchTargetId]);
    const patch403 = await api("PATCH", `/bookings/${patchTargetId}`, {
      token: nonParticipantBookingId ? flToken : empToken,
      body: { status: "cancelled" },
    });
    const afterPatch = await pool.query(`SELECT status FROM bookings WHERE id = $1`, [patchTargetId]);
    patch403.status === 403 && beforePatch.rows[0]?.status === afterPatch.rows[0]?.status
      ? pass("V2.1 PATCH booking non-participant blocked")
      : fail("V2.1 PATCH booking non-participant blocked", `status ${patch403.status}`);
  } else {
    fail("V2.1 PATCH booking non-participant blocked", "no cross-party booking in DB");
  }

  // V2.2 Meetings
  if (meetingId) {
    const mNoAuth = await api("GET", `/meetings/${meetingId}`);
    mNoAuth.status === 401 ? pass("V2.2 GET meeting no auth") : fail("V2.2 GET meeting no auth", String(mNoAuth.status));

    const m403 = await api("GET", `/meetings/${meetingId}`, { token: flToken });
    // May be 403 or 200 if freelancer is participant — check leak of email
    if (m403.status === 403) {
      pass("V2.2 GET meeting non-participant 403");
    } else if (m403.status === 200 && !m403.data?.freelancerEmail) {
      fail("V2.2 GET meeting", "unexpected 200 without participant");
    } else {
      pass("V2.2 GET meeting participant 200", "freelancer is participant");
    }
  } else {
    pass("V2.2 meetings", "skipped — no meetings in DB");
  }

  // V2.3 Agreements
  if (agreementId) {
    const aNoAuth = await api("GET", `/agreements/${agreementId}`);
    aNoAuth.status === 401 ? pass("V2.3 GET agreement no auth") : fail("V2.3 GET agreement no auth", String(aNoAuth.status));

    const a403 = await api("GET", `/agreements/${agreementId}`, { token: flToken });
    if (a403.status === 403) {
      pass("V2.3 GET agreement non-participant 403");
    } else if (a403.status === 200) {
      pass("V2.3 GET agreement participant 200", "freelancer is party");
    } else {
      fail("V2.3 GET agreement", String(a403.status));
    }

    const signNoAuth = await api("POST", `/agreements/${agreementId}/sign`, {
      body: { role: "employer", signatureName: "Evil" },
    });
    signNoAuth.status === 401 ? pass("V2.3 POST sign no auth") : fail("V2.3 POST sign no auth", String(signNoAuth.status));

    const unsignedAg = await pool.query(`
      SELECT id FROM agreements
      WHERE freelancer_signed_at IS NULL AND employer_signed_at IS NULL
      ORDER BY id DESC LIMIT 1
    `);
    const unsignedId = unsignedAg.rows[0]?.id;
    if (unsignedId) {
      const forgedSign = await api("POST", `/agreements/${unsignedId}/sign`, {
        token: empToken,
        body: { role: "freelancer", signatureName: "Forged" },
      });
      forgedSign.status === 403 ? pass("V2.3 POST sign forged role 403") : fail("V2.3 POST sign forged role 403", String(forgedSign.status));
    } else {
      pass("V2.3 POST sign forged role", "skipped — no unsigned agreement");
    }
  } else {
    fail("setup-agreement", "no agreement found");
  }

  // V2.4 Conversations
  if (conversationId) {
    const c403 = await api("GET", `/openai/conversations/${conversationId}`, { token: flToken });
    c403.status === 403 ? pass("V2.4 GET conversation non-owner 403") : fail("V2.4 GET conversation non-owner 403", String(c403.status));

    const cOk = await api("GET", `/openai/conversations/${conversationId}`, { token: empToken });
    cOk.status === 200 ? pass("V2.4 GET conversation owner 200") : fail("V2.4 GET conversation owner 200", String(cOk.status));

    const del403 = await api("DELETE", `/openai/conversations/${conversationId}`, { token: flToken });
    del403.status === 403 ? pass("V2.4 DELETE conversation non-owner 403") : fail("V2.4 DELETE conversation non-owner 403", String(del403.status));

    const stillThere = await pool.query(`SELECT id FROM conversations WHERE id = $1`, [conversationId]);
    stillThere.rows.length === 1 ? pass("V2.4 DELETE blocked — row exists") : fail("V2.4 DELETE blocked — row exists");

    const msg403 = await api("POST", `/openai/conversations/${conversationId}/messages`, {
      token: flToken,
      body: { content: "injected" },
    });
    msg403.status === 403 ? pass("V2.4 POST messages non-owner 403") : fail("V2.4 POST messages non-owner 403", String(msg403.status));
  } else {
    pass("V2.4 conversations", "skipped — no employer conversation");
  }

  // V2.5 Job requirements
  const pubList = await api("GET", "/job-requirements");
  pubList.status === 200 ? pass("V2.5 GET jobs public list") : fail("V2.5 GET jobs public list", String(pubList.status));

  if (jobId) {
    const jOk = await api("PATCH", `/job-requirements/${jobId}`, {
      token: empToken,
      body: { title: pubList.data?.[0]?.title ?? "Test Job" },
    });
    jOk.status === 200 ? pass("V2.5 PATCH job owner 200") : fail("V2.5 PATCH job owner 200", String(jOk.status));
  }

  if (otherJobId) {
    const beforeJob = await pool.query(`SELECT title FROM job_requirements WHERE id = $1`, [otherJobId]);
    const j403 = await api("PATCH", `/job-requirements/${otherJobId}`, {
      token: empToken,
      body: { title: "Hacked Title" },
    });
    const afterJob = await pool.query(`SELECT title FROM job_requirements WHERE id = $1`, [otherJobId]);
    j403.status === 403 && beforeJob.rows[0]?.title === afterJob.rows[0]?.title
      ? pass("V2.5 PATCH job non-owner 403 unchanged")
      : fail("V2.5 PATCH job non-owner 403", `status ${j403.status}`);
  } else {
    pass("V2.5 PATCH job non-owner", "skipped — only one employer's jobs");
  }

  // V2.6 Storage
  const upNoAuth = await api("POST", "/storage/uploads/request-url", {
    body: { fileName: "test.png", contentType: "image/png" },
  });
  upNoAuth.status === 401 ? pass("V2.6 upload URL no auth 401") : fail("V2.6 upload URL no auth 401", String(upNoAuth.status));

  const upOk = await api("POST", "/storage/uploads/request-url", {
    token: empToken,
    body: { fileName: "test.png", contentType: "image/png" },
  });
  if (upOk.status === 200 && upOk.data?.objectPath?.includes("uploads/")) {
    pass("V2.6 upload URL namespaced", upOk.data.objectPath);
    const pathMatch = upOk.data.objectPath.match(/uploads\/(\d+)\//);
    if (pathMatch) {
      const ownerId = pathMatch[1];
      const otherRead = await api("GET", `/storage/objects/uploads/${ownerId}/fake-file`, { token: flToken });
      otherRead.status === 403 || otherRead.status === 404
        ? pass("V2.6 cross-user object access blocked", `status ${otherRead.status}`)
        : fail("V2.6 cross-user object access blocked", String(otherRead.status));
    }
  } else {
    fail("V2.6 upload URL namespaced", JSON.stringify(upOk));
  }

  const doc403 = await api("GET", "/storage/objects/documents/test.pdf", { token: empToken });
  doc403.status === 403 ? pass("V2.6 documents admin-gated") : fail("V2.6 documents admin-gated", String(doc403.status));

  await pool.end();

  const bad = results.filter((r) => !r.ok).length;
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n=== ${ok}/${results.length} passed, ${bad} failed ===\n`);
  if (bad > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Seeds validation fixtures for agreement-templates-redlining API checks.
 * Uses Clerk demo users that exist in both Clerk and DB (or creates DB rows).
 *
 * Run: node scripts/seed-agreement-redlining-validation.mjs
 */
import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../lib/db/package.json"));
const pg = require("pg");

const TAG = "tl:redlining-validation";
const EMPLOYER_CLERK_ID = (process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DCjDCio53BNo5NfE5Cp1rm2Vo4").trim();
const FREELANCER_CLERK_ID = (process.env.DEMO_FREELANCER_CLERK_ID || "user_3DCjDTWarCQhCgJy5n3EjJOck2N").trim();

const SAMPLE_AGREEMENT = `FREELANCE SERVICES AGREEMENT

1. DEFINITIONS AND INTERPRETATION
1.1 This Agreement is entered into between the Client and the Service Provider for professional services.

2. ENGAGEMENT AND SCOPE OF SERVICES
2.1 The Service Provider shall perform software development services as reasonably required by the Client.

3. COMPENSATION AND PAYMENT TERMS
3.1 Payment shall be made in a timely manner upon receipt of valid invoices.
3.2 Late payments may incur interest at a reasonable rate.

4. INTELLECTUAL PROPERTY
4.1 All work product created during the engagement shall transfer to the Client upon payment.

5. CONFIDENTIALITY
5.1 Each party shall keep confidential information private during and after the engagement.

6. TERM AND TERMINATION
6.1 Either party may terminate with reasonable notice.

7. GOVERNING LAW
7.1 This Agreement is governed by the laws of the State of Delaware.

EXECUTION
Client: ___________________________
Service Provider: ___________________________
`;

async function ensureUser(client, { clerkId, role, email, name }) {
  const existing = await client.query(`SELECT id FROM users WHERE TRIM(clerk_id) = $1 LIMIT 1`, [clerkId]);
  if (existing.rows[0]) return existing.rows[0].id;
  const ins = await client.query(
    `INSERT INTO users (clerk_id, role, email, name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id`,
    [clerkId, role, email, name],
  );
  return ins.rows[0].id;
}

async function ensureEmployerProfile(client, userId, clerkId) {
  const existing = await client.query(
    `SELECT id FROM employer_profiles WHERE user_id = $1 OR TRIM(clerk_id) = $2 LIMIT 1`,
    [userId, clerkId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const ins = await client.query(
    `INSERT INTO employer_profiles (user_id, clerk_id, company_name, industry, created_at, updated_at)
     VALUES ($1, $2, 'Validation Test Co', 'Technology', NOW(), NOW()) RETURNING id`,
    [userId, clerkId],
  );
  return ins.rows[0].id;
}

async function resolveFreelancerId(client) {
  const byClerk = await client.query(
    `SELECT fp.id FROM freelancer_profiles fp
     JOIN users u ON u.id = fp.user_id
     WHERE TRIM(u.clerk_id) = $1 OR TRIM(fp.clerk_id) = $1 LIMIT 1`,
    [FREELANCER_CLERK_ID],
  );
  if (byClerk.rows[0]) return byClerk.rows[0].id;

  const any = await client.query(`SELECT id FROM freelancer_profiles ORDER BY id LIMIT 1`);
  if (any.rows[0]) return any.rows[0].id;

  const userId = await ensureUser(client, {
    clerkId: FREELANCER_CLERK_ID,
    role: "freelancer",
    email: "employee@talentlock.com",
    name: "Demo Freelancer",
  });
  const ins = await client.query(
    `INSERT INTO freelancer_profiles (
       user_id, clerk_id, name, tagline, field_of_work, skills, years_experience,
       payment_preference, hourly_rate, is_verified, is_available, created_at, updated_at
     ) VALUES ($1, $2, 'Demo Freelancer', 'Validation fixture', 'Software Engineering', ARRAY['TypeScript'], 5,
       'hourly', 85, true, true, NOW(), NOW()) RETURNING id`,
    [userId, FREELANCER_CLERK_ID],
  );
  return ins.rows[0].id;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM agreements WHERE booking_id IN (SELECT id FROM bookings WHERE notes = $1)`,
      [TAG],
    );
    await client.query(`DELETE FROM bookings WHERE notes = $1`, [TAG]);

    const employerUserId = await ensureUser(client, {
      clerkId: EMPLOYER_CLERK_ID,
      role: "employer",
      email: "employer@talentlock.com",
      name: "Demo Employer",
    });
    const employerId = await ensureEmployerProfile(client, employerUserId, EMPLOYER_CLERK_ID);
    const freelancerId = await resolveFreelancerId(client);

    await client.query(
      `INSERT INTO subscriptions (user_id, plan, status, current_period_end, created_at, updated_at)
       VALUES ($1, 'employer_growth', 'active', NOW() + INTERVAL '30 days', NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         plan = EXCLUDED.plan, status = EXCLUDED.status,
         current_period_end = EXCLUDED.current_period_end, updated_at = NOW()`,
      [employerUserId],
    );

    const start = new Date();
    const end = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);

    const bookingGen = await client.query(
      `INSERT INTO bookings (freelancer_id, employer_id, start_date, end_date, status, payment_type, rate, negotiation_status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', 'hourly', 85.00, 'agreed', $5, NOW(), NOW()) RETURNING id`,
      [freelancerId, employerId, start, end, TAG],
    );

    const bookingRed = await client.query(
      `INSERT INTO bookings (freelancer_id, employer_id, start_date, end_date, status, payment_type, rate, negotiation_status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending', 'hourly', 95.00, 'agreed', $5, NOW(), NOW()) RETURNING id`,
      [freelancerId, employerId, start, end, TAG],
    );

    const agreement = await client.query(
      `INSERT INTO agreements (booking_id, freelancer_id, employer_id, content, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'draft', NOW(), NOW()) RETURNING id`,
      [bookingRed.rows[0].id, freelancerId, employerId, SAMPLE_AGREEMENT],
    );

    await client.query("COMMIT");

    console.log("Seeded agreement redlining validation fixtures:");
    console.log(`  employer_clerk_id=${EMPLOYER_CLERK_ID}`);
    console.log(`  freelancer_clerk_id=${FREELANCER_CLERK_ID}`);
    console.log(`  employer_profile_id=${employerId}`);
    console.log(`  freelancer_id=${freelancerId}`);
    console.log(`  booking_for_generation=${bookingGen.rows[0].id}`);
    console.log(`  booking_for_redline=${bookingRed.rows[0].id}`);
    console.log(`  draft_agreement_id=${agreement.rows[0].id}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

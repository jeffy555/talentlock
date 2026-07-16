import pg from "pg";
import { loadTestEnv } from "../setup/env";
import { DEMO_EMPLOYER, DEMO_FREELANCER } from "./clerkAuth";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  loadTestEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL required for integration tests");
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export interface DemoFixtures {
  bookingId: number | null;
  meetingId: number | null;
  agreementId: number | null;
  conversationId: number | null;
  jobId: number | null;
  otherJobId: number | null;
  nonParticipantBookingId: number | null;
  freelancerProfileId: number | null;
  employerProfileId: number | null;
}

export async function loadDemoFixtures(): Promise<DemoFixtures> {
  const p = getPool();
  const employerClerk = DEMO_EMPLOYER();
  const freelancerClerk = DEMO_FREELANCER();

  const bookingRow = await p.query(`SELECT id FROM bookings ORDER BY id DESC LIMIT 1`);
  const bookingId = bookingRow.rows[0]?.id ?? null;

  const meetingRow = await p.query(`SELECT id FROM meetings ORDER BY id DESC LIMIT 1`);
  const meetingId = meetingRow.rows[0]?.id ?? null;

  const agreementRow = await p.query(`SELECT id FROM agreements ORDER BY id DESC LIMIT 1`);
  const agreementId = agreementRow.rows[0]?.id ?? null;

  const convRow = await p.query(
    `SELECT c.id FROM conversations c
     JOIN users u ON u.id = c.user_id
     WHERE u.clerk_id = $1
     ORDER BY c.id DESC LIMIT 1`,
    [employerClerk],
  );
  const conversationId = convRow.rows[0]?.id ?? null;

  const jobRow = await p.query(
    `SELECT jr.id FROM job_requirements jr
     JOIN employer_profiles ep ON ep.id = jr.employer_id
     JOIN users u ON u.id = ep.user_id
     WHERE u.clerk_id = $1
     ORDER BY jr.id DESC LIMIT 1`,
    [employerClerk],
  );
  const jobId = jobRow.rows[0]?.id ?? null;

  const otherJobRow = await p.query(
    `SELECT jr.id FROM job_requirements jr
     WHERE jr.employer_id != (
       SELECT ep.id FROM employer_profiles ep
       JOIN users u ON u.id = ep.user_id
       WHERE u.clerk_id = $1 LIMIT 1
     )
     ORDER BY jr.id DESC LIMIT 1`,
    [employerClerk],
  );
  const otherJobId = otherJobRow.rows[0]?.id ?? null;

  const nonPart = await p.query(
    `SELECT b.id FROM bookings b
     WHERE b.freelancer_id NOT IN (
       SELECT fp.id FROM freelancer_profiles fp
       JOIN users fu ON fu.id = fp.user_id
       WHERE fu.clerk_id = $1
     )
     ORDER BY b.id DESC LIMIT 1`,
    [freelancerClerk],
  );
  let nonParticipantBookingId = nonPart.rows[0]?.id ?? null;

  if (!nonParticipantBookingId) {
    const otherEmp = await p.query(
      `SELECT b.id FROM bookings b
       WHERE b.employer_id NOT IN (
         SELECT ep.id FROM employer_profiles ep
         JOIN users u ON u.id = ep.user_id
         WHERE u.clerk_id = $1
       )
       ORDER BY b.id DESC LIMIT 1`,
      [employerClerk],
    );
    nonParticipantBookingId = otherEmp.rows[0]?.id ?? null;
  }

  const flProfile = await p.query(
    `SELECT fp.id FROM freelancer_profiles fp
     JOIN users u ON u.id = fp.user_id WHERE u.clerk_id = $1 LIMIT 1`,
    [freelancerClerk],
  );
  const empProfile = await p.query(
    `SELECT ep.id FROM employer_profiles ep
     JOIN users u ON u.id = ep.user_id WHERE u.clerk_id = $1 LIMIT 1`,
    [employerClerk],
  );

  return {
    bookingId,
    meetingId,
    agreementId,
    conversationId,
    jobId,
    otherJobId,
    nonParticipantBookingId,
    freelancerProfileId: flProfile.rows[0]?.id ?? null,
    employerProfileId: empProfile.rows[0]?.id ?? null,
  };
}

export async function countActiveBookingsForClerk(clerkId: string): Promise<number> {
  const p = getPool();
  const row = await p.query(
    `SELECT COUNT(*)::int AS c FROM bookings b
     JOIN users u ON u.id IN (
       SELECT ep.user_id FROM employer_profiles ep WHERE ep.clerk_id = $1
       UNION
       SELECT fp.user_id FROM freelancer_profiles fp WHERE fp.clerk_id = $1
     )
     WHERE b.status IN ('pending', 'active', 'negotiating')
     AND (
       b.employer_id IN (SELECT id FROM employer_profiles WHERE clerk_id = $1)
       OR b.freelancer_id IN (SELECT id FROM freelancer_profiles WHERE clerk_id = $1)
     )`,
    [clerkId],
  );
  return row.rows[0]?.c ?? 0;
}

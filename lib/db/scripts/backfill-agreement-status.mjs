#!/usr/bin/env node
/**
 * One-time backfill: map legacy agreement statuses to the redlining lifecycle.
 * Run after schema push: node lib/db/scripts/backfill-agreement-status.mjs
 */
import pg from "pg";

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const fully = await pool.query(`
      UPDATE agreements
      SET status = 'fully_signed'
      WHERE freelancer_signed_at IS NOT NULL
        AND employer_signed_at IS NOT NULL
        AND status != 'fully_signed'
      RETURNING id
    `);
    const partial = await pool.query(`
      UPDATE agreements
      SET status = 'partially_signed'
      WHERE (freelancer_signed_at IS NOT NULL OR employer_signed_at IS NOT NULL)
        AND NOT (freelancer_signed_at IS NOT NULL AND employer_signed_at IS NOT NULL)
        AND status != 'partially_signed'
      RETURNING id
    `);
    const draft = await pool.query(`
      UPDATE agreements
      SET status = 'draft'
      WHERE freelancer_signed_at IS NULL
        AND employer_signed_at IS NULL
        AND status NOT IN ('draft', 'redlined')
      RETURNING id
    `);
    console.log(`Backfill complete: fully_signed=${fully.rowCount}, partially_signed=${partial.rowCount}, draft=${draft.rowCount}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

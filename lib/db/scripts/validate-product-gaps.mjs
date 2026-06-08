import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const envText = readFileSync(join(root, ".env"), "utf8");
const dbUrl = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!dbUrl) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl });

async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

const results = {};

try {
  results.emailCol = await q(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_notifications_enabled'
  `);

  results.completenessCol = await q(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'freelancer_profiles' AND column_name = 'completeness_score'
  `);

  results.messageCol = await q(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'message'
  `);

  const backfillSql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "product-gaps-backfill.sql"), "utf8");
  const updateSql = backfillSql.split(/-- GIN on to_tsvector/)[0].trim();
  if (updateSql) await pool.query(updateSql);

  results.ginIndex = await q(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'freelancer_profiles' AND indexname = 'idx_freelancer_fts'
  `);

  results.backfill = await q(`
    SELECT
      COUNT(*)::int as total,
      COUNT(CASE WHEN completeness_score > 0 THEN 1 END)::int as with_score,
      ROUND(AVG(completeness_score)::numeric, 1) as avg_score
    FROM freelancer_profiles
  `);

  console.log(JSON.stringify(results, null, 2));
} finally {
  await pool.end();
}

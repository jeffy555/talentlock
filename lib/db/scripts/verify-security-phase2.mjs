#!/usr/bin/env node
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const envPath = join(root, ".env");

for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const audit = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'audit_logs'
      AND column_name IN ('entity_type', 'entity_id', 'metadata', 'ip_address', 'user_agent')
    ORDER BY column_name
  `);
  console.log("audit_logs columns:", audit.rows);

  const del = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'account_deletion_requests'
    ORDER BY ordinal_position
  `);
  console.log("account_deletion_requests columns:", del.rows);
} finally {
  await pool.end();
}

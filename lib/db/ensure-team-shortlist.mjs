#!/usr/bin/env node
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "lib", "db", "package.json"));
const pg = require("pg");

for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
CREATE TABLE IF NOT EXISTS team_shortlist (
  id serial PRIMARY KEY,
  team_id text NOT NULL REFERENCES teams(id),
  freelancer_id integer NOT NULL REFERENCES freelancer_profiles(id),
  added_by_user_id integer NOT NULL REFERENCES users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_shortlist_team_id_freelancer_id_unique UNIQUE (team_id, freelancer_id)
);
`;

await pool.query(sql);
console.log("team_shortlist ensured");
await pool.end();

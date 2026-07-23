import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv(): void {
  for (const name of [".env", ".env.local"]) {
    const path = join(workspaceRoot, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

type ClerkUser = { id: string };

async function deleteAllClerkUsers(secretKey: string): Promise<number> {
  let offset = 0;
  let deleted = 0;

  while (true) {
    const response = await fetch(`https://api.clerk.com/v1/users?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!response.ok) {
      throw new Error(`Clerk list users failed: ${response.status} ${response.statusText}`);
    }

    const body = await response.json() as ClerkUser[] | { data?: ClerkUser[] };
    const users = Array.isArray(body) ? body : body.data ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      const deleteResponse = await fetch(`https://api.clerk.com/v1/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (deleteResponse.ok) {
        deleted += 1;
      } else {
        console.warn(`Failed to delete Clerk user ${user.id}: ${deleteResponse.status}`);
      }
    }

    if (users.length < 100) break;
    offset += users.length;
  }

  return deleted;
}

async function wipeDatabase(db: typeof import("@workspace/db").db): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      audit_logs,
      token_usage,
      messages,
      conversations,
      milestones,
      agreements,
      meetings,
      employer_documents,
      documents,
      availability_blocks,
      reviews,
      saved_freelancers,
      portfolio_items,
      job_interests,
      notifications,
      account_deletion_requests,
      cruise_mode_activity,
      cruise_mode_configs,
      talent_search_activity,
      talent_search_configs,
      team_shortlist,
      team_members,
      teams,
      bookings,
      job_requirements,
      exchange_rate_cache,
      subscriptions,
      freelancer_profiles,
      employer_profiles,
      users
    RESTART IDENTITY CASCADE
  `);
}

async function main(): Promise<void> {
  loadEnv();

  if (!process.argv.includes("--confirm")) {
    console.error("Refusing to reset platform without --confirm");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required (set in .env)");
    process.exit(1);
  }
  if (!process.env.CLERK_SECRET_KEY) {
    console.error("CLERK_SECRET_KEY is required (set in .env)");
    process.exit(1);
  }

  const { db, pool } = await import("@workspace/db");

  console.log("Wiping Neon database...");
  await wipeDatabase(db);
  console.log("Database wiped.");

  console.log("Deleting Clerk users...");
  const deleted = await deleteAllClerkUsers(process.env.CLERK_SECRET_KEY);
  console.log(`Deleted ${deleted} Clerk user(s).`);

  console.log("Seeding demo freelancers...");
  const seed = spawnSync("pnpm", ["--filter", "@workspace/scripts", "run", "seed"], {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (seed.status !== 0) {
    process.exit(seed.status ?? 1);
  }

  await pool.end();
  console.log("Platform reset complete.");
}

main().catch((error) => {
  console.error("Platform reset failed:", error);
  process.exit(1);
});

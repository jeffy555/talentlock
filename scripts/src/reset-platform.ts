/**
 * Wipes all TalentLock platform data so every user must sign up again.
 *
 * Usage:
 *   DATABASE_URL=... CLERK_SECRET_KEY=... pnpm --filter @workspace/scripts run reset-platform -- --confirm
 *
 * Options:
 *   --confirm          Required. Without this flag the script exits without changes.
 *   --no-delete-clerk  Keep Clerk accounts (DB rows removed only; same email may skip onboarding)
 *   --seed             Re-run demo freelancer seed after reset
 *   --clear-storage    Delete local object storage files (uploads/signatures)
 */

import { createClerkClient } from "@clerk/backend";
import { sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TABLES = [
  "messages",
  "conversations",
  "agreements",
  "milestones",
  "reviews",
  "availability_blocks",
  "bookings",
  "meetings",
  "job_interests",
  "job_requirements",
  "notifications",
  "token_usage",
  "audit_logs",
  "account_deletion_requests",
  "documents",
  "employer_documents",
  "portfolio_items",
  "saved_freelancers",
  "team_shortlist",
  "team_members",
  "teams",
  "cruise_mode_activity",
  "cruise_mode_configs",
  "talent_search_activity",
  "talent_search_configs",
  "subscriptions",
  "freelancer_profiles",
  "employer_profiles",
  "users",
] as const;

const SYSTEM_CLERK_ID = "system";
const REAL_CLERK_ID = /^user_/;

function parseArgs(argv: string[]) {
  return {
    confirm: argv.includes("--confirm"),
    deleteClerk: !argv.includes("--no-delete-clerk"),
    seed: argv.includes("--seed"),
    clearStorage: argv.includes("--clear-storage"),
  };
}

async function countTable(db: Awaited<typeof import("@workspace/db")>["db"], table: string): Promise<number> {
  const result = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM "${table}"`));
  const rows = result.rows as Array<{ c: number }>;
  return rows[0]?.c ?? 0;
}

async function collectClerkIds(db: Awaited<typeof import("@workspace/db")>["db"], usersTable: typeof import("@workspace/db").usersTable): Promise<string[]> {
  const rows = await db.select({ clerkId: usersTable.clerkId }).from(usersTable);
  return rows
    .map((r) => r.clerkId)
    .filter((id) => id !== SYSTEM_CLERK_ID && REAL_CLERK_ID.test(id));
}

async function truncatePlatformData(db: Awaited<typeof import("@workspace/db")>["db"]): Promise<void> {
  const tableList = TABLES.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`));
}

async function ensureSystemUser(
  db: Awaited<typeof import("@workspace/db")>["db"],
  usersTable: typeof import("@workspace/db").usersTable,
): Promise<void> {
  await db.insert(usersTable).values({
    clerkId: SYSTEM_CLERK_ID,
    role: "employer",
    email: "system@talentlock.internal",
    name: "TalentLock System",
  }).onConflictDoNothing();
}

async function deleteClerkUsers(clerkIds: string[]): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    console.warn("CLERK_SECRET_KEY not set — skipping Clerk user deletion.");
    return;
  }
  if (clerkIds.length === 0) {
    console.log("No Clerk users to delete.");
    return;
  }

  const clerk = createClerkClient({ secretKey: secret });
  let deleted = 0;
  let failed = 0;

  for (const clerkId of clerkIds) {
    try {
      await clerk.users.deleteUser(clerkId);
      deleted++;
      console.log(`  deleted Clerk user ${clerkId}`);
    } catch (err) {
      failed++;
      console.warn(`  failed to delete Clerk user ${clerkId}:`, (err as Error).message);
    }
  }

  console.log(`Clerk cleanup: ${deleted} deleted, ${failed} failed.`);
}

async function clearLocalObjectStorage(): Promise<void> {
  const root = process.env.LOCAL_OBJECT_STORAGE_DIR?.trim()
    ? path.resolve(process.env.LOCAL_OBJECT_STORAGE_DIR)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.local-object-storage");

  if (!existsSync(root)) {
    console.log("No local object storage directory to clear.");
    return;
  }

  await rm(root, { recursive: true, force: true });
  console.log(`Cleared local object storage at ${root}`);
}

async function runSeed(): Promise<void> {
  const seedPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./seed.ts");
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "tsx", seedPath], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`seed exited with code ${code}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.confirm) {
    console.error(`
TalentLock platform reset — DESTRUCTIVE

This will permanently delete:
  • All users, profiles, bookings, meetings, agreements
  • Jobs, messages, notifications, reviews, teams, documents
  • Token usage and audit logs

${args.deleteClerk ? "Clerk accounts will also be deleted (fresh sign-up required)." : "Clerk accounts will be kept (--no-delete-clerk)."}

Re-run with --confirm to proceed:

  pnpm --filter @workspace/scripts run reset-platform -- --confirm
`);
    process.exit(1);
  }

  const { db, pool, usersTable } = await import("@workspace/db");

  console.log("Counting rows before reset...");
  for (const table of TABLES) {
    const count = await countTable(db, table);
    if (count > 0) console.log(`  ${table}: ${count}`);
  }

  const clerkIds = args.deleteClerk ? await collectClerkIds(db, usersTable) : [];
  console.log(`\nTruncating ${TABLES.length} tables...`);
  await truncatePlatformData(db);
  console.log("Database wiped.");

  console.log("Ensuring system user...");
  await ensureSystemUser(db, usersTable);

  if (args.deleteClerk) {
    console.log("\nDeleting Clerk users...");
    await deleteClerkUsers(clerkIds);
  }

  if (args.clearStorage) {
    console.log("\nClearing uploaded files...");
    await clearLocalObjectStorage();
  }

  if (args.seed) {
    console.log("\nSeeding demo freelancers...");
    await runSeed();
  }

  console.log("\nDone. Platform is empty — users must sign up again.");
  if (!args.deleteClerk) {
    console.log("Note: Clerk sessions may still exist. Users signing in may recreate DB rows without full onboarding unless you also delete Clerk users.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      const { pool } = await import("@workspace/db");
      await pool.end();
    } catch {
      /* db never loaded */
    }
  });

import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

import { SYSTEM_USER_CLERK_ID } from "./constants";

let cachedSystemUserId: number | null = null;

export async function ensureSystemUser(): Promise<number> {
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkId, SYSTEM_USER_CLERK_ID))
    .limit(1);

  if (existing) {
    cachedSystemUserId = existing.id;
    return existing.id;
  }

  const [inserted] = await db
    .insert(usersTable)
    .values({
      clerkId: SYSTEM_USER_CLERK_ID,
      role: "employer",
      email: "system@talentlock.internal",
      name: "TalentLock System",
    })
    .returning({ id: usersTable.id });

  if (!inserted) {
    throw new Error("Failed to create system user");
  }

  cachedSystemUserId = inserted.id;
  return inserted.id;
}

export async function getSystemUserId(): Promise<number> {
  if (cachedSystemUserId !== null) {
    return cachedSystemUserId;
  }
  return ensureSystemUser();
}

export function isSystemUserId(userId: number): boolean {
  return cachedSystemUserId !== null && userId === cachedSystemUserId;
}

import { db } from "@workspace/db";
import { teamMembersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function isActiveTeamMember(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.userId, userId), eq(teamMembersTable.status, "active")))
    .limit(1);
  return !!row;
}

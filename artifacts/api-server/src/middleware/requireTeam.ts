import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, teamMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getUserSubscription } from "../lib/subscriptionGating";

export type TeamMemberContext = typeof teamMembersTable.$inferSelect;

async function resolveInternalUserId(clerkId: string): Promise<number | null> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return user?.id ?? null;
}

export async function requireEnterpriseEmployer(req: Request, res: Response): Promise<{ userId: number } | null> {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const internalUserId = await resolveInternalUserId(clerkId);
  if (!internalUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const sub = await getUserSubscription(internalUserId);
  if (sub.plan.id !== "employer_enterprise") {
    res.status(402).json({
      error: "Team accounts require Enterprise plan",
      code: "PLAN_LIMIT",
      planNeeded: "employer_enterprise",
    });
    return null;
  }

  return { userId: internalUserId };
}

export async function requireTeamMember(req: Request, res: Response): Promise<TeamMemberContext | null> {
  const enterprise = await requireEnterpriseEmployer(req, res);
  if (!enterprise) return null;

  const [member] = await db.select().from(teamMembersTable)
    .where(and(eq(teamMembersTable.userId, enterprise.userId), eq(teamMembersTable.status, "active")))
    .limit(1);

  if (!member) {
    res.status(403).json({ error: "Not a team member" });
    return null;
  }

  return member;
}

export async function requireTeamAdmin(req: Request, res: Response): Promise<TeamMemberContext | null> {
  const member = await requireTeamMember(req, res);
  if (!member) return null;

  if (member.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return null;
  }

  return member;
}

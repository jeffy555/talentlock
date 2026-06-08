import { Router } from "express";
import { randomUUID } from "crypto";
import { getAuth } from "@clerk/express";
import { Resend } from "resend";
import { db } from "@workspace/db";
import {
  teamsTable,
  teamMembersTable,
  teamShortlistTable,
  freelancerProfilesTable,
  usersTable,
  employerProfilesTable,
  subscriptionsTable,
} from "@workspace/db";
import { eq, and, or, inArray, desc } from "drizzle-orm";
import {
  CreateTeamBody,
  UpdateTeamBody,
  InviteTeamMemberBody,
  AcceptTeamInviteQueryParams,
  AddTeamShortlistBody,
  GetTeamAnalyticsQueryParams,
} from "@workspace/api-zod";
import { getUserSubscription } from "../lib/subscriptionGating";
import { buildTeamAnalytics } from "../lib/teamAnalytics";
import {
  requireEnterpriseEmployer,
  requireTeamMember,
  requireTeamAdmin,
} from "../middleware/requireTeam";
import { sanitiseText } from "../lib/sanitise";

const router = Router();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function appBaseUrl(): string {
  return process.env.APP_URL || "http://localhost:25807";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "team";
}

async function generateUniqueTeamId(baseName: string): Promise<string> {
  let slug = slugify(baseName);
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const [existing] = await db.select({ id: teamsTable.id }).from(teamsTable).where(eq(teamsTable.id, candidate)).limit(1);
    if (!existing) return candidate;
  }
  return `${slug}-${randomUUID().slice(0, 8)}`;
}

async function resolveUser(clerkId: string) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return u ?? null;
}

function mapFreelancerProfile(p: typeof freelancerProfilesTable.$inferSelect) {
  return {
    ...p,
    hourlyRate: p.hourlyRate ? parseFloat(p.hourlyRate) : null,
    dailyRate: p.dailyRate ? parseFloat(p.dailyRate) : null,
    averageRating: p.averageRating ? parseFloat(p.averageRating) : null,
    reviewCount: p.reviewCount ?? 0,
    completenessScore: p.completenessScore ?? 0,
    nextAvailableDate: p.nextAvailableDate ?? null,
  };
}

function buildShortlistItem(
  entry: typeof teamShortlistTable.$inferSelect,
  profile: typeof freelancerProfilesTable.$inferSelect,
  addedByName: string,
) {
  return {
    id: entry.id,
    freelancer: mapFreelancerProfile(profile),
    addedByUserId: entry.addedByUserId,
    addedByName,
    addedAt: entry.addedAt,
  };
}

async function enrichMembers(teamId: string) {
  const members = await db.select().from(teamMembersTable).where(eq(teamMembersTable.teamId, teamId));
  const userIds = members.map((m) => m.userId).filter((id): id is number => id != null);
  const usersById = new Map<number, { name: string; email: string }>();
  if (userIds.length > 0) {
    const users = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(or(...userIds.map((id) => eq(usersTable.id, id)))!);
    for (const u of users) usersById.set(u.id, { name: u.name, email: u.email });
  }

  return members.map((m) => {
    const user = m.userId != null ? usersById.get(m.userId) : null;
    return {
      id: m.id,
      userId: m.userId,
      role: m.role,
      status: m.status,
      invitedEmail: m.invitedEmail,
      invitedAt: m.invitedAt,
      joinedAt: m.joinedAt,
      displayName: user?.name ?? null,
      displayEmail: user?.email ?? m.invitedEmail,
    };
  });
}

function buildInviteEmailHtml(teamName: string, inviteUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1E3A5F;">TalentLock</h2>
      <p style="font-size: 16px; color: #1F2937;">
        You've been invited to join <strong>${teamName}</strong> on TalentLock.
      </p>
      <a href="${inviteUrl}" style="
        display: inline-block;
        background: #2E75B6;
        color: white;
        padding: 12px 24px;
        border-radius: 6px;
        text-decoration: none;
        font-size: 15px;
        margin: 16px 0;
      ">Accept Invitation</a>
    </body>
    </html>
  `;
}

async function sendTeamInviteEmail(teamName: string, email: string, inviteToken: string, log: { warn: (obj: object, msg: string) => void }): Promise<void> {
  if (!resend) return;
  const inviteUrl = `${appBaseUrl()}/team/accept-invite?token=${inviteToken}`;
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "noreply@talentlock.io",
      to: email,
      subject: `You've been invited to join ${teamName} on TalentLock`,
      html: buildInviteEmailHtml(teamName, inviteUrl),
    });
  } catch (err) {
    log.warn({ err, email }, "team invite email failed");
  }
}

router.post("/team", async (req, res) => {
  const enterprise = await requireEnterpriseEmployer(req, res);
  if (!enterprise) return;

  const parsed = CreateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, enterprise.userId)).limit(1);
    if (!user || user.role !== "employer") {
      res.status(403).json({ error: "Employers only" });
      return;
    }

    const [existingMember] = await db.select().from(teamMembersTable)
      .where(and(eq(teamMembersTable.userId, enterprise.userId), eq(teamMembersTable.status, "active")))
      .limit(1);
    if (existingMember) {
      res.status(409).json({ error: "You already belong to a team" });
      return;
    }

    const [ownedTeam] = await db.select().from(teamsTable).where(eq(teamsTable.ownerUserId, enterprise.userId)).limit(1);
    if (ownedTeam) {
      res.status(409).json({ error: "You already own a team" });
      return;
    }

    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.userId, enterprise.userId)).limit(1);
    const teamName = sanitiseText(parsed.data.name?.trim() || employer?.companyName || "My Team");
    const teamId = await generateUniqueTeamId(teamName);

    await db.transaction(async (tx) => {
      await tx.insert(teamsTable).values({
        id: teamId,
        name: teamName,
        ownerUserId: enterprise.userId,
      });
      await tx.insert(teamMembersTable).values({
        teamId,
        userId: enterprise.userId,
        role: "admin",
        status: "active",
        invitedEmail: user.email.toLowerCase(),
        joinedAt: new Date(),
      });
    });

    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).limit(1);
    const members = await enrichMembers(teamId);
    res.status(201).json({ team, members, isAdmin: true, isOwner: true });
  } catch (err) {
    req.log.error({ err }, "Failed to create team");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/team", async (req, res) => {
  const member = await requireTeamMember(req, res);
  if (!member) return;

  try {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, member.teamId)).limit(1);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    const members = await enrichMembers(team.id);
    res.json({
      team,
      members,
      isAdmin: member.role === "admin",
      isOwner: member.userId != null && team.ownerUserId === member.userId,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get team");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/team", async (req, res) => {
  const admin = await requireTeamAdmin(req, res);
  if (!admin) return;

  const parsed = UpdateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const name = sanitiseText(parsed.data.name.trim());
    if (!name) {
      res.status(400).json({ error: "Team name is required" });
      return;
    }

    await db.update(teamsTable).set({ name }).where(eq(teamsTable.id, admin.teamId));
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, admin.teamId)).limit(1);
    const members = await enrichMembers(admin.teamId);
    res.json({
      team,
      members,
      isAdmin: true,
      isOwner: admin.userId != null && team!.ownerUserId === admin.userId,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update team");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/team/invite", async (req, res) => {
  const admin = await requireTeamAdmin(req, res);
  if (!admin) return;

  const parsed = InviteTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const email = parsed.data.email.trim().toLowerCase();
    const role = parsed.data.role === "admin" ? "admin" : "member";

    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, admin.teamId)).limit(1);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const existingMembers = await db.select().from(teamMembersTable).where(eq(teamMembersTable.teamId, admin.teamId));
    const duplicate = existingMembers.find(
      (m) => m.invitedEmail.toLowerCase() === email && m.status !== "deactivated",
    );
    if (duplicate) {
      res.status(409).json({ error: "This email is already on the team or has a pending invite" });
      return;
    }

    const inviteToken = randomUUID();
    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [invited] = await db.insert(teamMembersTable).values({
      teamId: admin.teamId,
      role,
      status: "invited",
      invitedEmail: email,
      inviteToken,
      inviteExpiresAt,
    }).returning();

    sendTeamInviteEmail(team.name, email, inviteToken, req.log);

    res.status(201).json({
      id: invited.id,
      invitedEmail: invited.invitedEmail,
      role: invited.role,
      status: invited.status,
      invitedAt: invited.invitedAt,
      inviteExpiresAt: invited.inviteExpiresAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to invite team member");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/team/accept-invite", async (req, res) => {
  const parsed = AcceptTeamInviteQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const token = parsed.data.token;

  try {
    const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.inviteToken, token)).limit(1);
    if (!member) {
      const { userId: clerkId } = getAuth(req);
      if (clerkId) {
        const user = await resolveUser(clerkId);
        if (user) {
          const [activeMembership] = await db.select().from(teamMembersTable)
            .where(and(eq(teamMembersTable.userId, user.id), eq(teamMembersTable.status, "active")))
            .limit(1);
          if (activeMembership) {
            res.status(409).json({ error: "This invitation has already been accepted.", code: "INVITE_USED" });
            return;
          }
        }
      }
      res.status(404).json({ error: "Invalid invitation token" });
      return;
    }

    if (member.status === "active") {
      res.status(409).json({ error: "This invitation has already been accepted.", code: "INVITE_USED" });
      return;
    }

    if (member.inviteExpiresAt && member.inviteExpiresAt < new Date()) {
      res.status(410).json({ error: "Invite expired" });
      return;
    }

    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, member.teamId)).limit(1);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const { userId: clerkId } = getAuth(req);
    if (!clerkId) {
      res.status(401).json({
        error: "Authentication required",
        code: "AUTH_REQUIRED",
        teamName: team.name,
      });
      return;
    }

    const user = await resolveUser(clerkId);
    if (!user) {
      res.status(401).json({ error: "Unauthorized", code: "AUTH_REQUIRED", teamName: team.name });
      return;
    }

    if (user.email.toLowerCase() !== member.invitedEmail.toLowerCase()) {
      res.status(403).json({
        error: "This invitation was sent to a different email address. Sign in with the invited email.",
      });
      return;
    }

    const [existingMembership] = await db.select().from(teamMembersTable)
      .where(and(eq(teamMembersTable.userId, user.id), eq(teamMembersTable.status, "active")))
      .limit(1);
    if (existingMembership && existingMembership.id !== member.id) {
      res.status(409).json({ error: "You already belong to a team" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(teamMembersTable).set({
        inviteToken: null,
        inviteExpiresAt: null,
        status: "active",
        userId: user.id,
        joinedAt: new Date(),
      }).where(eq(teamMembersTable.inviteToken, token));

      const sub = await getUserSubscription(user.id);
      if (sub.plan.id !== "employer_enterprise") {
        const [existingSub] = await tx.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, user.id)).limit(1);
        if (existingSub) {
          await tx.update(subscriptionsTable).set({ plan: "employer_enterprise" }).where(eq(subscriptionsTable.userId, user.id));
        } else {
          await tx.insert(subscriptionsTable).values({ userId: user.id, plan: "employer_enterprise", status: "active" });
        }
      }
    });

    res.json({
      teamName: team.name,
      teamId: team.id,
      message: "Invitation accepted",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to accept team invite");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/team/shortlist", async (req, res) => {
  const member = await requireTeamMember(req, res);
  if (!member) return;

  try {
    const entries = await db.select().from(teamShortlistTable)
      .where(eq(teamShortlistTable.teamId, member.teamId))
      .orderBy(desc(teamShortlistTable.addedAt));

    if (entries.length === 0) {
      res.json([]);
      return;
    }

    const freelancerIds = entries.map((e) => e.freelancerId);
    const addedByIds = [...new Set(entries.map((e) => e.addedByUserId))];

    const [profiles, adders] = await Promise.all([
      db.select().from(freelancerProfilesTable).where(inArray(freelancerProfilesTable.id, freelancerIds)),
      db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, addedByIds)),
    ]);

    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const nameByUserId = new Map(adders.map((u) => [u.id, u.name]));

    const result = entries.flatMap((entry) => {
      const profile = profileById.get(entry.freelancerId);
      if (!profile) return [];
      return [buildShortlistItem(entry, profile, nameByUserId.get(entry.addedByUserId) ?? "Unknown")];
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list team shortlist");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/team/shortlist", async (req, res) => {
  const member = await requireTeamMember(req, res);
  if (!member) return;

  const parsed = AddTeamShortlistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    if (member.userId == null) {
      res.status(403).json({ error: "Not a team member" });
      return;
    }

    const [profile] = await db.select().from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, parsed.data.freelancerId))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Freelancer not found" });
      return;
    }

    const [existing] = await db.select().from(teamShortlistTable)
      .where(and(
        eq(teamShortlistTable.teamId, member.teamId),
        eq(teamShortlistTable.freelancerId, parsed.data.freelancerId),
      ))
      .limit(1);

    if (existing) {
      const [adder] = await db.select({ name: usersTable.name }).from(usersTable)
        .where(eq(usersTable.id, existing.addedByUserId))
        .limit(1);
      res.status(200).json(buildShortlistItem(existing, profile, adder?.name ?? "Unknown"));
      return;
    }

    const [created] = await db.insert(teamShortlistTable).values({
      teamId: member.teamId,
      freelancerId: parsed.data.freelancerId,
      addedByUserId: member.userId,
    }).returning();

    const [adder] = await db.select({ name: usersTable.name }).from(usersTable)
      .where(eq(usersTable.id, member.userId))
      .limit(1);

    const item = buildShortlistItem(created, profile, adder?.name ?? "Unknown");
    res.status(201).json(item);
  } catch (err) {
    req.log.error({ err }, "Failed to add team shortlist entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/team/shortlist/:freelancerId", async (req, res) => {
  const member = await requireTeamMember(req, res);
  if (!member) return;

  const freelancerId = parseInt(req.params.freelancerId, 10);
  if (Number.isNaN(freelancerId)) {
    res.status(400).json({ error: "Invalid freelancer ID" });
    return;
  }

  try {
    const [existing] = await db.select().from(teamShortlistTable)
      .where(and(
        eq(teamShortlistTable.teamId, member.teamId),
        eq(teamShortlistTable.freelancerId, freelancerId),
      ))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Shortlist entry not found" });
      return;
    }

    await db.delete(teamShortlistTable).where(eq(teamShortlistTable.id, existing.id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to remove team shortlist entry");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/team/analytics", async (req, res) => {
  const admin = await requireTeamAdmin(req, res);
  if (!admin) return;

  const parsed = GetTeamAnalyticsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (admin.userId == null) {
    res.status(403).json({ error: "Not a team member" });
    return;
  }

  try {
    const data = await buildTeamAnalytics(admin.teamId, parsed.data.window ?? "90d", admin.userId);
    if (!data) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to get team analytics");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/team/members/:memberId", async (req, res) => {
  const admin = await requireTeamAdmin(req, res);
  if (!admin) return;

  const memberId = parseInt(req.params.memberId, 10);
  if (Number.isNaN(memberId)) {
    res.status(400).json({ error: "Invalid member ID" });
    return;
  }

  try {
    const [target] = await db.select().from(teamMembersTable)
      .where(and(eq(teamMembersTable.id, memberId), eq(teamMembersTable.teamId, admin.teamId)))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, admin.teamId)).limit(1);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    if (target.userId != null && target.userId === team.ownerUserId) {
      res.status(403).json({ error: "Cannot remove the team owner" });
      return;
    }

    if (target.role === "admin" && target.userId === admin.userId) {
      res.status(403).json({ error: "Cannot remove yourself as admin" });
      return;
    }

    await db.update(teamMembersTable)
      .set({ status: "deactivated", inviteToken: null, inviteExpiresAt: null })
      .where(eq(teamMembersTable.id, memberId));

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to remove team member");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

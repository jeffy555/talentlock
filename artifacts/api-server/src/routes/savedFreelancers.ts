import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  savedFreelancersTable, usersTable, freelancerProfilesTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { PatchWatchlistNotesBody } from "@workspace/api-zod";
import { getUserSubscription } from "../lib/subscriptionGating";
import { isActiveTeamMember } from "../lib/teamMembership";
import { countWatchlist, watchlistLimitForPlan } from "../lib/watchlistLimits";
import { sanitiseText } from "../lib/sanitise";

const router = Router();

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

router.get("/freelancers/saved", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const user = await resolveUser(clerkId);
    if (!user || user.role !== "employer") { res.json([]); return; }
    if (await isActiveTeamMember(user.id)) { res.json([]); return; }

    const rows = await db
      .select({
        id: savedFreelancersTable.id,
        freelancerId: savedFreelancersTable.freelancerId,
        savedAt: savedFreelancersTable.createdAt,
        notes: savedFreelancersTable.notes,
        freelancer: freelancerProfilesTable,
      })
      .from(savedFreelancersTable)
      .innerJoin(
        freelancerProfilesTable,
        eq(savedFreelancersTable.freelancerId, freelancerProfilesTable.id),
      )
      .where(eq(savedFreelancersTable.employerUserId, user.id))
      .orderBy(desc(savedFreelancersTable.createdAt));

    res.json(
      rows.map((row) => ({
        id: row.id,
        freelancerId: row.freelancerId,
        savedAt: row.savedAt,
        notes: row.notes,
        freelancer: mapFreelancerProfile(row.freelancer),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list saved freelancers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/freelancers/:id/saved", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const freelancerId = parseInt(req.params.id);
  if (isNaN(freelancerId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const user = await resolveUser(clerkId);
    if (!user) { res.json({ saved: false }); return; }
    if (await isActiveTeamMember(user.id)) { res.json({ saved: false }); return; }
    const [row] = await db.select().from(savedFreelancersTable)
      .where(and(eq(savedFreelancersTable.employerUserId, user.id), eq(savedFreelancersTable.freelancerId, freelancerId)))
      .limit(1);
    res.json({ saved: !!row });
  } catch (err) {
    req.log.error({ err }, "Failed to check saved");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/freelancers/:id/save", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const freelancerId = parseInt(req.params.id);
  if (isNaN(freelancerId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const user = await resolveUser(clerkId);
    if (!user || user.role !== "employer") { res.status(403).json({ error: "Employers only" }); return; }
    if (await isActiveTeamMember(user.id)) {
      res.status(403).json({ error: "Use team shortlist for enterprise accounts" });
      return;
    }

    const [existing] = await db.select().from(savedFreelancersTable)
      .where(and(eq(savedFreelancersTable.employerUserId, user.id), eq(savedFreelancersTable.freelancerId, freelancerId)))
      .limit(1);

    if (existing) {
      await db.delete(savedFreelancersTable)
        .where(and(eq(savedFreelancersTable.employerUserId, user.id), eq(savedFreelancersTable.freelancerId, freelancerId)));
      res.json({ saved: false });
    } else {
      const { plan } = await getUserSubscription(user.id);
      const limit = watchlistLimitForPlan(plan.id);
      if (limit !== null) {
        const count = await countWatchlist(user.id);
        if (count >= limit) {
          res.status(402).json({
            error: "Watchlist limit reached",
            code: "PLAN_LIMIT",
            planNeeded: "employer_growth",
          });
          return;
        }
      }

      const [freelancer] = await db.select({ id: freelancerProfilesTable.id })
        .from(freelancerProfilesTable)
        .where(eq(freelancerProfilesTable.id, freelancerId))
        .limit(1);
      if (!freelancer) { res.status(404).json({ error: "Freelancer not found" }); return; }

      await db.insert(savedFreelancersTable).values({ employerUserId: user.id, freelancerId });
      res.json({ saved: true });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to toggle save");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/freelancers/:id/watchlist", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const freelancerId = parseInt(req.params.id);
  if (isNaN(freelancerId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const parsed = PatchWatchlistNotesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  try {
    const user = await resolveUser(clerkId);
    if (!user || user.role !== "employer") { res.status(403).json({ error: "Employers only" }); return; }
    if (await isActiveTeamMember(user.id)) {
      res.status(403).json({ error: "Use team shortlist for enterprise accounts" });
      return;
    }

    const [saved] = await db.select().from(savedFreelancersTable)
      .where(and(
        eq(savedFreelancersTable.employerUserId, user.id),
        eq(savedFreelancersTable.freelancerId, freelancerId),
      ))
      .limit(1);

    if (!saved) { res.status(404).json({ error: "Freelancer not on watchlist" }); return; }

    const rawNotes = parsed.data.notes;
    const notes = rawNotes == null || rawNotes === "" ? null : sanitiseText(rawNotes);

    await db.update(savedFreelancersTable)
      .set({ notes })
      .where(eq(savedFreelancersTable.id, saved.id));

    res.json({ notes });
  } catch (err) {
    req.log.error({ err }, "Failed to update watchlist notes");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

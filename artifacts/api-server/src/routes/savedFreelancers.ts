import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  savedFreelancersTable, usersTable, freelancerProfilesTable, employerProfilesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

async function resolveUser(clerkId: string) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return u ?? null;
}

router.get("/freelancers/saved", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const user = await resolveUser(clerkId);
    if (!user || user.role !== "employer") { res.json([]); return; }

    const saved = await db.select({
      savedId: savedFreelancersTable.id,
      freelancerId: savedFreelancersTable.freelancerId,
      savedAt: savedFreelancersTable.createdAt,
    }).from(savedFreelancersTable)
      .where(eq(savedFreelancersTable.employerUserId, user.id));

    const freelancerIds = saved.map(s => s.freelancerId);
    if (freelancerIds.length === 0) { res.json([]); return; }

    const profiles = await db.select().from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, freelancerIds[0]));

    const allProfiles = await Promise.all(
      freelancerIds.map(id =>
        db.select().from(freelancerProfilesTable)
          .where(eq(freelancerProfilesTable.id, id)).limit(1)
          .then(r => r[0] ?? null)
      )
    );

    const result = allProfiles
      .filter(Boolean)
      .map(p => ({
        ...p,
        hourlyRate: p!.hourlyRate ? parseFloat(p!.hourlyRate) : null,
        dailyRate: p!.dailyRate ? parseFloat(p!.dailyRate) : null,
        savedAt: saved.find(s => s.freelancerId === p!.id)?.savedAt,
      }));

    res.json(result);
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

    const [existing] = await db.select().from(savedFreelancersTable)
      .where(and(eq(savedFreelancersTable.employerUserId, user.id), eq(savedFreelancersTable.freelancerId, freelancerId)))
      .limit(1);

    if (existing) {
      await db.delete(savedFreelancersTable)
        .where(and(eq(savedFreelancersTable.employerUserId, user.id), eq(savedFreelancersTable.freelancerId, freelancerId)));
      res.json({ saved: false });
    } else {
      await db.insert(savedFreelancersTable).values({ employerUserId: user.id, freelancerId });
      res.json({ saved: true });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to toggle save");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

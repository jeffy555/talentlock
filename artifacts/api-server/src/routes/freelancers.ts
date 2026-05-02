import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { freelancerProfilesTable, usersTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import {
  CreateFreelancerProfileBody,
  UpdateMyFreelancerProfileBody,
  ListFreelancersQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/freelancers", async (req, res) => {
  const parsed = ListFreelancersQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};

  try {
    let query = db.select().from(freelancerProfilesTable);
    const conditions: SQL[] = [];

    if (params.field) {
      conditions.push(eq(freelancerProfilesTable.fieldOfWork, params.field));
    }
    if (params.available !== undefined) {
      conditions.push(eq(freelancerProfilesTable.isAvailable, params.available));
    }

    const results = conditions.length > 0
      ? await db.select().from(freelancerProfilesTable).where(and(...conditions)).limit(params.limit ?? 50)
      : await db.select().from(freelancerProfilesTable).limit(params.limit ?? 50).offset(params.offset ?? 0);

    res.json(results.map(mapProfile));
  } catch (err) {
    req.log.error({ err }, "Failed to list freelancers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/freelancers/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [profile] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }
    res.json(mapProfile(profile));
  } catch (err) {
    req.log.error({ err }, "Failed to get my freelancer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/freelancers/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpdateMyFreelancerProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [updated] = await db.update(freelancerProfilesTable)
      .set({ ...parsed.data, updatedAt: new Date() } as any)
      .where(eq(freelancerProfilesTable.clerkId, clerkId))
      .returning();
    if (!updated) { res.status(404).json({ error: "Profile not found" }); return; }
    res.json(mapProfile(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update freelancer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/freelancers", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateFreelancerProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(400).json({ error: "User profile not found" }); return; }
    const [profile] = await db.insert(freelancerProfilesTable)
      .values({ ...parsed.data as any, clerkId, userId: user.id, name: user.name, isAvailable: true, isVerified: false })
      .returning();
    res.status(201).json(mapProfile(profile));
  } catch (err) {
    req.log.error({ err }, "Failed to create freelancer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/freelancers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [profile] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, id)).limit(1);
    if (!profile) { res.status(404).json({ error: "Freelancer not found" }); return; }
    res.json(mapProfile(profile));
  } catch (err) {
    req.log.error({ err }, "Failed to get freelancer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapProfile(p: typeof freelancerProfilesTable.$inferSelect) {
  return {
    ...p,
    hourlyRate: p.hourlyRate ? parseFloat(p.hourlyRate) : null,
    dailyRate: p.dailyRate ? parseFloat(p.dailyRate) : null,
  };
}

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { employerProfilesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpsertMyEmployerProfileBody } from "@workspace/api-zod";
import { sanitiseText } from "../lib/sanitise";

const router = Router();

router.get("/employers/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [profile] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    if (!profile) { res.status(404).json({ error: "Employer profile not found" }); return; }
    res.json(profile);
  } catch (err) {
    req.log.error({ err }, "Failed to get employer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/employers/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpsertMyEmployerProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = {
    ...parsed.data,
    companyName: sanitiseText(parsed.data.companyName),
    industry: sanitiseText(parsed.data.industry),
    companySize: parsed.data.companySize != null ? sanitiseText(parsed.data.companySize) : parsed.data.companySize,
    description: parsed.data.description != null ? sanitiseText(parsed.data.description) : parsed.data.description,
  };
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(400).json({ error: "User profile not found" }); return; }
    const [existing] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    if (existing) {
      const [updated] = await db.update(employerProfilesTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(employerProfilesTable.clerkId, clerkId))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(employerProfilesTable)
        .values({ ...data, clerkId, userId: user.id, isVerified: false })
        .returning();
      res.json(created);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to upsert employer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

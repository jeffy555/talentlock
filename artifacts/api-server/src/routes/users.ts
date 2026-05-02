import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpsertMeBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

router.get("/users/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err) {
    req.log.error({ err }, "Failed to get user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/users/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpsertMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const data = parsed.data;
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (existing) {
      const [updated] = await db.update(usersTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(usersTable.clerkId, clerkId))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(usersTable)
        .values({ ...data, clerkId })
        .returning();
      res.json(created);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to upsert user");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

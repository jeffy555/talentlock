import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { portfolioItemsTable, freelancerProfilesTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { sanitiseText } from "../lib/sanitise";

const router = Router();

const CreatePortfolioItemBody = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  url: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
});

const UpdatePortfolioItemBody = CreatePortfolioItemBody.partial();

async function resolveFreelancer(clerkId: string) {
  const [p] = await db.select().from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
  return p ?? null;
}

router.get("/freelancers/:id/portfolio", async (req, res) => {
  const freelancerId = parseInt(req.params.id);
  if (isNaN(freelancerId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const items = await db.select().from(portfolioItemsTable)
      .where(eq(portfolioItemsTable.freelancerId, freelancerId))
      .orderBy(portfolioItemsTable.createdAt);
    res.json(items);
  } catch (err) {
    req.log.error({ err }, "Failed to list portfolio");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/portfolio/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const profile = await resolveFreelancer(clerkId);
    if (!profile) { res.json([]); return; }
    const items = await db.select().from(portfolioItemsTable)
      .where(eq(portfolioItemsTable.freelancerId, profile.id))
      .orderBy(portfolioItemsTable.createdAt);
    res.json(items);
  } catch (err) {
    req.log.error({ err }, "Failed to list my portfolio");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/portfolio", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreatePortfolioItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const profile = await resolveFreelancer(clerkId);
    if (!profile) { res.status(403).json({ error: "Freelancer profile required" }); return; }
    const [item] = await db.insert(portfolioItemsTable).values({
      freelancerId: profile.id,
      title: sanitiseText(parsed.data.title),
      description: parsed.data.description != null ? sanitiseText(parsed.data.description) : null,
      url: parsed.data.url ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      tags: parsed.data.tags ?? [],
    }).returning();
    res.status(201).json(item);
  } catch (err) {
    req.log.error({ err }, "Failed to create portfolio item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/portfolio/:id", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = UpdatePortfolioItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const profile = await resolveFreelancer(clerkId);
    if (!profile) { res.status(403).json({ error: "Freelancer profile required" }); return; }
    const clean = {
      ...parsed.data,
      title: parsed.data.title != null ? sanitiseText(parsed.data.title) : parsed.data.title,
      description: parsed.data.description != null ? sanitiseText(parsed.data.description) : parsed.data.description,
    };

    const [updated] = await db.update(portfolioItemsTable)
      .set({ ...clean as any, updatedAt: new Date() })
      .where(and(eq(portfolioItemsTable.id, id), eq(portfolioItemsTable.freelancerId, profile.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update portfolio item");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/portfolio/:id", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const profile = await resolveFreelancer(clerkId);
    if (!profile) { res.status(403).json({ error: "Freelancer profile required" }); return; }
    await db.delete(portfolioItemsTable)
      .where(and(eq(portfolioItemsTable.id, id), eq(portfolioItemsTable.freelancerId, profile.id)));
    res.json({ deleted: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete portfolio item");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

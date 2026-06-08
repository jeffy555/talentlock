import { Router } from "express";
import { db } from "@workspace/db";
import {
  freelancerProfilesTable, portfolioItemsTable, reviewsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { resolveEmployerDisplayName, toPublicReview } from "../lib/reviewUtils";

const router = Router();

router.get("/public/freelancers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [profile] = await db.select().from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, id)).limit(1);
    if (!profile) { res.status(404).json({ error: "Not found" }); return; }

    const portfolio = await db.select().from(portfolioItemsTable)
      .where(eq(portfolioItemsTable.freelancerId, id))
      .orderBy(portfolioItemsTable.createdAt);

    const reviewRows = await db.select().from(reviewsTable)
      .where(eq(reviewsTable.freelancerId, profile.userId))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(10);

    const reviews = await Promise.all(
      reviewRows.map(async (row) => toPublicReview(row, await resolveEmployerDisplayName(row.employerId))),
    );

    res.json({
      ...profile,
      hourlyRate: profile.hourlyRate ? parseFloat(profile.hourlyRate) : null,
      dailyRate: profile.dailyRate ? parseFloat(profile.dailyRate) : null,
      averageRating: profile.averageRating ? parseFloat(profile.averageRating) : null,
      reviewCount: profile.reviewCount ?? 0,
      portfolio,
      reviews,
      totalReviews: profile.reviewCount ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get public profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

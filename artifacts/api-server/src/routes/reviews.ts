import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  reviewsTable, bookingsTable, usersTable,
  freelancerProfilesTable, employerProfilesTable,
} from "@workspace/db";
import { eq, and, avg, count, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

const CreateReviewBody = z.object({
  bookingId: z.number().int(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  content: z.string().max(2000).optional(),
});

async function resolveUser(clerkId: string) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return u ?? null;
}

router.get("/reviews/freelancer/:freelancerId", async (req, res) => {
  const freelancerId = parseInt(req.params.freelancerId);
  if (isNaN(freelancerId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [profile] = await db.select({ userId: freelancerProfilesTable.userId })
      .from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, freelancerId)).limit(1);
    if (!profile) { res.status(404).json({ error: "Not found" }); return; }

    const rows = await db.select().from(reviewsTable)
      .where(eq(reviewsTable.revieweeId, profile.userId))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(50);

    const [agg] = await db.select({
      avg: avg(reviewsTable.rating),
      total: count(reviewsTable.id),
    }).from(reviewsTable).where(eq(reviewsTable.revieweeId, profile.userId));

    res.json({
      reviews: rows,
      averageRating: agg.avg ? parseFloat(agg.avg) : null,
      totalReviews: Number(agg.total),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list freelancer reviews");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reviews/my-review/:bookingId", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const bookingId = parseInt(req.params.bookingId);
  if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const user = await resolveUser(clerkId);
    if (!user) { res.json({ reviewed: false, review: null }); return; }
    const [existing] = await db.select().from(reviewsTable)
      .where(and(eq(reviewsTable.bookingId, bookingId), eq(reviewsTable.reviewerId, user.id)))
      .limit(1);
    res.json({ reviewed: !!existing, review: existing ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to get my review");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reviews", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const user = await resolveUser(clerkId);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const [booking] = await db.select().from(bookingsTable)
      .where(eq(bookingsTable.id, parsed.data.bookingId)).limit(1);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.status !== "completed") {
      res.status(422).json({ error: "Reviews can only be submitted for completed bookings" });
      return;
    }

    let revieweeId: number;
    let reviewerRole: string;

    if (user.role === "employer") {
      const [emp] = await db.select().from(employerProfilesTable)
        .where(eq(employerProfilesTable.userId, user.id)).limit(1);
      if (!emp || emp.id !== booking.employerId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
      const [freelancer] = await db.select({ userId: freelancerProfilesTable.userId })
        .from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, booking.freelancerId)).limit(1);
      if (!freelancer) { res.status(404).json({ error: "Freelancer not found" }); return; }
      revieweeId = freelancer.userId;
      reviewerRole = "employer";
    } else {
      const [fl] = await db.select().from(freelancerProfilesTable)
        .where(eq(freelancerProfilesTable.userId, user.id)).limit(1);
      if (!fl || fl.id !== booking.freelancerId) {
        res.status(403).json({ error: "Forbidden" }); return;
      }
      const [employer] = await db.select({ userId: employerProfilesTable.userId })
        .from(employerProfilesTable).where(eq(employerProfilesTable.id, booking.employerId)).limit(1);
      if (!employer) { res.status(404).json({ error: "Employer not found" }); return; }
      revieweeId = employer.userId;
      reviewerRole = "freelancer";
    }

    const [existing] = await db.select().from(reviewsTable)
      .where(and(eq(reviewsTable.bookingId, parsed.data.bookingId), eq(reviewsTable.reviewerId, user.id)))
      .limit(1);
    if (existing) { res.status(409).json({ error: "You have already reviewed this booking" }); return; }

    const [review] = await db.insert(reviewsTable).values({
      bookingId: parsed.data.bookingId,
      reviewerId: user.id,
      revieweeId,
      reviewerRole,
      rating: parsed.data.rating,
      title: parsed.data.title ?? null,
      content: parsed.data.content ?? null,
    }).returning();

    res.status(201).json(review);
  } catch (err) {
    req.log.error({ err }, "Failed to create review");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

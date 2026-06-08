import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  reviewsTable,
  bookingsTable,
  usersTable,
  freelancerProfilesTable,
  employerProfilesTable,
} from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { z } from "zod/v4";
import {
  BOOKING_COMPLETED_STATUS,
  REVIEW_MAX_COMMENT_LENGTH,
  REVIEW_MAX_REPLY_LENGTH,
  REVIEW_MAX_RATING,
  REVIEW_MIN_RATING,
  resolveEmployerDisplayName,
  toPublicReview,
  updateFreelancerRating,
} from "../lib/reviewUtils";
import { sanitiseText } from "../lib/sanitise";
import {
  createNotification,
  NotificationType,
  freelancerNameForProfile,
} from "../lib/createNotification";
import { sendNotificationEmailAsync } from "../lib/emailService";

const router = Router();

const CreateReviewBody = z.object({
  bookingId: z.number().int(),
  rating: z.number().int().min(REVIEW_MIN_RATING).max(REVIEW_MAX_RATING),
  comment: z.string().max(REVIEW_MAX_COMMENT_LENGTH).optional(),
});

const ReplyReviewBody = z.object({
  reply: z.string().min(1).max(REVIEW_MAX_REPLY_LENGTH),
});

async function resolveUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return user ?? null;
}

router.get("/reviews/freelancer/:freelancerId", async (req, res) => {
  const freelancerProfileId = parseInt(req.params.freelancerId, 10);
  if (Number.isNaN(freelancerProfileId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
  const offset = (page - 1) * pageSize;

  try {
    const [profile] = await db
      .select({ userId: freelancerProfilesTable.userId })
      .from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, freelancerProfileId))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const whereClause = eq(reviewsTable.freelancerId, profile.userId);

    const [totalRow] = await db
      .select({ total: count() })
      .from(reviewsTable)
      .where(whereClause);
    const total = Number(totalRow?.total ?? 0);
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    const rows = await db
      .select()
      .from(reviewsTable)
      .where(whereClause)
      .orderBy(desc(reviewsTable.createdAt))
      .limit(pageSize)
      .offset(offset);

    const data = await Promise.all(
      rows.map(async (review) => toPublicReview(review, await resolveEmployerDisplayName(review.employerId))),
    );

    res.json({ data, total, page, pageSize, totalPages });
  } catch (err) {
    req.log.error({ err }, "Failed to list freelancer reviews");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reviews", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const user = await resolveUser(clerkId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.role !== "employer") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [employer] = await db
      .select()
      .from(employerProfilesTable)
      .where(eq(employerProfilesTable.userId, user.id))
      .limit(1);
    if (!employer) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, parsed.data.bookingId))
      .limit(1);
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (booking.employerId !== employer.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (booking.status !== BOOKING_COMPLETED_STATUS) {
      res.status(400).json({
        error: "Reviews can only be submitted for completed bookings",
        code: "BOOKING_NOT_COMPLETED",
      });
      return;
    }

    const [existing] = await db
      .select({ id: reviewsTable.id })
      .from(reviewsTable)
      .where(eq(reviewsTable.bookingId, parsed.data.bookingId))
      .limit(1);
    if (existing) {
      res.status(409).json({
        error: "A review already exists for this booking",
        code: "REVIEW_ALREADY_EXISTS",
      });
      return;
    }

    const [freelancer] = await db
      .select({ userId: freelancerProfilesTable.userId })
      .from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, booking.freelancerId))
      .limit(1);
    if (!freelancer) {
      res.status(404).json({ error: "Freelancer not found" });
      return;
    }

    const comment = parsed.data.comment != null ? sanitiseText(parsed.data.comment) : null;
    const [review] = await db
      .insert(reviewsTable)
      .values({
        bookingId: parsed.data.bookingId,
        employerId: user.id,
        freelancerId: freelancer.userId,
        rating: parsed.data.rating,
        comment: comment || null,
      })
      .returning();

    await updateFreelancerRating(freelancer.userId);

    const employerDisplayName = await resolveEmployerDisplayName(user.id);
    const reviewMsg = `You received a ${parsed.data.rating}-star review from ${employerDisplayName}`;
    createNotification(db, {
      userId: freelancer.userId,
      type: NotificationType.REVIEW_RECEIVED,
      entityType: "review",
      entityId: parsed.data.bookingId,
      message: reviewMsg,
    }).catch((err) => req.log.warn({ err, bookingId: parsed.data.bookingId }, "notification write failed"));
    sendNotificationEmailAsync(
      db, freelancer.userId, "New review on TalentLock", reviewMsg,
      `/bookings/${parsed.data.bookingId}`, req.log,
    );

    res.status(201).json(toPublicReview(review, employerDisplayName));
  } catch (err) {
    req.log.error({ err }, "Failed to create review");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reviews/:id/reply", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const reviewId = parseInt(req.params.id, 10);
  if (Number.isNaN(reviewId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = ReplyReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const user = await resolveUser(clerkId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.role !== "freelancer") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [review] = await db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.id, reviewId))
      .limit(1);
    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    if (review.freelancerId !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (review.reply != null) {
      res.status(409).json({
        error: "Reply already exists",
        code: "REPLY_ALREADY_EXISTS",
      });
      return;
    }

    const [updated] = await db
      .update(reviewsTable)
      .set({
        reply: sanitiseText(parsed.data.reply),
        repliedAt: new Date(),
      })
      .where(and(eq(reviewsTable.id, reviewId), eq(reviewsTable.freelancerId, user.id)))
      .returning();

    const employerDisplayName = await resolveEmployerDisplayName(updated.employerId);
    const [booking] = await db
      .select({ freelancerId: bookingsTable.freelancerId })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, updated.bookingId))
      .limit(1);
    const freelancerName = booking
      ? await freelancerNameForProfile(booking.freelancerId)
      : "The freelancer";
    const replyMsg = `${freelancerName} replied to your review`;
    createNotification(db, {
      userId: updated.employerId,
      type: NotificationType.REVIEW_REPLIED,
      entityType: "review",
      entityId: updated.bookingId,
      message: replyMsg,
    }).catch((err) => req.log.warn({ err, reviewId }, "notification write failed"));
    sendNotificationEmailAsync(
      db, updated.employerId, "Review reply on TalentLock", replyMsg,
      `/bookings/${updated.bookingId}`, req.log,
    );

    res.json(toPublicReview(updated, employerDisplayName));
  } catch (err) {
    req.log.error({ err }, "Failed to reply to review");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  bookingsTable, freelancerProfilesTable, employerProfilesTable, usersTable,
  reviewsTable,
} from "@workspace/db";
import {
  createNotification,
  NotificationType,
  userIdFromFreelancerProfileId,
  userIdFromEmployerProfileId,
  freelancerNameForProfile,
  employerCompanyForProfile,
} from "../lib/createNotification";
import { resolveEmployerDisplayName, toPublicReview } from "../lib/reviewUtils";
import { eq, or, and, inArray, sql, SQL, count } from "drizzle-orm";
import {
  CreateBookingBody, UpdateBookingBody, ListBookingsQueryParams,
} from "@workspace/api-zod";
import { getUserSubscription, checkLimit } from "../lib/subscriptionGating";
import {
  createAvailabilityBlock,
  deleteAvailabilityBlockByBookingId,
} from "../lib/availabilityUtils";
import { z } from "zod/v4";
import { sanitiseText } from "../lib/sanitise";
import { sendNotificationEmailAsync } from "../lib/emailService";
import { parsePagination, paginatedResponse } from "../lib/paginationUtils";
import { resolveUserByClerkId, canAccessBooking, profileIdsForUser } from "../lib/accessControl";

const BOOKING_CONFIRMED_STATUS = "active";
const BOOKING_CANCELLED_STATUS = "cancelled";
const BOOKING_COMPLETED_STATUS = "completed";

const router = Router();

function enrichRate(b: typeof bookingsTable.$inferSelect) {
  return {
    ...b,
    rate: b.rate ? parseFloat(b.rate) : null,
    proposedRate: b.proposedRate ? parseFloat(b.proposedRate) : null,
  };
}

router.get("/bookings", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const params = parsed.data;
  try {
    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);

    const conditions: SQL[] = [];
    if (freelancer && employer) {
      conditions.push(or(eq(bookingsTable.freelancerId, freelancer.id), eq(bookingsTable.employerId, employer.id))!);
    } else if (freelancer) {
      conditions.push(eq(bookingsTable.freelancerId, freelancer.id));
    } else if (employer) {
      conditions.push(eq(bookingsTable.employerId, employer.id));
    }
    if (params.status) conditions.push(eq(bookingsTable.status, params.status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const { page, pageSize, offset } = parsePagination(params);

    const [rows, countResult] = await Promise.all([
      db.select().from(bookingsTable).where(whereClause).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(bookingsTable).where(whereClause),
    ]);

    const enriched = await Promise.all(rows.map(async (b) => {
      const [f] = await db.select({ name: freelancerProfilesTable.name }).from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, b.freelancerId)).limit(1);
      const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, b.employerId)).limit(1);
      return { ...enrichRate(b), freelancerName: f?.name ?? null, employerName: e?.name ?? null };
    }));

    const total = Number(countResult[0]?.count ?? 0);
    res.json(paginatedResponse(enriched, total, page, pageSize));
  } catch (err) {
    req.log.error({ err }, "Failed to list bookings");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bookings", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.message && parsed.data.message.length > 500) {
    res.status(400).json({ error: "Message too long", code: "MESSAGE_TOO_LONG" });
    return;
  }
  const message = parsed.data.message ? sanitiseText(parsed.data.message) : null;
  try {
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    if (!employer) { res.status(400).json({ error: "Employer profile not found" }); return; }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "User account not found" }); return; }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
      const sub = await getUserSubscription(user.id);
      const activeRows = await tx.select({ id: bookingsTable.id }).from(bookingsTable)
        .where(and(eq(bookingsTable.employerId, employer.id), inArray(bookingsTable.status, ["pending", "active"])));
      const gate = checkLimit(sub.plan, "activeBookings", activeRows.length);
      if (!gate.allowed) return { gate, booking: null };

      const proposedRate = parsed.data.rate != null ? String(parsed.data.rate) : null;

      const { message: _msg, ...bookingData } = parsed.data;
      const [booking] = await tx.insert(bookingsTable)
        .values({
          ...bookingData as any,
          message,
          employerId: employer.id,
          status: "pending",
          rate: null,
          proposedRate,
          lastProposedBy: "employer",
          negotiationStatus: "negotiating",
        })
        .returning();
      return { gate: null, booking };
    });

    if (result.gate) {
      res.status(402).json({ error: result.gate.reason, planNeeded: result.gate.planNeeded, code: "PLAN_LIMIT" });
      return;
    }
    const booking = result.booking!;
    const [f] = await db.select({ name: freelancerProfilesTable.name, clerkId: freelancerProfilesTable.clerkId })
      .from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, booking.freelancerId)).limit(1);
    const [e] = await db.select({ name: employerProfilesTable.companyName })
      .from(employerProfilesTable).where(eq(employerProfilesTable.id, booking.employerId)).limit(1);

    const freelancerUserId = await userIdFromFreelancerProfileId(booking.freelancerId);
    if (freelancerUserId) {
      const notifMsg = `"${e?.name ?? "An employer"}" has sent you a booking request`;
      createNotification(db, {
        userId: freelancerUserId,
        type: NotificationType.BOOKING_CREATED,
        entityType: "booking",
        entityId: booking.id,
        message: notifMsg,
      }).catch((err) => req.log.warn({ err, bookingId: booking.id }, "notification write failed"));
      sendNotificationEmailAsync(
        db, freelancerUserId, "New booking request on TalentLock", notifMsg,
        `/bookings/${booking.id}`, req.log,
      );
    }

    res.status(201).json({ ...enrichRate(booking), freelancerName: f?.name ?? null, employerName: e?.name ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to create booking");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/bookings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const access = await canAccessBooking(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Booking not found" : "Forbidden" });
      return;
    }
    const [b] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    if (!b) { res.status(404).json({ error: "Booking not found" }); return; }
    const [f] = await db.select({ name: freelancerProfilesTable.name }).from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, b.freelancerId)).limit(1);
    const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, b.employerId)).limit(1);

    const [reviewRow] = await db.select().from(reviewsTable).where(eq(reviewsTable.bookingId, id)).limit(1);
    let review = null;
    if (reviewRow) {
      const employerDisplayName = await resolveEmployerDisplayName(reviewRow.employerId);
      review = toPublicReview(reviewRow, employerDisplayName);
    }

    res.json({
      ...enrichRate(b),
      freelancerName: f?.name ?? null,
      employerName: e?.name ?? null,
      review,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get booking");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/bookings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const access = await canAccessBooking(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Booking not found" : "Forbidden" });
      return;
    }
    const [before] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    if (!before) { res.status(404).json({ error: "Booking not found" }); return; }

    const [updated] = await db.update(bookingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(bookingsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Booking not found" }); return; }

    if (parsed.data.status === "completed" || parsed.data.status === "cancelled") {
      await db.update(freelancerProfilesTable)
        .set({ isAvailable: true, currentBookingId: null, bookingEndDate: null })
        .where(eq(freelancerProfilesTable.id, updated.freelancerId));
    }

    if (parsed.data.status && parsed.data.status !== before.status) {
      if (parsed.data.status === BOOKING_CONFIRMED_STATUS) {
        await db.update(freelancerProfilesTable)
          .set({
            isAvailable: false,
            currentBookingId: updated.id,
            bookingEndDate: updated.endDate ?? null,
          })
          .where(eq(freelancerProfilesTable.id, updated.freelancerId));

        const blockStart = updated.startDate ?? null;
        const blockEnd = updated.endDate ?? null;
        if (blockStart && blockEnd) {
          createAvailabilityBlock(db, {
            freelancerId: updated.freelancerId,
            startDate: blockStart,
            endDate: blockEnd,
            reason: "booked",
            bookingId: updated.id,
          }).catch((err) => req.log.warn({ err, bookingId: id }, "auto-block creation failed"));
        } else {
          req.log.warn({ bookingId: id }, "auto-block skipped — no date range on booking");
        }
      }

      if (
        parsed.data.status === BOOKING_CANCELLED_STATUS
        || parsed.data.status === BOOKING_COMPLETED_STATUS
      ) {
        deleteAvailabilityBlockByBookingId(db, updated.id)
          .catch((err) => req.log.warn({ err, bookingId: id }, "auto-block deletion failed"));
      }

      const { employerId: callerEmployerId, freelancerId: callerFreelancerId } = await profileIdsForUser(user.id);
      const isEmployer = callerEmployerId !== null && callerEmployerId === updated.employerId;
      const isFreelancer = callerFreelancerId !== null && callerFreelancerId === updated.freelancerId;
      let recipientUserId: number | null = null;
      if (isEmployer) recipientUserId = await userIdFromFreelancerProfileId(updated.freelancerId);
      else if (isFreelancer) recipientUserId = await userIdFromEmployerProfileId(updated.employerId);
      if (recipientUserId) {
        const otherName = isEmployer
          ? await employerCompanyForProfile(updated.employerId)
          : await freelancerNameForProfile(updated.freelancerId);
        const statusMsg = `Your booking with ${otherName} is now ${parsed.data.status}`;
        createNotification(db, {
          userId: recipientUserId,
          type: NotificationType.BOOKING_STATUS_CHANGED,
          entityType: "booking",
          entityId: id,
          message: statusMsg,
        }).catch((err) => req.log.warn({ err, bookingId: id }, "notification write failed"));
        sendNotificationEmailAsync(
          db, recipientUserId, "Booking status updated on TalentLock", statusMsg,
          `/bookings/${id}`, req.log,
        );
      }
    }

    res.json(enrichRate(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update booking");
    res.status(500).json({ error: "Internal server error" });
  }
});

const NegotiateBookingBody = z.object({
  action: z.enum(["accept", "counter"]),
  counterRate: z.number().positive().optional(),
});

router.post("/bookings/:id/negotiate", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = NegotiateBookingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.negotiationStatus === "agreed") {
      res.status(400).json({ error: "Rate has already been agreed upon" }); return;
    }

    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);

    const isFreelancer = !!freelancer && freelancer.id === booking.freelancerId;
    const isEmployer = !!employer && employer.id === booking.employerId;
    if (!isFreelancer && !isEmployer) {
      res.status(403).json({ error: "Not a participant in this booking" }); return;
    }

    const myRole = isFreelancer ? "freelancer" : "employer";

    // Can only act if it's their turn (last proposal was from the other side, or it's a fresh booking)
    if (booking.lastProposedBy === myRole) {
      res.status(400).json({ error: "Awaiting the other party's response to your proposal" }); return;
    }

    const { action, counterRate } = parsed.data;

    if (action === "accept") {
      const agreedRate = booking.proposedRate;
      const [updated] = await db.update(bookingsTable)
        .set({ rate: agreedRate, negotiationStatus: "agreed", updatedAt: new Date() })
        .where(eq(bookingsTable.id, id))
        .returning();
      const [f] = await db.select({ name: freelancerProfilesTable.name }).from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, booking.freelancerId)).limit(1);
      const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, booking.employerId)).limit(1);
      const rateMsg = agreedRate ? `$${parseFloat(agreedRate)}/hr` : "the agreed rate";
      const employerUserId = await userIdFromEmployerProfileId(booking.employerId);
      const freelancerUserId = await userIdFromFreelancerProfileId(booking.freelancerId);
      const agreedMessage = `Both parties agreed on a rate of ${rateMsg}`;
      if (employerUserId) {
        createNotification(db, {
          userId: employerUserId,
          type: NotificationType.RATE_AGREED,
          entityType: "booking",
          entityId: id,
          message: agreedMessage,
        }).catch((err) => req.log.warn({ err, bookingId: id }, "notification write failed"));
        sendNotificationEmailAsync(
          db, employerUserId, "Rate agreed on TalentLock", agreedMessage,
          `/bookings/${id}`, req.log,
        );
      }
      if (freelancerUserId) {
        createNotification(db, {
          userId: freelancerUserId,
          type: NotificationType.RATE_AGREED,
          entityType: "booking",
          entityId: id,
          message: agreedMessage,
        }).catch((err) => req.log.warn({ err, bookingId: id }, "notification write failed"));
        sendNotificationEmailAsync(
          db, freelancerUserId, "Rate agreed on TalentLock", agreedMessage,
          `/bookings/${id}`, req.log,
        );
      }
      res.json({ ...enrichRate(updated), freelancerName: f?.name ?? null, employerName: e?.name ?? null });
    } else {
      if (counterRate == null) {
        res.status(400).json({ error: "counterRate is required when action is 'counter'" }); return;
      }
      const [updated] = await db.update(bookingsTable)
        .set({ proposedRate: String(counterRate), lastProposedBy: myRole, negotiationStatus: "negotiating", updatedAt: new Date() })
        .where(eq(bookingsTable.id, id))
        .returning();
      const [f] = await db.select({ name: freelancerProfilesTable.name }).from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, booking.freelancerId)).limit(1);
      const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, booking.employerId)).limit(1);
      const proposerName = myRole === "employer" ? (e?.name ?? "The employer") : (f?.name ?? "The freelancer");
      const recipientUserId = myRole === "employer"
        ? await userIdFromFreelancerProfileId(booking.freelancerId)
        : await userIdFromEmployerProfileId(booking.employerId);
      if (recipientUserId) {
        const counterMsg = `${proposerName} proposed a new rate of $${counterRate}/hr`;
        createNotification(db, {
          userId: recipientUserId,
          type: NotificationType.RATE_COUNTER_PROPOSED,
          entityType: "booking",
          entityId: id,
          message: counterMsg,
        }).catch((err) => req.log.warn({ err, bookingId: id }, "notification write failed"));
        sendNotificationEmailAsync(
          db, recipientUserId, "New rate proposal on TalentLock", counterMsg,
          `/bookings/${id}`, req.log,
        );
      }
      res.json({ ...enrichRate(updated), freelancerName: f?.name ?? null, employerName: e?.name ?? null });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to negotiate booking");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

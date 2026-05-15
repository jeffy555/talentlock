import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  bookingsTable, freelancerProfilesTable, employerProfilesTable, usersTable,
} from "@workspace/db";
import { eq, or, and, inArray, sql, SQL } from "drizzle-orm";
import {
  CreateBookingBody, UpdateBookingBody, ListBookingsQueryParams,
} from "@workspace/api-zod";
import { getUserSubscription, checkLimit } from "../lib/subscriptionGating";
import { z } from "zod/v4";

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
  const params = parsed.success ? parsed.data : {};
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

    const bookings = await db.select().from(bookingsTable).where(conditions.length > 0 ? and(...conditions) : undefined);

    const enriched = await Promise.all(bookings.map(async (b) => {
      const [f] = await db.select({ name: freelancerProfilesTable.name }).from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, b.freelancerId)).limit(1);
      const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, b.employerId)).limit(1);
      return { ...enrichRate(b), freelancerName: f?.name ?? null, employerName: e?.name ?? null };
    }));

    res.json(enriched);
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

      const [booking] = await tx.insert(bookingsTable)
        .values({
          ...parsed.data as any,
          employerId: employer.id,
          status: "pending",
          rate: null,
          proposedRate,
          lastProposedBy: "employer",
          negotiationStatus: "negotiating",
        })
        .returning();
      await tx.update(freelancerProfilesTable)
        .set({ isAvailable: false, currentBookingId: booking.id, bookingEndDate: parsed.data.endDate as any })
        .where(eq(freelancerProfilesTable.id, parsed.data.freelancerId));
      return { gate: null, booking };
    });

    if (result.gate) {
      res.status(402).json({ error: result.gate.reason, planNeeded: result.gate.planNeeded, code: "PLAN_LIMIT" });
      return;
    }
    const booking = result.booking!;
    const [f] = await db.select({ name: freelancerProfilesTable.name }).from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, booking.freelancerId)).limit(1);
    const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, booking.employerId)).limit(1);
    res.status(201).json({ ...enrichRate(booking), freelancerName: f?.name ?? null, employerName: e?.name ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to create booking");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/bookings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [b] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, id)).limit(1);
    if (!b) { res.status(404).json({ error: "Booking not found" }); return; }
    const [f] = await db.select({ name: freelancerProfilesTable.name }).from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, b.freelancerId)).limit(1);
    const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, b.employerId)).limit(1);
    res.json({ ...enrichRate(b), freelancerName: f?.name ?? null, employerName: e?.name ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to get booking");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/bookings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
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
      res.json({ ...enrichRate(updated), freelancerName: f?.name ?? null, employerName: e?.name ?? null });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to negotiate booking");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

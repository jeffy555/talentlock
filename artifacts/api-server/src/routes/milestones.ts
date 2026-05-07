import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  milestonesTable, bookingsTable, usersTable,
  freelancerProfilesTable, employerProfilesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

const CreateMilestoneBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().datetime().optional(),
});

const UpdateMilestoneBody = z.object({
  status: z.enum(["pending", "completed", "approved"]).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  amount: z.number().positive().optional(),
  dueDate: z.string().datetime().optional(),
});

async function resolveUser(clerkId: string) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return u ?? null;
}

async function canAccessBooking(userId: number, role: string, booking: typeof bookingsTable.$inferSelect) {
  if (role === "employer") {
    const [emp] = await db.select().from(employerProfilesTable)
      .where(eq(employerProfilesTable.userId, userId)).limit(1);
    return emp?.id === booking.employerId;
  }
  const [fl] = await db.select().from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.userId, userId)).limit(1);
  return fl?.id === booking.freelancerId;
}

router.get("/bookings/:id/milestones", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const bookingId = parseInt(req.params.id);
  if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const user = await resolveUser(clerkId);
    if (!user) { res.status(403).json({ error: "Forbidden" }); return; }
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (!(await canAccessBooking(user.id, user.role!, booking))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const milestones = await db.select().from(milestonesTable)
      .where(eq(milestonesTable.bookingId, bookingId))
      .orderBy(milestonesTable.createdAt);
    res.json(milestones.map(m => ({ ...m, amount: m.amount ? parseFloat(m.amount) : null })));
  } catch (err) {
    req.log.error({ err }, "Failed to list milestones");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bookings/:id/milestones", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const bookingId = parseInt(req.params.id);
  if (isNaN(bookingId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = CreateMilestoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const user = await resolveUser(clerkId);
    if (!user) { res.status(403).json({ error: "Forbidden" }); return; }
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (!(await canAccessBooking(user.id, user.role!, booking))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const [milestone] = await db.insert(milestonesTable).values({
      bookingId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      amount: parsed.data.amount?.toString() ?? null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      status: "pending",
    }).returning();
    res.status(201).json({ ...milestone, amount: milestone.amount ? parseFloat(milestone.amount) : null });
  } catch (err) {
    req.log.error({ err }, "Failed to create milestone");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/milestones/:id", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = UpdateMilestoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const user = await resolveUser(clerkId);
    if (!user) { res.status(403).json({ error: "Forbidden" }); return; }
    const [milestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id)).limit(1);
    if (!milestone) { res.status(404).json({ error: "Milestone not found" }); return; }
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, milestone.bookingId)).limit(1);
    if (!booking || !(await canAccessBooking(user.id, user.role!, booking))) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.title) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.amount !== undefined) updateData.amount = parsed.data.amount?.toString();
    if (parsed.data.dueDate !== undefined) updateData.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    if (parsed.data.status) {
      updateData.status = parsed.data.status;
      if (parsed.data.status === "completed") updateData.completedAt = new Date();
      if (parsed.data.status === "approved") updateData.approvedAt = new Date();
    }
    const [updated] = await db.update(milestonesTable).set(updateData as any)
      .where(eq(milestonesTable.id, id)).returning();
    res.json({ ...updated, amount: updated.amount ? parseFloat(updated.amount) : null });
  } catch (err) {
    req.log.error({ err }, "Failed to update milestone");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

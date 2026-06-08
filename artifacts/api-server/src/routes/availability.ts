import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  availabilityBlocksTable,
  freelancerProfilesTable,
  employerProfilesTable,
} from "@workspace/db";
import { eq, and, gte, asc } from "drizzle-orm";
import { CreateAvailabilityBlockBody } from "@workspace/api-zod";
import {
  createAvailabilityBlock,
  refreshNextAvailableDate,
  toDateString,
} from "../lib/availabilityUtils";
import { sanitiseText } from "../lib/sanitise";

const router = Router();

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function maxFutureStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 365);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function resolveFreelancer(clerkId: string) {
  const [profile] = await db
    .select()
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.clerkId, clerkId))
    .limit(1);
  return profile ?? null;
}

function mapPublicBlock(b: typeof availabilityBlocksTable.$inferSelect) {
  return {
    id: b.id,
    startDate: b.startDate,
    endDate: b.endDate,
    reason: b.reason as "booked" | "holiday" | "unavailable",
  };
}

function mapMeBlock(b: typeof availabilityBlocksTable.$inferSelect) {
  return {
    id: b.id,
    startDate: b.startDate,
    endDate: b.endDate,
    reason: b.reason as "booked" | "holiday" | "unavailable",
    label: b.label,
    bookingId: b.bookingId !== null ? String(b.bookingId) : null,
    createdAt: b.createdAt.toISOString(),
  };
}

router.get("/availability/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const profile = await resolveFreelancer(clerkId);
    if (!profile) {
      const [employer] = await db
        .select()
        .from(employerProfilesTable)
        .where(eq(employerProfilesTable.clerkId, clerkId))
        .limit(1);
      if (employer) {
        res.status(403).json({ error: "Only freelancers can access availability blocks" });
        return;
      }
      res.status(404).json({ error: "Freelancer profile not found" });
      return;
    }

    const today = todayStr();
    const blocks = await db
      .select()
      .from(availabilityBlocksTable)
      .where(
        and(
          eq(availabilityBlocksTable.freelancerId, profile.id),
          gte(availabilityBlocksTable.endDate, today),
        ),
      )
      .orderBy(asc(availabilityBlocksTable.startDate));

    res.json({
      nextAvailableDate: profile.nextAvailableDate ?? null,
      blocks: blocks.map(mapMeBlock),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get my availability");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/availability/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateAvailabilityBlockBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const startDate = toDateString(parsed.data.startDate);
  const endDate = toDateString(parsed.data.endDate);
  const { reason } = parsed.data;
  const label = parsed.data.label != null ? sanitiseText(parsed.data.label) : parsed.data.label;
  const today = todayStr();
  const maxFuture = maxFutureStr();

  if (startDate > endDate) {
    res.status(400).json({ error: "Start date must be on or before end date", code: "DATE_INVALID" });
    return;
  }
  if (endDate < today) {
    res.status(400).json({ error: "End date cannot be in the past", code: "DATE_IN_PAST" });
    return;
  }
  if (endDate > maxFuture) {
    res.status(400).json({ error: "End date cannot be more than 365 days in the future", code: "DATE_TOO_FAR" });
    return;
  }
  if (label && label.length > 100) {
    res.status(400).json({ error: "Label must be 100 characters or fewer", code: "LABEL_TOO_LONG" });
    return;
  }

  try {
    const profile = await resolveFreelancer(clerkId);
    if (!profile) {
      const [employer] = await db
        .select()
        .from(employerProfilesTable)
        .where(eq(employerProfilesTable.clerkId, clerkId))
        .limit(1);
      if (employer) {
        res.status(403).json({ error: "Only freelancers can create availability blocks" });
        return;
      }
      res.status(404).json({ error: "Freelancer profile not found" });
      return;
    }

    const block = await createAvailabilityBlock(db, {
      freelancerId: profile.id,
      startDate,
      endDate,
      reason,
      label: label ?? null,
    });

    const [updatedProfile] = await db
      .select({ nextAvailableDate: freelancerProfilesTable.nextAvailableDate })
      .from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, profile.id))
      .limit(1);

    res.status(201).json({
      ...mapMeBlock(block),
      nextAvailableDate: updatedProfile?.nextAvailableDate ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create availability block");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/availability/me/:id", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const blockId = parseInt(req.params.id);
  if (isNaN(blockId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    const profile = await resolveFreelancer(clerkId);
    if (!profile) {
      const [employer] = await db
        .select()
        .from(employerProfilesTable)
        .where(eq(employerProfilesTable.clerkId, clerkId))
        .limit(1);
      if (employer) {
        res.status(403).json({ error: "Only freelancers can delete availability blocks" });
        return;
      }
      res.status(404).json({ error: "Freelancer profile not found" });
      return;
    }

    const [block] = await db
      .select()
      .from(availabilityBlocksTable)
      .where(eq(availabilityBlocksTable.id, blockId))
      .limit(1);

    if (!block) {
      res.status(404).json({ error: "Block not found" });
      return;
    }
    if (block.freelancerId !== profile.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (block.bookingId !== null) {
      res.status(409).json({
        error: "Cannot delete an auto-created booking block. Cancel the booking to remove it.",
        code: "BLOCK_IS_AUTO",
      });
      return;
    }

    await db.delete(availabilityBlocksTable).where(eq(availabilityBlocksTable.id, blockId));
    await refreshNextAvailableDate(db, profile.id);

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete availability block");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/availability/:freelancerId", async (req, res) => {
  const freelancerId = parseInt(req.params.freelancerId);
  if (isNaN(freelancerId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    const [profile] = await db
      .select()
      .from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, freelancerId))
      .limit(1);

    if (!profile) {
      res.status(404).json({ error: "Freelancer not found" });
      return;
    }

    const today = todayStr();
    const blocks = await db
      .select()
      .from(availabilityBlocksTable)
      .where(
        and(
          eq(availabilityBlocksTable.freelancerId, freelancerId),
          gte(availabilityBlocksTable.endDate, today),
        ),
      )
      .orderBy(asc(availabilityBlocksTable.startDate));

    res.json({
      freelancerId: String(freelancerId),
      nextAvailableDate: profile.nextAvailableDate ?? null,
      blocks: blocks.map(mapPublicBlock),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get freelancer availability");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

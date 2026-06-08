import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, accountDeletionRequestsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { logAudit } from "../lib/auditLogger";
import { sanitiseText } from "../lib/sanitise";
import {
  anonymiseUserData,
  countActiveBookingsForUser,
  deleteClerkUser,
  findOpenDeletionRequest,
  markDeletionClerkFailed,
  markDeletionComplete,
} from "../lib/accountDeletion";

const router = Router();

const DeleteRequestBody = z.object({
  reason: z.string().max(500).optional(),
});

router.get("/account/delete-request", async (req, res) => {
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

    const [request] = await db
      .select({
        status: accountDeletionRequestsTable.status,
        rejectionReason: accountDeletionRequestsTable.rejectionReason,
      })
      .from(accountDeletionRequestsTable)
      .where(eq(accountDeletionRequestsTable.userId, user.id))
      .orderBy(desc(accountDeletionRequestsTable.requestedAt))
      .limit(1);

    res.json({
      status: request?.status ?? null,
      rejectionReason: request?.rejectionReason ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get deletion request status");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/account/delete-request", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = DeleteRequestBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const activeCount = await countActiveBookingsForUser(db, user.id);
    if (activeCount > 0) {
      res.status(409).json({
        error: "Cannot delete account with active bookings",
        code: "ACTIVE_BOOKINGS_EXIST",
        bookingCount: activeCount,
      });
      return;
    }

    const openRequest = await findOpenDeletionRequest(db, user.id);
    if (openRequest) {
      res.status(409).json({
        error: "A deletion request is already in progress",
        code: "DELETION_REQUEST_EXISTS",
      });
      return;
    }

    const reason = parsed.data.reason != null ? sanitiseText(parsed.data.reason) || null : null;

    const [deletionRequest] = await db
      .insert(accountDeletionRequestsTable)
      .values({ userId: user.id, status: "pending", reason })
      .returning();

    logAudit(db, {
      userId: user.id,
      clerkId,
      email: user.email,
      role: user.role,
      action: "account.deletion_requested",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    }).catch((err) => req.log.warn({ err }, "audit log write failed"));

    await anonymiseUserData(db, user.id, deletionRequest.id);

    try {
      await deleteClerkUser(clerkId);
      await markDeletionComplete(db, user.id);
      logAudit(db, {
        userId: user.id,
        action: "account.deletion_complete",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      }).catch((err) => req.log.warn({ err }, "audit log write failed"));
    } catch (clerkErr) {
      req.log.error({ err: clerkErr }, "Clerk account deletion failed — TalentLock data already anonymised");
      await markDeletionClerkFailed(db, user.id);
      res.status(500).json({
        error: "Account data was anonymised but sign-in could not be removed. Please contact support.",
        code: "CLERK_DELETION_FAILED",
      });
      return;
    }

    res.json({ success: true, message: "Your account has been deleted." });
  } catch (err) {
    req.log.error({ err }, "Failed to process account deletion");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

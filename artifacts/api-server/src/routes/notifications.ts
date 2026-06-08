import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";

const router = Router();

async function resolveUserId(clerkId: string): Promise<number | null> {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return u?.id ?? null;
}

function toPublicNotification(row: typeof notificationsTable.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    entityType: row.entityType,
    entityId: row.entityId,
    message: row.message,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/notifications/unread-count", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = await resolveUserId(clerkId);
    if (userId == null) { res.json({ count: 0 }); return; }
    const [row] = await db
      .select({ count: count() })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)));
    res.json({ count: Number(row?.count ?? 0) });
  } catch (err) {
    req.log.error({ err }, "Failed to get unread notification count");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/notifications", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
  const offset = (page - 1) * pageSize;

  try {
    const userId = await resolveUserId(clerkId);
    if (userId == null) {
      res.json({ data: [], total: 0, unreadCount: 0, page, pageSize });
      return;
    }

    const where = eq(notificationsTable.userId, userId);
    const [totalRow] = await db.select({ total: count() }).from(notificationsTable).where(where);
    const [unreadRow] = await db
      .select({ unread: count() })
      .from(notificationsTable)
      .where(and(where, eq(notificationsTable.read, false)));

    const rows = await db
      .select()
      .from(notificationsTable)
      .where(where)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(pageSize)
      .offset(offset);

    res.json({
      data: rows.map(toPublicNotification),
      total: Number(totalRow?.total ?? 0),
      unreadCount: Number(unreadRow?.unread ?? 0),
      page,
      pageSize,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/read-all", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const userId = await resolveUserId(clerkId);
    if (userId == null) { res.json({ success: true }); return; }
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(eq(notificationsTable.userId, userId));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark all notifications read");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/:id/read", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const userId = await resolveUserId(clerkId);
    if (userId == null) { res.status(404).json({ error: "Not found" }); return; }

    const [existing] = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, id))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification read");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

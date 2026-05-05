import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { auditLogsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function record(req: any, event: "user.login" | "user.logout") {
  const { userId: clerkId } = getAuth(req) ?? { userId: null };
  let userId: number | null = null;
  let email: string | null = null;
  let role: string | null = null;
  if (clerkId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (user) {
      userId = user.id;
      email = user.email;
      role = user.role;
    }
  }
  await db.insert(auditLogsTable).values({
    userId,
    clerkId: clerkId ?? null,
    email,
    role,
    event,
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });
}

router.post("/auth/track-login", async (req, res) => {
  try {
    await record(req, "user.login");
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to record login");
    res.status(500).json({ error: "Failed to record." });
  }
});

router.post("/auth/track-logout", async (req, res) => {
  try {
    await record(req, "user.logout");
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to record logout");
    res.status(500).json({ error: "Failed to record." });
  }
});

export default router;

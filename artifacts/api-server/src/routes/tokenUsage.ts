import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, tokenUsage, conversations } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import {
  getMonthlyTokenUsage,
  getUserSubscription,
  getUtcTokenResetDate,
} from "../lib/subscriptionGating";

const router = Router();

router.get("/token-usage/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.role !== "employer") {
      res.status(403).json({ error: "Token usage is available for employer accounts only" });
      return;
    }

    const sub = await getUserSubscription(user.id);
    const now = new Date();
    const resetDate = getUtcTokenResetDate(now);
    const { tokensUsed, breakdown } = await getMonthlyTokenUsage(user.id);
    const monthlyTokenLimit = sub.plan.limits.monthlyTokenLimit;
    const tokensRemaining =
      monthlyTokenLimit === null ? null : Math.max(0, monthlyTokenLimit - tokensUsed);

    res.json({
      plan: sub.plan.id,
      monthlyTokenLimit,
      tokensUsed,
      tokensRemaining,
      resetDate: resetDate.toISOString(),
      breakdown,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get token usage");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/token-usage/conversation/:conversationId", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const conversationId = parseInt(req.params.conversationId, 10);
  if (isNaN(conversationId)) { res.status(400).json({ error: "Invalid conversation ID" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.role !== "employer") {
      res.status(403).json({ error: "Token usage is available for employer accounts only" });
      return;
    }

    const sub = await getUserSubscription(user.id);
    if (sub.plan.id === "employer_starter") {
      res.status(402).json({
        error: "Per-conversation breakdown requires Growth or Enterprise plan",
        code: "PLAN_LIMIT",
        planNeeded: "employer_growth",
      });
      return;
    }

    const [conversation] = await db.select().from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conversation) { res.status(404).json({ error: "Conversation not found" }); return; }
    if (conversation.userId !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const rows = await db.select().from(tokenUsage)
      .where(and(
        eq(tokenUsage.conversationId, conversationId),
        eq(tokenUsage.userId, user.id),
        eq(tokenUsage.feature, "ai_match"),
      ))
      .orderBy(asc(tokenUsage.createdAt));

    const messages = rows.map(row => ({
      id: row.id,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      createdAt: row.createdAt.toISOString(),
    }));

    const totalTokens = messages.reduce((sum, m) => sum + m.totalTokens, 0);

    res.json({
      conversationId,
      totalTokens,
      messages,
      legacyData: messages.length === 0,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation token usage");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

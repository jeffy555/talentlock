import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { subscriptionsTable, usersTable, freelancerProfilesTable, employerProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { PLANS, getPlan, listPlansForAudience, type Audience } from "../lib/plans";
import { getUserSubscription, getCombinedUsage } from "../lib/subscriptionGating";

const router = Router();

router.get("/subscriptions/plans", async (req, res) => {
  const audience = (req.query.audience as Audience) || "any";
  res.json(listPlansForAudience(audience));
});

router.get("/subscriptions/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const sub = await getUserSubscription(user.id);
    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    const usage = await getCombinedUsage({
      employerProfileId: employer?.id ?? null,
      freelancerProfileId: freelancer?.id ?? null,
    });

    res.json({
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      usage,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/subscriptions/upgrade", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const planId = typeof req.body?.planId === "string" ? req.body.planId : null;
  if (!planId || !(planId in PLANS) || planId === "free") {
    res.status(400).json({ error: "Invalid plan" }); return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const plan = getPlan(planId);

    // Audience guard: prevent freelancer accounts from buying employer plans
    // and vice versa, which would create inconsistent entitlements.
    if (
      plan.audience !== "any" &&
      user.role !== plan.audience &&
      plan.id !== "employer_enterprise"
    ) {
      res.status(400).json({ error: `The ${plan.name} plan is for ${plan.audience} accounts.` });
      return;
    }

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Atomic upsert keyed on the unique (user_id) index — safe under concurrent
    // first-time upgrades.
    await db.insert(subscriptionsTable)
      .values({
        userId: user.id, plan: plan.id, status: "active", currentPeriodEnd: periodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptionsTable.userId,
        set: { plan: plan.id, status: "active", currentPeriodEnd: periodEnd },
      });

    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    const usage = await getCombinedUsage({
      employerProfileId: employer?.id ?? null,
      freelancerProfileId: freelancer?.id ?? null,
    });

    res.json({ plan, status: "active", currentPeriodEnd: periodEnd, usage });
  } catch (err) {
    req.log.error({ err }, "Failed to upgrade subscription");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

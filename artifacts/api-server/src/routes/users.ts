import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpsertMeBody, PatchNotificationPreferencesBody, PatchOnboardingStepBody } from "@workspace/api-zod";
import { sanitiseText } from "../lib/sanitise";
import { z } from "zod/v4";

const router = Router();

router.get("/users/me", async (req, res) => {
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
    res.json(user);
  } catch (err) {
    req.log.error({ err }, "Failed to get user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/users/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpsertMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const data = {
      ...parsed.data,
      name: sanitiseText(parsed.data.name),
    };
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (existing) {
      const isCompletingOnboarding =
        parsed.data.role === "freelancer" || parsed.data.role === "employer";
      const [updated] = await db.update(usersTable)
        .set({
          ...data,
          ...(isCompletingOnboarding
            ? { onboardingRole: null, onboardingStep: null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.clerkId, clerkId))
        .returning();
      res.json(updated);
    } else {
      const isCompletingOnboarding =
        parsed.data.role === "freelancer" || parsed.data.role === "employer";
      const [created] = await db.insert(usersTable)
        .values({
          ...data,
          clerkId,
          ...(isCompletingOnboarding
            ? { onboardingRole: null, onboardingStep: null }
            : {}),
        })
        .returning();
      res.json(created);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to upsert user");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/me/onboarding-step", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = PatchOnboardingStepBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (existing && existing.role !== "pending") {
      res.status(409).json({ error: "Onboarding already complete" });
      return;
    }
    const payload = {
      clerkId,
      role: "pending" as const,
      email: parsed.data.email,
      name: sanitiseText(parsed.data.name),
      avatarUrl: parsed.data.avatarUrl ?? null,
      onboardingRole: parsed.data.onboardingRole,
      onboardingStep: parsed.data.onboardingStep,
      updatedAt: new Date(),
    };
    const [user] = await db
      .insert(usersTable)
      .values(payload)
      .onConflictDoUpdate({
        target: usersTable.clerkId,
        set: {
          email: payload.email,
          name: payload.name,
          avatarUrl: payload.avatarUrl,
          onboardingRole: payload.onboardingRole,
          onboardingStep: payload.onboardingStep,
          updatedAt: payload.updatedAt,
        },
      })
      .returning();
    req.log.info(
      { clerkId, onboardingRole: user.onboardingRole, onboardingStep: user.onboardingStep },
      "Onboarding step saved",
    );
    res.json(user);
  } catch (err) {
    req.log.error({ err }, "Failed to save onboarding step");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/me/notification-preferences", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = PatchNotificationPreferencesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [updated] = await db.update(usersTable)
      .set({
        emailNotificationsEnabled: parsed.data.emailNotificationsEnabled,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
    if (!updated) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ success: true, emailNotificationsEnabled: updated.emailNotificationsEnabled });
  } catch (err) {
    req.log.error({ err }, "Failed to update notification preferences");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/users/me/signature", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = z.object({ signatureImageUrl: z.string().nullable() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "signatureImageUrl required" }); return; }
  try {
    const [updated] = await db.update(usersTable)
      .set({ signatureImageUrl: body.data.signatureImageUrl, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
    if (!updated) { res.status(404).json({ error: "User not found" }); return; }
    req.log.info({ clerkId }, "Signature image saved");
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to save signature");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { usersTable, notificationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { UpsertMeBody, PatchNotificationPreferencesBody, PatchOnboardingStepBody, PatchMyContactBody } from "@workspace/api-zod";
import { sanitiseText } from "../lib/sanitise";
import { validateLocationInput } from "../lib/countryData";
import { syncFreelancerLocationFromUser } from "../lib/locationSync";
import { isValidEmail } from "../lib/emailValidation";
import { isValidPhone, normalizePhone } from "../lib/phoneValidation";
import { createNotification, NotificationType } from "../lib/createNotification";
import { z } from "zod/v4";

const router = Router();

async function ensureContactUpdateNotification(user: typeof usersTable.$inferSelect, log: { warn: Function }) {
  if (user.role !== "freelancer" && user.role !== "employer") return;
  if (isValidPhone(user.phone)) return;

  try {
    const [existing] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, user.id),
          eq(notificationsTable.type, NotificationType.CONTACT_UPDATE_REQUIRED),
          eq(notificationsTable.read, false),
        ),
      )
      .limit(1);
    if (existing) return;

    await createNotification(db, {
      userId: user.id,
      type: NotificationType.CONTACT_UPDATE_REQUIRED,
      entityType: "user_contact",
      entityId: user.id,
      message: "Add your contact email and phone with country code on Profile — required for meeting invites.",
    });
  } catch (err) {
    log.warn({ err, userId: user.id }, "contact update notification failed");
  }
}

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
    // Fire-and-forget: prompt existing users missing phone to update contact details.
    void ensureContactUpdateNotification(user, req.log);
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
  if (!isValidEmail(parsed.data.email)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  if (!isValidPhone(parsed.data.phone)) {
    res.status(400).json({ error: "A valid phone number is required (8–15 digits, optional + country code)." });
    return;
  }
  try {
    const data = {
      ...parsed.data,
      email: parsed.data.email.trim(),
      phone: normalizePhone(parsed.data.phone),
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
  if (!isValidEmail(parsed.data.email)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  const phoneRaw = (parsed.data as { phone?: string | null }).phone;
  if (phoneRaw != null && phoneRaw !== "" && !isValidPhone(phoneRaw)) {
    res.status(400).json({ error: "A valid phone number is required (8–15 digits, optional + country code)." });
    return;
  }
  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (existing && existing.role !== "pending") {
      res.status(409).json({ error: "Onboarding already complete" });
      return;
    }
    const payload: Record<string, unknown> = {
      clerkId,
      role: "pending" as const,
      email: parsed.data.email.trim(),
      name: sanitiseText(parsed.data.name),
      avatarUrl: parsed.data.avatarUrl ?? null,
      onboardingRole: parsed.data.onboardingRole,
      onboardingStep: parsed.data.onboardingStep,
      updatedAt: new Date(),
    };
    if (phoneRaw != null && phoneRaw !== "") {
      payload.phone = normalizePhone(phoneRaw);
    }

    const countryCode = (parsed.data as { countryCode?: string }).countryCode;
    const stateCode = (parsed.data as { stateCode?: string | null }).stateCode ?? null;
    const isLocationStep = parsed.data.onboardingStep === "location";
    if (isLocationStep || countryCode) {
      if (!countryCode) {
        res.status(400).json({ error: "countryCode is required for location step" });
        return;
      }
      const loc = validateLocationInput(countryCode, stateCode);
      if (!loc.ok) {
        res.status(400).json({ error: loc.error });
        return;
      }
      payload.countryCode = countryCode;
      payload.stateCode = stateCode;
      payload.currencyCode = loc.currencyCode;
    }

    const locationUpdate =
      payload.countryCode !== undefined
        ? {
            countryCode: payload.countryCode as string,
            stateCode: payload.stateCode as string | null,
            currencyCode: payload.currencyCode as string,
          }
        : {};

    const phoneUpdate =
      payload.phone !== undefined ? { phone: payload.phone as string } : {};

    const [user] = await db
      .insert(usersTable)
      .values(payload as typeof usersTable.$inferInsert)
      .onConflictDoUpdate({
        target: usersTable.clerkId,
        set: {
          email: payload.email as string,
          name: payload.name as string,
          avatarUrl: payload.avatarUrl as string | null,
          onboardingRole: payload.onboardingRole as string,
          onboardingStep: payload.onboardingStep as string,
          ...phoneUpdate,
          ...locationUpdate,
          updatedAt: payload.updatedAt as Date,
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

router.patch("/users/me/contact", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = PatchMyContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isValidEmail(parsed.data.email)) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  if (!isValidPhone(parsed.data.phone)) {
    res.status(400).json({ error: "A valid phone number with country code is required (e.g. +919876543210)." });
    return;
  }
  try {
    const [updated] = await db
      .update(usersTable)
      .set({
        email: parsed.data.email.trim(),
        phone: normalizePhone(parsed.data.phone),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    // Clear pending contact-update prompts once the user has saved valid details.
    try {
      await db
        .update(notificationsTable)
        .set({ read: true })
        .where(
          and(
            eq(notificationsTable.userId, updated.id),
            eq(notificationsTable.type, NotificationType.CONTACT_UPDATE_REQUIRED),
            eq(notificationsTable.read, false),
          ),
        );
    } catch (err) {
      req.log.warn({ err }, "failed to clear contact notifications");
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update contact details");
    res.status(500).json({ error: "Internal server error" });
  }
});

const PatchLocationBody = z.object({
  countryCode: z.string().min(2).max(2),
  stateCode: z.string().min(1).max(16).nullable().optional(),
});

router.patch("/users/me/location", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = PatchLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const loc = validateLocationInput(parsed.data.countryCode, parsed.data.stateCode ?? null);
  if (!loc.ok) {
    res.status(400).json({ error: loc.error });
    return;
  }
  try {
    const [updated] = await db
      .update(usersTable)
      .set({
        countryCode: parsed.data.countryCode,
        stateCode: parsed.data.stateCode ?? null,
        currencyCode: loc.currencyCode,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.clerkId, clerkId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (updated.role === "freelancer") {
      await syncFreelancerLocationFromUser(db, updated.id);
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update user location");
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

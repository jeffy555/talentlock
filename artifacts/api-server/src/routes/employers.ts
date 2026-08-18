import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { employerProfilesTable, usersTable, employerCandidateNotesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { UpsertMyEmployerProfileBody } from "@workspace/api-zod";
import { sanitiseText } from "../lib/sanitise";
import { resolveUserByClerkId } from "../lib/accessControl";

const router = Router();

router.get("/employers/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [profile] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    if (!profile) { res.status(404).json({ error: "Employer profile not found" }); return; }
    res.json(profile);
  } catch (err) {
    req.log.error({ err }, "Failed to get employer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/employers/me/candidate-notes/:freelancerId", async (req, res) => {
  const freelancerId = parseInt(req.params.freelancerId);
  if (isNaN(freelancerId)) { res.status(400).json({ error: "Invalid freelancer ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (user.role !== "employer") {
      res.status(403).json({ error: "Employer only" });
      return;
    }
    const [note] = await db
      .select()
      .from(employerCandidateNotesTable)
      .where(and(
        eq(employerCandidateNotesTable.employerUserId, user.id),
        eq(employerCandidateNotesTable.freelancerId, freelancerId),
      ))
      .limit(1);
    if (!note) {
      res.status(404).json({ error: "No hiring notes for this freelancer" });
      return;
    }
    res.json({
      freelancerId: note.freelancerId,
      disposition: note.disposition,
      feedbackText: note.feedbackText,
      feedbackSummary: note.feedbackSummary,
      latestMeetingId: note.latestMeetingId,
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get employer candidate notes");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/employers/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpsertMyEmployerProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // website is in OpenAPI but not yet in employer_profiles — omit until schema migration
  const { website: _website, ...profileInput } = parsed.data;
  const data = {
    companyName: sanitiseText(profileInput.companyName),
    industry: sanitiseText(profileInput.industry),
    companySize: profileInput.companySize != null ? sanitiseText(profileInput.companySize) : profileInput.companySize,
    description: profileInput.description != null ? sanitiseText(profileInput.description) : profileInput.description,
    subscriptionPlan: profileInput.subscriptionPlan,
  };
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(400).json({ error: "User profile not found" }); return; }
    const [existing] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    if (existing) {
      const [updated] = await db.update(employerProfilesTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(employerProfilesTable.clerkId, clerkId))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(employerProfilesTable)
        .values({ ...data, clerkId, userId: user.id, isVerified: false })
        .returning();
      res.json(created);
    }
  } catch (err) {
    req.log.error({ err }, "Failed to upsert employer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

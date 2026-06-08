import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { freelancerProfilesTable, usersTable, documentsTable } from "@workspace/db";
import { eq, and, or, isNull, lte, gte, sql, SQL, exists } from "drizzle-orm";
import { refreshNextAvailableDate, toDateString } from "../lib/availabilityUtils";
import { sanitiseSearchQuery } from "../lib/searchUtils";
import { calculateCompletenessScore } from "../lib/completenessUtils";
import {
  CreateFreelancerProfileBody,
  UpdateMyFreelancerProfileBody,
  ListFreelancersQueryParams,
} from "@workspace/api-zod";

import { countVerifiedDocuments } from "../lib/documentReview";
import { sanitiseText } from "../lib/sanitise";

const router = Router();

router.get("/freelancers", async (req, res) => {
  const parsed = ListFreelancersQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  const verifiedOnly = params.verified === true;

  try {
    const conditions: SQL[] = [];

    if (params.field) {
      conditions.push(eq(freelancerProfilesTable.fieldOfWork, params.field));
    }
    if (params.available !== undefined) {
      conditions.push(eq(freelancerProfilesTable.isAvailable, params.available));
    }
    if (params.availableFrom) {
      const filterDate = toDateString(params.availableFrom);
      conditions.push(
        or(
          isNull(freelancerProfilesTable.nextAvailableDate),
          lte(freelancerProfilesTable.nextAvailableDate, filterDate),
        )!,
      );
    }
    if (verifiedOnly) {
      conditions.push(
        exists(
          db
            .select({ one: documentsTable.id })
            .from(documentsTable)
            .where(
              and(
                eq(documentsTable.freelancerId, freelancerProfilesTable.id),
                eq(documentsTable.status, "verified"),
              ),
            ),
        ),
      );
    }

    // Full-text search: skills is text[] — array_to_string expression (see plan.md Q3/Q4)
    const searchQ = params.q ? sanitiseSearchQuery(params.q) : null;
    if (searchQ) {
      conditions.push(
        sql`to_tsvector('simple',
          coalesce(${freelancerProfilesTable.bio}, '') || ' ' ||
          coalesce(array_to_string(${freelancerProfilesTable.skills}, ' '), ''))
          @@ to_tsquery('simple', ${searchQ})`,
      );
    }

    conditions.push(gte(freelancerProfilesTable.completenessScore, 60));

    const results = await db
      .select()
      .from(freelancerProfilesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    res.json(results.map(mapProfile));
  } catch (err) {
    req.log.error({ err }, "Failed to list freelancers");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/freelancers/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [profile] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }
    res.json(mapProfile(profile));
  } catch (err) {
    req.log.error({ err }, "Failed to get my freelancer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/freelancers/me", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpdateMyFreelancerProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = { ...parsed.data };
  if (data.tagline !== undefined) data.tagline = sanitiseText(data.tagline);
  if (data.bio !== undefined) data.bio = data.bio === null ? null : sanitiseText(data.bio);
  if (data.fieldOfWork !== undefined) data.fieldOfWork = sanitiseText(data.fieldOfWork);
  if (data.skills !== undefined) data.skills = data.skills.map((s) => sanitiseText(s));
  if (data.achievements !== undefined) {
    data.achievements = data.achievements === null ? null : sanitiseText(data.achievements);
  }
  if (data.availabilityNote !== undefined) {
    data.availabilityNote = data.availabilityNote === null ? null : sanitiseText(data.availabilityNote);
  }
  try {
    const [current] = await db.select().from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    if (!current) { res.status(404).json({ error: "Profile not found" }); return; }

    const [user] = await db.select({ avatarUrl: usersTable.avatarUrl })
      .from(usersTable).where(eq(usersTable.id, current.userId)).limit(1);

    const merged = { ...current, ...data };
    const completenessScore = calculateCompletenessScore(
      {
        bio: merged.bio,
        skills: merged.skills,
        hourlyRate: merged.hourlyRate,
        dailyRate: merged.dailyRate,
        paymentPreference: merged.paymentPreference,
        fieldOfWork: merged.fieldOfWork,
        isAvailable: merged.isAvailable,
      },
      user?.avatarUrl,
    );

    const [updated] = await db.update(freelancerProfilesTable)
      .set({ ...data, completenessScore, updatedAt: new Date() } as any)
      .where(eq(freelancerProfilesTable.clerkId, clerkId))
      .returning();
    if (!updated) { res.status(404).json({ error: "Profile not found" }); return; }
    if (data.isAvailable !== undefined || data.availableFrom !== undefined) {
      await refreshNextAvailableDate(db, updated.id);
      const [refreshed] = await db.select().from(freelancerProfilesTable)
        .where(eq(freelancerProfilesTable.id, updated.id)).limit(1);
      res.json(mapProfile(refreshed ?? updated));
      return;
    }
    res.json(mapProfile(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update freelancer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/freelancers", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateFreelancerProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(400).json({ error: "User profile not found" }); return; }
    const insertData = { ...parsed.data as any, clerkId, userId: user.id, name: user.name, isAvailable: true, isVerified: false, verificationLevel: "unverified" };
    const [profile] = await db.insert(freelancerProfilesTable)
      .values(insertData)
      .onConflictDoUpdate({
        target: freelancerProfilesTable.clerkId,
        set: {
          tagline: insertData.tagline,
          fieldOfWork: insertData.fieldOfWork,
          skills: insertData.skills,
          yearsExperience: insertData.yearsExperience,
          paymentPreference: insertData.paymentPreference,
          hourlyRate: insertData.hourlyRate ?? null,
          subscriptionPlan: insertData.subscriptionPlan,
          resumeAnalysis: insertData.resumeAnalysis ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    res.status(201).json(mapProfile(profile));
  } catch (err) {
    req.log.error({ err }, "Failed to create freelancer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/freelancers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [profile] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, id)).limit(1);
    if (!profile) { res.status(404).json({ error: "Freelancer not found" }); return; }
    const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, profile.userId)).limit(1);
    const verifiedDocumentCount = await countVerifiedDocuments(profile.id);

    res.json({
      ...mapProfile(profile),
      email: user?.email ?? null,
      verification: {
        level: profile.verificationLevel,
        verifiedDocumentCount,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get freelancer profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapProfile(p: typeof freelancerProfilesTable.$inferSelect) {
  return {
    ...p,
    hourlyRate: p.hourlyRate ? parseFloat(p.hourlyRate) : null,
    dailyRate: p.dailyRate ? parseFloat(p.dailyRate) : null,
    averageRating: p.averageRating ? parseFloat(p.averageRating) : null,
    reviewCount: p.reviewCount ?? 0,
    completenessScore: p.completenessScore ?? 0,
    nextAvailableDate: p.nextAvailableDate ?? null,
  };
}

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { freelancerProfilesTable, usersTable, documentsTable } from "@workspace/db";
import { eq, and, or, isNull, isNotNull, lte, gte, lt, not, inArray, sql, SQL, exists } from "drizzle-orm";
import { refreshNextAvailableDate, toDateString } from "../lib/availabilityUtils";
import { sanitiseSearchQuery } from "../lib/searchUtils";
import { calculateCompletenessScore } from "../lib/completenessUtils";
import { daysUntil } from "../lib/credentialExpiryUtils";
import { evaluateTalentSearchForUpdatedProfile } from "../lib/talentSearchEvaluator";
import { notifyWatchlistSubscribers, type FreelancerSnapshot } from "../lib/watchlistAlerts";
import { syncFreelancerLocationFromUser } from "../lib/locationSync";
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

    // Full-text + name match (name ILIKE covers partial first/last name queries used by messaging search)
    const searchQ = params.q ? sanitiseSearchQuery(params.q) : null;
    if (searchQ) {
      const namePattern = `%${searchQ}%`;
      conditions.push(
        or(
          sql`to_tsvector('simple',
            coalesce(${freelancerProfilesTable.name}, '') || ' ' ||
            coalesce(${freelancerProfilesTable.bio}, '') || ' ' ||
            coalesce(array_to_string(${freelancerProfilesTable.skills}, ' '), ''))
            @@ to_tsquery('simple', ${searchQ})`,
          sql`${freelancerProfilesTable.name} ILIKE ${namePattern}`,
        )!,
      );
    }

    if (params.professionCategory) {
      conditions.push(eq(freelancerProfilesTable.professionCategory, params.professionCategory));
    }

    if (params.teachingSubject) {
      const subjectPattern = `%${params.teachingSubject}%`;
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM unnest(${freelancerProfilesTable.teachingSubjects}) AS subject
          WHERE subject ILIKE ${subjectPattern}
        )`,
      );
    }

    if (params.countryCode) {
      conditions.push(eq(freelancerProfilesTable.countryCode, params.countryCode));
    }
    if (params.currencyCode) {
      conditions.push(eq(freelancerProfilesTable.currencyCode, params.currencyCode));
    }

    conditions.push(gte(freelancerProfilesTable.completenessScore, 60));

    // Credential Expiry Tracking (Q3 scope): only school_teacher education
    // professionals with an expired REQUIRED teaching licence are excluded
    // from Talent Vault. Generic professional_credential expiry never
    // gates Vault visibility — it only downgrades the badge (see
    // credentialExpiryScan.ts). Direct access (/:id, /f/:id) is unaffected.
    conditions.push(
      not(
        and(
          eq(freelancerProfilesTable.professionCategory, "education"),
          eq(freelancerProfilesTable.educationProfessionType, "school_teacher"),
          isNotNull(freelancerProfilesTable.teachingLicenceExpiry),
          lt(freelancerProfilesTable.teachingLicenceExpiry, new Date()),
        )!,
      )!,
    );

    const results = await db
      .select()
      .from(freelancerProfilesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(params.limit ?? 50)
      .offset(params.offset ?? 0);

    // "Expiring Soon" Vault badge — any verified document or teaching
    // licence expiring within the next 7 days.
    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const freelancerIds = results.map((r) => r.id);

    const expiringDocs = freelancerIds.length
      ? await db
          .select({ freelancerId: documentsTable.freelancerId, expiryDate: documentsTable.expiryDate })
          .from(documentsTable)
          .where(
            and(
              inArray(documentsTable.freelancerId, freelancerIds),
              eq(documentsTable.status, "verified"),
              isNotNull(documentsTable.expiryDate),
              gte(documentsTable.expiryDate, now),
              lte(documentsTable.expiryDate, sevenDaysOut),
            ),
          )
      : [];
    const docExpiryByFreelancer = new Map(expiringDocs.map((d) => [d.freelancerId, d.expiryDate!]));

    res.json(
      results.map((p) => {
        const mapped = mapProfile(p);
        let soonest: Date | null = docExpiryByFreelancer.get(p.id) ?? null;
        if (p.teachingLicenceExpiry && p.teachingLicenceExpiry >= now && p.teachingLicenceExpiry <= sevenDaysOut) {
          if (!soonest || p.teachingLicenceExpiry < soonest) soonest = p.teachingLicenceExpiry;
        }
        return {
          ...mapped,
          expiringCredential: soonest ? { daysRemaining: daysUntil(soonest, now) } : null,
        };
      }),
    );
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
  if (data.teachingSubjects !== undefined) {
    data.teachingSubjects = data.teachingSubjects?.map((s) => sanitiseText(s)) ?? null;
  }
  if (data.teachingLevels !== undefined) {
    data.teachingLevels = data.teachingLevels?.map((s) => sanitiseText(s)) ?? null;
  }
  if (data.degreeSubject !== undefined) {
    data.degreeSubject = data.degreeSubject === null ? null : sanitiseText(data.degreeSubject);
  }
  if (data.degreeInstitution !== undefined) {
    data.degreeInstitution = data.degreeInstitution === null ? null : sanitiseText(data.degreeInstitution);
  }
  if (data.teachingLicenceState !== undefined) {
    data.teachingLicenceState = data.teachingLicenceState === null ? null : sanitiseText(data.teachingLicenceState);
  }
  if (data.researchPublications !== undefined) {
    data.researchPublications = data.researchPublications === null ? null : sanitiseText(data.researchPublications);
  }
  if (data.location !== undefined) {
    data.location = data.location === null ? null : sanitiseText(data.location);
  }
  try {
    const [current] = await db.select().from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    if (!current) { res.status(404).json({ error: "Profile not found" }); return; }

    const beforeSnapshot: FreelancerSnapshot = {
      isAvailable: current.isAvailable,
      hourlyRate: current.hourlyRate,
      dailyRate: current.dailyRate,
      name: current.name,
    };

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

    // Renewing the teaching licence must reset the expiry alert stage —
    // otherwise a renewed licence stays stuck at 'expired' and the
    // freelancer remains excluded from Talent Vault despite renewing.
    const nextTeachingLicenceExpiry =
      data.teachingLicenceExpiry !== undefined
        ? (data.teachingLicenceExpiry ? new Date(data.teachingLicenceExpiry).getTime() : null)
        : undefined;
    const currentTeachingLicenceExpiry = current.teachingLicenceExpiry
      ? current.teachingLicenceExpiry.getTime()
      : null;
    const teachingLicenceExpiryChanged =
      nextTeachingLicenceExpiry !== undefined && nextTeachingLicenceExpiry !== currentTeachingLicenceExpiry;

    const [updated] = await db.update(freelancerProfilesTable)
      .set({
        ...data,
        completenessScore,
        ...(teachingLicenceExpiryChanged ? { teachingLicenceAlertStage: "none" } : {}),
        updatedAt: new Date(),
      } as any)
      .where(eq(freelancerProfilesTable.clerkId, clerkId))
      .returning();
    if (!updated) { res.status(404).json({ error: "Profile not found" }); return; }

    const afterSnapshot: FreelancerSnapshot = {
      isAvailable: updated.isAvailable,
      hourlyRate: updated.hourlyRate,
      dailyRate: updated.dailyRate,
      name: updated.name,
    };
    notifyWatchlistSubscribers(updated.id, beforeSnapshot, afterSnapshot, req.log).catch((err) =>
      req.log.warn({ err, freelancerId: updated.id }, "watchlist alert failed"),
    );

    // Fire-and-forget TalentSearch evaluation — runs before both res.json exits below,
    // never awaited, never delays the response. Only matchable, Talent-Vault-visible
    // profiles (completeness >= 60) are evaluated.
    if (updated.completenessScore >= 60) {
      evaluateTalentSearchForUpdatedProfile(db, updated.id, req.log).catch((err) =>
        req.log.warn({ err, freelancerId: updated.id }, "talent-search evaluation hook failed"),
      );
    }

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
    const insertData = {
      ...parsed.data as any,
      clerkId,
      userId: user.id,
      name: user.name,
      isAvailable: true,
      isVerified: false,
      verificationLevel: "unverified",
      countryCode: user.countryCode,
      currencyCode: user.currencyCode,
    };
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
          professionCategory: insertData.professionCategory,
          educationProfessionType: insertData.educationProfessionType ?? null,
          teachingSubjects: insertData.teachingSubjects ?? null,
          teachingLevels: insertData.teachingLevels ?? null,
          yearsTeachingExperience: insertData.yearsTeachingExperience ?? null,
          highestDegree: insertData.highestDegree ?? null,
          degreeSubject: insertData.degreeSubject ?? null,
          degreeInstitution: insertData.degreeInstitution ?? null,
          teachingLicenceState: insertData.teachingLicenceState ?? null,
          teachingLicenceExpiry: insertData.teachingLicenceExpiry ?? null,
          dbsCheckStatus: insertData.dbsCheckStatus ?? null,
          researchPublications: insertData.researchPublications ?? null,
          preferredTeachingMode: insertData.preferredTeachingMode ?? null,
          location: insertData.location ?? null,
          countryCode: insertData.countryCode,
          currencyCode: insertData.currencyCode,
          updatedAt: new Date(),
        },
      })
      .returning();
    await syncFreelancerLocationFromUser(db, user.id);
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

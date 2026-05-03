import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  jobInterestsTable,
  jobRequirementsTable,
  freelancerProfilesTable,
  employerProfilesTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { getUserSubscription, checkLimit } from "../lib/subscriptionGating";

const router = Router();

router.post("/job-requirements/:id/interest", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const jobId = parseInt(req.params.id);
  if (isNaN(jobId)) { res.status(400).json({ error: "Invalid job ID" }); return; }

  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 1000) : null;

  try {
    const [freelancer] = await db.select().from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    if (!freelancer) { res.status(403).json({ error: "Only freelancers can express interest" }); return; }

    const [job] = await db.select().from(jobRequirementsTable)
      .where(eq(jobRequirementsTable.id, jobId)).limit(1);
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.status !== "open") { res.status(400).json({ error: "This role is no longer open" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "User account not found" }); return; }

    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    let interest;
    try {
      const txResult = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
        const sub = await getUserSubscription(user.id);
        const monthlyInterests = await tx.select({ id: jobInterestsTable.id }).from(jobInterestsTable)
          .where(and(eq(jobInterestsTable.freelancerId, freelancer.id), gte(jobInterestsTable.createdAt as any, monthStart)));
        const gate = checkLimit(sub.plan, "monthlyExpressInterests", monthlyInterests.length);
        if (!gate.allowed) return { gate, row: null };

        const [row] = await tx.insert(jobInterestsTable).values({
          jobRequirementId: jobId,
          freelancerId: freelancer.id,
          message: message || null,
        }).returning();
        return { gate: null, row };
      });

      if (txResult.gate) {
        res.status(402).json({ error: txResult.gate.reason, planNeeded: txResult.gate.planNeeded, code: "PLAN_LIMIT" });
        return;
      }
      interest = txResult.row!;
    } catch (insertErr: any) {
      if (insertErr?.code === "23505") {
        res.status(409).json({ error: "You have already expressed interest in this role" });
        return;
      }
      throw insertErr;
    }

    // Notify the employer who owns this job. Notification failure must not roll
    // back the (already-committed) interest record — log and continue.
    try {
      const [employerProfile] = await db.select().from(employerProfilesTable)
        .where(eq(employerProfilesTable.id, job.employerId)).limit(1);
      if (employerProfile) {
        const [employerUser] = await db.select().from(usersTable)
          .where(eq(usersTable.clerkId, employerProfile.clerkId)).limit(1);
        if (employerUser) {
          await db.insert(notificationsTable).values({
            userId: employerUser.id,
            type: "job_interest",
            title: "New interest in your role",
            message: `${freelancer.name} expressed interest in "${job.title}".`,
            link: `/jobs/${job.id}`,
          });
        }
      }
    } catch (notifyErr) {
      req.log.error({ err: notifyErr, jobId, freelancerId: freelancer.id }, "Failed to enqueue employer notification (interest still recorded)");
    }

    res.status(201).json(interest);
  } catch (err) {
    req.log.error({ err }, "Failed to express interest");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/job-requirements/:id/interests", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const jobId = parseInt(req.params.id);
  if (isNaN(jobId)) { res.status(400).json({ error: "Invalid job ID" }); return; }

  try {
    const [job] = await db.select().from(jobRequirementsTable)
      .where(eq(jobRequirementsTable.id, jobId)).limit(1);
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }

    // Only the owning employer can view the interest list.
    const [employer] = await db.select().from(employerProfilesTable)
      .where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    if (!employer || employer.id !== job.employerId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const rows = await db.select({
      id: jobInterestsTable.id,
      jobRequirementId: jobInterestsTable.jobRequirementId,
      freelancerId: jobInterestsTable.freelancerId,
      message: jobInterestsTable.message,
      createdAt: jobInterestsTable.createdAt,
      freelancerName: freelancerProfilesTable.name,
      freelancerTagline: freelancerProfilesTable.tagline,
    }).from(jobInterestsTable)
      .leftJoin(freelancerProfilesTable, eq(freelancerProfilesTable.id, jobInterestsTable.freelancerId))
      .where(eq(jobInterestsTable.jobRequirementId, jobId))
      .orderBy(desc(jobInterestsTable.createdAt));

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list interests");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/job-requirements/:id/my-interest", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const jobId = parseInt(req.params.id);
  if (isNaN(jobId)) { res.status(400).json({ error: "Invalid job ID" }); return; }

  try {
    const [freelancer] = await db.select().from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    if (!freelancer) { res.json({ expressed: false }); return; }

    const [existing] = await db.select().from(jobInterestsTable)
      .where(and(
        eq(jobInterestsTable.jobRequirementId, jobId),
        eq(jobInterestsTable.freelancerId, freelancer.id),
      )).limit(1);

    res.json({ expressed: !!existing, expressedAt: existing?.createdAt ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to check interest");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

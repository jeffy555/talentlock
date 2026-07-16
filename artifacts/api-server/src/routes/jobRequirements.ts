import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { jobRequirementsTable, employerProfilesTable, usersTable } from "@workspace/db";
import { eq, and, gte, sql, SQL } from "drizzle-orm";
import {
  CreateJobRequirementBody,
  UpdateJobRequirementBody,
  ListJobRequirementsQueryParams,
} from "@workspace/api-zod";
import { getUserSubscription, checkLimit } from "../lib/subscriptionGating";
import { sanitiseText } from "../lib/sanitise";
import { resolveUserByClerkId, canAccessJobRequirement } from "../lib/accessControl";
import { evaluateCruiseModeForNewJob } from "../lib/cruiseModeEvaluator";

const router = Router();

router.get("/job-requirements", async (req, res) => {
  const parsed = ListJobRequirementsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  try {
    const conditions: SQL[] = [];
    if (params.employerId !== undefined) {
      conditions.push(eq(jobRequirementsTable.employerId, params.employerId));
    }
    if (params.status) {
      conditions.push(eq(jobRequirementsTable.status, params.status));
    }
    const results = conditions.length > 0
      ? await db.select({ job: jobRequirementsTable, verificationLevel: employerProfilesTable.verificationLevel })
        .from(jobRequirementsTable)
        .leftJoin(employerProfilesTable, eq(jobRequirementsTable.employerId, employerProfilesTable.id))
        .where(and(...conditions))
      : await db.select({ job: jobRequirementsTable, verificationLevel: employerProfilesTable.verificationLevel })
        .from(jobRequirementsTable)
        .leftJoin(employerProfilesTable, eq(jobRequirementsTable.employerId, employerProfilesTable.id));
    res.json(results.map((row) => mapJob(row.job, row.verificationLevel)));
  } catch (err) {
    req.log.error({ err }, "Failed to list job requirements");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/job-requirements", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateJobRequirementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    if (!employer) { res.status(400).json({ error: "Employer profile not found" }); return; }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "User account not found" }); return; }

    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
      const sub = await getUserSubscription(user.id);
      const monthlyJobs = await tx.select({ id: jobRequirementsTable.id }).from(jobRequirementsTable)
        .where(and(eq(jobRequirementsTable.employerId, employer.id), gte(jobRequirementsTable.createdAt as any, monthStart)));
      const gate = checkLimit(sub.plan, "monthlyJobPosts", monthlyJobs.length);
      if (!gate.allowed) return { gate, job: null };

      const [job] = await tx.insert(jobRequirementsTable)
        .values({
          ...parsed.data as any,
          title: sanitiseText(parsed.data.title),
          description: sanitiseText(parsed.data.description),
          employerId: employer.id,
          status: "open",
        })
        .returning();
      return { gate: null, job };
    });

    if (result.gate) {
      res.status(402).json({ error: result.gate.reason, planNeeded: result.gate.planNeeded, code: "PLAN_LIMIT" });
      return;
    }
    const newJob = result.job!;
    // Fire-and-forget — never awaited, never delays the response
    evaluateCruiseModeForNewJob(db, newJob.id, req.log).catch((err) =>
      req.log.warn({ err, jobId: newJob.id }, "cruise-mode evaluation hook failed"),
    );
    const [employerProfile] = await db.select({ verificationLevel: employerProfilesTable.verificationLevel })
      .from(employerProfilesTable)
      .where(eq(employerProfilesTable.id, newJob.employerId))
      .limit(1);
    res.status(201).json(mapJob(newJob, employerProfile?.verificationLevel ?? "unverified"));
  } catch (err) {
    req.log.error({ err }, "Failed to create job requirement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/job-requirements/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [row] = await db.select({ job: jobRequirementsTable, verificationLevel: employerProfilesTable.verificationLevel })
      .from(jobRequirementsTable)
      .leftJoin(employerProfilesTable, eq(jobRequirementsTable.employerId, employerProfilesTable.id))
      .where(eq(jobRequirementsTable.id, id))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Job requirement not found" }); return; }
    res.json(mapJob(row.job, row.verificationLevel));
  } catch (err) {
    req.log.error({ err }, "Failed to get job requirement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/job-requirements/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpdateJobRequirementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = { ...parsed.data } as Record<string, unknown>;
  if (parsed.data.title !== undefined) data.title = sanitiseText(parsed.data.title);
  if (parsed.data.description !== undefined) data.description = sanitiseText(parsed.data.description);
  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const access = await canAccessJobRequirement(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Job requirement not found" : "Forbidden" });
      return;
    }
    const [updated] = await db.update(jobRequirementsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(jobRequirementsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Job requirement not found" }); return; }
    const [employerProfile] = await db.select({ verificationLevel: employerProfilesTable.verificationLevel })
      .from(employerProfilesTable)
      .where(eq(employerProfilesTable.id, updated.employerId))
      .limit(1);
    res.json(mapJob(updated, employerProfile?.verificationLevel ?? "unverified"));
  } catch (err) {
    req.log.error({ err }, "Failed to update job requirement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/job-requirements/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const access = await canAccessJobRequirement(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Job requirement not found" : "Forbidden" });
      return;
    }
    await db.delete(jobRequirementsTable).where(eq(jobRequirementsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete job requirement");
    res.status(500).json({ error: "Internal server error" });
  }
});

function mapJob(j: typeof jobRequirementsTable.$inferSelect, verificationLevel?: string | null) {
  return {
    ...j,
    budget: j.budget ? parseFloat(j.budget) : null,
    employerVerificationLevel: verificationLevel ?? "unverified",
  };
}

export default router;

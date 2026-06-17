import { Router } from "express";
import { randomUUID } from "crypto";
import { getAuth } from "@clerk/express";
import OpenAI from "openai";
import {
  and,
  count,
  desc,
  eq,
  gte,
  isNull,
  sql,
} from "drizzle-orm";
import { db } from "@workspace/db";
import {
  cruiseModeActivityTable,
  cruiseModeConfigsTable,
  freelancerProfilesTable,
  jobRequirementsTable,
  usersTable,
  type CruiseModeRules,
} from "@workspace/db";
import {
  ListCruiseModeActivityQueryParams,
  UpsertCruiseModeBody,
  ParseCruiseModeRulesBody,
} from "@workspace/api-zod";
import { logTokenUsage } from "../lib/tokenLogger";
import { parsePagination, paginatedResponse } from "../lib/paginationUtils";
import { sanitiseText } from "../lib/sanitise";
import {
  getNextMidnightUTC,
  normaliseParsedRules,
  parseHoursValue,
  PARSE_RULES_SYSTEM_PROMPT,
} from "../lib/cruiseModeUtils";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });

async function resolveFreelancer(clerkId: string) {
  const [profile] = await db
    .select()
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.clerkId, clerkId))
    .limit(1);
  if (!profile) return null;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, profile.userId))
    .limit(1);
  if (!user) return null;
  return { profile, user };
}

function mapConfig(row: typeof cruiseModeConfigsTable.$inferSelect) {
  return {
    ...row,
    hoursUsedToday: parseHoursValue(row.hoursUsedToday),
    dailyLimitHours: parseHoursValue(row.dailyLimitHours),
  };
}

function rulesChanged(a: CruiseModeRules, b: CruiseModeRules): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

router.get("/cruise-mode/stats", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveFreelancer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Freelancer profile required" }); return; }

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const baseWhere = eq(cruiseModeActivityTable.freelancerId, ctx.profile.id);

    const [config] = await db
      .select()
      .from(cruiseModeConfigsTable)
      .where(
        and(
          eq(cruiseModeConfigsTable.freelancerId, ctx.profile.id),
          isNull(cruiseModeConfigsTable.deletedAt),
        ),
      )
      .limit(1);

    const todayWhere = and(baseWhere, gte(cruiseModeActivityTable.createdAt, startOfToday));

    const [evaluatedTodayRow, sentTodayRow, skippedTodayRow, dryRunTodayRow] = await Promise.all([
      db.select({ count: count() }).from(cruiseModeActivityTable).where(todayWhere),
      db.select({ count: count() }).from(cruiseModeActivityTable).where(
        and(todayWhere, eq(cruiseModeActivityTable.decision, "sent")),
      ),
      db.select({ count: count() }).from(cruiseModeActivityTable).where(
        and(
          todayWhere,
          sql`${cruiseModeActivityTable.decision} IN ('skipped', 'dry_run_skipped', 'daily_limit_reached', 'blackout')`,
        ),
      ),
      db.select({ count: count() }).from(cruiseModeActivityTable).where(
        and(
          todayWhere,
          sql`${cruiseModeActivityTable.decision} IN ('dry_run_would_send', 'dry_run_skipped')`,
        ),
      ),
    ]);

    const hoursUsedToday = parseHoursValue(config?.hoursUsedToday);
    const dailyLimitHours = parseHoursValue(config?.dailyLimitHours) || 6;
    const hoursRemainingToday = Math.max(0, dailyLimitHours - hoursUsedToday);

    res.json({
      evaluatedToday: evaluatedTodayRow[0]?.count ?? 0,
      sentToday: sentTodayRow[0]?.count ?? 0,
      skippedToday: skippedTodayRow[0]?.count ?? 0,
      dryRunToday: dryRunTodayRow[0]?.count ?? 0,
      hoursUsedToday,
      dailyLimitHours,
      hoursRemainingToday,
      hoursResetAt: config?.hoursResetAt ?? getNextMidnightUTC(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get cruise mode stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/cruise-mode/activity", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = ListCruiseModeActivityQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const ctx = await resolveFreelancer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Freelancer profile required" }); return; }

    const { page, pageSize, offset } = parsePagination(parsed.data);
    const whereClause = eq(cruiseModeActivityTable.freelancerId, ctx.profile.id);

    const [rows, countResult] = await Promise.all([
      db
        .select({
          activity: cruiseModeActivityTable,
          jobTitle: jobRequirementsTable.title,
        })
        .from(cruiseModeActivityTable)
        .innerJoin(
          jobRequirementsTable,
          eq(cruiseModeActivityTable.jobRequirementId, jobRequirementsTable.id),
        )
        .where(whereClause)
        .orderBy(desc(cruiseModeActivityTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: count() }).from(cruiseModeActivityTable).where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data = rows.map(({ activity, jobTitle }) => ({
      ...activity,
      jobTitle,
    }));

    res.json(paginatedResponse(data, total, page, pageSize));
  } catch (err) {
    req.log.error({ err }, "Failed to list cruise mode activity");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cruise-mode/activity/:id/follow-up", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const activityId = req.params.id;
  try {
    const ctx = await resolveFreelancer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Freelancer profile required" }); return; }

    const [updated] = await db
      .update(cruiseModeActivityTable)
      .set({ freelancerFollowUpSent: true })
      .where(
        and(
          eq(cruiseModeActivityTable.id, activityId),
          eq(cruiseModeActivityTable.freelancerId, ctx.profile.id),
          eq(cruiseModeActivityTable.decision, "sent"),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Activity entry not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to mark cruise mode follow-up");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/cruise-mode/activate", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveFreelancer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Freelancer profile required" }); return; }

    const [existing] = await db
      .select()
      .from(cruiseModeConfigsTable)
      .where(
        and(
          eq(cruiseModeConfigsTable.freelancerId, ctx.profile.id),
          isNull(cruiseModeConfigsTable.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Cruise Mode config not found — save rules first" });
      return;
    }

    const [updated] = await db
      .update(cruiseModeConfigsTable)
      .set({
        isActive: true,
        isDryRun: false,
        activatedAt: new Date(),
        deactivatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(cruiseModeConfigsTable.id, existing.id))
      .returning();

    res.json(mapConfig(updated!));
  } catch (err) {
    req.log.error({ err }, "Failed to activate cruise mode");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/cruise-mode/dry-run", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveFreelancer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Freelancer profile required" }); return; }

    const [existing] = await db
      .select()
      .from(cruiseModeConfigsTable)
      .where(
        and(
          eq(cruiseModeConfigsTable.freelancerId, ctx.profile.id),
          isNull(cruiseModeConfigsTable.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Cruise Mode config not found — save rules first" });
      return;
    }

    const [updated] = await db
      .update(cruiseModeConfigsTable)
      .set({
        isActive: true,
        isDryRun: true,
        activatedAt: new Date(),
        deactivatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(cruiseModeConfigsTable.id, existing.id))
      .returning();

    res.json(mapConfig(updated!));
  } catch (err) {
    req.log.error({ err }, "Failed to enable cruise mode dry run");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/cruise-mode/deactivate", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveFreelancer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Freelancer profile required" }); return; }

    const [updated] = await db
      .update(cruiseModeConfigsTable)
      .set({
        isActive: false,
        deactivatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cruiseModeConfigsTable.freelancerId, ctx.profile.id),
          isNull(cruiseModeConfigsTable.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Cruise Mode config not found" });
      return;
    }
    res.json(mapConfig(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate cruise mode");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cruise-mode/parse-rules", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = ParseCruiseModeRulesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const ctx = await resolveFreelancer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Freelancer profile required" }); return; }

    const rawText = sanitiseText(parsed.data.rawText);
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        { role: "system", content: PARSE_RULES_SYSTEM_PROMPT },
        { role: "user", content: rawText },
      ],
    });
    const responseText = response.choices[0]?.message?.content ?? "";
    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    logTokenUsage(db, ctx.user.id, "cruise_mode_parse", {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    }).catch((err) => req.log.warn({ err }, "cruise mode parse token log failed"));

    const cleaned = responseText.replace(/```json|```/g, "").trim();
    const payload = JSON.parse(cleaned) as { rules?: Partial<CruiseModeRules>; warnings?: string[] };
    const rules = normaliseParsedRules(payload.rules ?? {});
    const warnings = Array.isArray(payload.warnings)
      ? payload.warnings.map((w) => sanitiseText(String(w)))
      : [];

    res.json({ rules, warnings });
  } catch (err) {
    req.log.error({ err }, "Failed to parse cruise mode rules");
    res.status(500).json({ error: "Failed to parse rules" });
  }
});

router.get("/cruise-mode", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveFreelancer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Freelancer profile required" }); return; }

    const [config] = await db
      .select()
      .from(cruiseModeConfigsTable)
      .where(
        and(
          eq(cruiseModeConfigsTable.freelancerId, ctx.profile.id),
          isNull(cruiseModeConfigsTable.deletedAt),
        ),
      )
      .limit(1);

    res.json(config ? mapConfig(config) : null);
  } catch (err) {
    req.log.error({ err }, "Failed to get cruise mode config");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cruise-mode", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpsertCruiseModeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const ctx = await resolveFreelancer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Freelancer profile required" }); return; }

    const rules = normaliseParsedRules(parsed.data.rules as CruiseModeRules);
    const rawRulesText = parsed.data.rawRulesText
      ? sanitiseText(parsed.data.rawRulesText)
      : null;

    const [existing] = await db
      .select()
      .from(cruiseModeConfigsTable)
      .where(
        and(
          eq(cruiseModeConfigsTable.freelancerId, ctx.profile.id),
          isNull(cruiseModeConfigsTable.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      const nextVersion = rulesChanged(existing.rules, rules)
        ? existing.rulesVersion + 1
        : existing.rulesVersion;
      const [updated] = await db
        .update(cruiseModeConfigsTable)
        .set({
          rules: { ...rules, version: nextVersion },
          rulesVersion: nextVersion,
          rawRulesText: rawRulesText ?? existing.rawRulesText,
          updatedAt: new Date(),
        })
        .where(eq(cruiseModeConfigsTable.id, existing.id))
        .returning();
      res.json(mapConfig(updated!));
      return;
    }

    const [created] = await db
      .insert(cruiseModeConfigsTable)
      .values({
        id: randomUUID(),
        freelancerId: ctx.profile.id,
        rules: { ...rules, version: 1 },
        rulesVersion: 1,
        rawRulesText,
        hoursResetAt: getNextMidnightUTC(),
      })
      .returning();

    res.status(201).json(mapConfig(created!));
  } catch (err) {
    req.log.error({ err }, "Failed to upsert cruise mode config");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

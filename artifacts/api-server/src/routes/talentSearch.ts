import { Router } from "express";
import { randomUUID } from "crypto";
import { getAuth } from "@clerk/express";
import OpenAI from "openai";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  employerProfilesTable,
  freelancerProfilesTable,
  talentSearchActivityTable,
  talentSearchConfigsTable,
  usersTable,
  type TalentSearchRules,
} from "@workspace/db";
import {
  ListTalentSearchActivityQueryParams,
  UpsertTalentSearchBody,
  ParseTalentSearchRulesBody,
} from "@workspace/api-zod";
import { logTokenUsage } from "../lib/tokenLogger";
import { parsePagination, paginatedResponse } from "../lib/paginationUtils";
import { sanitiseText } from "../lib/sanitise";
import { getNextMidnightUTC, parseHoursValue } from "../lib/cruiseModeUtils";
import {
  normaliseParsedTalentSearchRules,
  PARSE_TALENT_SEARCH_RULES_SYSTEM_PROMPT,
} from "../lib/talentSearchUtils";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });

async function resolveEmployer(clerkId: string) {
  const [profile] = await db
    .select()
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.clerkId, clerkId))
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

function mapConfig(row: typeof talentSearchConfigsTable.$inferSelect) {
  return {
    ...row,
    hoursUsedToday: parseHoursValue(row.hoursUsedToday),
    dailyLimitHours: parseHoursValue(row.dailyLimitHours),
  };
}

function rulesChanged(a: TalentSearchRules, b: TalentSearchRules): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

router.get("/talent-search/stats", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveEmployer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Employer profile required" }); return; }

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const baseWhere = eq(talentSearchActivityTable.employerId, ctx.profile.id);

    const [config] = await db
      .select()
      .from(talentSearchConfigsTable)
      .where(
        and(
          eq(talentSearchConfigsTable.employerId, ctx.profile.id),
          isNull(talentSearchConfigsTable.deletedAt),
        ),
      )
      .limit(1);

    const todayWhere = and(baseWhere, gte(talentSearchActivityTable.createdAt, startOfToday));

    const [evaluatedTodayRow, sentTodayRow, skippedTodayRow, dryRunTodayRow] = await Promise.all([
      db.select({ count: count() }).from(talentSearchActivityTable).where(todayWhere),
      db.select({ count: count() }).from(talentSearchActivityTable).where(
        and(todayWhere, eq(talentSearchActivityTable.decision, "sent")),
      ),
      db.select({ count: count() }).from(talentSearchActivityTable).where(
        and(
          todayWhere,
          sql`${talentSearchActivityTable.decision} IN ('skipped', 'dry_run_skipped', 'daily_limit_reached', 'daily_freelancer_limit_reached', 'blackout')`,
        ),
      ),
      db.select({ count: count() }).from(talentSearchActivityTable).where(
        and(
          todayWhere,
          sql`${talentSearchActivityTable.decision} IN ('dry_run_would_send', 'dry_run_skipped')`,
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
    req.log.error({ err }, "Failed to get talent search stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/talent-search/activity", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = ListTalentSearchActivityQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const ctx = await resolveEmployer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Employer profile required" }); return; }

    const { page, pageSize, offset } = parsePagination(parsed.data);
    const whereClause = eq(talentSearchActivityTable.employerId, ctx.profile.id);

    const [rows, countResult] = await Promise.all([
      db
        .select({
          activity: talentSearchActivityTable,
          freelancerName: freelancerProfilesTable.name,
        })
        .from(talentSearchActivityTable)
        .innerJoin(
          freelancerProfilesTable,
          eq(talentSearchActivityTable.freelancerId, freelancerProfilesTable.id),
        )
        .where(whereClause)
        .orderBy(desc(talentSearchActivityTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: count() }).from(talentSearchActivityTable).where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;
    const data = rows.map(({ activity, freelancerName }) => ({
      ...activity,
      freelancerName,
    }));

    res.json(paginatedResponse(data, total, page, pageSize));
  } catch (err) {
    req.log.error({ err }, "Failed to list talent search activity");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/talent-search/activity/:id/follow-up", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const activityId = req.params.id;
  try {
    const ctx = await resolveEmployer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Employer profile required" }); return; }

    const [updated] = await db
      .update(talentSearchActivityTable)
      .set({ employerFollowUpSent: true })
      .where(
        and(
          eq(talentSearchActivityTable.id, activityId),
          eq(talentSearchActivityTable.employerId, ctx.profile.id),
          eq(talentSearchActivityTable.decision, "sent"),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Activity entry not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to mark talent search follow-up");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/talent-search/activate", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveEmployer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Employer profile required" }); return; }

    const [existing] = await db
      .select()
      .from(talentSearchConfigsTable)
      .where(
        and(
          eq(talentSearchConfigsTable.employerId, ctx.profile.id),
          isNull(talentSearchConfigsTable.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "TalentSearch config not found — save rules first" });
      return;
    }

    const [updated] = await db
      .update(talentSearchConfigsTable)
      .set({
        isActive: true,
        isDryRun: false,
        activatedAt: new Date(),
        deactivatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(talentSearchConfigsTable.id, existing.id))
      .returning();

    res.json(mapConfig(updated!));
  } catch (err) {
    req.log.error({ err }, "Failed to activate talent search");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/talent-search/dry-run", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveEmployer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Employer profile required" }); return; }

    const [existing] = await db
      .select()
      .from(talentSearchConfigsTable)
      .where(
        and(
          eq(talentSearchConfigsTable.employerId, ctx.profile.id),
          isNull(talentSearchConfigsTable.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "TalentSearch config not found — save rules first" });
      return;
    }

    const [updated] = await db
      .update(talentSearchConfigsTable)
      .set({
        isActive: true,
        isDryRun: true,
        activatedAt: new Date(),
        deactivatedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(talentSearchConfigsTable.id, existing.id))
      .returning();

    res.json(mapConfig(updated!));
  } catch (err) {
    req.log.error({ err }, "Failed to enable talent search dry run");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/talent-search/deactivate", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveEmployer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Employer profile required" }); return; }

    const [updated] = await db
      .update(talentSearchConfigsTable)
      .set({
        isActive: false,
        deactivatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(talentSearchConfigsTable.employerId, ctx.profile.id),
          isNull(talentSearchConfigsTable.deletedAt),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "TalentSearch config not found" });
      return;
    }
    res.json(mapConfig(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate talent search");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/talent-search/parse-rules", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = ParseTalentSearchRulesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const ctx = await resolveEmployer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Employer profile required" }); return; }

    const rawText = sanitiseText(parsed.data.rawText);
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        { role: "system", content: PARSE_TALENT_SEARCH_RULES_SYSTEM_PROMPT },
        { role: "user", content: rawText },
      ],
    });
    const responseText = response.choices[0]?.message?.content ?? "";
    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    logTokenUsage(db, ctx.user.id, "talent_search_parse", {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    }).catch((err) => req.log.warn({ err }, "talent search parse token log failed"));

    const cleaned = responseText.replace(/```json|```/g, "").trim();
    const payload = JSON.parse(cleaned) as {
      rules?: Partial<TalentSearchRules>;
      warnings?: string[];
    };
    const rules = normaliseParsedTalentSearchRules(payload.rules ?? {});
    const warnings = Array.isArray(payload.warnings)
      ? payload.warnings.map((w) => sanitiseText(String(w)))
      : [];

    res.json({ rules, warnings });
  } catch (err) {
    req.log.error({ err }, "Failed to parse talent search rules");
    res.status(500).json({ error: "Failed to parse rules" });
  }
});

router.get("/talent-search", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const ctx = await resolveEmployer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Employer profile required" }); return; }

    const [config] = await db
      .select()
      .from(talentSearchConfigsTable)
      .where(
        and(
          eq(talentSearchConfigsTable.employerId, ctx.profile.id),
          isNull(talentSearchConfigsTable.deletedAt),
        ),
      )
      .limit(1);

    res.json(config ? mapConfig(config) : null);
  } catch (err) {
    req.log.error({ err }, "Failed to get talent search config");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/talent-search", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpsertTalentSearchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const ctx = await resolveEmployer(clerkId);
    if (!ctx) { res.status(403).json({ error: "Employer profile required" }); return; }

    const rules = normaliseParsedTalentSearchRules(parsed.data.rules as TalentSearchRules);
    const rawRulesText = parsed.data.rawRulesText
      ? sanitiseText(parsed.data.rawRulesText)
      : null;

    const [existing] = await db
      .select()
      .from(talentSearchConfigsTable)
      .where(
        and(
          eq(talentSearchConfigsTable.employerId, ctx.profile.id),
          isNull(talentSearchConfigsTable.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      const nextVersion = rulesChanged(existing.rules, rules)
        ? existing.rulesVersion + 1
        : existing.rulesVersion;
      const [updated] = await db
        .update(talentSearchConfigsTable)
        .set({
          rules: { ...rules, version: nextVersion },
          rulesVersion: nextVersion,
          rawRulesText: rawRulesText ?? existing.rawRulesText,
          updatedAt: new Date(),
        })
        .where(eq(talentSearchConfigsTable.id, existing.id))
        .returning();
      res.json(mapConfig(updated!));
      return;
    }

    const [created] = await db
      .insert(talentSearchConfigsTable)
      .values({
        id: randomUUID(),
        employerId: ctx.profile.id,
        rules: { ...rules, version: 1 },
        rulesVersion: 1,
        rawRulesText,
        hoursResetAt: getNextMidnightUTC(),
      })
      .returning();

    res.status(201).json(mapConfig(created!));
  } catch (err) {
    req.log.error({ err }, "Failed to upsert talent search config");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

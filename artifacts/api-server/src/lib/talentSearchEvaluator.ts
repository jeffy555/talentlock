import { randomUUID } from "crypto";
import OpenAI from "openai";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import {
  db,
  documentsTable,
  employerProfilesTable,
  freelancerProfilesTable,
  jobRequirementsTable,
  talentSearchActivityTable,
  talentSearchConfigsTable,
  type CruiseModeRules,
  type FreelancerProfile,
  type MatchReasons,
  type TalentSearchConfig,
} from "@workspace/db";
import { desc } from "drizzle-orm";
import type { Logger } from "pino";
import { createNotification, NotificationType } from "./createNotification";
import { sendAutomatedOutreachMessage } from "./automatedOutreachMessaging";
import { logTokenUsage } from "./tokenLogger";
import { getNextMidnightUTC, isInBlackoutWindow, parseHoursValue } from "./cruiseModeUtils";
import {
  buildTalentSearchEvaluationPrompt,
  normaliseFreelancer,
  talentSearchPreFilter,
  talentSearchPreFilterReason,
  validateTalentSearchResponse,
  type NormalisedFreelancer,
  type TalentSearchEvaluation,
} from "./talentSearchUtils";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });

type DbClient = typeof db;
type Log = Pick<Logger, "info" | "warn" | "error">;

interface ActivityLogParams {
  decision: string;
  score: number;
  matchReasons: MatchReasons;
  proposedMessage: string | null;
  skippedReason: string | null;
  conversationId?: number | null;
  messageId?: number | null;
}

async function logTalentSearchActivity(
  dbClient: DbClient,
  config: TalentSearchConfig,
  freelancerId: number,
  params: ActivityLogParams,
): Promise<string> {
  const activityId = randomUUID();
  await dbClient.insert(talentSearchActivityTable).values({
    id: activityId,
    employerId: config.employerId,
    freelancerId,
    rulesVersion: config.rulesVersion,
    score: params.score,
    decision: params.decision,
    matchReasons: params.matchReasons,
    proposedMessage: params.proposedMessage,
    conversationId: params.conversationId ?? null,
    messageId: params.messageId ?? null,
    sentAt: params.decision === "sent" ? new Date() : null,
    skippedReason: params.skippedReason,
    createdAt: new Date(),
  });
  return activityId;
}

async function hasAnyVerifiedDocument(
  dbClient: DbClient,
  freelancerId: number,
): Promise<boolean> {
  const [row] = await dbClient
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.freelancerId, freelancerId),
        eq(documentsTable.status, "verified"),
      ),
    )
    .limit(1);
  return !!row;
}

async function recentEmployerJobTitles(
  dbClient: DbClient,
  employerId: number,
): Promise<string[]> {
  const rows = await dbClient
    .select({ title: jobRequirementsTable.title })
    .from(jobRequirementsTable)
    .where(eq(jobRequirementsTable.employerId, employerId))
    .orderBy(desc(jobRequirementsTable.createdAt))
    .limit(5);
  return rows.map((r) => r.title);
}

export async function evaluateTalentSearchForUpdatedProfile(
  dbClient: DbClient,
  freelancerId: number,
  log: Log,
): Promise<void> {
  const [freelancerRow] = await dbClient
    .select()
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.id, freelancerId))
    .limit(1);
  if (!freelancerRow || freelancerRow.completenessScore < 60) return;

  const verified = await hasAnyVerifiedDocument(dbClient, freelancerId);
  const freelancer = normaliseFreelancer(freelancerRow, verified);

  const configs = await dbClient
    .select()
    .from(talentSearchConfigsTable)
    .where(
      and(
        eq(talentSearchConfigsTable.isActive, true),
        isNull(talentSearchConfigsTable.deletedAt),
      ),
    );
  if (configs.length === 0) return;

  const candidates = configs.filter((c) => talentSearchPreFilter(c.rules, freelancer));
  log.info(
    { freelancerId, total: configs.length, candidates: candidates.length },
    "talent-search pre-filter",
  );

  const batch = candidates.slice(0, 50);
  await Promise.allSettled(
    batch.map((config) =>
      evaluateSingleEmployer(dbClient, config, freelancerRow, freelancer, log),
    ),
  );
}

/** Scan existing Talent-Vault-visible freelancers when an employer activates TalentSearch. */
export async function backfillTalentSearchForEmployer(
  dbClient: DbClient,
  employerId: number,
  log: Log,
): Promise<void> {
  const [config] = await dbClient
    .select()
    .from(talentSearchConfigsTable)
    .where(
      and(
        eq(talentSearchConfigsTable.employerId, employerId),
        eq(talentSearchConfigsTable.isActive, true),
        isNull(talentSearchConfigsTable.deletedAt),
      ),
    )
    .limit(1);
  if (!config) return;

  const freelancerRows = await dbClient
    .select()
    .from(freelancerProfilesTable)
    .where(gte(freelancerProfilesTable.completenessScore, 60))
    .limit(50);

  log.info(
    { employerId, freelancerCount: freelancerRows.length },
    "talent-search activate backfill",
  );

  await Promise.allSettled(
    freelancerRows.map(async (freelancerRow) => {
      const verified = await hasAnyVerifiedDocument(dbClient, freelancerRow.id);
      const freelancer = normaliseFreelancer(freelancerRow, verified);
      const prefilterReason = talentSearchPreFilterReason(config.rules, freelancer);
      if (prefilterReason) {
        await logTalentSearchActivity(dbClient, config, freelancer.id, {
          decision: "prefilter_rejected",
          score: 0,
          matchReasons: {
            matched: [],
            concerns: [],
            blockers: [prefilterReason],
          },
          proposedMessage: null,
          skippedReason: prefilterReason,
        });
        return;
      }
      await evaluateSingleEmployer(dbClient, config, freelancerRow, freelancer, log);
    }),
  );
}

async function evaluateSingleEmployer(
  dbClient: DbClient,
  config: TalentSearchConfig,
  freelancerRow: FreelancerProfile,
  freelancer: NormalisedFreelancer,
  log: Log,
): Promise<void> {
  try {
    // isInBlackoutWindow only reads `blackoutWindows`; the rule shapes share that field.
    if (isInBlackoutWindow(config.rules as unknown as CruiseModeRules)) {
      await logTalentSearchActivity(dbClient, config, freelancer.id, {
        decision: "blackout",
        score: 0,
        matchReasons: { matched: [], concerns: [], blockers: ["Blackout window active"] },
        proposedMessage: null,
        skippedReason: "Blackout window",
      });
      return;
    }

    // 30-day duplicate check per (employer, freelancer)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [recentlySent] = await dbClient
      .select({ id: talentSearchActivityTable.id })
      .from(talentSearchActivityTable)
      .where(
        and(
          eq(talentSearchActivityTable.employerId, config.employerId),
          eq(talentSearchActivityTable.freelancerId, freelancer.id),
          eq(talentSearchActivityTable.decision, "sent"),
          gte(talentSearchActivityTable.sentAt, thirtyDaysAgo),
        ),
      )
      .limit(1);
    if (recentlySent) {
      await logTalentSearchActivity(dbClient, config, freelancer.id, {
        decision: "duplicate_skipped",
        score: 0,
        matchReasons: {
          matched: [],
          concerns: [],
          blockers: ["Already contacted within the last 30 days"],
        },
        proposedMessage: null,
        skippedReason: "Already contacted within the last 30 days",
      });
      return;
    }

    // Employer daily-hours budget
    const now = new Date();
    let currentConfig = config;
    if (new Date(config.hoursResetAt) < now) {
      await dbClient
        .update(talentSearchConfigsTable)
        .set({ hoursUsedToday: "0", hoursResetAt: getNextMidnightUTC() })
        .where(eq(talentSearchConfigsTable.id, config.id));
      currentConfig = { ...config, hoursUsedToday: "0" };
    }
    const hoursUsed = parseHoursValue(currentConfig.hoursUsedToday);
    const dailyLimit = parseHoursValue(currentConfig.dailyLimitHours);
    if (hoursUsed >= dailyLimit) {
      await logTalentSearchActivity(dbClient, config, freelancer.id, {
        decision: "daily_limit_reached",
        score: 0,
        matchReasons: { matched: [], concerns: [], blockers: ["Daily limit reached"] },
        proposedMessage: null,
        skippedReason: `Daily limit of ${dailyLimit}h reached`,
      });
      return;
    }

    // Freelancer daily notification cap (max 3 across all employers)
    let fl = freelancerRow;
    if (!fl.talentSearchNotificationsResetAt || new Date(fl.talentSearchNotificationsResetAt) < now) {
      await dbClient
        .update(freelancerProfilesTable)
        .set({
          talentSearchNotificationsToday: 0,
          talentSearchNotificationsResetAt: getNextMidnightUTC(),
        })
        .where(eq(freelancerProfilesTable.id, freelancer.id));
      fl = { ...fl, talentSearchNotificationsToday: 0 };
    }
    if (fl.talentSearchNotificationsToday >= 3) {
      await logTalentSearchActivity(dbClient, config, freelancer.id, {
        decision: "daily_freelancer_limit_reached",
        score: 0,
        matchReasons: {
          matched: [],
          concerns: [],
          blockers: ["Freelancer daily cap reached"],
        },
        proposedMessage: null,
        skippedReason: "Freelancer received 3 TalentSearch notifications today",
      });
      return;
    }

    // Load employer
    const [employerProfile] = await dbClient
      .select()
      .from(employerProfilesTable)
      .where(eq(employerProfilesTable.id, config.employerId))
      .limit(1);
    if (!employerProfile) return;

    const recentJobTitles = await recentEmployerJobTitles(dbClient, config.employerId);

    const prompt = buildTalentSearchEvaluationPrompt(
      {
        companyName: employerProfile.companyName,
        sector: employerProfile.industry,
        recentJobTitles,
      },
      config.rules,
      freelancer,
    );

    const evalStart = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    });
    const evalDurationHours = (Date.now() - evalStart) / 3_600_000;
    const responseText = response.choices[0]?.message?.content ?? "";
    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    await dbClient
      .update(talentSearchConfigsTable)
      .set({
        hoursUsedToday: sql`${talentSearchConfigsTable.hoursUsedToday} + ${evalDurationHours}`,
      })
      .where(eq(talentSearchConfigsTable.id, config.id));

    // Tokens are charged to the employer's account
    logTokenUsage(dbClient, employerProfile.userId, "talent_search_evaluation", {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    }).catch((err) => log.warn({ err }, "talent-search token log failed"));

    let evaluation: TalentSearchEvaluation;
    try {
      const cleaned = responseText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (!validateTalentSearchResponse(parsed)) throw new Error("invalid shape");
      evaluation = parsed;
    } catch {
      log.warn(
        { employerId: config.employerId, freelancerId: freelancer.id },
        "talent-search parse failed",
      );
      await logTalentSearchActivity(dbClient, config, freelancer.id, {
        decision: "ai_parse_failed",
        score: 0,
        matchReasons: {
          matched: [],
          concerns: [],
          blockers: ["AI evaluation response could not be parsed"],
        },
        proposedMessage: null,
        skippedReason: "AI evaluation response could not be parsed",
      });
      return;
    }

    const hasBlocker = evaluation.reasons.blockers.length > 0;
    const meetsThreshold = evaluation.score >= (config.rules.matchThreshold ?? 70);
    const willSend = !hasBlocker && meetsThreshold && evaluation.decision === "send";
    const isDryRun = config.isDryRun;

    const decision = isDryRun
      ? willSend
        ? "dry_run_would_send"
        : "dry_run_skipped"
      : willSend
        ? "sent"
        : "skipped";

    let finalDecision = decision;
    let conversationId: number | null = null;
    let messageId: number | null = null;
    let skippedReason =
      decision === "skipped"
        ? `Score ${evaluation.score} below threshold ${config.rules.matchThreshold ?? 70}`
        : null;

    if (decision === "sent") {
      try {
        const dm = await sendAutomatedOutreachMessage(
          dbClient,
          {
            source: "talent_search",
            employerId: config.employerId,
            freelancerId: freelancer.id,
            senderRole: "employer",
            senderUserId: employerProfile.userId,
            senderProfileId: config.employerId,
            recipientUserId: freelancerRow.userId,
            content: evaluation.proposedMessage ?? "",
            notificationMessage: `${employerProfile.companyName} expressed interest in your profile`,
            senderDisplayName: employerProfile.companyName,
          },
          log,
        );
        conversationId = dm.conversationId;
        messageId = dm.messageId;
      } catch (err) {
        log.warn(
          { err, employerId: config.employerId, freelancerId: freelancer.id },
          "talent-search DM delivery failed",
        );
        finalDecision = "dm_failed";
        skippedReason = "Direct message delivery failed";
      }
    }

    const activityId = await logTalentSearchActivity(dbClient, config, freelancer.id, {
      decision: finalDecision,
      score: evaluation.score,
      matchReasons: evaluation.reasons,
      proposedMessage: evaluation.proposedMessage,
      conversationId,
      messageId,
      skippedReason,
    });

    if (finalDecision === "sent") {
      createNotification(dbClient, {
        userId: employerProfile.userId,
        type: NotificationType.TALENT_SEARCH_SENT,
        entityType: "talent_search_activity",
        entityId: activityId,
        message: `Your AI assistant expressed interest in ${freelancerRow.name}'s profile (match score: ${evaluation.score}/100)`,
      }).catch((err) => log.warn({ err }, "talent-search employer notification failed"));

      await dbClient
        .update(freelancerProfilesTable)
        .set({
          talentSearchNotificationsToday: sql`${freelancerProfilesTable.talentSearchNotificationsToday} + 1`,
        })
        .where(eq(freelancerProfilesTable.id, freelancer.id));
    } else if (decision === "dry_run_would_send") {
      createNotification(dbClient, {
        userId: employerProfile.userId,
        type: NotificationType.TALENT_SEARCH_SENT,
        entityType: "talent_search_activity",
        entityId: activityId,
        message: `Dry run: would have reached out to ${freelancerRow.name} (match score: ${evaluation.score}/100)`,
      }).catch((err) => log.warn({ err }, "talent-search dry-run employer notification failed"));
    }
  } catch (err) {
    log.error(
      { err, employerId: config.employerId, freelancerId: freelancer.id },
      "talent-search single evaluation failed",
    );
  }
}

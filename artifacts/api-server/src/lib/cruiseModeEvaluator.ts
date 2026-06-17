import { randomUUID } from "crypto";
import OpenAI from "openai";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import {
  db,
  cruiseModeActivityTable,
  cruiseModeConfigsTable,
  freelancerProfilesTable,
  jobRequirementsTable,
  jobInterestsTable,
  type CruiseModeConfig,
  type JobRequirement,
  type MatchReasons,
} from "@workspace/db";
import type { Logger } from "pino";
import {
  createNotification,
  NotificationType,
  userIdFromEmployerProfileId,
} from "./createNotification";
import { sendNotificationEmailAsync } from "./emailService";
import { sanitiseText } from "./sanitise";
import { logTokenUsage } from "./tokenLogger";
import {
  buildEvaluationPrompt,
  getNextMidnightUTC,
  isInBlackoutWindow,
  normaliseJob,
  parseHoursValue,
  preFilter,
  validateEvaluationResponse,
  type EvaluationResult,
  type NormalisedJob,
} from "./cruiseModeUtils";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });

type DbClient = typeof db;
type Log = Pick<Logger, "info" | "warn" | "error">;

interface ActivityLogParams {
  decision: string;
  score: number;
  matchReasons: MatchReasons;
  proposedMessage: string | null;
  skippedReason: string | null;
}

async function logActivity(
  dbClient: DbClient,
  config: CruiseModeConfig,
  jobRequirementId: number,
  params: ActivityLogParams,
): Promise<string> {
  const activityId = randomUUID();
  await dbClient.insert(cruiseModeActivityTable).values({
    id: activityId,
    freelancerId: config.freelancerId,
    jobRequirementId,
    rulesVersion: config.rulesVersion,
    score: params.score,
    decision: params.decision,
    matchReasons: params.matchReasons,
    proposedMessage: params.proposedMessage,
    sentAt: params.decision === "sent" ? new Date() : null,
    skippedReason: params.skippedReason,
    createdAt: new Date(),
  });
  return activityId;
}

async function recordJobInterestFromCruiseMode(
  dbClient: DbClient,
  job: JobRequirement,
  freelancerId: number,
  proposedMessage: string | null,
  log: Log,
): Promise<void> {
  const message = proposedMessage
    ? sanitiseText(proposedMessage).trim().slice(0, 1000)
    : null;
  try {
    await dbClient.insert(jobInterestsTable).values({
      jobRequirementId: job.id,
      freelancerId,
      message: message || null,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") return;
    log.warn({ err, jobId: job.id, freelancerId }, "cruise mode job interest insert failed");
  }
}

async function hasDailyLimitActivityToday(
  dbClient: DbClient,
  freelancerId: number,
): Promise<boolean> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const [row] = await dbClient
    .select({ id: cruiseModeActivityTable.id })
    .from(cruiseModeActivityTable)
    .where(
      and(
        eq(cruiseModeActivityTable.freelancerId, freelancerId),
        eq(cruiseModeActivityTable.decision, "daily_limit_reached"),
        gte(cruiseModeActivityTable.createdAt, startOfToday),
      ),
    )
    .limit(1);
  return !!row;
}

// TODO: Migrate to BullMQ when Redis is available — see spec/cruisemode/plan.md Q1
export async function evaluateCruiseModeForNewJob(
  dbClient: DbClient,
  jobId: number,
  log: Log,
): Promise<void> {
  const [job] = await dbClient
    .select()
    .from(jobRequirementsTable)
    .where(eq(jobRequirementsTable.id, jobId))
    .limit(1);
  if (!job) return;

  const configs = await dbClient
    .select()
    .from(cruiseModeConfigsTable)
    .where(
      and(
        eq(cruiseModeConfigsTable.isActive, true),
        isNull(cruiseModeConfigsTable.deletedAt),
      ),
    );
  if (configs.length === 0) return;

  const normalJob = normaliseJob(job);
  const candidates = configs.filter((c) => preFilter(c.rules, normalJob));
  log.info(
    { jobId, total: configs.length, candidates: candidates.length },
    "cruise mode pre-filter",
  );

  const batch = candidates.slice(0, 50);
  await Promise.allSettled(
    batch.map((config) => evaluateSingleCandidate(dbClient, config, job, normalJob, log)),
  );
}

async function evaluateSingleCandidate(
  dbClient: DbClient,
  config: CruiseModeConfig,
  job: JobRequirement,
  normalJob: NormalisedJob,
  log: Log,
): Promise<void> {
  try {
    if (isInBlackoutWindow(config.rules)) {
      await logActivity(dbClient, config, job.id, {
        decision: "blackout",
        score: 0,
        matchReasons: { matched: [], concerns: [], blockers: ["Blackout window active"] },
        proposedMessage: null,
        skippedReason: "Blackout window",
      });
      return;
    }

    const [alreadySent] = await dbClient
      .select({ id: cruiseModeActivityTable.id })
      .from(cruiseModeActivityTable)
      .where(
        and(
          eq(cruiseModeActivityTable.freelancerId, config.freelancerId),
          eq(cruiseModeActivityTable.jobRequirementId, job.id),
          eq(cruiseModeActivityTable.decision, "sent"),
        ),
      )
      .limit(1);
    if (alreadySent) return;

    const now = new Date();
    let currentConfig = config;
    if (new Date(config.hoursResetAt) < now) {
      await dbClient
        .update(cruiseModeConfigsTable)
        .set({ hoursUsedToday: "0", hoursResetAt: getNextMidnightUTC() })
        .where(eq(cruiseModeConfigsTable.id, config.id));
      currentConfig = { ...config, hoursUsedToday: "0" };
    }

    const hoursUsed = parseHoursValue(currentConfig.hoursUsedToday);
    const dailyLimit = parseHoursValue(currentConfig.dailyLimitHours);
    if (hoursUsed >= dailyLimit) {
      const alreadyNotifiedToday = await hasDailyLimitActivityToday(
        dbClient,
        config.freelancerId,
      );
      await logActivity(dbClient, config, job.id, {
        decision: "daily_limit_reached",
        score: 0,
        matchReasons: { matched: [], concerns: [], blockers: ["Daily limit reached"] },
        proposedMessage: null,
        skippedReason: `Daily limit of ${dailyLimit}h reached`,
      });

      if (!alreadyNotifiedToday) {
        const [freelancerProfile] = await dbClient
          .select()
          .from(freelancerProfilesTable)
          .where(eq(freelancerProfilesTable.id, config.freelancerId))
          .limit(1);
        if (freelancerProfile) {
          createNotification(dbClient, {
            userId: freelancerProfile.userId,
            type: NotificationType.CRUISE_MODE_DAILY_LIMIT,
            entityType: "cruise_mode_activity",
            entityId: config.id,
            message: `Your daily Cruise Mode budget of ${dailyLimit}h is used up. New jobs will be skipped until midnight UTC.`,
          }).catch((err) => log.warn({ err }, "cruise mode daily limit notification failed"));
        }
      }
      return;
    }

    const [freelancerProfile] = await dbClient
      .select()
      .from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, config.freelancerId))
      .limit(1);
    if (!freelancerProfile) return;

    const prompt = buildEvaluationPrompt(
      {
        name: freelancerProfile.name,
        fieldOfWork: freelancerProfile.fieldOfWork,
        skills: freelancerProfile.skills,
        bio: freelancerProfile.bio,
        hourlyRate: freelancerProfile.hourlyRate ? parseFloat(freelancerProfile.hourlyRate) : null,
        dailyRate: freelancerProfile.dailyRate ? parseFloat(freelancerProfile.dailyRate) : null,
      },
      config.rules,
      normalJob,
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
      .update(cruiseModeConfigsTable)
      .set({
        hoursUsedToday: sql`${cruiseModeConfigsTable.hoursUsedToday} + ${evalDurationHours}`,
      })
      .where(eq(cruiseModeConfigsTable.id, config.id));

    logTokenUsage(dbClient, freelancerProfile.userId, "cruise_mode_evaluation", {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    }).catch((err) => log.warn({ err }, "cruise mode token log failed"));

    let evaluation: EvaluationResult;
    try {
      const cleaned = responseText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (!validateEvaluationResponse(parsed)) throw new Error("invalid shape");
      evaluation = parsed;
    } catch {
      log.warn({ freelancerId: config.freelancerId, jobId: job.id }, "cruise mode parse failed");
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

    const activityId = await logActivity(dbClient, config, job.id, {
      decision,
      score: evaluation.score,
      matchReasons: evaluation.reasons,
      proposedMessage: evaluation.proposedMessage,
      skippedReason:
        decision === "skipped"
          ? `Score ${evaluation.score} below threshold ${config.rules.matchThreshold ?? 70}`
          : null,
    });

    if (decision === "sent") {
      await recordJobInterestFromCruiseMode(
        dbClient,
        job,
        config.freelancerId,
        evaluation.proposedMessage,
        log,
      );

      const employerUserId = await userIdFromEmployerProfileId(job.employerId);

      if (employerUserId) {
        createNotification(dbClient, {
          userId: employerUserId,
          type: NotificationType.CRUISE_MODE_INTEREST,
          entityType: "cruise_mode_activity",
          entityId: activityId,
          message: `${freelancerProfile.name} expressed interest in "${job.title}"`,
        }).catch((err) => log.warn({ err }, "cruise mode employer notification failed"));
      }

      createNotification(dbClient, {
        userId: freelancerProfile.userId,
        type: NotificationType.CRUISE_MODE_SENT,
        entityType: "cruise_mode_activity",
        entityId: activityId,
        message: `Your AI assistant expressed interest in "${job.title}" (match score: ${evaluation.score}/100)`,
      }).catch((err) => log.warn({ err }, "cruise mode freelancer notification failed"));

      sendNotificationEmailAsync(
        dbClient,
        freelancerProfile.userId,
        `Cruise Mode expressed interest in "${job.title}"`,
        `Your TalentLock Cruise Mode sent an interest message for the job "${job.title}". Match score: ${evaluation.score}/100. View your activity feed to see what was sent.`,
        "/cruise-mode",
        log,
      );
    }
  } catch (err) {
    log.error({ err, freelancerId: config.freelancerId, jobId: job.id }, "cruise mode single evaluation failed");
  }
}

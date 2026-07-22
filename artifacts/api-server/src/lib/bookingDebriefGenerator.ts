import OpenAI from "openai";
import { and, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import { z } from "zod/v4";

import {
  db as defaultDb,
  bookingsTable,
  freelancerProfilesTable,
  employerProfilesTable,
  jobRequirementsTable,
  milestonesTable,
  agreementsTable,
  reviewsTable,
  conversations,
  messages,
  type BookingDebriefContent,
} from "@workspace/db";

import { sanitiseText } from "./sanitise";
import { logTokenUsage } from "./tokenLogger";
import { checkTokenQuota } from "./subscriptionGating";
import {
  createNotification,
  NotificationType,
  userIdFromEmployerProfileId,
  userIdFromFreelancerProfileId,
} from "./createNotification";
import { sendNotificationEmailAsync } from "./emailService";

type DB = typeof defaultDb;
type Log = Pick<Logger, "info" | "warn" | "error">;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY_TALENTLOCK;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_TALENTLOCK is not set");
  }
  return new OpenAI({ apiKey });
}

export const DEBRIEF_DISCLAIMER =
  "AI-generated summary based on platform data only. Not a performance review, legal record, or substitute for a formal evaluation.";

export const DEBRIEF_REGEN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MESSAGE_LIMIT = 10;
const MESSAGE_TRUNCATE = 500;

const rehireVerdictSchema = z.enum(["strong_rehire", "rehire_with_caveats", "one_off"]);

const employerDebriefSchema = z.object({
  engagementSnapshot: z.object({
    freelancerName: z.string(),
    field: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    rate: z.number(),
    rateType: z.string(),
    milestonesCompleted: z.number(),
    milestonesTotal: z.number(),
  }),
  outcomeSummary: z.string(),
  performanceSignals: z.array(z.string()),
  rehireRecommendation: z.object({
    verdict: rehireVerdictSchema,
    reasons: z.array(z.string()),
  }),
  internalNotesTemplate: z.string(),
});

const freelancerDebriefSchema = z.object({
  engagementSnapshot: z.object({
    companyName: z.string(),
    jobTitle: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    rate: z.number(),
    rateType: z.string(),
  }),
  whatYouDelivered: z.string(),
  strengthsDemonstrated: z.array(z.string()),
  growthAreas: z.array(z.string()),
  profileSuggestions: z.array(z.string()),
});

const bookingDebriefContentSchema = z.object({
  employer: employerDebriefSchema,
  freelancer: freelancerDebriefSchema,
  generatedAt: z.string(),
});

export function isWithinDebriefRegenCooldown(regeneratedAt: Date | null, nowMs = Date.now()): boolean {
  if (!regeneratedAt) return false;
  return nowMs - regeneratedAt.getTime() < DEBRIEF_REGEN_COOLDOWN_MS;
}

export function validateDebriefResponse(raw: string): BookingDebriefContent {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  const result = bookingDebriefContentSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid debrief response: ${result.error.message}`);
  }
  return result.data;
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(d: Date | null | undefined): string {
  return d ? d.toISOString() : "";
}

async function loadBookingMessages(dbClient: DB, bookingId: number) {
  const [conv] = await dbClient
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.type, "human_direct"), eq(conversations.bookingId, bookingId)))
    .limit(1);
  if (!conv) return [];

  const rows = await dbClient
    .select({
      content: messages.content,
      role: messages.role,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(desc(messages.createdAt))
    .limit(MESSAGE_LIMIT);

  return rows.reverse().map((m) => ({
    sender: m.role,
    content: sanitiseText(m.content).slice(0, MESSAGE_TRUNCATE),
    at: m.createdAt?.toISOString() ?? "",
  }));
}

export function buildBookingDebriefPrompt(context: {
  booking: typeof bookingsTable.$inferSelect;
  freelancer: typeof freelancerProfilesTable.$inferSelect;
  employer: typeof employerProfilesTable.$inferSelect;
  job: typeof jobRequirementsTable.$inferSelect | null;
  milestones: (typeof milestonesTable.$inferSelect)[];
  agreement: {
    status: string;
    employerSignedAt: Date | null;
    freelancerSignedAt: Date | null;
  } | null;
  review: typeof reviewsTable.$inferSelect | null;
  messages: { sender: string; content: string; at: string }[];
}): string {
  const rate = toNumber(context.booking.rate ?? context.booking.proposedRate);
  const rateType = context.job?.rateType ?? context.booking.paymentType ?? "hourly";
  const milestonesSummary = context.milestones.map((m) => ({
    title: m.title,
    status: m.status,
    amount: m.amount ? toNumber(m.amount) : null,
    dueDate: isoDate(m.dueDate),
  }));

  const agreementMeta = context.agreement
    ? {
        status: context.agreement.status,
        employerSignedAt: isoDate(context.agreement.employerSignedAt),
        freelancerSignedAt: isoDate(context.agreement.freelancerSignedAt),
        fullySigned: context.agreement.status === "fully_signed",
      }
    : null;

  const reviewMeta = context.review
    ? { rating: context.review.rating, hasComment: Boolean(context.review.comment) }
    : null;

  return `You are TalentLock's post-engagement debrief assistant. Generate a structured JSON retrospective for BOTH the employer and freelancer based ONLY on the data below. Return ONLY valid JSON matching this shape (no markdown fences):

{
  "employer": {
    "engagementSnapshot": { "freelancerName", "field", "startDate", "endDate", "rate", "rateType", "milestonesCompleted", "milestonesTotal" },
    "outcomeSummary": "string paragraph",
    "performanceSignals": ["string", ...],
    "rehireRecommendation": { "verdict": "strong_rehire"|"rehire_with_caveats"|"one_off", "reasons": ["string", ...] },
    "internalNotesTemplate": "copyable paragraph for employer internal records"
  },
  "freelancer": {
    "engagementSnapshot": { "companyName", "jobTitle", "startDate", "endDate", "rate", "rateType" },
    "whatYouDelivered": "string paragraph",
    "strengthsDemonstrated": ["string", ...],
    "growthAreas": ["string", ...],
    "profileSuggestions": ["string", ...]
  },
  "generatedAt": "ISO timestamp"
}

Rules:
- Be factual and grounded in the data provided. Do not invent deliverables not supported by milestones or job description.
- growthAreas must be constructive and private — not harsh or legalistic.
- internalNotesTemplate is for the employer only — professional tone, no sensitive speculation.
- profileSuggestions: 2-3 actionable tips for the freelancer profile.
- performanceSignals: 2-4 bullets including review status if provided.
- rehireRecommendation.reasons: 2-3 specific bullets.

BOOKING:
${JSON.stringify({
  status: context.booking.status,
  startDate: isoDate(context.booking.startDate),
  endDate: isoDate(context.booking.endDate),
  rate,
  rateType,
  paymentType: context.booking.paymentType,
  negotiationStatus: context.booking.negotiationStatus,
  message: context.booking.message,
})}

FREELANCER PROFILE:
${JSON.stringify({
  name: context.freelancer.name,
  field: context.freelancer.fieldOfWork,
  skills: context.freelancer.skills,
  averageRating: context.freelancer.averageRating,
  reviewCount: context.freelancer.reviewCount,
})}

EMPLOYER:
${JSON.stringify({ companyName: context.employer.companyName })}

JOB REQUIREMENT:
${JSON.stringify(
  context.job
    ? {
        title: context.job.title,
        description: context.job.description,
        skills: context.job.requiredSkills,
        professionCategory: context.job.professionCategory,
        rateType: context.job.rateType,
      }
    : null,
)}

MILESTONES:
${JSON.stringify(milestonesSummary)}

AGREEMENT METADATA (no contract text):
${JSON.stringify(agreementMeta)}

REVIEW:
${JSON.stringify(reviewMeta)}

MESSAGES (truncated, optional):
${JSON.stringify(context.messages)}`;
}

export async function generateBookingDebrief(
  dbClient: DB,
  bookingId: number,
  log: Log,
): Promise<void> {
  const [booking] = await dbClient
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId))
    .limit(1);
  if (!booking || booking.status !== "completed") return;

  const [freelancer] = await dbClient
    .select()
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.id, booking.freelancerId))
    .limit(1);
  const [employer] = await dbClient
    .select()
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.id, booking.employerId))
    .limit(1);
  if (!freelancer || !employer) {
    log.warn({ bookingId }, "booking debrief skipped — missing profiles");
    return;
  }

  const employerUserId = await userIdFromEmployerProfileId(booking.employerId);
  if (!employerUserId) {
    log.warn({ bookingId }, "booking debrief skipped — no employer user");
    return;
  }

  const quota = await checkTokenQuota(dbClient, employerUserId);
  if (!quota.allowed) {
    log.warn({ bookingId, employerUserId }, "booking debrief skipped — token limit");
    return;
  }

  const [job] = booking.jobRequirementId
    ? await dbClient
        .select()
        .from(jobRequirementsTable)
        .where(eq(jobRequirementsTable.id, booking.jobRequirementId))
        .limit(1)
    : [null];

  const milestoneRows = await dbClient
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.bookingId, bookingId));

  const [agreement] = await dbClient
    .select({
      status: agreementsTable.status,
      employerSignedAt: agreementsTable.employerSignedAt,
      freelancerSignedAt: agreementsTable.freelancerSignedAt,
    })
    .from(agreementsTable)
    .where(eq(agreementsTable.bookingId, bookingId))
    .limit(1);

  const [review] = await dbClient
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.bookingId, bookingId))
    .limit(1);

  const messageRows = await loadBookingMessages(dbClient, bookingId);

  const prompt = buildBookingDebriefPrompt({
    booking,
    freelancer,
    employer,
    job: job ?? null,
    milestones: milestoneRows,
    agreement: agreement ?? null,
    review: review ?? null,
    messages: messageRows,
  });

  const response = await getOpenAIClient().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const usage = response.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  logTokenUsage(dbClient, employerUserId, "booking_debrief", {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
  }).catch((err) => log.warn({ err, bookingId }, "booking debrief token log failed"));

  const raw = response.choices[0]?.message?.content ?? "";
  let debrief: BookingDebriefContent;
  try {
    debrief = validateDebriefResponse(raw);
  } catch (err) {
    log.warn({ err, bookingId }, "booking debrief parse failed");
    return;
  }

  if (!debrief.generatedAt) {
    debrief.generatedAt = new Date().toISOString();
  }

  const [fresh] = await dbClient
    .select({ status: bookingsTable.status })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId))
    .limit(1);
  if (fresh?.status !== "completed") return;

  await dbClient
    .update(bookingsTable)
    .set({
      debriefContent: debrief,
      debriefGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bookingsTable.id, bookingId));

  const freelancerUserId = await userIdFromFreelancerProfileId(booking.freelancerId);

  const employerMsg = `Your post-engagement debrief for ${freelancer.name} is ready.`;
  const freelancerMsg = `Your post-engagement debrief for ${employer.companyName} is ready.`;

  if (employerUserId) {
    createNotification(dbClient, {
      userId: employerUserId,
      type: NotificationType.BOOKING_DEBRIEF_READY,
      entityType: "booking",
      entityId: bookingId,
      message: employerMsg,
    }).catch((err) => log.warn({ err, bookingId }, "employer debrief notification failed"));
    sendNotificationEmailAsync(
      dbClient,
      employerUserId,
      `Post-engagement debrief ready — ${freelancer.name}`,
      employerMsg,
      `/bookings/${bookingId}`,
      log,
    );
  }

  if (freelancerUserId) {
    createNotification(dbClient, {
      userId: freelancerUserId,
      type: NotificationType.BOOKING_DEBRIEF_READY,
      entityType: "booking",
      entityId: bookingId,
      message: freelancerMsg,
    }).catch((err) => log.warn({ err, bookingId }, "freelancer debrief notification failed"));
    sendNotificationEmailAsync(
      dbClient,
      freelancerUserId,
      `Post-engagement debrief ready — ${employer.companyName}`,
      freelancerMsg,
      `/bookings/${bookingId}`,
      log,
    );
  }

  log.info({ bookingId }, "booking debrief generated");
}

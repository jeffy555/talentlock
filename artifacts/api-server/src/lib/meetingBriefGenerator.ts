import OpenAI from "openai";
import { and, desc, eq } from "drizzle-orm";
import {
  db as defaultDb,
  meetingsTable,
  freelancerProfilesTable,
  jobRequirementsTable,
  bookingsTable,
  documentsTable,
  type MeetingBrief,
} from "@workspace/db";
import type { Logger } from "pino";
import {
  getMarketMedian,
  getEmployerHistoricalAvg,
  type RatePaymentType,
} from "./rateSuggestionUtils";
import { buildRateDisplay, currencySymbol } from "./countryData";
import { logTokenUsage } from "./tokenLogger";
import {
  createNotification,
  NotificationType,
  userIdFromEmployerProfileId,
} from "./createNotification";
import { sendNotificationEmailAsync } from "./emailService";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });
  }
  return openaiClient;
}

type DB = typeof defaultDb;
type Log = Pick<Logger, "info" | "warn" | "error">;
type FreelancerProfile = typeof freelancerProfilesTable.$inferSelect;
type JobRequirement = typeof jobRequirementsTable.$inferSelect;
type Meeting = typeof meetingsTable.$inferSelect;

// documentType maps to a human-readable credential label. Covers both the
// current document types (government_id, professional_credential) and the
// education-vertical types so the brief stays accurate as the taxonomy grows.
const DOCUMENT_LABELS: Record<string, string> = {
  government_id: "Identity Verified",
  professional_credential: "Professional Credential",
  identity: "Identity Verified",
  degree_certificate: "Degree Certificate",
  teaching_licence: "Teaching Licence Verified",
  dbs_check: "DBS Checked",
  transcripts: "Transcripts",
  professional_licence: "Professional Licence",
};

// Generic interview questions used when no job requirement is linked to the
// meeting (plan.md Q3) — kept role-agnostic and working-style focused.
const GENERIC_QUESTIONS: string[] = [
  "Walk me through a recent project you're proud of — what was your specific role and impact?",
  "How do you typically structure the first two weeks of a new engagement?",
  "How do you prefer to communicate and report progress while working with a client?",
  "Tell me about a time a project's scope changed mid-way — how did you handle it?",
  "How do you approach handover and documentation at the end of a contract?",
];

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Rough percentile of a rate vs the market median for its field. */
function calculatePercentile(rate: number, median: number): number {
  if (!median || median <= 0) return 50;
  if (rate <= median * 0.8) return 25;
  if (rate <= median * 0.95) return 40;
  if (rate <= median) return 50;
  if (rate <= median * 1.1) return 67;
  if (rate <= median * 1.25) return 80;
  return 90;
}

/**
 * Resolve the job requirement linked to a meeting. `meetings` has no direct FK,
 * so fall back to the most recent booking between the two parties. Returns null
 * when no job requirement can be found — the brief is still generated (partial).
 */
async function resolveJobRequirement(
  dbClient: DB,
  meeting: Pick<Meeting, "employerId" | "freelancerId">,
): Promise<JobRequirement | null> {
  const [booking] = await dbClient
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.employerId, meeting.employerId),
        eq(bookingsTable.freelancerId, meeting.freelancerId),
      ),
    )
    .orderBy(desc(bookingsTable.createdAt))
    .limit(1);

  if (booking?.jobRequirementId) {
    const [job] = await dbClient
      .select()
      .from(jobRequirementsTable)
      .where(eq(jobRequirementsTable.id, booking.jobRequirementId))
      .limit(1);
    return job ?? null;
  }

  return null;
}

function formatBriefRate(
  amount: number,
  rateType: RatePaymentType,
  currencyCode: string,
): string {
  const paymentType = rateType === "daily" ? "daily" : "hourly";
  return buildRateDisplay({
    rate: String(amount),
    paymentType,
    currencyCode,
  });
}

interface PromptContext {
  freelancer: FreelancerProfile;
  jobRequirement: JobRequirement | null;
  meeting: Meeting;
  rate: number;
  rateType: RatePaymentType;
  currencyCode: string;
  marketMedian: number;
  employerAvg: number;
  jobBudget: number | null;
  verifiedCredentials: string[];
}

export function buildMeetingBriefPrompt(ctx: PromptContext): string {
  const f = ctx.freelancer;
  const job = ctx.jobRequirement;
  const scheduled = ctx.meeting.scheduledAt
    ? new Date(ctx.meeting.scheduledAt).toISOString().slice(0, 10)
    : "TBD";
  const rateLabel = formatBriefRate(ctx.rate, ctx.rateType, ctx.currencyCode);
  const medianLabel = formatBriefRate(ctx.marketMedian, ctx.rateType, ctx.currencyCode);
  const employerAvgLabel = formatBriefRate(ctx.employerAvg, ctx.rateType, ctx.currencyCode);
  const budgetLabel =
    ctx.jobBudget != null
      ? `${currencySymbol(ctx.currencyCode)}${ctx.jobBudget}`
      : "not specified";

  return `You are an AI assistant for a professional hiring marketplace, generating a pre-meeting brief for an employer.

EMPLOYER MEETING CONTEXT:
Meeting with: ${f.name}
Meeting date: ${scheduled}
Job role:     ${job?.title ?? "Discovery meeting (no specific role)"}

FREELANCER PROFILE:
Name:              ${f.name}
Field:             ${f.fieldOfWork}
Profession type:   ${f.educationProfessionType ?? "not specified"}
Skills:            ${(f.skills ?? []).join(", ") || "not specified"}
Teaching subjects: ${(f.teachingSubjects ?? []).join(", ") || "N/A"}
Experience:        ${f.yearsExperience} years
Experience bio:    ${f.bio?.slice(0, 400) ?? "not provided"}
Rate:              ${rateLabel}
Completeness:      ${f.completenessScore}/100
Average rating:    ${toNumber(f.averageRating)} stars (${f.reviewCount} reviews)
Verified:          ${ctx.verifiedCredentials.join(", ") || "no verified documents"}

JOB REQUIREMENT (if linked):
Title:       ${job?.title ?? "N/A"}
Description: ${job?.description?.slice(0, 500) ?? "N/A"}
Skills:      ${(job?.requiredSkills ?? []).join(", ") || "N/A"}
Budget:      ${budgetLabel}
Min experience: ${job?.minExperience ?? "not specified"}

MARKET RATE CONTEXT (all amounts in ${ctx.currencyCode}):
Market median for ${f.fieldOfWork}: ${medianLabel}
Employer historical avg for this field: ${employerAvgLabel}
Freelancer's proposed rate: ${rateLabel}

Generate a pre-meeting brief. Return ONLY a JSON object — no preamble, no markdown fences:

{
  "whyTheyMatch": ["<specific reason 1 — reference actual skills/rate/availability>", "<reason 2>", "<reason 3>"],
  "suggestedQuestions": ["<question 1>", "<question 2>", "<question 3>", "<question 4>", "<question 5>", "<question 6 — probe a specific skill on the job but light in their profile (if any)>", "<question 7 — working style>", "<question 8 — handover/end-of-contract>"],
  "rateAssessment": "<1 sentence: is their rate competitive, within budget, negotiable?>",
  "withinBudget": <true|false — is rate within job budget?>,
  "watchPoints": ["<specific concern 1 — factual, not speculative>", "<concern 2>"]
}

Rules:
- whyTheyMatch: exactly 3 items. Reference actual data (skills, rate, availability). Not generic.
- suggestedQuestions: 5–8 items. At least 1 must probe a specific gap or skill mentioned in the job but not prominent in the profile.
- watchPoints: may be empty array [] if no genuine concerns exist. Do NOT fabricate concerns.
- rateAssessment: one sentence, factual, no fluff.
- All fields required. Return valid JSON only.`;
}

interface AiResult {
  whyTheyMatch: string[];
  suggestedQuestions: string[];
  rateAssessment: string;
  withinBudget: boolean;
  watchPoints: string[];
}

/**
 * Fire-and-forget meeting brief generation. Never throws — logs and returns.
 * Only runs when the meeting is still `confirmed` at execution time.
 */
export async function generateMeetingBrief(
  dbClient: DB,
  meetingId: number,
  log: Log,
): Promise<void> {
  try {
    // Re-fetch and re-check status — guards against a cancel that raced the trigger.
    const [meeting] = await dbClient
      .select()
      .from(meetingsTable)
      .where(eq(meetingsTable.id, meetingId))
      .limit(1);
    if (!meeting || meeting.status !== "confirmed") return;

    const [freelancer, jobRequirement, verifiedDocs] = await Promise.all([
      dbClient
        .select()
        .from(freelancerProfilesTable)
        .where(eq(freelancerProfilesTable.id, meeting.freelancerId))
        .limit(1)
        .then((r) => r[0]),
      resolveJobRequirement(dbClient, meeting),
      dbClient
        .select()
        .from(documentsTable)
        .where(
          and(
            eq(documentsTable.freelancerId, meeting.freelancerId),
            eq(documentsTable.status, "verified"),
          ),
        ),
    ]);

    if (!freelancer) return;

    const rateType: RatePaymentType =
      freelancer.paymentPreference === "daily" ? "daily" : "hourly";
    const currencyCode = freelancer.currencyCode ?? "USD";
    const rate = toNumber(
      rateType === "daily" ? freelancer.dailyRate : freelancer.hourlyRate,
    );

    const [marketMedianRaw, employerAvgRaw] = await Promise.all([
      getMarketMedian(dbClient, freelancer.fieldOfWork, rateType, currencyCode),
      getEmployerHistoricalAvg(dbClient, meeting.employerId, freelancer.fieldOfWork),
    ]);
    const marketMedian = marketMedianRaw ?? 0;
    const employerAvg = employerAvgRaw ?? 0;

    const jobBudget = jobRequirement?.budget != null ? toNumber(jobRequirement.budget) : null;
    const verifiedCredentials = verifiedDocs.map(
      (d) => DOCUMENT_LABELS[d.documentType] ?? d.documentType,
    );

    const candidateSnapshot: MeetingBrief["candidateSnapshot"] = {
      name: freelancer.name,
      field: freelancer.fieldOfWork,
      experience: `${freelancer.yearsExperience} years`,
      rate,
      rateType,
      completenessScore: freelancer.completenessScore,
      averageRating: toNumber(freelancer.averageRating),
      reviewCount: freelancer.reviewCount ?? 0,
      verifiedCredentials,
    };
    const platformPercentile = calculatePercentile(rate, marketMedian);
    const employerUserId = await userIdFromEmployerProfileId(meeting.employerId);

    // Persist the brief and notify the employer — shared by the full and partial paths.
    const persistAndNotify = async (content: MeetingBrief): Promise<void> => {
      await dbClient
        .update(meetingsTable)
        .set({ briefContent: content, briefGeneratedAt: new Date() })
        .where(eq(meetingsTable.id, meetingId));
      if (employerUserId) {
        const message = `Your AI meeting brief for ${freelancer.name} is ready — candidate summary, suggested questions, and rate context.`;
        createNotification(dbClient, {
          userId: employerUserId,
          type: NotificationType.MEETING_BRIEF_READY,
          entityType: "meeting",
          entityId: meetingId,
          message,
        }).catch((err) => log.warn({ err, meetingId }, "meeting brief notification failed"));
        sendNotificationEmailAsync(
          dbClient,
          employerUserId,
          `Your meeting brief is ready — ${freelancer.name}`,
          message,
          `/meetings/${meetingId}`,
          log,
        );
      }
    };

    // Partial brief when no job requirement is linked (plan.md Q3): skip the AI
    // call and return a data-only brief with fixed placeholders.
    if (!jobRequirement) {
      const rateLabel = formatBriefRate(rate, rateType, currencyCode);
      const medianLabel = formatBriefRate(marketMedian, rateType, currencyCode);
      const assessment =
        marketMedian > 0
          ? `Their rate of ${rateLabel} is ${rate <= marketMedian ? "at or below" : "above"} the ${medianLabel} market median for ${freelancer.fieldOfWork}.`
          : `Market rate data is limited for ${freelancer.fieldOfWork} in ${currencyCode}.`;
      await persistAndNotify({
        candidateSnapshot,
        whyTheyMatch: ["No job requirement linked to this meeting"],
        suggestedQuestions: [...GENERIC_QUESTIONS],
        rateContext: {
          proposedRate: rate,
          jobBudgetMin: null,
          jobBudgetMax: null,
          marketMedian,
          platformPercentile,
          employerHistoricalAvg: employerAvg,
          assessment,
          withinBudget: true,
        },
        watchPoints: [],
        generatedAt: new Date().toISOString(),
      });
      log.info({ meetingId }, "meeting brief generated (partial — no job requirement)");
      return;
    }

    const prompt = buildMeetingBriefPrompt({
      freelancer,
      jobRequirement,
      meeting,
      rate,
      rateType,
      currencyCode,
      marketMedian,
      employerAvg,
      jobBudget,
      verifiedCredentials,
    });

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = response.choices[0]?.message?.content ?? "";
    const usage = response.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    // Charge tokens to the EMPLOYER's user account — fire-and-forget.
    if (employerUserId) {
      logTokenUsage(dbClient, employerUserId, "meeting_brief", {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      }).catch((err) => log.warn({ err, meetingId }, "meeting brief token log failed"));
    }

    let aiResult: AiResult;
    try {
      const cleaned = responseText.replace(/```json|```/g, "").trim();
      aiResult = JSON.parse(cleaned) as AiResult;
    } catch {
      log.warn({ meetingId }, "meeting brief AI response parse failed");
      return;
    }

    // Deterministic budget check overrides the model — data is authoritative.
    const withinBudget = jobBudget == null ? true : rate <= jobBudget;

    await persistAndNotify({
      candidateSnapshot,
      whyTheyMatch: Array.isArray(aiResult.whyTheyMatch) ? aiResult.whyTheyMatch.slice(0, 3) : [],
      suggestedQuestions: Array.isArray(aiResult.suggestedQuestions)
        ? aiResult.suggestedQuestions.slice(0, 10)
        : [],
      rateContext: {
        proposedRate: rate,
        jobBudgetMin: null,
        jobBudgetMax: jobBudget,
        marketMedian,
        platformPercentile,
        employerHistoricalAvg: employerAvg,
        assessment: typeof aiResult.rateAssessment === "string" ? aiResult.rateAssessment : "",
        withinBudget,
      },
      watchPoints: Array.isArray(aiResult.watchPoints) ? aiResult.watchPoints : [],
      generatedAt: new Date().toISOString(),
    });

    log.info({ meetingId }, "meeting brief generated");
  } catch (err) {
    log.error({ err, meetingId }, "meeting brief generation failed");
  }
}

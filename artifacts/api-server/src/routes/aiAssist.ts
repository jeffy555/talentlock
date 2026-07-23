import { Router } from "express";
import { getAuth } from "@clerk/express";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  bookingsTable,
  freelancerProfilesTable,
  jobRequirementsTable,
  employerProfilesTable,
} from "@workspace/db";
import { PostAiJobDescriptionBody, PostAiProposalBody, PostAiRateSuggestionBody } from "@workspace/api-zod";
import { checkTokenQuota, getUserSubscription } from "../lib/subscriptionGating";
import { logTokenUsage } from "../lib/tokenLogger";
import {
  getMarketMedian,
  getEmployerHistoricalAvg,
  type RatePaymentType,
} from "../lib/rateSuggestionUtils";
import { buildRateDisplay } from "../lib/countryData";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });

const GENERATE_SYSTEM_PROMPT = `You are a professional job post writer for a freelance platform.
The employer has described a role in plain language.
Write a complete, well-structured job post based on their description.

Structure the output as:
- A clear, specific job title (1 line)
- Project overview (2-3 sentences)
- Key responsibilities (4-6 bullet points)
- Required skills and experience (4-6 bullet points)
- Engagement details (type, duration, rate if mentioned, remote/on-site)

Write in a professional but approachable tone.
Do not add information the employer did not provide — work only with what is given.
Return the job post as plain text with clear section headings.
Do not use markdown formatting — no asterisks, no hashes.`;

const IMPROVE_SYSTEM_PROMPT = `You are a professional job post editor for a freelance platform.
Rewrite the following job post to improve its clarity, structure, and completeness.

Rules:
- Keep all factual details from the original (skills, rate, timeline, etc.)
- Improve vague language — replace "good communication skills" with specific examples
- Add structure if missing — use clear sections for overview, responsibilities, requirements
- Do not add information that was not in the original
- Return as plain text with clear section headings
- Do not use markdown formatting — no asterisks, no hashes`;

const CHECK_SYSTEM_PROMPT = `You are a job post quality reviewer for a freelance platform.
Evaluate the following job post against this rubric. For each item,
determine if it is present and adequately described.

Rubric items (10 pts each unless noted):
1. Role title / job title (10 pts)
2. Project or product overview (15 pts)
3. Key responsibilities — at least 3 listed (15 pts)
4. Required skills or experience (15 pts)
5. Experience level stated (junior/mid/senior/lead) (10 pts)
6. Engagement type stated (contract/part-time/full-time) (10 pts)
7. Duration or timeline mentioned (10 pts)
8. Budget or rate range indicated (10 pts)
9. Remote/on-site/hybrid preference (5 pts)

Return ONLY a JSON object — no preamble, no markdown:
{
  "score": <total score 0-100>,
  "missing": ["plain English description of what is missing", ...]
}

Only include an item in "missing" if it is absent or completely vague.
If the post scores 100, return "missing": [].`;

type ProposalTone = "professional" | "friendly" | "concise";

function buildProposalSystemPrompt(params: {
  tone: ProposalTone;
  firstName: string;
  fieldOfWork: string;
  skills: string;
  bio: string;
  rateLabel: string;
  jobContext: string | null;
  employerMessage: string | null;
}): string {
  const wordTarget = params.tone === "concise" ? "80–100 words maximum" : "150–200 words";
  const punchy = params.tone === "concise" ? " Be direct and punchy." : "";

  let prompt = `You are writing a professional proposal response for a freelancer on a hiring platform.
Write a concise, confident proposal (${wordTarget}) that:
1. Briefly introduces the freelancer and their most relevant skills
2. Explains why they are a strong fit for this specific role
3. Mentions their availability and rate (${params.rateLabel})
4. Ends with a clear next step

Freelancer profile:
- Name: ${params.firstName}
- Field: ${params.fieldOfWork}
- Skills: ${params.skills}
- Bio: ${params.bio?.slice(0, 300) ?? ""}

${params.jobContext ? `Job/role context:\n${params.jobContext}` : "No specific job description provided — write a general but personalised proposal."}
${params.employerMessage ? `Employer's message: "${params.employerMessage}"` : ""}

Write the proposal in first person. Do not use markdown. Return only the proposal text.${punchy}`;

  if (params.tone === "friendly") {
    prompt += "\nWrite in a warm, approachable, conversational tone.";
  }

  return prompt;
}

function paymentTypeForRate(paymentType: RatePaymentType): "hourly" | "daily" | "fixed" {
  if (paymentType === "daily") return "daily";
  if (paymentType === "fixed") return "fixed";
  return "hourly";
}

function formatRateAmountLine(
  amount: number,
  paymentType: RatePaymentType,
  currencyCode: string,
): string {
  return buildRateDisplay({
    rate: String(amount),
    paymentType: paymentTypeForRate(paymentType),
    currencyCode,
  });
}

function buildRateSuggestionSystemPrompt(params: {
  freelancerRate: number;
  field: string;
  marketMedian: number | null;
  historicalAvg: number | null;
  proposedRate: number | null;
  roleContext: string;
  paymentType: RatePaymentType;
  currencyCode: string;
}): string {
  const {
    freelancerRate,
    field,
    marketMedian,
    historicalAvg,
    proposedRate,
    roleContext,
    paymentType,
    currencyCode,
  } = params;
  return `You are a rate advisor for a freelance platform.
Given the following data, suggest an appropriate rate in ${currencyCode} and explain why.

Freelancer's listed rate: ${formatRateAmountLine(freelancerRate, paymentType, currencyCode)}
${marketMedian ? `Market median for ${field} (${currencyCode} freelancers): ${formatRateAmountLine(marketMedian, paymentType, currencyCode)}` : `Market median: insufficient data for ${field} in ${currencyCode}`}
${historicalAvg ? `Employer's historical average for ${field}: ${formatRateAmountLine(historicalAvg, paymentType, currencyCode)}` : ""}
${proposedRate ? `Employer's proposed rate: ${formatRateAmountLine(proposedRate, paymentType, currencyCode)}` : ""}
${roleContext}

Return ONLY a JSON object — no preamble, no markdown:
{
  "suggestedRate": <integer>,
  "explanation": "<2-3 sentences plain English>",
  "confidence": "high" | "medium" | "low"
}

Confidence is "high" when market data is available, "medium" when only partial data,
"low" when minimal context.`;
}

function resolveFreelancerRate(
  freelancer: typeof freelancerProfilesTable.$inferSelect,
  paymentType: RatePaymentType,
): number {
  if (paymentType === "daily") {
    const n = Number(freelancer.dailyRate);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  if (paymentType === "hourly") {
    const n = Number(freelancer.hourlyRate);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  const hourly = Number(freelancer.hourlyRate);
  if (Number.isFinite(hourly) && hourly > 0) return Math.round(hourly);
  const daily = Number(freelancer.dailyRate);
  return Number.isFinite(daily) && daily > 0 ? Math.round(daily) : 0;
}

const router = Router();

router.post("/ai/job-description", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PostAiJobDescriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { mode, content, jobTitle } = parsed.data;

  if (content.trim().length < 10) {
    res.status(400).json({
      error: "Content is too short to process",
      code: "CONTENT_TOO_SHORT",
    });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (user.role !== "employer") {
      res.status(403).json({ error: "Only employers can use the job description assistant" });
      return;
    }

    const quota = await checkTokenQuota(db, user.id);
    if (!quota.allowed) {
      res.status(402).json({
        error: "Monthly AI token limit reached",
        code: "TOKEN_LIMIT",
        planNeeded: quota.planNeeded,
      });
      return;
    }

    const contextPrefix = jobTitle?.trim()
      ? `Job title context: ${jobTitle.trim()}\n\n`
      : "";

    let systemPrompt: string;
    let maxTokens: number;

    switch (mode) {
      case "generate":
        systemPrompt = GENERATE_SYSTEM_PROMPT;
        maxTokens = 1500;
        break;
      case "improve":
        systemPrompt = IMPROVE_SYSTEM_PROMPT;
        maxTokens = 1500;
        break;
      case "check":
        systemPrompt = CHECK_SYSTEM_PROMPT;
        maxTokens = 600;
        break;
      default:
        res.status(400).json({ error: "Invalid mode" });
        return;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextPrefix + content },
      ],
      max_completion_tokens: maxTokens,
    });

    if (completion.usage) {
      await logTokenUsage(db, user.id, "job_description_assistant", completion.usage);
    } else {
      req.log.warn({ userId: user.id, feature: "job_description_assistant" }, "token usage unavailable on response");
    }

    const rawContent = completion.choices[0]?.message?.content ?? "";

    if (mode === "check") {
      try {
        const checkResult = JSON.parse(rawContent);
        const score = typeof checkResult.score === "number"
          ? Math.max(0, Math.min(100, Math.round(checkResult.score)))
          : 0;
        const missing = Array.isArray(checkResult.missing)
          ? checkResult.missing.filter((item: unknown) => typeof item === "string")
          : ["Could not analyse job post — please try again."];
        res.status(200).json({ mode: "check", score, missing });
      } catch {
        req.log.warn({ mode }, "check mode JSON parse failed");
        res.status(200).json({
          mode: "check",
          score: 0,
          missing: ["Could not analyse job post — please try again."],
        });
      }
      return;
    }

    res.status(200).json({ mode, output: rawContent.trim() });
  } catch (err) {
    req.log.error({ err }, "Failed to process job description assistant request");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/ai/proposal", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PostAiProposalBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const bookingId = parseInt(parsed.data.bookingId, 10);
  if (Number.isNaN(bookingId)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (user.role !== "freelancer") {
      res.status(403).json({ error: "Only freelancers can use the proposal generator" });
      return;
    }

    const [freelancer] = await db.select().from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    if (!freelancer) {
      res.status(403).json({ error: "Freelancer profile not found" });
      return;
    }

    const [booking] = await db.select().from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.freelancerId !== freelancer.id) {
      res.status(403).json({ error: "This booking does not belong to you" });
      return;
    }
    if (booking.status !== "pending") {
      res.status(400).json({ error: "Proposal can only be generated for pending bookings", code: "BOOKING_NOT_PENDING" });
      return;
    }

    // TODO: Add freelancer token quota when billing is connected
    let jobContext: string | null = null;
    if (booking.jobRequirementId) {
      const [job] = await db.select().from(jobRequirementsTable)
        .where(eq(jobRequirementsTable.id, booking.jobRequirementId)).limit(1);
      if (job) {
        jobContext = `Title: ${job.title}\nDescription: ${job.description}`;
      }
    }

    const firstName = freelancer.name.split(/\s+/)[0] ?? freelancer.name;
    const skills = (freelancer.skills ?? []).join(", ");
    const proposedRate = booking.proposedRate != null ? Number(booking.proposedRate) : null;
    const profileRate = booking.paymentType === "daily"
      ? (freelancer.dailyRate != null ? Number(freelancer.dailyRate) : null)
      : (freelancer.hourlyRate != null ? Number(freelancer.hourlyRate) : null);
    const rate = proposedRate ?? profileRate;
    const rateUnit = booking.paymentType === "daily" ? "day" : booking.paymentType === "fixed" ? "fixed" : "hr";
    const rateLabel = rate != null ? `$${rate}/${rateUnit}` : "as listed on my profile";

    const systemPrompt = buildProposalSystemPrompt({
      tone: parsed.data.tone,
      firstName,
      fieldOfWork: freelancer.fieldOfWork,
      skills,
      bio: freelancer.bio ?? "",
      rateLabel,
      jobContext,
      employerMessage: booking.message,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Write the proposal now." },
      ],
      max_completion_tokens: parsed.data.tone === "concise" ? 400 : 600,
    });

    if (completion.usage) {
      await logTokenUsage(db, user.id, "ai_proposal", completion.usage);
    } else {
      req.log.warn({ userId: user.id, feature: "ai_proposal" }, "token usage unavailable on response");
    }

    const proposal = (completion.choices[0]?.message?.content ?? "").trim();
    if (!proposal) {
      res.status(200).json({
        proposal: "",
        error: "Could not generate proposal. Please try again.",
      });
      return;
    }

    res.status(200).json({ proposal });
  } catch (err) {
    req.log.error({ err, bookingId }, "Failed to generate AI proposal");
    res.status(200).json({
      proposal: "",
      error: "Could not generate proposal. Please try again.",
    });
  }
});

router.post("/ai/rate-suggestion", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PostAiRateSuggestionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const {
    freelancerId,
    proposedRate: proposedRateInput,
    jobRequirementId,
    bookingId,
    paymentType: paymentTypeInput,
    includeAi,
  } = parsed.data;

  const paymentType: RatePaymentType = paymentTypeInput ?? "hourly";

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (user.role !== "employer") {
      res.status(403).json({ error: "Only employers can use rate suggestions" });
      return;
    }

    const [employer] = await db.select().from(employerProfilesTable)
      .where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    if (!employer) {
      res.status(403).json({ error: "Employer profile not found" });
      return;
    }

    const [freelancer] = await db.select().from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, freelancerId)).limit(1);
    if (!freelancer) { res.status(404).json({ error: "Freelancer not found" }); return; }

    if (bookingId != null) {
      const [booking] = await db.select().from(bookingsTable)
        .where(eq(bookingsTable.id, bookingId)).limit(1);
      if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
      if (booking.employerId !== employer.id) {
        res.status(403).json({ error: "This booking does not belong to you" });
        return;
      }
    }

    const sub = await getUserSubscription(user.id);
    const planId = sub.plan.id;
    const canUseAi = planId === "employer_growth" || planId === "employer_enterprise";
    const wantsAi = includeAi === true;

    if (wantsAi && canUseAi) {
      const quota = await checkTokenQuota(db, user.id);
      if (!quota.allowed) {
        res.status(402).json({
          error: "Monthly AI token limit reached",
          code: "TOKEN_LIMIT",
          planNeeded: quota.planNeeded,
        });
        return;
      }
    }

    const freelancerRate = resolveFreelancerRate(freelancer, paymentType);
    const field = freelancer.fieldOfWork;
    const currencyCode = freelancer.currencyCode ?? "USD";
    const marketMedian = await getMarketMedian(db, field, paymentType, currencyCode);
    const yourHistoricalAvg = await getEmployerHistoricalAvg(db, employer.id, field);

    const proposedRate = proposedRateInput != null && Number.isFinite(proposedRateInput)
      ? Math.round(proposedRateInput)
      : null;

    let jobContext: string | null = null;
    if (jobRequirementId != null) {
      const [job] = await db.select().from(jobRequirementsTable)
        .where(eq(jobRequirementsTable.id, jobRequirementId)).limit(1);
      if (!job) { res.status(404).json({ error: "Job requirement not found" }); return; }
      jobContext = `Role: ${job.title}. ${job.description?.slice(0, 300) ?? ""}`;
    }

    const roleContext = jobContext ?? `Field: ${field}`;

    const staticResponse = {
      freelancerRate,
      marketMedian,
      yourHistoricalAvg,
      suggestedRate: proposedRate ?? freelancerRate,
      explanation: "",
      confidence: "low" as const,
      isAiSuggestion: false,
    };

    if (!wantsAi || !canUseAi) {
      res.status(200).json(staticResponse);
      return;
    }

    const systemPrompt = buildRateSuggestionSystemPrompt({
      freelancerRate,
      field,
      marketMedian,
      historicalAvg: yourHistoricalAvg,
      proposedRate,
      roleContext,
      paymentType,
      currencyCode,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Suggest an appropriate rate based on the data provided." },
      ],
      max_completion_tokens: 400,
    });

    if (completion.usage) {
      await logTokenUsage(db, user.id, "rate_suggestion", completion.usage);
    } else {
      req.log.warn({ userId: user.id, feature: "rate_suggestion" }, "token usage unavailable on response");
    }

    const rawContent = completion.choices[0]?.message?.content ?? "";

    try {
      const aiResult = JSON.parse(rawContent) as {
        suggestedRate?: unknown;
        explanation?: unknown;
        confidence?: unknown;
      };
      const suggestedRate = typeof aiResult.suggestedRate === "number"
        ? Math.round(aiResult.suggestedRate)
        : freelancerRate;
      const explanation = typeof aiResult.explanation === "string"
        ? aiResult.explanation
        : "Could not generate suggestion.";
      const confidenceRaw = aiResult.confidence;
      const confidence = confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
        ? confidenceRaw
        : "low";

      res.status(200).json({
        freelancerRate,
        marketMedian,
        yourHistoricalAvg,
        suggestedRate,
        explanation,
        confidence,
        isAiSuggestion: true,
      });
    } catch {
      req.log.warn({ freelancerId }, "rate suggestion JSON parse failed");
      res.status(200).json({
        freelancerRate,
        marketMedian,
        yourHistoricalAvg,
        suggestedRate: freelancerRate,
        explanation: "Could not generate suggestion.",
        confidence: "low" as const,
        isAiSuggestion: true,
      });
    }
  } catch (err) {
    req.log.error({ err, freelancerId }, "Failed to process rate suggestion request");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

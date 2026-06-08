// Job columns: budget (numeric), startDate (timestamptz), requiredSkills (text[])
// Freelancer join key: freelancer_profiles.id

import { Router } from "express";
import { getAuth } from "@clerk/express";
import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  freelancerProfilesTable,
  jobRequirementsTable,
} from "@workspace/db";
import { PostAiMatchExplanationBody } from "@workspace/api-zod";
import { checkTokenQuota } from "../lib/subscriptionGating";
import { logTokenUsage } from "../lib/tokenLogger";
import { normaliseSkills } from "../lib/skillsUtils";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });

const MATCH_EXPLANATION_SYSTEM_PROMPT = `You are a talent matching assistant for a freelance platform.
You will be given a freelancer profile and optionally a job requirement.
Analyse the fit and return ONLY a JSON object — no preamble, no markdown fences.

JSON structure:
{
  "skillsAlignment": {
    "matched": ["skill1", "skill2"],
    "gaps": ["skill3"]
  },
  "rateFit": {
    "freelancerRate": <number or null>,
    "budgetMin": <number or null>,
    "budgetMax": <number or null>,
    "assessment": "within_budget" | "above_budget" | "below_budget" | "unknown"
  },
  "availabilityFit": {
    "freelancerAvailableFrom": "<ISO date string or null>",
    "requiredStartDate": "<ISO date string or null>",
    "assessment": "available" | "unavailable" | "unknown"
  },
  "overallSummary": "<2-3 sentence plain English summary of match quality>"
}

Rules:
- If no job requirement is provided, set rateFit.assessment to "unknown" and availabilityFit.assessment to "unknown"
- skillsAlignment.gaps should only list skills explicitly required by the job that the freelancer does not have
- If no required skills are specified, set gaps to an empty array
- overallSummary must always be present and non-empty
- Do NOT include markdown, code fences, or any text outside the JSON object`;

const router = Router();

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseConversationId(raw: string): number | undefined {
  if (raw === "direct-view") return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

router.post("/ai/match-explanation", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PostAiMatchExplanationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { freelancerId, jobRequirementId, conversationId: conversationIdRaw } = parsed.data;
  const conversationId = parseConversationId(conversationIdRaw);

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (user.role !== "employer") {
      res.status(403).json({ error: "Only employers can request match explanations" });
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

    const [freelancer] = await db
      .select()
      .from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, freelancerId))
      .limit(1);
    if (!freelancer) { res.status(404).json({ error: "Freelancer not found" }); return; }

    let job: typeof jobRequirementsTable.$inferSelect | null = null;
    if (jobRequirementId != null) {
      const [found] = await db
        .select()
        .from(jobRequirementsTable)
        .where(eq(jobRequirementsTable.id, jobRequirementId))
        .limit(1);
      if (!found) { res.status(404).json({ error: "Job requirement not found" }); return; }
      job = found;
    }

    const freelancerSkills = normaliseSkills(freelancer.skills);
    const jobSkills = job ? normaliseSkills(job.requiredSkills) : [];
    const freelancerRate =
      freelancer.paymentPreference === "hourly"
        ? parseNumeric(freelancer.hourlyRate)
        : parseNumeric(freelancer.dailyRate);
    const budget = job ? parseNumeric(job.budget) : null;

    const userMessage = [
      "Freelancer profile:",
      `Name: ${freelancer.name}`,
      `Skills: ${freelancerSkills.length ? freelancerSkills.join(", ") : "None specified"}`,
      `Rate: ${freelancerRate != null ? `$${freelancerRate}/${freelancer.paymentPreference === "hourly" ? "hr" : "day"}` : "Not specified"}`,
      `Available: ${freelancer.isAvailable ? "Yes" : "No"}`,
      `Available from: ${freelancer.availableFrom?.toISOString() ?? "Not specified"}`,
      job ? "" : null,
      job ? "Job requirement:" : null,
      job ? `Title: ${job.title}` : null,
      job ? `Required skills: ${jobSkills.length ? jobSkills.join(", ") : "None specified"}` : null,
      job ? `Budget: ${budget != null ? `$${budget} (${job.paymentType})` : "Not specified"}` : null,
      job ? `Required start date: ${job.startDate.toISOString()}` : null,
    ].filter((line): line is string => line != null).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: MATCH_EXPLANATION_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_completion_tokens: 600,
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";

    if (completion.usage) {
      await logTokenUsage(db, user.id, "ai_match_explanation", completion.usage, conversationId);
    } else {
      req.log.warn({ userId: user.id, feature: "ai_match_explanation" }, "token usage unavailable on response");
    }

    let explanation: Record<string, unknown>;
    try {
      explanation = JSON.parse(rawContent);
      if (
        !explanation.skillsAlignment ||
        !explanation.availabilityFit ||
        typeof explanation.overallSummary !== "string"
      ) {
        throw new Error("Invalid explanation shape");
      }
    } catch {
      req.log.warn({ freelancerId, conversationId: conversationIdRaw }, "match explanation JSON parse failed");
      res.status(200).json({ parseError: true, rawContent });
      return;
    }

    const rateFitFromAi = explanation.rateFit as Record<string, unknown> | undefined;
    const hasJobBudget = job != null && budget != null;

    if (!job) {
      res.status(200).json({
        skillsAlignment: explanation.skillsAlignment,
        rateFit: null,
        availabilityFit: explanation.availabilityFit,
        overallSummary: explanation.overallSummary,
      });
      return;
    }

    res.status(200).json({
      skillsAlignment: explanation.skillsAlignment,
      rateFit: hasJobBudget
        ? {
            freelancerRate: rateFitFromAi?.freelancerRate ?? freelancerRate,
            budgetMin: budget,
            budgetMax: budget,
            assessment: rateFitFromAi?.assessment ?? "unknown",
          }
        : null,
      availabilityFit: explanation.availabilityFit,
      overallSummary: explanation.overallSummary,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate match explanation");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

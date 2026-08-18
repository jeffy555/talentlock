import OpenAI from "openai";
import { logTokenUsage } from "./tokenLogger";
import type { db as DbType } from "@workspace/db";

type DbClient = Pick<typeof DbType, "insert">;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });

/**
 * AI-1: summarise internal interview notes for the next interviewer.
 * Returns summary text + usage for token charging.
 */
export async function generateInterviewHandoffSummary(params: {
  feedbackText: string;
  candidateName: string;
  meetingTitle: string;
  dbClient: DbClient;
  employerUserId: number;
}): Promise<{ summary: string }> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content:
          "You summarise confidential hiring interview notes for the NEXT interviewer. " +
          "Be concise (3–6 short bullets or a short paragraph). Never address the candidate. " +
          "Never suggest sharing this with the candidate. Focus on strengths, concerns, and topics to probe.",
      },
      {
        role: "user",
        content: [
          `Meeting: ${params.meetingTitle}`,
          `Candidate: ${params.candidateName}`,
          "",
          "Internal notes:",
          params.feedbackText,
        ].join("\n"),
      },
    ],
  });

  const summary = (completion.choices[0]?.message?.content ?? "").trim();
  if (!summary) {
    throw new Error("Empty handoff summary from model");
  }

  if (completion.usage) {
    await logTokenUsage(params.dbClient, params.employerUserId, "interview_handoff_summary", {
      prompt_tokens: completion.usage.prompt_tokens ?? 0,
      completion_tokens: completion.usage.completion_tokens ?? 0,
      total_tokens: completion.usage.total_tokens ?? 0,
    });
  }

  return { summary: summary.slice(0, 4000) };
}

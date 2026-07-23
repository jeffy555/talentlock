import { tokenUsage } from "@workspace/db";
import type { db } from "@workspace/db";

export type TokenFeature =
  | "ai_match"
  | "ai_match_explanation"
  | "agreement_generation"
  | "contract_redlining"
  | "job_description_assistant"
  | "ai_proposal"
  | "document_verification"
  | "rate_suggestion"
  | "contract_health_score"
  | "agreement_summary"
  | "agreement_upload_summary"
  | "agreement_upload_enrich"
  | "cruise_mode_parse"
  | "cruise_mode_evaluation"
  | "talent_search_parse"
  | "talent_search_evaluation"
  | "meeting_brief"
  | "booking_debrief"
  | "employer_doc_review";

export const TOKEN_FEATURES: TokenFeature[] = [
  "ai_match",
  "ai_match_explanation",
  "agreement_generation",
  "contract_redlining",
  "contract_health_score",
  "agreement_summary",
  "agreement_upload_summary",
  "agreement_upload_enrich",
  "job_description_assistant",
  "ai_proposal",
  "document_verification",
  "rate_suggestion",
  "cruise_mode_parse",
  "cruise_mode_evaluation",
  "talent_search_parse",
  "talent_search_evaluation",
  "meeting_brief",
  "booking_debrief",
  "employer_doc_review",
];

const VALID_TOKEN_FEATURES = TOKEN_FEATURES;

export interface TokenUsageInput {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

type DbClient = Pick<typeof db, "insert">;

export async function logTokenUsage(
  dbOrTx: DbClient,
  userId: number,
  feature: TokenFeature,
  usage: TokenUsageInput,
  conversationId?: number,
): Promise<void> {
  if (!VALID_TOKEN_FEATURES.includes(feature)) {
    throw new Error(`Invalid token usage feature: ${feature}`);
  }

  await dbOrTx.insert(tokenUsage).values({
    userId,
    feature,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    conversationId: conversationId ?? null,
  });
}

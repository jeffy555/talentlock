import type { TokenUsageBreakdown } from "@workspace/api-client-react";

export const TOKEN_FEATURE_LABELS: Record<keyof TokenUsageBreakdown, string> = {
  ai_match: "AI Match",
  ai_match_explanation: "Match Explanation",
  agreement_generation: "Agreement Generation",
  contract_redlining: "Contract Redlining",
  job_description_assistant: "Job Description Assistant",
  ai_proposal: "AI Proposal",
  document_verification: "Document Verification",
  rate_suggestion: "Rate Suggestion",
  contract_health_score: "Contract Health Score",
  agreement_summary: "Agreement Summary",
  cruise_mode_parse: "Cruise Mode Parse",
  cruise_mode_evaluation: "Cruise Mode Evaluation",
  talent_search_parse: "TalentSearch Parse",
  talent_search_evaluation: "TalentSearch Evaluation",
};

export interface TokenBreakdownEntry {
  key: keyof TokenUsageBreakdown;
  label: string;
  tokens: number;
}

export function nonZeroBreakdownEntries(
  breakdown: TokenUsageBreakdown,
): TokenBreakdownEntry[] {
  return (Object.entries(breakdown) as [keyof TokenUsageBreakdown, number][])
    .filter(([, tokens]) => tokens > 0)
    .map(([key, tokens]) => ({
      key,
      label: TOKEN_FEATURE_LABELS[key],
      tokens,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

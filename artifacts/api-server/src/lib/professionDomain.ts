/** Platform profession verticals. Must match freelancer_profiles + job_requirements. */
export const PROFESSION_CATEGORIES = [
  "technology",
  "education",
  "healthcare",
  "legal_finance",
] as const;

export type ProfessionCategory = (typeof PROFESSION_CATEGORIES)[number];

export function normalizeProfessionCategory(
  value: string | null | undefined,
): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "technology";
}

/** Hard lock: a freelancer only sees / matches jobs in their onboarded vertical. */
export function isSameProfessionDomain(
  freelancerCategory: string | null | undefined,
  jobCategory: string | null | undefined,
): boolean {
  return (
    normalizeProfessionCategory(freelancerCategory) ===
    normalizeProfessionCategory(jobCategory)
  );
}

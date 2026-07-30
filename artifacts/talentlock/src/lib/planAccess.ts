/**
 * Temporary testing flag — keep in sync with
 * `artifacts/api-server/src/lib/plans.ts` (`PREMIUM_FEATURES_FREE`).
 * Set both to false before paid launch.
 */
export const PREMIUM_FEATURES_FREE =
  import.meta.env.VITE_PREMIUM_FEATURES_FREE !== "false";

/** Growth-tier employer features (AI rate suggest, redline, brief questions, debrief sections, etc.). */
export function hasEmployerGrowthFeatures(planId: string | null | undefined): boolean {
  if (PREMIUM_FEATURES_FREE) return true;
  return planId === "employer_growth" || planId === "employer_enterprise";
}

/** Enterprise-tier employer features (team accounts, custom clauses, team analytics). */
export function hasEmployerEnterpriseFeatures(planId: string | null | undefined): boolean {
  if (PREMIUM_FEATURES_FREE) return true;
  return planId === "employer_enterprise";
}

/** Freelancer Pro features. */
export function hasFreelancerProFeatures(planId: string | null | undefined): boolean {
  if (PREMIUM_FEATURES_FREE) return true;
  return planId === "freelancer_pro";
}

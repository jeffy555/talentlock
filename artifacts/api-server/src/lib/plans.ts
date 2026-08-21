import {
  currencySymbolForPlan,
  planDisplayCurrency,
  resolvePlanPrice,
  type PlanDisplayCurrency,
} from "./planPrices";

export type PlanId =
  | "freelancer_free"
  | "freelancer_pro"
  | "employer_starter"
  | "employer_growth"
  | "employer_enterprise"
  | "free";

export type Audience = "freelancer" | "employer" | "any";

export interface PlanLimits {
  monthlyJobPosts: number | null;
  activeBookings: number | null;
  monthlyExpressInterests: number | null;
  teamSeats: number | null;
  monthlyTokenLimit: number | null;
}

export interface PlanDef {
  id: PlanId;
  audience: Audience;
  name: string;
  /** Amount in `displayCurrency` major units; null = Custom (enterprise). */
  priceMonthly: number | null;
  tagline: string;
  features: string[];
  limits: PlanLimits;
  priority: number;
  displayCurrency: PlanDisplayCurrency;
  currencySymbol: string;
}

/** Canonical USD list prices on static defs (before localization / free-flag). */
interface PlanDefBase {
  id: PlanId;
  audience: Audience;
  name: string;
  /** Canonical USD book amount; enterprise uses 0 placeholder (API returns null). */
  priceMonthly: number;
  tagline: string;
  features: string[];
  limits: PlanLimits;
  priority: number;
}

/**
 * Temporary testing flag — Growth/Pro premium feature gates are open and
 * Growth/Pro list at $0 while Stripe billing is deferred.
 * Set to `false` (or `PREMIUM_FEATURES_FREE=false`) before paid launch.
 */
export const PREMIUM_FEATURES_FREE =
  process.env.PREMIUM_FEATURES_FREE !== "false";

/** Growth-tier employer features (AI rate suggest, redline, brief questions, etc.). */
export function hasEmployerGrowthFeatures(planId: string | null | undefined): boolean {
  if (PREMIUM_FEATURES_FREE) return true;
  return planId === "employer_growth" || planId === "employer_enterprise";
}

/** Enterprise-tier employer features (team accounts, custom clauses, etc.). */
export function hasEmployerEnterpriseFeatures(planId: string | null | undefined): boolean {
  if (PREMIUM_FEATURES_FREE) return true;
  return planId === "employer_enterprise";
}

/** Freelancer Pro features (Cruise Mode, unlimited Express Interest, etc.). */
export function hasFreelancerProFeatures(planId: string | null | undefined): boolean {
  if (PREMIUM_FEATURES_FREE) return true;
  return planId === "freelancer_pro";
}

export const PLANS: Record<PlanId, PlanDefBase> = {
  free: {
    id: "free",
    audience: "any",
    name: "Free",
    priceMonthly: 0,
    tagline: "Default starter access",
    features: ["Basic access while you choose a plan"],
    limits: { monthlyJobPosts: 1, activeBookings: 1, monthlyExpressInterests: 3, teamSeats: 1, monthlyTokenLimit: null },
    priority: 0,
  },
  freelancer_free: {
    id: "freelancer_free",
    audience: "freelancer",
    name: "Freelancer Free",
    priceMonthly: 0,
    tagline: "Get listed in the Vault",
    features: [
      "Listed in the Talent Vault",
      "Basic profile and AI Match score",
      "3 Express Interest pitches per month",
    ],
    limits: { monthlyJobPosts: 0, activeBookings: 1, monthlyExpressInterests: 3, teamSeats: 1, monthlyTokenLimit: null },
    priority: 1,
  },
  freelancer_pro: {
    id: "freelancer_pro",
    audience: "freelancer",
    name: "Freelancer Pro",
    priceMonthly: 19, // localized via resolvePlanPrice; PREMIUM_FEATURES_FREE zeros display
    tagline: "Stand out and pitch unlimited",
    features: [
      "Unlimited Express Interest pitches",
      "Verified Pro badge on profile",
      "Priority placement in Vault search",
      "Advanced AI Match insights",
    ],
    limits: { monthlyJobPosts: 0, activeBookings: 5, monthlyExpressInterests: null, teamSeats: 1, monthlyTokenLimit: null },
    priority: 2,
  },
  employer_starter: {
    id: "employer_starter",
    audience: "employer",
    name: "Employer Starter",
    priceMonthly: 49,
    tagline: "For solo founders and small teams",
    features: [
      "2 active bookings",
      "5 job posts per month",
      "Basic AI matching",
      "Standard agreement templates",
    ],
    limits: { monthlyJobPosts: 5, activeBookings: 2, monthlyExpressInterests: 0, teamSeats: 1, monthlyTokenLimit: 50000 },
    priority: 3,
  },
  employer_growth: {
    id: "employer_growth",
    audience: "employer",
    name: "Employer Growth",
    priceMonthly: 199, // localized via resolvePlanPrice; PREMIUM_FEATURES_FREE zeros display
    tagline: "For scaling teams hiring regularly",
    features: [
      "10 active bookings",
      "Unlimited job posts",
      "Advanced AI matching",
      "3 team seats",
      "Priority support",
    ],
    limits: { monthlyJobPosts: null, activeBookings: 10, monthlyExpressInterests: 0, teamSeats: 3, monthlyTokenLimit: 250000 },
    priority: 4,
  },
  employer_enterprise: {
    id: "employer_enterprise",
    audience: "employer",
    name: "Employer Enterprise",
    priceMonthly: 0, // contact sales — API exposes priceMonthly: null
    tagline: "Custom — for large organizations",
    features: [
      "Unlimited bookings and job posts",
      "SSO / SCIM",
      "Custom agreement templates",
      "Audit log export",
      "Dedicated success manager",
    ],
    limits: { monthlyJobPosts: null, activeBookings: null, monthlyExpressInterests: 0, teamSeats: null, monthlyTokenLimit: null },
    priority: 5,
  },
};

export function localizePlan(
  base: PlanDefBase,
  currency: PlanDisplayCurrency = "USD",
): PlanDef {
  return {
    ...base,
    priceMonthly: resolvePlanPrice(base.id, currency, PREMIUM_FEATURES_FREE),
    displayCurrency: currency,
    currencySymbol: currencySymbolForPlan(currency),
  };
}

export function getPlan(
  planId: string | null | undefined,
  currency: PlanDisplayCurrency = "USD",
): PlanDef {
  const base = planId && planId in PLANS ? PLANS[planId as PlanId] : PLANS.free;
  return localizePlan(base, currency);
}

export function listPlansForAudience(
  audience: Audience,
  currency: PlanDisplayCurrency = "USD",
): PlanDef[] {
  return Object.values(PLANS)
    .filter((p) => p.id !== "free" && (audience === "any" || p.audience === audience))
    .sort((a, b) => a.priority - b.priority)
    .map((p) => localizePlan(p, currency));
}

export { planDisplayCurrency, resolvePlanPrice };
export type { PlanDisplayCurrency };

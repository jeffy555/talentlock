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
}

export interface PlanDef {
  id: PlanId;
  audience: Audience;
  name: string;
  priceMonthly: number;
  tagline: string;
  features: string[];
  limits: PlanLimits;
  priority: number;
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    audience: "any",
    name: "Free",
    priceMonthly: 0,
    tagline: "Default starter access",
    features: ["Basic access while you choose a plan"],
    limits: { monthlyJobPosts: 1, activeBookings: 1, monthlyExpressInterests: 3, teamSeats: 1 },
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
    limits: { monthlyJobPosts: 0, activeBookings: 1, monthlyExpressInterests: 3, teamSeats: 1 },
    priority: 1,
  },
  freelancer_pro: {
    id: "freelancer_pro",
    audience: "freelancer",
    name: "Freelancer Pro",
    priceMonthly: 19,
    tagline: "Stand out and pitch unlimited",
    features: [
      "Unlimited Express Interest pitches",
      "Verified Pro badge on profile",
      "Priority placement in Vault search",
      "Advanced AI Match insights",
    ],
    limits: { monthlyJobPosts: 0, activeBookings: 5, monthlyExpressInterests: null, teamSeats: 1 },
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
    limits: { monthlyJobPosts: 5, activeBookings: 2, monthlyExpressInterests: 0, teamSeats: 1 },
    priority: 3,
  },
  employer_growth: {
    id: "employer_growth",
    audience: "employer",
    name: "Employer Growth",
    priceMonthly: 199,
    tagline: "For scaling teams hiring regularly",
    features: [
      "10 active bookings",
      "Unlimited job posts",
      "Advanced AI matching",
      "3 team seats",
      "Priority support",
    ],
    limits: { monthlyJobPosts: null, activeBookings: 10, monthlyExpressInterests: 0, teamSeats: 3 },
    priority: 4,
  },
  employer_enterprise: {
    id: "employer_enterprise",
    audience: "employer",
    name: "Employer Enterprise",
    priceMonthly: 0, // contact sales
    tagline: "Custom — for large organizations",
    features: [
      "Unlimited bookings and job posts",
      "SSO / SCIM",
      "Custom agreement templates",
      "Audit log export",
      "Dedicated success manager",
    ],
    limits: { monthlyJobPosts: null, activeBookings: null, monthlyExpressInterests: 0, teamSeats: null },
    priority: 5,
  },
};

export function getPlan(planId: string | null | undefined): PlanDef {
  if (planId && planId in PLANS) return PLANS[planId as PlanId];
  return PLANS.free;
}

export function listPlansForAudience(audience: Audience): PlanDef[] {
  return Object.values(PLANS)
    .filter((p) => p.id !== "free" && (audience === "any" || p.audience === audience))
    .sort((a, b) => a.priority - b.priority);
}

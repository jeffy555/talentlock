import { db } from "@workspace/db";
import { subscriptionsTable, bookingsTable, jobRequirementsTable, jobInterestsTable, freelancerProfilesTable } from "@workspace/db";
import { eq, and, gte, inArray } from "drizzle-orm";
import { getPlan, type PlanDef } from "./plans";

export interface UsageCounts {
  activeBookings: number;
  monthlyJobPosts: number;
  monthlyExpressInterests: number;
}

export async function getUserSubscription(userId: number): Promise<{ plan: PlanDef; status: string; currentPeriodEnd: Date | null }> {
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId)).limit(1);
  if (!sub) {
    return { plan: getPlan("free"), status: "active", currentPeriodEnd: null };
  }
  return { plan: getPlan(sub.plan), status: sub.status, currentPeriodEnd: sub.currentPeriodEnd };
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function getEmployerUsage(employerProfileId: number): Promise<Pick<UsageCounts, "activeBookings" | "monthlyJobPosts">> {
  const since = startOfMonth();
  const activeBookingRows = await db.select({ id: bookingsTable.id }).from(bookingsTable)
    .where(and(eq(bookingsTable.employerId, employerProfileId), inArray(bookingsTable.status, ["pending", "active"])));
  const monthlyJobs = await db.select({ id: jobRequirementsTable.id }).from(jobRequirementsTable)
    .where(and(eq(jobRequirementsTable.employerId, employerProfileId), gte(jobRequirementsTable.createdAt as any, since)));
  return { activeBookings: activeBookingRows.length, monthlyJobPosts: monthlyJobs.length };
}

export async function getFreelancerUsage(freelancerProfileId: number): Promise<Pick<UsageCounts, "activeBookings" | "monthlyExpressInterests">> {
  const since = startOfMonth();
  const activeBookingRows = await db.select({ id: bookingsTable.id }).from(bookingsTable)
    .where(and(eq(bookingsTable.freelancerId, freelancerProfileId), inArray(bookingsTable.status, ["pending", "active"])));
  const interests = await db.select({ id: jobInterestsTable.id }).from(jobInterestsTable)
    .where(and(eq(jobInterestsTable.freelancerId, freelancerProfileId), gte(jobInterestsTable.createdAt as any, since)));
  return { activeBookings: activeBookingRows.length, monthlyExpressInterests: interests.length };
}

export async function getCombinedUsage(opts: { employerProfileId?: number | null; freelancerProfileId?: number | null }): Promise<UsageCounts> {
  let activeBookings = 0;
  let monthlyJobPosts = 0;
  let monthlyExpressInterests = 0;
  if (opts.employerProfileId) {
    const u = await getEmployerUsage(opts.employerProfileId);
    activeBookings += u.activeBookings;
    monthlyJobPosts += u.monthlyJobPosts;
  }
  if (opts.freelancerProfileId) {
    const u = await getFreelancerUsage(opts.freelancerProfileId);
    activeBookings += u.activeBookings;
    monthlyExpressInterests += u.monthlyExpressInterests;
  }
  return { activeBookings, monthlyJobPosts, monthlyExpressInterests };
}

export type GateResult = { allowed: true } | { allowed: false; reason: string; planNeeded: string };

export function checkLimit(plan: PlanDef, key: keyof PlanDef["limits"], current: number): GateResult {
  const limit = plan.limits[key];
  if (limit === null) return { allowed: true };
  if (current < limit) return { allowed: true };
  const labels: Record<string, string> = {
    monthlyJobPosts: "monthly job posts",
    activeBookings: "active bookings",
    monthlyExpressInterests: "monthly Express Interest pitches",
    teamSeats: "team seats",
  };
  return {
    allowed: false,
    reason: `Your ${plan.name} plan allows ${limit} ${labels[key] ?? key}. Upgrade to continue.`,
    planNeeded: plan.audience === "freelancer" ? "freelancer_pro" : "employer_growth",
  };
}

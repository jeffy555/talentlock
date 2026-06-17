import { db } from "@workspace/db";
import { subscriptionsTable, bookingsTable, jobRequirementsTable, jobInterestsTable, freelancerProfilesTable, tokenUsage } from "@workspace/db";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { getPlan, type PlanDef, type PlanId } from "./plans";
import { getSystemUserId, isSystemUserId } from "./systemUser";
import { TOKEN_FEATURES, type TokenFeature } from "./tokenLogger";

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

export function getUtcTokenResetDate(now = new Date()): Date {
  return new Date(Date.UTC(
    now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(),
    now.getUTCMonth() === 11 ? 0 : now.getUTCMonth() + 1,
    1,
  ));
}

export type TokenUsageBreakdown = Record<TokenFeature, number>;

function emptyBreakdown(): TokenUsageBreakdown {
  return Object.fromEntries(TOKEN_FEATURES.map((f) => [f, 0])) as TokenUsageBreakdown;
}

export function aggregateTokenUsageRows(
  rows: { feature: string; totalTokens: number }[],
): { tokensUsed: number; breakdown: TokenUsageBreakdown } {
  const breakdown = emptyBreakdown();
  let tokensUsed = 0;
  for (const row of rows) {
    tokensUsed += row.totalTokens;
    if (row.feature in breakdown) {
      breakdown[row.feature as TokenFeature] += row.totalTokens;
    }
  }
  return { tokensUsed, breakdown };
}

export async function getMonthlyTokenUsage(
  userId: number,
  startOfMonthUtc = startOfMonth(),
): Promise<{ tokensUsed: number; breakdown: TokenUsageBreakdown }> {
  const rows = await db
    .select({
      feature: tokenUsage.feature,
      totalTokens: tokenUsage.totalTokens,
    })
    .from(tokenUsage)
    .where(and(eq(tokenUsage.userId, userId), gte(tokenUsage.createdAt, startOfMonthUtc)));

  return aggregateTokenUsageRows(rows);
}

function planNeededForTokenLimit(planId: PlanId): string {
  if (planId === "employer_growth") return "employer_enterprise";
  return "employer_growth";
}

export type TokenQuotaResult = { allowed: true } | { allowed: false; planNeeded: string };

export async function checkTokenQuota(_db: typeof db, userId: number): Promise<TokenQuotaResult> {
  if (isSystemUserId(userId)) {
    return { allowed: true };
  }

  try {
    const systemUserId = await getSystemUserId();
    if (userId === systemUserId) {
      return { allowed: true };
    }
  } catch {
    // System user not seeded yet — proceed with normal quota check.
  }

  return db.transaction(async (tx) => {
    // NOTE: OpenAI call occurs outside this transaction. Small race window accepted —
    // consistent with existing plan gating patterns. See specs/token-usage/plan.md Risk 1.
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    const sub = await getUserSubscription(userId);
    const limit = sub.plan.limits.monthlyTokenLimit;
    if (limit === null) return { allowed: true };

    const since = startOfMonth();
    const [row] = await tx
      .select({ total: sql<number>`coalesce(sum(${tokenUsage.totalTokens}), 0)` })
      .from(tokenUsage)
      .where(and(eq(tokenUsage.userId, userId), gte(tokenUsage.createdAt, since)));

    const tokensUsed = Number(row?.total ?? 0);
    if (tokensUsed >= limit) {
      return { allowed: false, planNeeded: planNeededForTokenLimit(sub.plan.id) };
    }
    return { allowed: true };
  });
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

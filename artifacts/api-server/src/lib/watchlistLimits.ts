import { db } from "@workspace/db";
import { savedFreelancersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export const WATCHLIST_LIMITS: Record<string, number> = {
  employer_starter: 25,
  employer_growth: 100,
};

export function watchlistLimitForPlan(planId: string): number | null {
  return WATCHLIST_LIMITS[planId] ?? null;
}

export async function countWatchlist(employerUserId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(savedFreelancersTable)
    .where(eq(savedFreelancersTable.employerUserId, employerUserId));
  return row?.count ?? 0;
}

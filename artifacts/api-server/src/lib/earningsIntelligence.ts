import { db } from "@workspace/db";
import {
  bookingsTable,
  freelancerProfilesTable,
  milestonesTable,
  jobRequirementsTable,
  type FreelancerProfile,
} from "@workspace/db";
import { eq, and, gte, lt, isNotNull, sql, sum, inArray } from "drizzle-orm";
import { normaliseSkills } from "./skillsUtils";
import {
  getLast6Months,
  getMonthLabel,
  fillZeroMonths,
  monthRange,
  currentCalendarMonthRange,
} from "./earningsUtils";

// Confirmed column names from schema inspection (task.md Task 1.1):
// bookings.freelancerId — freelancer profile id (integer)
// bookings.status — text: pending | active | completed | cancelled
// bookings.jobRequirementId — nullable integer FK to job_requirements
// Milestone storage: separate `milestones` table (not JSONB on bookings)
// freelancer_profiles.fieldOfWork — text column field_of_work
// job_requirements.requiredSkills — text[] (no `skills` column)

const BOOKING_ACTIVE_STATUSES = ["active"] as const;
const BOOKING_COMPLETED_STATUS = "completed";
const MILESTONE_APPROVED_STATUS = "approved";
const MILESTONE_PENDING_STATUS = "pending";

const MIN_PLATFORM_FREELANCERS = 5;
const MIN_FIELD_FREELANCERS = 3;

export type EarningsIntelligenceResponse = {
  summary: {
    thisMonth: number;
    lastMonth: number;
    allTime: number;
    monthOverMonthChange: number | null;
  };
  trend: {
    months: string[];
    freelancerEarnings: number[];
    platformAverage: (number | null)[];
  };
  rateBenchmark: {
    myRate: number;
    fieldOfWork: string;
    percentile: number;
    fieldMin: number;
    fieldMedian: number;
    fieldMax: number;
    freelancerCount: number;
  } | null;
  projection: {
    projectedAmount: number;
    milestoneCount: number;
    currency: string;
  };
  topSkills: {
    skill: string;
    totalEarned: number;
    bookingCount: number;
  }[];
};

function parseAmount(value: string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function resolveProfileRate(
  profile: FreelancerProfile,
  completedBookingRates: number[],
): number | null {
  if (profile.hourlyRate) return parseAmount(profile.hourlyRate);
  if (profile.dailyRate) return parseAmount(profile.dailyRate);
  const valid = completedBookingRates.filter((r) => r > 0);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

async function sumApprovedMilestones(
  freelancerProfileId: number,
  range?: { start: Date; end: Date },
): Promise<number> {
  const conditions = [
    eq(bookingsTable.freelancerId, freelancerProfileId),
    eq(milestonesTable.status, MILESTONE_APPROVED_STATUS),
    isNotNull(milestonesTable.approvedAt),
  ];
  if (range) {
    conditions.push(gte(milestonesTable.approvedAt, range.start));
    conditions.push(lt(milestonesTable.approvedAt, range.end));
  }

  const [row] = await db
    .select({ total: sum(milestonesTable.amount) })
    .from(milestonesTable)
    .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
    .where(and(...conditions));

  return parseAmount(row?.total as string | null);
}

async function monthlyEarningsByFreelancer(
  freelancerProfileId: number,
  monthKeys: string[],
): Promise<{ month: string; total: number }[]> {
  if (monthKeys.length === 0) return [];

  const earliest = monthRange(monthKeys[0]).start;

  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${milestonesTable.approvedAt}), 'YYYY-MM')`,
      total: sum(milestonesTable.amount),
    })
    .from(milestonesTable)
    .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
    .where(and(
      eq(bookingsTable.freelancerId, freelancerProfileId),
      eq(milestonesTable.status, MILESTONE_APPROVED_STATUS),
      isNotNull(milestonesTable.approvedAt),
      gte(milestonesTable.approvedAt, earliest),
    ))
    .groupBy(sql`date_trunc('month', ${milestonesTable.approvedAt})`);

  return rows.map((r) => ({
    month: r.month,
    total: parseAmount(r.total as string | null),
  }));
}

async function platformMonthlyEarnings(
  fieldOfWork: string,
  monthKeys: string[],
): Promise<{
  monthAverages: Map<string, number>;
  freelancersWithData: number;
}> {
  if (monthKeys.length === 0) {
    return { monthAverages: new Map(), freelancersWithData: 0 };
  }

  const earliest = monthRange(monthKeys[0]).start;

  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${milestonesTable.approvedAt}), 'YYYY-MM')`,
      freelancerId: bookingsTable.freelancerId,
      total: sum(milestonesTable.amount),
    })
    .from(milestonesTable)
    .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
    .innerJoin(
      freelancerProfilesTable,
      eq(bookingsTable.freelancerId, freelancerProfilesTable.id),
    )
    .where(and(
      eq(freelancerProfilesTable.fieldOfWork, fieldOfWork),
      eq(milestonesTable.status, MILESTONE_APPROVED_STATUS),
      isNotNull(milestonesTable.approvedAt),
      eq(bookingsTable.status, BOOKING_COMPLETED_STATUS),
      gte(milestonesTable.approvedAt, earliest),
    ))
    .groupBy(
      sql`date_trunc('month', ${milestonesTable.approvedAt})`,
      bookingsTable.freelancerId,
    );

  const freelancersWithEarnings = new Set<number>();
  const byMonth = new Map<string, number[]>();

  for (const row of rows) {
    const total = parseAmount(row.total as string | null);
    if (total <= 0) continue;
    freelancersWithEarnings.add(row.freelancerId);
    const list = byMonth.get(row.month) ?? [];
    list.push(total);
    byMonth.set(row.month, list);
  }

  const monthAverages = new Map<string, number>();
  for (const [month, totals] of byMonth) {
    if (totals.length === 0) continue;
    monthAverages.set(
      month,
      totals.reduce((a, b) => a + b, 0) / totals.length,
    );
  }

  return {
    monthAverages,
    freelancersWithData: freelancersWithEarnings.size,
  };
}

async function buildRateBenchmark(
  profile: FreelancerProfile,
  myRate: number | null,
): Promise<EarningsIntelligenceResponse["rateBenchmark"]> {
  if (myRate == null) return null;

  const fieldRows = await db
    .selectDistinct({
      id: freelancerProfilesTable.id,
      hourlyRate: freelancerProfilesTable.hourlyRate,
      dailyRate: freelancerProfilesTable.dailyRate,
    })
    .from(freelancerProfilesTable)
    .innerJoin(bookingsTable, eq(bookingsTable.freelancerId, freelancerProfilesTable.id))
    .where(and(
      eq(freelancerProfilesTable.fieldOfWork, profile.fieldOfWork),
      eq(freelancerProfilesTable.currencyCode, profile.currencyCode ?? "USD"),
      eq(bookingsTable.status, BOOKING_COMPLETED_STATUS),
    ));

  const rates: number[] = [];
  for (const row of fieldRows) {
    const rate = row.hourlyRate
      ? parseAmount(row.hourlyRate)
      : row.dailyRate
        ? parseAmount(row.dailyRate)
        : null;
    if (rate != null && rate > 0) rates.push(rate);
  }

  if (rates.length < MIN_FIELD_FREELANCERS) return null;

  rates.sort((a, b) => a - b);
  const below = rates.filter((r) => r < myRate).length;
  const percentile = Math.round((below / rates.length) * 100);
  const median = rates[Math.floor(rates.length / 2)];

  return {
    myRate,
    fieldOfWork: profile.fieldOfWork,
    percentile,
    fieldMin: rates[0],
    fieldMedian: median,
    fieldMax: rates[rates.length - 1],
    freelancerCount: rates.length,
  };
}

async function buildProjection(
  freelancerProfileId: number,
  currencyCode: string,
): Promise<EarningsIntelligenceResponse["projection"]> {
  const { start, end } = currentCalendarMonthRange();

  const rows = await db
    .select({
      amount: milestonesTable.amount,
    })
    .from(milestonesTable)
    .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
    .where(and(
      eq(bookingsTable.freelancerId, freelancerProfileId),
      inArray(bookingsTable.status, [...BOOKING_ACTIVE_STATUSES]),
      eq(milestonesTable.status, MILESTONE_PENDING_STATUS),
      isNotNull(milestonesTable.dueDate),
      gte(milestonesTable.dueDate, start),
      lt(milestonesTable.dueDate, end),
    ));

  const projectedAmount = rows.reduce((acc, r) => acc + parseAmount(r.amount), 0);

  return {
    projectedAmount,
    milestoneCount: rows.length,
    currency: currencyCode,
  };
}

function skillsMatch(a: string, b: string): boolean {
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

async function buildTopSkills(
  profile: FreelancerProfile,
  freelancerProfileId: number,
): Promise<EarningsIntelligenceResponse["topSkills"]> {
  const mySkills = normaliseSkills(profile.skills);
  if (mySkills.length === 0) return [];

  const milestoneRows = await db
    .select({
      amount: milestonesTable.amount,
      bookingId: bookingsTable.id,
      jobRequirementId: bookingsTable.jobRequirementId,
    })
    .from(milestonesTable)
    .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
    .where(and(
      eq(bookingsTable.freelancerId, freelancerProfileId),
      eq(milestonesTable.status, MILESTONE_APPROVED_STATUS),
    ));

  const jobIds = [
    ...new Set(
      milestoneRows
        .map((r) => r.jobRequirementId)
        .filter((id): id is number => id != null),
    ),
  ];

  const jobsMap = new Map<number, string[]>();
  if (jobIds.length > 0) {
    const jobs = await db
      .select({
        id: jobRequirementsTable.id,
        requiredSkills: jobRequirementsTable.requiredSkills,
      })
      .from(jobRequirementsTable)
      .where(inArray(jobRequirementsTable.id, jobIds));

    for (const job of jobs) {
      jobsMap.set(job.id, normaliseSkills(job.requiredSkills));
    }
  }

  const skillEarnings = new Map<string, number>();
  const skillBookings = new Map<string, Set<number>>();

  for (const row of milestoneRows) {
    const amount = parseAmount(row.amount);
    if (amount <= 0) continue;

    let matchedSkills: string[] = [];
    if (row.jobRequirementId != null) {
      const jobSkills = jobsMap.get(row.jobRequirementId) ?? [];
      matchedSkills = mySkills.filter((s) =>
        jobSkills.some((js) => skillsMatch(s, js)),
      );
    }

    if (matchedSkills.length === 0) {
      matchedSkills = [...mySkills];
    }

    const share = amount / matchedSkills.length;
    for (const skill of matchedSkills) {
      skillEarnings.set(skill, (skillEarnings.get(skill) ?? 0) + share);
      if (!skillBookings.has(skill)) skillBookings.set(skill, new Set());
      skillBookings.get(skill)!.add(row.bookingId);
    }
  }

  return [...skillEarnings.entries()]
    .filter(([, total]) => total > 0)
    .map(([skill, totalEarned]) => ({
      skill,
      totalEarned: Math.round(totalEarned * 100) / 100,
      bookingCount: skillBookings.get(skill)?.size ?? 0,
    }))
    .sort((a, b) => b.totalEarned - a.totalEarned)
    .slice(0, 5);
}

export async function buildEarningsIntelligence(
  profile: FreelancerProfile,
): Promise<EarningsIntelligenceResponse> {
  const now = new Date();
  const thisMonthRange = currentCalendarMonthRange(now);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthKeys = getLast6Months();

  const [
    thisMonth,
    lastMonth,
    allTime,
    freelancerMonthRows,
    platformData,
    projection,
    topSkills,
  ] = await Promise.all([
    sumApprovedMilestones(profile.id, thisMonthRange),
    sumApprovedMilestones(profile.id, { start: lastMonthStart, end: lastMonthEnd }),
    sumApprovedMilestones(profile.id),
    monthlyEarningsByFreelancer(profile.id, monthKeys),
    platformMonthlyEarnings(profile.fieldOfWork, monthKeys),
    buildProjection(profile.id, profile.currencyCode ?? "USD"),
    buildTopSkills(profile, profile.id),
  ]);

  const monthOverMonthChange =
    lastMonth === 0 ? null : ((thisMonth - lastMonth) / lastMonth) * 100;

  const freelancerEarnings = fillZeroMonths(monthKeys, freelancerMonthRows);

  let platformAverage: (number | null)[];
  if (platformData.freelancersWithData < MIN_PLATFORM_FREELANCERS) {
    platformAverage = monthKeys.map(() => null);
  } else {
    platformAverage = monthKeys.map((m) => {
      const avg = platformData.monthAverages.get(m);
      return avg != null ? Math.round(avg * 100) / 100 : 0;
    });
  }

  const completedRates = await db
    .select({ rate: bookingsTable.rate })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.freelancerId, profile.id),
      eq(bookingsTable.status, BOOKING_COMPLETED_STATUS),
    ));

  const myRate = resolveProfileRate(
    profile,
    completedRates.map((r) => parseAmount(r.rate)),
  );

  const rateBenchmark = await buildRateBenchmark(profile, myRate);

  return {
    summary: {
      thisMonth: Math.round(thisMonth * 100) / 100,
      lastMonth: Math.round(lastMonth * 100) / 100,
      allTime: Math.round(allTime * 100) / 100,
      monthOverMonthChange:
        monthOverMonthChange == null
          ? null
          : Math.round(monthOverMonthChange * 10) / 10,
    },
    trend: {
      months: monthKeys.map(getMonthLabel),
      freelancerEarnings,
      platformAverage,
    },
    rateBenchmark,
    projection,
    topSkills,
  };
}

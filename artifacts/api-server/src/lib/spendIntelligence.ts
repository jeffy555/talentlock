import { db } from "@workspace/db";
import {
  bookingsTable,
  freelancerProfilesTable,
  milestonesTable,
  reviewsTable,
  type EmployerProfile,
} from "@workspace/db";
import {
  eq,
  and,
  gte,
  lt,
  isNotNull,
  or,
  sql,
  sum,
  count,
  countDistinct,
  inArray,
  desc,
} from "drizzle-orm";
import {
  getLast6Months,
  getMonthLabel,
  fillZeroMonths,
  monthRange,
  currentCalendarMonthRange,
} from "./earningsUtils";

// Codebase inspection (Task 1.1):
// bookings.employerId — integer employer profile id (column employer_id)
// bookings.freelancerId — integer freelancer profile id (column freelancer_id)
// bookings.proposedRate — nullable numeric; holds last proposed rate; when negotiationStatus = 'agreed' this is the agreed rate (may still be null)
// bookings.rate — set to proposedRate on negotiate accept
// bookings.negotiationStatus — 'negotiating' | 'agreed'
// bookings.status — pending | active | completed | cancelled
// Milestone storage: separate milestones table (bookingId FK), not JSONB
// freelancer_profiles.fieldOfWork — text column field_of_work
// freelancer_profiles.name — display name for top freelancers list
// freelancer_profiles.hourlyRate / dailyRate — profile rate fallback (no single `rate` column)
// reviews.employerId — users.id (not employer profile id)
// reviews.freelancerId — users.id (not freelancer profile id)
// GET /api/dashboard/stats — totalSpent always null; no overlap with spend analytics

const BOOKING_ACTIVE_STATUSES = ["active"] as const;
const BOOKING_COMPLETED_STATUS = "completed";
const MILESTONE_APPROVED_STATUS = "approved";
const MILESTONE_PENDING_STATUS = "pending";
const MIN_FIELD_FREELANCERS = 3;

export type SpendAnalyticsResponse = {
  summary: {
    thisMonth: number;
    lastMonth: number;
    allTime: number;
    monthOverMonthChange: number | null;
  };
  trend: {
    months: string[];
    spend: number[];
  };
  spendByField: {
    field: string;
    totalSpend: number;
    percentageOfTotal: number;
  }[];
  topFreelancers: {
    freelancerId: string;
    name: string;
    fieldOfWork: string;
    totalPaid: number;
    bookingCount: number;
    averageRatingGiven: number | null;
  }[];
  committed: {
    committedAmount: number;
    milestoneCount: number;
  };
  rateBenchmark: {
    averageRatePaid: number;
    marketMedian: number;
    fields: {
      field: string;
      avgPaid: number;
      marketMedian: number;
      differencePercent: number;
    }[];
  } | null;
};

function parseAmount(value: string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveAgreedRate(
  proposedRate: string | null,
  bookingRate: string | null,
  hourlyRate: string | null,
  dailyRate: string | null,
): number | null {
  if (proposedRate) {
    const n = parseAmount(proposedRate);
    if (n > 0) return n;
  }
  if (bookingRate) {
    const n = parseAmount(bookingRate);
    if (n > 0) return n;
  }
  if (hourlyRate) {
    const n = parseAmount(hourlyRate);
    if (n > 0) return n;
  }
  if (dailyRate) {
    const n = parseAmount(dailyRate);
    if (n > 0) return n;
  }
  return null;
}

async function sumApprovedMilestonesForEmployer(
  employerProfileId: number,
  range?: { start: Date; end: Date },
): Promise<number> {
  const conditions = [
    eq(bookingsTable.employerId, employerProfileId),
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

async function monthlySpendByEmployer(
  employerProfileId: number,
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
      eq(bookingsTable.employerId, employerProfileId),
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

async function buildSpendByField(
  employerProfileId: number,
): Promise<SpendAnalyticsResponse["spendByField"]> {
  const rows = await db
    .select({
      field: freelancerProfilesTable.fieldOfWork,
      totalSpend: sum(milestonesTable.amount),
    })
    .from(milestonesTable)
    .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
    .innerJoin(
      freelancerProfilesTable,
      eq(bookingsTable.freelancerId, freelancerProfilesTable.id),
    )
    .where(and(
      eq(bookingsTable.employerId, employerProfileId),
      eq(milestonesTable.status, MILESTONE_APPROVED_STATUS),
      isNotNull(milestonesTable.approvedAt),
    ))
    .groupBy(freelancerProfilesTable.fieldOfWork)
    .orderBy(desc(sum(milestonesTable.amount)))
    .limit(6);

  const items = rows
    .map((r) => ({
      field: r.field,
      totalSpend: parseAmount(r.totalSpend as string | null),
    }))
    .filter((r) => r.totalSpend > 0);

  const grandTotal = items.reduce((acc, r) => acc + r.totalSpend, 0);
  if (grandTotal === 0) return [];

  return items.map((r) => ({
    field: r.field,
    totalSpend: roundMoney(r.totalSpend),
    percentageOfTotal: Math.round((r.totalSpend / grandTotal) * 1000) / 10,
  }));
}

async function buildTopFreelancers(
  employerProfileId: number,
  employerUserId: number,
): Promise<SpendAnalyticsResponse["topFreelancers"]> {
  const spendRows = await db
    .select({
      freelancerId: bookingsTable.freelancerId,
      name: freelancerProfilesTable.name,
      fieldOfWork: freelancerProfilesTable.fieldOfWork,
      freelancerUserId: freelancerProfilesTable.userId,
      totalPaid: sum(milestonesTable.amount),
    })
    .from(milestonesTable)
    .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
    .innerJoin(
      freelancerProfilesTable,
      eq(bookingsTable.freelancerId, freelancerProfilesTable.id),
    )
    .where(and(
      eq(bookingsTable.employerId, employerProfileId),
      eq(milestonesTable.status, MILESTONE_APPROVED_STATUS),
      isNotNull(milestonesTable.approvedAt),
    ))
    .groupBy(
      bookingsTable.freelancerId,
      freelancerProfilesTable.name,
      freelancerProfilesTable.fieldOfWork,
      freelancerProfilesTable.userId,
    )
    .orderBy(desc(sum(milestonesTable.amount)))
    .limit(5);

  if (spendRows.length === 0) return [];

  const freelancerProfileIds = spendRows.map((r) => r.freelancerId);

  const completedCounts = await db
    .select({
      freelancerId: bookingsTable.freelancerId,
      bookingCount: countDistinct(bookingsTable.id),
    })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.employerId, employerProfileId),
      eq(bookingsTable.status, BOOKING_COMPLETED_STATUS),
      inArray(bookingsTable.freelancerId, freelancerProfileIds),
    ))
    .groupBy(bookingsTable.freelancerId);

  const countMap = new Map(
    completedCounts.map((r) => [r.freelancerId, Number(r.bookingCount)]),
  );

  const ratingRows = await db
    .select({
      freelancerUserId: reviewsTable.freelancerId,
      averageRating: sql<number>`avg(${reviewsTable.rating})::float`,
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.employerId, employerUserId))
    .groupBy(reviewsTable.freelancerId);

  const ratingMap = new Map(
    ratingRows.map((r) => [r.freelancerUserId, r.averageRating]),
  );

  return spendRows.map((r) => {
    const avg = ratingMap.get(r.freelancerUserId);
    return {
      freelancerId: String(r.freelancerId),
      name: r.name,
      fieldOfWork: r.fieldOfWork,
      totalPaid: roundMoney(parseAmount(r.totalPaid as string | null)),
      bookingCount: countMap.get(r.freelancerId) ?? 0,
      averageRatingGiven:
        avg != null && Number.isFinite(avg)
          ? Math.round(avg * 10) / 10
          : null,
    };
  });
}

async function buildCommittedSpend(
  employerProfileId: number,
): Promise<SpendAnalyticsResponse["committed"]> {
  const { start, end } = currentCalendarMonthRange();

  const rows = await db
    .select({
      amount: milestonesTable.amount,
    })
    .from(milestonesTable)
    .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
    .where(and(
      eq(bookingsTable.employerId, employerProfileId),
      inArray(bookingsTable.status, [...BOOKING_ACTIVE_STATUSES]),
      eq(milestonesTable.status, MILESTONE_PENDING_STATUS),
      isNotNull(milestonesTable.dueDate),
      gte(milestonesTable.dueDate, start),
      lt(milestonesTable.dueDate, end),
    ));

  const committedAmount = rows.reduce((acc, r) => acc + parseAmount(r.amount), 0);

  return {
    committedAmount: roundMoney(committedAmount),
    milestoneCount: rows.length,
  };
}

async function getMarketMedian(fieldOfWork: string): Promise<number | null> {
  const rows = await db
    .select({
      hourlyRate: freelancerProfilesTable.hourlyRate,
      dailyRate: freelancerProfilesTable.dailyRate,
    })
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.fieldOfWork, fieldOfWork));

  const rates: number[] = [];
  for (const row of rows) {
    const rate = row.hourlyRate
      ? parseAmount(row.hourlyRate)
      : row.dailyRate
        ? parseAmount(row.dailyRate)
        : null;
    if (rate != null && rate > 0) rates.push(rate);
  }

  if (rates.length < MIN_FIELD_FREELANCERS) return null;

  rates.sort((a, b) => a - b);
  return rates[Math.floor(rates.length / 2)];
}

async function avgPaidRateForField(
  employerProfileId: number,
  fieldOfWork: string,
): Promise<number | null> {
  const bookingRows = await db
    .select({
      bookingId: bookingsTable.id,
      proposedRate: bookingsTable.proposedRate,
      rate: bookingsTable.rate,
      hourlyRate: freelancerProfilesTable.hourlyRate,
      dailyRate: freelancerProfilesTable.dailyRate,
      milestoneCount: count(milestonesTable.id),
    })
    .from(bookingsTable)
    .innerJoin(
      freelancerProfilesTable,
      eq(bookingsTable.freelancerId, freelancerProfilesTable.id),
    )
    .leftJoin(
      milestonesTable,
      and(
        eq(milestonesTable.bookingId, bookingsTable.id),
        eq(milestonesTable.status, MILESTONE_APPROVED_STATUS),
      ),
    )
    .where(and(
      eq(bookingsTable.employerId, employerProfileId),
      eq(bookingsTable.negotiationStatus, "agreed"),
      eq(freelancerProfilesTable.fieldOfWork, fieldOfWork),
      or(
        isNotNull(bookingsTable.proposedRate),
        isNotNull(bookingsTable.rate),
        isNotNull(freelancerProfilesTable.hourlyRate),
        isNotNull(freelancerProfilesTable.dailyRate),
      ),
    ))
    .groupBy(
      bookingsTable.id,
      bookingsTable.proposedRate,
      bookingsTable.rate,
      freelancerProfilesTable.hourlyRate,
      freelancerProfilesTable.dailyRate,
    );

  let weightedSum = 0;
  let totalWeight = 0;

  for (const row of bookingRows) {
    const agreedRate = resolveAgreedRate(
      row.proposedRate,
      row.rate,
      row.hourlyRate,
      row.dailyRate,
    );
    if (agreedRate == null) continue;

    const weight = Math.max(Number(row.milestoneCount), 1);
    weightedSum += agreedRate * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

async function buildRateBenchmark(
  employerProfileId: number,
  spendByField: SpendAnalyticsResponse["spendByField"],
): Promise<SpendAnalyticsResponse["rateBenchmark"]> {
  if (spendByField.length === 0) return null;

  const fieldBenchmarks: NonNullable<SpendAnalyticsResponse["rateBenchmark"]>["fields"] = [];

  for (const { field, totalSpend } of spendByField) {
    const [marketMedian, avgPaid] = await Promise.all([
      getMarketMedian(field),
      avgPaidRateForField(employerProfileId, field),
    ]);

    if (marketMedian == null || avgPaid == null) continue;

    const differencePercent = Math.round(
      ((avgPaid - marketMedian) / marketMedian) * 100,
    );

    fieldBenchmarks.push({
      field,
      avgPaid: roundMoney(avgPaid),
      marketMedian: roundMoney(marketMedian),
      differencePercent,
    });
  }

  if (fieldBenchmarks.length === 0) return null;

  const spendWeightMap = new Map(
    spendByField.map((f) => [f.field, f.totalSpend]),
  );

  let weightedAvgPaid = 0;
  let weightedMarketMedian = 0;
  let totalWeight = 0;

  for (const fb of fieldBenchmarks) {
    const weight = spendWeightMap.get(fb.field) ?? 0;
    if (weight <= 0) continue;
    weightedAvgPaid += fb.avgPaid * weight;
    weightedMarketMedian += fb.marketMedian * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;

  return {
    averageRatePaid: roundMoney(weightedAvgPaid / totalWeight),
    marketMedian: roundMoney(weightedMarketMedian / totalWeight),
    fields: fieldBenchmarks,
  };
}

export async function buildSpendAnalytics(
  employer: EmployerProfile,
  employerUserId: number,
): Promise<SpendAnalyticsResponse> {
  const now = new Date();
  const thisMonthRange = currentCalendarMonthRange(now);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthKeys = getLast6Months();

  const [
    thisMonth,
    lastMonth,
    allTime,
    spendMonthRows,
    spendByField,
    topFreelancers,
    committed,
  ] = await Promise.all([
    sumApprovedMilestonesForEmployer(employer.id, thisMonthRange),
    sumApprovedMilestonesForEmployer(employer.id, {
      start: lastMonthStart,
      end: lastMonthEnd,
    }),
    sumApprovedMilestonesForEmployer(employer.id),
    monthlySpendByEmployer(employer.id, monthKeys),
    buildSpendByField(employer.id),
    buildTopFreelancers(employer.id, employerUserId),
    buildCommittedSpend(employer.id),
  ]);

  const monthOverMonthChange =
    lastMonth === 0 ? null : ((thisMonth - lastMonth) / lastMonth) * 100;

  const spend = fillZeroMonths(monthKeys, spendMonthRows);
  const rateBenchmark = await buildRateBenchmark(employer.id, spendByField);

  return {
    summary: {
      thisMonth: roundMoney(thisMonth),
      lastMonth: roundMoney(lastMonth),
      allTime: roundMoney(allTime),
      monthOverMonthChange:
        monthOverMonthChange == null
          ? null
          : Math.round(monthOverMonthChange * 10) / 10,
    },
    trend: {
      months: monthKeys.map(getMonthLabel),
      spend,
    },
    spendByField,
    topFreelancers,
    committed,
    rateBenchmark,
  };
}

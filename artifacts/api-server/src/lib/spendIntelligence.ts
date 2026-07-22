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
import { convertAmount, currencyName } from "./countryData";
import type { ExchangeRateSnapshot } from "@workspace/db";

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
  displayCurrency: string;
  conversionNote: string | null;
};

function parseAmount(value: string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function convertToEmployerCurrency(
  amount: number,
  fromCode: string | null,
  employerCurrency: string,
  snapshot: ExchangeRateSnapshot | null,
): { converted: number; didConvert: boolean } {
  const from = fromCode ?? "USD";
  if (from === employerCurrency) {
    return { converted: amount, didConvert: false };
  }
  const rates = snapshot?.rates;
  if (!rates) {
    return { converted: amount, didConvert: false };
  }
  const converted = convertAmount(amount, from, employerCurrency, rates);
  if (converted == null) {
    return { converted: amount, didConvert: false };
  }
  return { converted, didConvert: true };
}

type ApprovedMilestoneRow = {
  amount: string | null;
  currencyCode: string | null;
  exchangeRateAtCreation: ExchangeRateSnapshot | null;
  approvedAt: Date | null;
};

async function fetchApprovedMilestones(
  employerProfileId: number,
  range?: { start: Date; end: Date },
): Promise<ApprovedMilestoneRow[]> {
  const conditions = [
    eq(bookingsTable.employerId, employerProfileId),
    eq(milestonesTable.status, MILESTONE_APPROVED_STATUS),
    isNotNull(milestonesTable.approvedAt),
  ];
  if (range) {
    conditions.push(gte(milestonesTable.approvedAt, range.start));
    conditions.push(lt(milestonesTable.approvedAt, range.end));
  }

  return db
    .select({
      amount: milestonesTable.amount,
      currencyCode: bookingsTable.currencyCode,
      exchangeRateAtCreation: bookingsTable.exchangeRateAtCreation,
      approvedAt: milestonesTable.approvedAt,
    })
    .from(milestonesTable)
    .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
    .where(and(...conditions));
}

function sumConvertedMilestones(
  rows: ApprovedMilestoneRow[],
  employerCurrency: string,
): { total: number; hadConversion: boolean } {
  let total = 0;
  let hadConversion = false;
  for (const row of rows) {
    const amt = parseAmount(row.amount);
    if (amt <= 0) continue;
    const { converted, didConvert } = convertToEmployerCurrency(
      amt,
      row.currencyCode,
      employerCurrency,
      row.exchangeRateAtCreation,
    );
    total += converted;
    if (didConvert) hadConversion = true;
  }
  return { total, hadConversion };
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
  employerCurrency: string,
  range?: { start: Date; end: Date },
): Promise<{ total: number; hadConversion: boolean }> {
  const rows = await fetchApprovedMilestones(employerProfileId, range);
  const { total, hadConversion } = sumConvertedMilestones(rows, employerCurrency);
  return { total, hadConversion };
}

async function monthlySpendByEmployer(
  employerProfileId: number,
  employerCurrency: string,
  monthKeys: string[],
): Promise<{ month: string; total: number }[]> {
  if (monthKeys.length === 0) return [];

  const earliest = monthRange(monthKeys[0]).start;
  const rows = await fetchApprovedMilestones(employerProfileId, { start: earliest, end: new Date(8640000000000000) });

  const byMonth = new Map<string, number>();
  for (const row of rows) {
    if (!row.approvedAt) continue;
    const month = row.approvedAt.toISOString().slice(0, 7);
    if (!monthKeys.includes(month)) continue;
    const amt = parseAmount(row.amount);
    if (amt <= 0) continue;
    const { converted } = convertToEmployerCurrency(
      amt,
      row.currencyCode,
      employerCurrency,
      row.exchangeRateAtCreation,
    );
    byMonth.set(month, (byMonth.get(month) ?? 0) + converted);
  }

  return [...byMonth.entries()].map(([month, total]) => ({ month, total }));
}

async function buildSpendByField(
  employerProfileId: number,
  employerCurrency: string,
): Promise<{ items: SpendAnalyticsResponse["spendByField"]; hadConversion: boolean }> {
  const rows = await db
    .select({
      field: freelancerProfilesTable.fieldOfWork,
      amount: milestonesTable.amount,
      currencyCode: bookingsTable.currencyCode,
      exchangeRateAtCreation: bookingsTable.exchangeRateAtCreation,
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
    ));

  const byField = new Map<string, number>();
  let hadConversion = false;
  for (const row of rows) {
    const amt = parseAmount(row.amount);
    if (amt <= 0) continue;
    const { converted, didConvert } = convertToEmployerCurrency(
      amt,
      row.currencyCode,
      employerCurrency,
      row.exchangeRateAtCreation,
    );
    if (didConvert) hadConversion = true;
    byField.set(row.field, (byField.get(row.field) ?? 0) + converted);
  }

  const items = [...byField.entries()]
    .map(([field, totalSpend]) => ({ field, totalSpend }))
    .filter((r) => r.totalSpend > 0)
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 6);

  const grandTotal = items.reduce((acc, r) => acc + r.totalSpend, 0);
  if (grandTotal === 0) return { items: [], hadConversion };

  return {
    hadConversion,
    items: items.map((r) => ({
      field: r.field,
      totalSpend: roundMoney(r.totalSpend),
      percentageOfTotal: Math.round((r.totalSpend / grandTotal) * 1000) / 10,
    })),
  };
}

async function buildTopFreelancers(
  employerProfileId: number,
  employerUserId: number,
  employerCurrency: string,
): Promise<{ items: SpendAnalyticsResponse["topFreelancers"]; hadConversion: boolean }> {
  const milestoneRows = await db
    .select({
      freelancerId: bookingsTable.freelancerId,
      name: freelancerProfilesTable.name,
      fieldOfWork: freelancerProfilesTable.fieldOfWork,
      freelancerUserId: freelancerProfilesTable.userId,
      amount: milestonesTable.amount,
      currencyCode: bookingsTable.currencyCode,
      exchangeRateAtCreation: bookingsTable.exchangeRateAtCreation,
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
    ));

  if (milestoneRows.length === 0) return { items: [], hadConversion: false };

  const byFreelancer = new Map<number, {
    name: string;
    fieldOfWork: string;
    freelancerUserId: number;
    totalPaid: number;
  }>();
  let hadConversion = false;

  for (const row of milestoneRows) {
    const amt = parseAmount(row.amount);
    if (amt <= 0) continue;
    const { converted, didConvert } = convertToEmployerCurrency(
      amt,
      row.currencyCode,
      employerCurrency,
      row.exchangeRateAtCreation,
    );
    if (didConvert) hadConversion = true;
    const existing = byFreelancer.get(row.freelancerId);
    if (existing) {
      existing.totalPaid += converted;
    } else {
      byFreelancer.set(row.freelancerId, {
        name: row.name,
        fieldOfWork: row.fieldOfWork,
        freelancerUserId: row.freelancerUserId,
        totalPaid: converted,
      });
    }
  }

  const spendRows = [...byFreelancer.entries()]
    .map(([freelancerId, data]) => ({ freelancerId, ...data }))
    .sort((a, b) => b.totalPaid - a.totalPaid)
    .slice(0, 5);

  if (spendRows.length === 0) return { items: [], hadConversion };

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

  return {
    hadConversion,
    items: spendRows.map((r) => {
      const avg = ratingMap.get(r.freelancerUserId);
      return {
        freelancerId: String(r.freelancerId),
        name: r.name,
        fieldOfWork: r.fieldOfWork,
        totalPaid: roundMoney(r.totalPaid),
        bookingCount: countMap.get(r.freelancerId) ?? 0,
        averageRatingGiven:
          avg != null && Number.isFinite(avg)
            ? Math.round(avg * 10) / 10
            : null,
      };
    }),
  };
}

async function buildCommittedSpend(
  employerProfileId: number,
  employerCurrency: string,
): Promise<{ committed: SpendAnalyticsResponse["committed"]; hadConversion: boolean }> {
  const { start, end } = currentCalendarMonthRange();

  const rows = await db
    .select({
      amount: milestonesTable.amount,
      currencyCode: bookingsTable.currencyCode,
      exchangeRateAtCreation: bookingsTable.exchangeRateAtCreation,
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

  let committedAmount = 0;
  let hadConversion = false;
  for (const row of rows) {
    const amt = parseAmount(row.amount);
    if (amt <= 0) continue;
    const { converted, didConvert } = convertToEmployerCurrency(
      amt,
      row.currencyCode,
      employerCurrency,
      row.exchangeRateAtCreation,
    );
    if (didConvert) hadConversion = true;
    committedAmount += converted;
  }

  return {
    hadConversion,
    committed: {
      committedAmount: roundMoney(committedAmount),
      milestoneCount: rows.length,
    },
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
  employerCurrencyCode: string,
): Promise<SpendAnalyticsResponse> {
  const employerCurrency = employerCurrencyCode || "USD";
  const now = new Date();
  const thisMonthRange = currentCalendarMonthRange(now);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthKeys = getLast6Months();

  const [
    thisMonthResult,
    lastMonthResult,
    allTimeResult,
    spendMonthRows,
    spendByFieldResult,
    topFreelancersResult,
    committedResult,
  ] = await Promise.all([
    sumApprovedMilestonesForEmployer(employer.id, employerCurrency, thisMonthRange),
    sumApprovedMilestonesForEmployer(employer.id, employerCurrency, {
      start: lastMonthStart,
      end: lastMonthEnd,
    }),
    sumApprovedMilestonesForEmployer(employer.id, employerCurrency),
    monthlySpendByEmployer(employer.id, employerCurrency, monthKeys),
    buildSpendByField(employer.id, employerCurrency),
    buildTopFreelancers(employer.id, employerUserId, employerCurrency),
    buildCommittedSpend(employer.id, employerCurrency),
  ]);

  const thisMonth = thisMonthResult.total;
  const lastMonth = lastMonthResult.total;
  const allTime = allTimeResult.total;
  const spendByField = spendByFieldResult.items;
  const topFreelancers = topFreelancersResult.items;
  const committed = committedResult.committed;
  const hadConversion =
    thisMonthResult.hadConversion
    || lastMonthResult.hadConversion
    || allTimeResult.hadConversion
    || spendByFieldResult.hadConversion
    || topFreelancersResult.hadConversion
    || committedResult.hadConversion;

  const monthOverMonthChange =
    lastMonth === 0 ? null : ((thisMonth - lastMonth) / lastMonth) * 100;

  const spend = fillZeroMonths(monthKeys, spendMonthRows);
  const rateBenchmark = await buildRateBenchmark(employer.id, spendByField);

  const conversionNote = hadConversion
    ? `Amounts converted to ${currencyName(employerCurrency)} (${employerCurrency}) at booking-time rates.`
    : null;

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
    displayCurrency: employerCurrency,
    conversionNote,
  };
}

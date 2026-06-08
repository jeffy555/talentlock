import { db } from "@workspace/db";
import {
  bookingsTable,
  agreementsTable,
  freelancerProfilesTable,
  jobRequirementsTable,
  type EmployerProfile,
} from "@workspace/db";
import {
  eq,
  and,
  gte,
  lt,
  isNotNull,
  sql,
  count,
  inArray,
} from "drizzle-orm";
import { normaliseSkills } from "./skillsUtils";
import {
  type AnalyticsWindow,
  getWindowDates,
  safeAverage,
  getLifecycleTrend,
} from "./earningsUtils";

// Hiring Analytics — Codebase inspection results (Task 1.1):
// bookings.employerId — integer employer profile id (column employer_id)
// bookings.freelancerId — integer freelancer profile id
// booking status completed   = 'completed'
// booking status cancelled   = 'cancelled'
// booking status in_progress = 'active' (schema: pending | active | completed | cancelled — no in_progress)
// booking status pending     = 'pending' (counted in outcomes "other")
// job_requirements.createdAt = EXISTS (column created_at)
// job_requirements.employerId = employer profile id
// job_requirements skills    = EXISTS as requiredSkills (text[] column required_skills)
// agreements.bookingId       = EXISTS (column booking_id, notNull FK to bookings)
// agreements.employerId      = employer profile id
// fully_signed captured via  = status = 'fully_signed' + GREATEST(freelancerSignedAt, employerSignedAt)
// Milestone storage: separate milestones table (documented in earningsIntelligence.ts)
// proposedRate when agreed: holds last proposed rate; nullable; COALESCE to rate/hourlyRate/dailyRate
// GET /api/dashboard/stats — no hiring funnel/lifecycle data; additive only
// normaliseSkills exported from skillsUtils.ts

const BOOKING_COMPLETED_STATUS = "completed";
const BOOKING_CANCELLED_STATUS = "cancelled";
const BOOKING_IN_PROGRESS_STATUS = "active";
const AGREEMENT_FULLY_SIGNED_STATUS = "fully_signed";

const fullySignedAtSql = sql<Date>`GREATEST(${agreementsTable.freelancerSignedAt}, ${agreementsTable.employerSignedAt})`;

export type HiringAnalyticsResponse = {
  funnel: {
    window: AnalyticsWindow;
    jobsPosted: number;
    bookingsCreated: number;
    agreementsSigned: number;
    completed: number;
    conversionRates: {
      jobToBooking: number | null;
      bookingToSigned: number | null;
      signedToCompleted: number | null;
    };
  };
  skillsGap: {
    demand: { skill: string; count: number }[];
    supply: { skill: string; count: number }[];
    gaps: string[];
  };
  retention: {
    repeatRate: number;
    newRate: number;
    totalBookings: number;
    repeatFreelancers: {
      freelancerId: string;
      name: string;
      fieldOfWork: string;
      bookingCount: number;
    }[];
  };
  lifecycle: {
    window: AnalyticsWindow;
    jobToFirstBooking: number | null;
    bookingToSigned: number | null;
    signedToCompleted: number | null;
    totalDuration: number | null;
    trends: {
      jobToFirstBooking: ReturnType<typeof getLifecycleTrend>;
      bookingToSigned: ReturnType<typeof getLifecycleTrend>;
      signedToCompleted: ReturnType<typeof getLifecycleTrend>;
    };
  };
  outcomes: {
    completed: number;
    cancelled: number;
    inProgress: number;
    other: number;
    total: number;
    completedPct: number;
    cancelledPct: number;
    inProgressPct: number;
    otherPct: number;
  };
};

function daysBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
}

function resolveFullySignedAt(
  freelancerSignedAt: Date | null,
  employerSignedAt: Date | null,
): Date | null {
  if (!freelancerSignedAt || !employerSignedAt) return null;
  return freelancerSignedAt > employerSignedAt ? freelancerSignedAt : employerSignedAt;
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function conversionRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

async function countJobsPosted(
  employerProfileId: number,
  start: Date,
  end: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(jobRequirementsTable)
    .where(and(
      eq(jobRequirementsTable.employerId, employerProfileId),
      gte(jobRequirementsTable.createdAt, start),
      lt(jobRequirementsTable.createdAt, end),
    ));
  return Number(row?.count ?? 0);
}

async function countBookingsCreated(
  employerProfileId: number,
  start: Date,
  end: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.employerId, employerProfileId),
      gte(bookingsTable.createdAt, start),
      lt(bookingsTable.createdAt, end),
    ));
  return Number(row?.count ?? 0);
}

async function countAgreementsSigned(
  employerProfileId: number,
  start: Date,
  end: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(agreementsTable)
    .where(and(
      eq(agreementsTable.employerId, employerProfileId),
      eq(agreementsTable.status, AGREEMENT_FULLY_SIGNED_STATUS),
      isNotNull(agreementsTable.freelancerSignedAt),
      isNotNull(agreementsTable.employerSignedAt),
      gte(fullySignedAtSql, start),
      lt(fullySignedAtSql, end),
    ));
  return Number(row?.count ?? 0);
}

async function countCompletedBookings(
  employerProfileId: number,
  start: Date,
  end: Date,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.employerId, employerProfileId),
      eq(bookingsTable.status, BOOKING_COMPLETED_STATUS),
      gte(bookingsTable.updatedAt, start),
      lt(bookingsTable.updatedAt, end),
    ));
  return Number(row?.count ?? 0);
}

async function buildFunnel(
  employerProfileId: number,
  window: AnalyticsWindow,
): Promise<HiringAnalyticsResponse["funnel"]> {
  const { currentStart, currentEnd } = getWindowDates(window);

  const [jobsPosted, bookingsCreated, agreementsSigned, completed] = await Promise.all([
    countJobsPosted(employerProfileId, currentStart, currentEnd),
    countBookingsCreated(employerProfileId, currentStart, currentEnd),
    countAgreementsSigned(employerProfileId, currentStart, currentEnd),
    countCompletedBookings(employerProfileId, currentStart, currentEnd),
  ]);

  return {
    window,
    jobsPosted,
    bookingsCreated,
    agreementsSigned,
    completed,
    conversionRates: {
      jobToBooking: conversionRate(bookingsCreated, jobsPosted),
      bookingToSigned: conversionRate(agreementsSigned, bookingsCreated),
      signedToCompleted: conversionRate(completed, agreementsSigned),
    },
  };
}

async function buildSkillsGap(
  employerProfileId: number,
  window: AnalyticsWindow,
): Promise<HiringAnalyticsResponse["skillsGap"]> {
  const { currentStart, currentEnd } = getWindowDates(window);

  const jobsInWindow = await db
    .select({ skills: jobRequirementsTable.requiredSkills })
    .from(jobRequirementsTable)
    .where(and(
      eq(jobRequirementsTable.employerId, employerProfileId),
      gte(jobRequirementsTable.createdAt, currentStart),
      lt(jobRequirementsTable.createdAt, currentEnd),
    ));

  const demandSkillCounts = new Map<string, number>();
  for (const job of jobsInWindow) {
    for (const skill of normaliseSkills(job.skills)) {
      demandSkillCounts.set(skill, (demandSkillCounts.get(skill) ?? 0) + 1);
    }
  }

  const demand = [...demandSkillCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill, skillCount]) => ({ skill, count: skillCount }));

  const bookedFreelancers = await db
    .select({ skills: freelancerProfilesTable.skills })
    .from(bookingsTable)
    .innerJoin(
      freelancerProfilesTable,
      eq(bookingsTable.freelancerId, freelancerProfilesTable.id),
    )
    .where(eq(bookingsTable.employerId, employerProfileId));

  const supplySkillCounts = new Map<string, number>();
  for (const row of bookedFreelancers) {
    for (const skill of normaliseSkills(row.skills)) {
      supplySkillCounts.set(skill, (supplySkillCounts.get(skill) ?? 0) + 1);
    }
  }

  const supply = [...supplySkillCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill, skillCount]) => ({ skill, count: skillCount }));

  const gaps = demand
    .filter((d) => {
      const s = supplySkillCounts.get(d.skill) ?? 0;
      return s / d.count < 0.3;
    })
    .slice(0, 5)
    .map((d) => d.skill);

  return { demand, supply, gaps };
}

async function buildRetention(
  employerProfileId: number,
): Promise<HiringAnalyticsResponse["retention"]> {
  const bookingsByFreelancer = await db
    .select({
      freelancerId: bookingsTable.freelancerId,
      bookingCount: count(),
    })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.employerId, employerProfileId),
      eq(bookingsTable.status, BOOKING_COMPLETED_STATUS),
    ))
    .groupBy(bookingsTable.freelancerId);

  const totalBookings = bookingsByFreelancer.reduce(
    (sum, row) => sum + Number(row.bookingCount),
    0,
  );
  const totalFreelancers = bookingsByFreelancer.length;

  const repeatRows = bookingsByFreelancer
    .filter((row) => Number(row.bookingCount) > 1)
    .sort((a, b) => Number(b.bookingCount) - Number(a.bookingCount));

  const repeatFreelancerCount = repeatRows.length;
  const repeatRate =
    totalFreelancers > 0
      ? Math.round((repeatFreelancerCount / totalFreelancers) * 100)
      : 0;
  const newRate = 100 - repeatRate;

  const topIds = repeatRows.slice(0, 3).map((r) => r.freelancerId);
  let repeatFreelancers: HiringAnalyticsResponse["retention"]["repeatFreelancers"] = [];

  if (topIds.length > 0) {
    const profiles = await db
      .select({
        id: freelancerProfilesTable.id,
        name: freelancerProfilesTable.name,
        fieldOfWork: freelancerProfilesTable.fieldOfWork,
      })
      .from(freelancerProfilesTable)
      .where(inArray(freelancerProfilesTable.id, topIds));

    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    repeatFreelancers = repeatRows.slice(0, 3).map((row) => {
      const profile = profileMap.get(row.freelancerId);
      return {
        freelancerId: String(row.freelancerId),
        name: profile?.name ?? "Unknown",
        fieldOfWork: profile?.fieldOfWork ?? "",
        bookingCount: Number(row.bookingCount),
      };
    });
  }

  return {
    repeatRate,
    newRate,
    totalBookings,
    repeatFreelancers,
  };
}

async function computeLifecycleDurations(
  employerProfileId: number,
  start: Date,
  end: Date,
): Promise<{
  jobToFirstBooking: number[];
  bookingToSigned: number[];
  signedToCompleted: number[];
}> {
  const completedBookings = await db
    .select({
      bookingId: bookingsTable.id,
      bookingCreatedAt: bookingsTable.createdAt,
      bookingUpdatedAt: bookingsTable.updatedAt,
      jobRequirementId: bookingsTable.jobRequirementId,
    })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.employerId, employerProfileId),
      eq(bookingsTable.status, BOOKING_COMPLETED_STATUS),
      gte(bookingsTable.updatedAt, start),
      lt(bookingsTable.updatedAt, end),
    ));

  if (completedBookings.length === 0) {
    return { jobToFirstBooking: [], bookingToSigned: [], signedToCompleted: [] };
  }

  const bookingIds = completedBookings.map((b) => b.bookingId);
  const jobIds = [
    ...new Set(
      completedBookings
        .map((b) => b.jobRequirementId)
        .filter((id): id is number => id != null),
    ),
  ];

  const agreements = await db
    .select({
      bookingId: agreementsTable.bookingId,
      freelancerSignedAt: agreementsTable.freelancerSignedAt,
      employerSignedAt: agreementsTable.employerSignedAt,
      status: agreementsTable.status,
    })
    .from(agreementsTable)
    .where(and(
      eq(agreementsTable.employerId, employerProfileId),
      inArray(agreementsTable.bookingId, bookingIds),
      eq(agreementsTable.status, AGREEMENT_FULLY_SIGNED_STATUS),
    ));

  const agreementMap = new Map(
    agreements.map((a) => [a.bookingId, a]),
  );

  const jobsMap = new Map<number, Date>();
  if (jobIds.length > 0) {
    const jobs = await db
      .select({
        id: jobRequirementsTable.id,
        createdAt: jobRequirementsTable.createdAt,
      })
      .from(jobRequirementsTable)
      .where(inArray(jobRequirementsTable.id, jobIds));

    for (const job of jobs) {
      jobsMap.set(job.id, job.createdAt);
    }
  }

  const jobToFirstBooking: number[] = [];
  const bookingToSigned: number[] = [];
  const signedToCompleted: number[] = [];

  for (const booking of completedBookings) {
    if (booking.jobRequirementId != null) {
      const jobCreatedAt = jobsMap.get(booking.jobRequirementId);
      if (jobCreatedAt) {
        const days = daysBetween(jobCreatedAt, booking.bookingCreatedAt);
        if (days >= 0) jobToFirstBooking.push(days);
      }
    }

    const agreement = agreementMap.get(booking.bookingId);
    if (agreement) {
      const signedAt = resolveFullySignedAt(
        agreement.freelancerSignedAt,
        agreement.employerSignedAt,
      );
      if (signedAt) {
        const b2s = daysBetween(booking.bookingCreatedAt, signedAt);
        if (b2s >= 0) bookingToSigned.push(b2s);

        const s2c = daysBetween(signedAt, booking.bookingUpdatedAt);
        if (s2c >= 0) signedToCompleted.push(s2c);
      }
    }
  }

  return { jobToFirstBooking, bookingToSigned, signedToCompleted };
}

async function buildLifecycle(
  employerProfileId: number,
  window: AnalyticsWindow,
): Promise<HiringAnalyticsResponse["lifecycle"]> {
  const { currentStart, currentEnd, previousStart, previousEnd } =
    getWindowDates(window);

  const [current, previous] = await Promise.all([
    computeLifecycleDurations(employerProfileId, currentStart, currentEnd),
    computeLifecycleDurations(employerProfileId, previousStart, previousEnd),
  ]);

  const jobToFirstBooking = safeAverage(current.jobToFirstBooking);
  const bookingToSigned = safeAverage(current.bookingToSigned);
  const signedToCompleted = safeAverage(current.signedToCompleted);

  const prevJobToFirstBooking = safeAverage(previous.jobToFirstBooking);
  const prevBookingToSigned = safeAverage(previous.bookingToSigned);
  const prevSignedToCompleted = safeAverage(previous.signedToCompleted);

  let totalDuration: number | null = null;
  if (
    jobToFirstBooking != null &&
    bookingToSigned != null &&
    signedToCompleted != null
  ) {
    totalDuration =
      Math.round((jobToFirstBooking + bookingToSigned + signedToCompleted) * 10) / 10;
  }

  return {
    window,
    jobToFirstBooking,
    bookingToSigned,
    signedToCompleted,
    totalDuration,
    trends: {
      jobToFirstBooking: getLifecycleTrend(jobToFirstBooking, prevJobToFirstBooking),
      bookingToSigned: getLifecycleTrend(bookingToSigned, prevBookingToSigned),
      signedToCompleted: getLifecycleTrend(signedToCompleted, prevSignedToCompleted),
    },
  };
}

async function buildOutcomes(
  employerProfileId: number,
): Promise<HiringAnalyticsResponse["outcomes"]> {
  const rows = await db
    .select({
      status: bookingsTable.status,
      count: count(),
    })
    .from(bookingsTable)
    .where(eq(bookingsTable.employerId, employerProfileId))
    .groupBy(bookingsTable.status);

  const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
  const get = (status: string) =>
    Number(rows.find((row) => row.status === status)?.count ?? 0);

  const completed = get(BOOKING_COMPLETED_STATUS);
  const cancelled = get(BOOKING_CANCELLED_STATUS);
  const inProgress = get(BOOKING_IN_PROGRESS_STATUS);
  // pending and any unknown statuses count toward "other"
  const otherCount = total - completed - cancelled - inProgress;

  return {
    completed,
    cancelled,
    inProgress,
    other: otherCount,
    total,
    completedPct: pct(completed, total),
    cancelledPct: pct(cancelled, total),
    inProgressPct: pct(inProgress, total),
    otherPct: pct(otherCount, total),
  };
}

export async function buildHiringAnalytics(
  employer: EmployerProfile,
  window: AnalyticsWindow,
): Promise<HiringAnalyticsResponse> {
  const [funnel, skillsGap, retention, lifecycle, outcomes] = await Promise.all([
    buildFunnel(employer.id, window),
    buildSkillsGap(employer.id, window),
    buildRetention(employer.id),
    buildLifecycle(employer.id, window),
    buildOutcomes(employer.id),
  ]);

  return {
    funnel,
    skillsGap,
    retention,
    lifecycle,
    outcomes,
  };
}

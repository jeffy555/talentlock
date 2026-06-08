import { db } from "@workspace/db";
import {
  teamMembersTable,
  teamsTable,
  usersTable,
  employerProfilesTable,
  bookingsTable,
  milestonesTable,
  jobRequirementsTable,
  freelancerProfilesTable,
} from "@workspace/db";
import { eq, and, gte, inArray, sum, count, countDistinct, isNotNull } from "drizzle-orm";
import { getWindowDates, type AnalyticsWindow } from "./earningsUtils";

const MILESTONE_APPROVED = "approved";
const JOB_OPEN = "open";

function parseAmount(value: string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type TeamAnalyticsResponse = {
  teamName: string;
  window: AnalyticsWindow;
  totalSpend: number;
  bookingsCreated: number;
  spendByMember: {
    userId: number;
    name: string;
    spend: number;
  }[];
  mostHiredFreelancers: {
    freelancerId: number;
    name: string;
    fieldOfWork: string;
    totalSpend: number;
    bookingCount: number;
  }[];
  openJobsByMember: {
    userId: number;
    name: string;
    openJobCount: number;
  }[];
};

export async function buildTeamAnalytics(
  teamId: string,
  window: AnalyticsWindow,
  currentUserId: number,
): Promise<TeamAnalyticsResponse | null> {
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId)).limit(1);
  if (!team) return null;

  const members = await db.select().from(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.status, "active")));

  const userIds = members
    .map((m) => m.userId)
    .filter((id): id is number => id != null);

  if (userIds.length === 0) {
    return {
      teamName: team.name,
      window,
      totalSpend: 0,
      bookingsCreated: 0,
      spendByMember: [],
      mostHiredFreelancers: [],
      openJobsByMember: [],
    };
  }

  const [users, employers] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds)),
    db.select().from(employerProfilesTable).where(inArray(employerProfilesTable.userId, userIds)),
  ]);

  const nameByUserId = new Map(users.map((u) => [u.id, u.name]));
  const employerByUserId = new Map(employers.map((e) => [e.userId, e.id]));
  const employerProfileIds = employers.map((e) => e.id);

  const { currentStart } = getWindowDates(window);

  if (employerProfileIds.length === 0) {
    return {
      teamName: team.name,
      window,
      totalSpend: 0,
      bookingsCreated: 0,
      spendByMember: userIds.map((id) => ({
        userId: id,
        name: id === currentUserId ? "You" : (nameByUserId.get(id) ?? "Unknown"),
        spend: 0,
      })),
      mostHiredFreelancers: [],
      openJobsByMember: userIds.map((id) => ({
        userId: id,
        name: id === currentUserId ? "You" : (nameByUserId.get(id) ?? "Unknown"),
        openJobCount: 0,
      })),
    };
  }

  const [totalSpendRow, bookingsCountRow, spendByEmployerRows, topFreelancerRows, openJobRows] = await Promise.all([
    db.select({ total: sum(milestonesTable.amount) })
      .from(milestonesTable)
      .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
      .where(and(
        inArray(bookingsTable.employerId, employerProfileIds),
        eq(milestonesTable.status, MILESTONE_APPROVED),
        isNotNull(milestonesTable.approvedAt),
        gte(milestonesTable.approvedAt, currentStart),
      )),

    db.select({ total: count() })
      .from(bookingsTable)
      .where(and(
        inArray(bookingsTable.employerId, employerProfileIds),
        gte(bookingsTable.createdAt, currentStart),
      )),

    db.select({
      employerId: bookingsTable.employerId,
      total: sum(milestonesTable.amount),
    })
      .from(milestonesTable)
      .innerJoin(bookingsTable, eq(milestonesTable.bookingId, bookingsTable.id))
      .where(and(
        inArray(bookingsTable.employerId, employerProfileIds),
        eq(milestonesTable.status, MILESTONE_APPROVED),
        isNotNull(milestonesTable.approvedAt),
        gte(milestonesTable.approvedAt, currentStart),
      ))
      .groupBy(bookingsTable.employerId),

    db.select({
      freelancerId: bookingsTable.freelancerId,
      name: freelancerProfilesTable.name,
      fieldOfWork: freelancerProfilesTable.fieldOfWork,
      totalSpend: sum(milestonesTable.amount),
      bookingCount: countDistinct(bookingsTable.id),
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
          eq(milestonesTable.status, MILESTONE_APPROVED),
          isNotNull(milestonesTable.approvedAt),
          gte(milestonesTable.approvedAt, currentStart),
        ),
      )
      .where(and(
        inArray(bookingsTable.employerId, employerProfileIds),
        gte(bookingsTable.createdAt, currentStart),
      ))
      .groupBy(
        bookingsTable.freelancerId,
        freelancerProfilesTable.name,
        freelancerProfilesTable.fieldOfWork,
      )
      .limit(50),

    db.select({
      employerId: jobRequirementsTable.employerId,
      openJobCount: count(),
    })
      .from(jobRequirementsTable)
      .where(and(
        inArray(jobRequirementsTable.employerId, employerProfileIds),
        eq(jobRequirementsTable.status, JOB_OPEN),
      ))
      .groupBy(jobRequirementsTable.employerId),
  ]);

  const spendByEmployerId = new Map(
    spendByEmployerRows.map((r) => [r.employerId, parseAmount(r.total as string | null)]),
  );
  const openJobsByEmployerId = new Map(
    openJobRows.map((r) => [r.employerId, Number(r.openJobCount ?? 0)]),
  );

  const displayName = (userId: number) =>
    userId === currentUserId ? "You" : (nameByUserId.get(userId) ?? "Unknown");

  const spendByMember = userIds
    .map((userId) => {
      const employerId = employerByUserId.get(userId);
      return {
        userId,
        name: displayName(userId),
        spend: roundMoney(employerId ? (spendByEmployerId.get(employerId) ?? 0) : 0),
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const openJobsByMember = userIds
    .map((userId) => {
      const employerId = employerByUserId.get(userId);
      return {
        userId,
        name: displayName(userId),
        openJobCount: employerId ? (openJobsByEmployerId.get(employerId) ?? 0) : 0,
      };
    })
    .filter((m) => m.openJobCount > 0)
    .sort((a, b) => b.openJobCount - a.openJobCount);

  const mostHiredFreelancers = topFreelancerRows
    .map((r) => ({
      freelancerId: r.freelancerId,
      name: r.name,
      fieldOfWork: r.fieldOfWork,
      totalSpend: roundMoney(parseAmount(r.totalSpend as string | null)),
      bookingCount: Number(r.bookingCount ?? 0),
    }))
    .filter((r) => r.bookingCount > 0)
    .sort((a, b) => b.totalSpend - a.totalSpend || b.bookingCount - a.bookingCount)
    .slice(0, 10);

  return {
    teamName: team.name,
    window,
    totalSpend: roundMoney(parseAmount(totalSpendRow[0]?.total as string | null)),
    bookingsCreated: Number(bookingsCountRow[0]?.total ?? 0),
    spendByMember,
    mostHiredFreelancers,
    openJobsByMember,
  };
}

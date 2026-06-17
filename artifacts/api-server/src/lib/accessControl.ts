/*
 * Pre-implementation inspection (Auth Hardening Task 1.1):
 * - milestones.ts: resolveUser(clerkId) + canAccessBooking via userId → profile userId join
 * - freelancer_profiles / employer_profiles: both have userId + clerkId
 * - conversations.userId: owner column confirmed
 * - agreements.bookingId: links agreement → booking for participant checks
 * - GET /agreements/:id/download: already checks clerkId profile match (participant-gated)
 * - upload URL callers: Profile.tsx + AgreementDetail.tsx only (frontend, authenticated)
 * - getAuth import: @clerk/express (standard across routes)
 */
import { db as defaultDb } from "@workspace/db";
import {
  usersTable,
  bookingsTable,
  agreementsTable,
  conversations,
  meetingsTable,
  jobRequirementsTable,
  freelancerProfilesTable,
  employerProfilesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

type DB = typeof defaultDb;

export type AccessResult =
  | { ok: true }
  | { ok: false; status: 403 | 404 };

export async function resolveUserByClerkId(clerkId: string, db: DB = defaultDb) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return u ?? null;
}

export async function profileIdsForUser(userId: number, db: DB = defaultDb) {
  const [emp] = await db.select({ id: employerProfilesTable.id })
    .from(employerProfilesTable).where(eq(employerProfilesTable.userId, userId)).limit(1);
  const [fl] = await db.select({ id: freelancerProfilesTable.id })
    .from(freelancerProfilesTable).where(eq(freelancerProfilesTable.userId, userId)).limit(1);
  return { employerId: emp?.id ?? null, freelancerId: fl?.id ?? null };
}

export async function canAccessBooking(userId: number, bookingId: number, db: DB = defaultDb): Promise<AccessResult> {
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) return { ok: false, status: 404 };
  const { employerId, freelancerId } = await profileIdsForUser(userId, db);
  const isParticipant =
    (employerId !== null && employerId === booking.employerId) ||
    (freelancerId !== null && freelancerId === booking.freelancerId);
  return isParticipant ? { ok: true } : { ok: false, status: 403 };
}

export async function canAccessMeeting(userId: number, meetingId: number, db: DB = defaultDb): Promise<AccessResult> {
  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, meetingId)).limit(1);
  if (!meeting) return { ok: false, status: 404 };
  const { employerId, freelancerId } = await profileIdsForUser(userId, db);
  const isParticipant =
    (employerId !== null && employerId === meeting.employerId) ||
    (freelancerId !== null && freelancerId === meeting.freelancerId);
  return isParticipant ? { ok: true } : { ok: false, status: 403 };
}

export async function canAccessJobRequirement(userId: number, jobId: number, db: DB = defaultDb): Promise<AccessResult> {
  const [job] = await db.select().from(jobRequirementsTable).where(eq(jobRequirementsTable.id, jobId)).limit(1);
  if (!job) return { ok: false, status: 404 };
  const { employerId } = await profileIdsForUser(userId, db);
  if (employerId !== null && employerId === job.employerId) return { ok: true };
  return { ok: false, status: 403 };
}

export async function canAccessConversation(userId: number, conversationId: number, db: DB = defaultDb): Promise<AccessResult> {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conv) return { ok: false, status: 404 };
  if (conv.userId === userId) return { ok: true };
  return { ok: false, status: 403 };
}

export async function canAccessAgreement(userId: number, agreementId: number, db: DB = defaultDb): Promise<AccessResult> {
  const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, agreementId)).limit(1);
  if (!agreement) return { ok: false, status: 404 };
  return canAccessBooking(userId, agreement.bookingId, db);
}

export async function agreementRoleForUser(
  userId: number,
  agreementId: number,
  db: DB = defaultDb,
): Promise<"employer" | "freelancer" | null> {
  const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, agreementId)).limit(1);
  if (!agreement) return null;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, agreement.bookingId)).limit(1);
  if (!booking) return null;
  const { employerId, freelancerId } = await profileIdsForUser(userId, db);
  if (employerId !== null && employerId === booking.employerId) return "employer";
  if (freelancerId !== null && freelancerId === booking.freelancerId) return "freelancer";
  return null;
}

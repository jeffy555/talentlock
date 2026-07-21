import { db } from "@workspace/db";
import { notificationsTable, freelancerProfilesTable, employerProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const NotificationType = {
  BOOKING_CREATED: "booking_created",
  BOOKING_STATUS_CHANGED: "booking_status_changed",
  RATE_COUNTER_PROPOSED: "rate_counter_proposed",
  RATE_AGREED: "rate_agreed",
  AGREEMENT_READY: "agreement_ready",
  AGREEMENT_SIGNED: "agreement_signed",
  AGREEMENT_FULLY_SIGNED: "agreement_fully_signed",
  MEETING_REQUESTED: "meeting_requested",
  MEETING_STATUS_CHANGED: "meeting_status_changed",
  MILESTONE_COMPLETED: "milestone_completed",
  MILESTONE_APPROVED: "milestone_approved",
  REVIEW_RECEIVED: "review_received",
  REVIEW_REPLIED: "review_replied",
  DOCUMENT_VERIFIED: "document_verified",
  DOCUMENT_REJECTED: "document_rejected",
  JOB_INTEREST: "job_interest",
  CRUISE_MODE_INTEREST: "cruise_mode_interest",
  CRUISE_MODE_SENT: "cruise_mode_sent",
  CRUISE_MODE_DAILY_LIMIT: "cruise_mode_daily_limit",
  TALENT_SEARCH_INTEREST: "talent_search_interest",
  TALENT_SEARCH_SENT: "talent_search_sent",
  MEETING_BRIEF_READY: "meeting_brief_ready",
  NEW_MESSAGE: "new_message",
  CREDENTIAL_EXPIRING: "credential_expiring",
  WATCHLIST_UPDATE: "watchlist_update",
} as const;

type DbLike = Pick<typeof db, "insert">;

/**
 * IMPORTANT: Never await this function from route handlers.
 * Always use: createNotification(...).catch(err => req.log.warn(err, 'notification write failed'))
 * A failed notification must never block the primary action.
 */
export async function createNotification(
  dbOrTx: DbLike,
  params: {
    userId: number;
    type: string;
    entityType: string;
    entityId: string | number;
    message: string;
  },
): Promise<void> {
  await dbOrTx.insert(notificationsTable).values({
    userId: params.userId,
    type: params.type,
    entityType: params.entityType,
    entityId: String(params.entityId),
    message: params.message,
    read: false,
  });
}

export async function userIdFromFreelancerProfileId(profileId: number): Promise<number | null> {
  const [row] = await db
    .select({ userId: freelancerProfilesTable.userId })
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.id, profileId))
    .limit(1);
  return row?.userId ?? null;
}

export async function userIdFromEmployerProfileId(profileId: number): Promise<number | null> {
  const [row] = await db
    .select({ userId: employerProfilesTable.userId })
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.id, profileId))
    .limit(1);
  return row?.userId ?? null;
}

export async function freelancerNameForProfile(profileId: number): Promise<string> {
  const [row] = await db
    .select({ name: freelancerProfilesTable.name })
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.id, profileId))
    .limit(1);
  return row?.name ?? "the freelancer";
}

export async function employerCompanyForProfile(profileId: number): Promise<string> {
  const [row] = await db
    .select({ name: employerProfilesTable.companyName })
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.id, profileId))
    .limit(1);
  return row?.name ?? "An employer";
}

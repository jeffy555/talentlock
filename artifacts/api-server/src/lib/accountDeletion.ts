// Security Hardening Phase 5 — GDPR account deletion (plan Q7/Q8).
// Bookings use profile IDs; token_usage/notifications use users.id; documents/blocks use freelancer_profiles.id.

import { createClerkClient } from "@clerk/express";
import {
  db,
  usersTable,
  freelancerProfilesTable,
  employerProfilesTable,
  bookingsTable,
  notificationsTable,
  documentsTable,
  availabilityBlocksTable,
  accountDeletionRequestsTable,
  tokenUsage,
} from "@workspace/db";
import { and, eq, inArray, or, SQL } from "drizzle-orm";
import { deleteCachedAgreementPdfsForUser } from "./agreementPdfCache";

type DB = typeof db;

export const BOOKING_ACTIVE_STATUSES = ["active"] as const;

const DELETED_NAME = "Deleted User";

export async function countActiveBookingsForUser(
  dbConn: DB,
  userId: number,
): Promise<number> {
  const [freelancer] = await dbConn
    .select({ id: freelancerProfilesTable.id })
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.userId, userId))
    .limit(1);
  const [employer] = await dbConn
    .select({ id: employerProfilesTable.id })
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.userId, userId))
    .limit(1);

  const partyConditions: SQL[] = [];
  if (freelancer) partyConditions.push(eq(bookingsTable.freelancerId, freelancer.id));
  if (employer) partyConditions.push(eq(bookingsTable.employerId, employer.id));
  if (partyConditions.length === 0) return 0;

  const rows = await dbConn
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(and(or(...partyConditions), inArray(bookingsTable.status, [...BOOKING_ACTIVE_STATUSES])));
  return rows.length;
}

export async function findOpenDeletionRequest(dbConn: DB, userId: number) {
  const [row] = await dbConn
    .select()
    .from(accountDeletionRequestsTable)
    .where(
      and(
        eq(accountDeletionRequestsTable.userId, userId),
        inArray(accountDeletionRequestsTable.status, ["pending", "processing"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function anonymiseUserData(
  dbConn: DB,
  userId: number,
  deletionRequestId: number,
): Promise<void> {
  const [freelancer] = await dbConn
    .select({ id: freelancerProfilesTable.id })
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.userId, userId))
    .limit(1);
  const [employer] = await dbConn
    .select({ id: employerProfilesTable.id })
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.userId, userId))
    .limit(1);

  await dbConn.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({
        name: DELETED_NAME,
        email: `deleted-user-${userId}@deleted.talentlock`,
        avatarUrl: null,
        signatureImageUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    if (freelancer) {
      await tx
        .update(freelancerProfilesTable)
        .set({
          name: DELETED_NAME,
          bio: null,
          portfolioUrl: null,
          resumeUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(freelancerProfilesTable.id, freelancer.id));

      await tx.delete(documentsTable).where(eq(documentsTable.freelancerId, freelancer.id));
      await tx
        .delete(availabilityBlocksTable)
        .where(eq(availabilityBlocksTable.freelancerId, freelancer.id));
    }

    if (employer) {
      await tx
        .update(employerProfilesTable)
        .set({
          companyName: DELETED_NAME,
          description: null,
          updatedAt: new Date(),
        })
        .where(eq(employerProfilesTable.id, employer.id));
    }

    await tx.delete(notificationsTable).where(eq(notificationsTable.userId, userId));
    await tx.delete(tokenUsage).where(eq(tokenUsage.userId, userId));

    await tx
      .update(accountDeletionRequestsTable)
      .set({ status: "processing", processedAt: new Date(), rejectionReason: null })
      .where(eq(accountDeletionRequestsTable.id, deletionRequestId));
  });

  await deleteCachedAgreementPdfsForUser(dbConn, userId).catch(() => {
    // Best-effort — cached PDF removal must not block anonymisation
  });
}

export async function deleteClerkUser(clerkId: string): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY not configured");
  const clerkClient = createClerkClient({ secretKey });
  await clerkClient.users.deleteUser(clerkId);
}

export async function markDeletionComplete(dbConn: DB, userId: number): Promise<void> {
  await dbConn
    .update(accountDeletionRequestsTable)
    .set({ status: "complete", processedAt: new Date(), rejectionReason: null })
    .where(eq(accountDeletionRequestsTable.userId, userId));
}

export async function markDeletionClerkFailed(dbConn: DB, userId: number): Promise<void> {
  await dbConn
    .update(accountDeletionRequestsTable)
    .set({
      status: "pending",
      rejectionReason: "Clerk deletion failed — retry required",
    })
    .where(eq(accountDeletionRequestsTable.userId, userId));
}

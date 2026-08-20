import { and, eq } from "drizzle-orm";

import {
  documentsTable,
  freelancerProfilesTable,
  documentStatusToAadhaarVerificationStatus,
  maskRegistrationNumber,
} from "@workspace/db";

type DbClient = Pick<typeof import("@workspace/db").db, "select" | "update">;

export async function syncAadhaarVerificationStatus(
  dbOrTx: DbClient,
  freelancerId: number,
): Promise<void> {
  const [aadhaarDoc] = await dbOrTx
    .select({ status: documentsTable.status })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.freelancerId, freelancerId),
        eq(documentsTable.documentType, "aadhaar"),
      ),
    )
    .limit(1);

  const aadhaarVerificationStatus = documentStatusToAadhaarVerificationStatus(
    aadhaarDoc?.status,
  );

  await dbOrTx
    .update(freelancerProfilesTable)
    .set({ aadhaarVerificationStatus, updatedAt: new Date() })
    .where(eq(freelancerProfilesTable.id, freelancerId));
}

export function mapFreelancerProfileForApi(
  p: typeof freelancerProfilesTable.$inferSelect,
  options?: { maskRegistration?: boolean },
) {
  const { aadhaarLastFour: _omit, ...rest } = p;
  const mask = options?.maskRegistration ?? true;
  return {
    ...rest,
    hourlyRate: p.hourlyRate ? parseFloat(p.hourlyRate) : null,
    dailyRate: p.dailyRate ? parseFloat(p.dailyRate) : null,
    averageRating: p.averageRating ? parseFloat(p.averageRating) : null,
    reviewCount: p.reviewCount ?? 0,
    completenessScore: p.completenessScore ?? 0,
    nextAvailableDate: p.nextAvailableDate ?? null,
    registrationNumber: mask
      ? maskRegistrationNumber(p.registrationNumber)
      : p.registrationNumber,
  };
}

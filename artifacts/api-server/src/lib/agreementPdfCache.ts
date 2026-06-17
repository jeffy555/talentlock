import {
  agreementsTable,
  employerProfilesTable,
  freelancerProfilesTable,
} from "@workspace/db";
import type { db } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";

type DB = typeof db;

function cacheKeyForAgreement(agreementId: number): string {
  return `agreements/${agreementId}/signed-agreement.pdf`;
}

export async function readCachedAgreementPdf(agreementId: number): Promise<Buffer | null> {
  const objectStorageService = new ObjectStorageService();
  return objectStorageService.readPrivateObjectBuffer(cacheKeyForAgreement(agreementId));
}

export async function writeCachedAgreementPdf(
  agreementId: number,
  pdfBuffer: Buffer,
): Promise<void> {
  const objectStorageService = new ObjectStorageService();
  await objectStorageService.writePrivateObjectBuffer(
    cacheKeyForAgreement(agreementId),
    pdfBuffer,
    "application/pdf",
  );
}

export async function deleteCachedAgreementPdfsForUser(
  dbConn: DB,
  userId: number,
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

  const partyConditions = [];
  if (freelancer) partyConditions.push(eq(agreementsTable.freelancerId, freelancer.id));
  if (employer) partyConditions.push(eq(agreementsTable.employerId, employer.id));
  if (partyConditions.length === 0) return;

  const agreements = await dbConn
    .select({ id: agreementsTable.id })
    .from(agreementsTable)
    .where(or(...partyConditions));

  const objectStorageService = new ObjectStorageService();
  await Promise.allSettled(
    agreements.map((agr) =>
      objectStorageService.deletePrivateObject(cacheKeyForAgreement(agr.id)),
    ),
  );
}

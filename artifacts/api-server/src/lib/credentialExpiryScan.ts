/**
 * Credential Expiry Tracking — daily scan pipeline.
 * Triggered by POST /api/cron/credential-expiry (see routes/cron.ts).
 * Scans two independent expiry sources and advances each credential's alert
 * stage (never re-fires an already-reached stage; safely catches up if a
 * day was missed). See spec/credential-expiry-tracking/plan.md D3.
 */
import type { Logger } from "pino";
import { and, eq, isNotNull, ne } from "drizzle-orm";

import { db, documentsTable, freelancerProfilesTable } from "@workspace/db";

import { updateVerificationLevel } from "./documentReview";
import { createNotification, NotificationType, userIdFromFreelancerProfileId } from "./createNotification";
import { sendNotificationEmailAsync } from "./emailService";
import {
  alertCopyForStage,
  daysUntil,
  stageAdvanced,
  targetStageForDaysRemaining,
} from "./credentialExpiryUtils";

export interface CredentialExpiryScanResult {
  documentsScanned: number;
  documentAlertsSent: number;
  documentsExpired: number;
  licencesScanned: number;
  licenceAlertsSent: number;
}

export async function runCredentialExpiryScan(log: Logger): Promise<CredentialExpiryScanResult> {
  const now = new Date();
  const result: CredentialExpiryScanResult = {
    documentsScanned: 0,
    documentAlertsSent: 0,
    documentsExpired: 0,
    licencesScanned: 0,
    licenceAlertsSent: 0,
  };

  const docs = await db
    .select()
    .from(documentsTable)
    .where(and(isNotNull(documentsTable.expiryDate), ne(documentsTable.expiryAlertStage, "expired")));

  for (const doc of docs) {
    if (!doc.expiryDate) continue;
    result.documentsScanned += 1;

    const remaining = daysUntil(doc.expiryDate, now);
    const target = targetStageForDaysRemaining(remaining);
    if (!stageAdvanced(doc.expiryAlertStage, target)) continue;

    const shouldFlipStatus = target === "expired" && doc.status === "verified";

    await db
      .update(documentsTable)
      .set({
        expiryAlertStage: target,
        status: shouldFlipStatus ? "expired" : doc.status,
        updatedAt: now,
      })
      .where(eq(documentsTable.id, doc.id));

    if (shouldFlipStatus) {
      await updateVerificationLevel(db, doc.freelancerId);
      result.documentsExpired += 1;
    }

    const copy = alertCopyForStage(target, "Your professional credential", remaining);
    if (copy) {
      const userId = await userIdFromFreelancerProfileId(doc.freelancerId);
      if (userId) {
        if (copy.inApp) {
          createNotification(db, {
            userId,
            type: NotificationType.CREDENTIAL_EXPIRING,
            entityType: "document",
            entityId: doc.id,
            message: copy.message,
          }).catch((err) => log.warn({ err, documentId: doc.id }, "credential expiry notification failed"));
        }
        if (copy.email) {
          sendNotificationEmailAsync(db, userId, copy.subject, copy.message, "/profile", log);
        }
        result.documentAlertsSent += 1;
      }
    }
  }

  const freelancers = await db
    .select()
    .from(freelancerProfilesTable)
    .where(
      and(
        isNotNull(freelancerProfilesTable.teachingLicenceExpiry),
        ne(freelancerProfilesTable.teachingLicenceAlertStage, "expired"),
      ),
    );

  for (const fp of freelancers) {
    if (!fp.teachingLicenceExpiry) continue;
    result.licencesScanned += 1;

    const remaining = daysUntil(fp.teachingLicenceExpiry, now);
    const target = targetStageForDaysRemaining(remaining);
    if (!stageAdvanced(fp.teachingLicenceAlertStage, target)) continue;

    await db
      .update(freelancerProfilesTable)
      .set({ teachingLicenceAlertStage: target, updatedAt: now })
      .where(eq(freelancerProfilesTable.id, fp.id));

    const copy = alertCopyForStage(target, "Your teaching licence", remaining);
    if (copy) {
      createNotification(db, {
        userId: fp.userId,
        type: NotificationType.CREDENTIAL_EXPIRING,
        entityType: "freelancer_profile",
        entityId: fp.id,
        message: copy.message,
      }).catch((err) => log.warn({ err, freelancerId: fp.id }, "licence expiry notification failed"));
      sendNotificationEmailAsync(db, fp.userId, copy.subject, copy.message, "/profile", log);
      result.licenceAlertsSent += 1;
    }
  }

  return result;
}

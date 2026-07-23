import type { db as database } from "@workspace/db";
import { NotificationType } from "./createNotification";
import { findOrCreateConversation, sendHumanMessage } from "./conversationsUtils";
import { sanitiseText } from "./sanitise";

type DB = typeof database;
type Log = { warn: (obj: object, message: string) => void; error?: (obj: object, message: string) => void };

export type OutreachSource = "cruise_mode" | "talent_search";

export async function sendAutomatedOutreachMessage(
  db: DB,
  params: {
    source: OutreachSource;
    employerId: number;
    freelancerId: number;
    senderRole: "employer" | "freelancer";
    senderUserId: number;
    senderProfileId: number;
    recipientUserId: number;
    content: string;
    notificationMessage: string;
    senderDisplayName: string;
  },
  log: Log,
): Promise<{ conversationId: number; messageId: number }> {
  const content = sanitiseText(params.content).trim().slice(0, 2000);
  if (!content) {
    throw new Error("OUTREACH_MESSAGE_EMPTY");
  }

  const { conversationId } = await findOrCreateConversation(db, {
    employerId: params.employerId,
    freelancerId: params.freelancerId,
    initiatorUserId: params.senderUserId,
  });

  const notificationType =
    params.source === "cruise_mode"
      ? NotificationType.CRUISE_MODE_INTEREST
      : NotificationType.TALENT_SEARCH_INTEREST;

  const saved = await sendHumanMessage(
    db,
    {
      conversationId,
      senderUserId: params.senderUserId,
      senderProfileId: params.senderProfileId,
      senderRole: params.senderRole,
      content,
    },
    log,
    {
      notificationOverride: {
        type: notificationType,
        entityType: "conversation",
        entityId: conversationId,
        message: params.notificationMessage,
      },
      emailSubject:
        params.source === "cruise_mode"
          ? `${params.senderDisplayName} expressed interest via Cruise Mode`
          : `${params.senderDisplayName} expressed interest via TalentSearch`,
      emailPath: `/messages/${conversationId}`,
    },
  );

  return { conversationId, messageId: saved.id };
}

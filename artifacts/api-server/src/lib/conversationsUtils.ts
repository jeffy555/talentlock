import { and, count, desc, eq, gte, isNull, ne, or } from "drizzle-orm";
import {
  conversations,
  employerProfilesTable,
  freelancerProfilesTable,
  messages,
  usersTable,
  type db as database,
} from "@workspace/db";
import { createNotification, NotificationType } from "./createNotification";
import { sendNotificationEmailAsync } from "./emailService";
import { sanitiseText } from "./sanitise";

type DB = typeof database;
type Log = { warn: (obj: object, message: string) => void };
type HumanRole = "employer" | "freelancer";

export type SendHumanMessageOptions = {
  notificationOverride?: {
    type: string;
    entityType: string;
    entityId: number | string;
    message: string;
  };
  emailSubject?: string;
  emailPath?: string;
};

export async function findOrCreateConversation(
  db: DB,
  params: {
    employerId: number;
    freelancerId: number;
    bookingId?: number | null;
    meetingId?: number | null;
    initiatorUserId: number;
  },
) {
  const scope = params.bookingId == null
    ? isNull(conversations.bookingId)
    : eq(conversations.bookingId, params.bookingId);
  const where = and(
    eq(conversations.type, "human_direct"),
    eq(conversations.employerId, params.employerId),
    eq(conversations.freelancerId, params.freelancerId),
    scope,
  );
  const [existing] = await db.select({ id: conversations.id }).from(conversations).where(where).limit(1);
  if (existing) return { conversationId: existing.id, isNew: false };

  const [created] = await db.insert(conversations).values({
    title: "Direct conversation",
    userId: params.initiatorUserId,
    type: "human_direct",
    employerId: params.employerId,
    freelancerId: params.freelancerId,
    bookingId: params.bookingId ?? null,
    meetingId: params.meetingId ?? null,
  }).onConflictDoNothing().returning({ id: conversations.id });
  if (created) return { conversationId: created.id, isNew: true };

  const [raced] = await db.select({ id: conversations.id }).from(conversations).where(where).limit(1);
  if (!raced) throw new Error("Conversation creation race did not resolve");
  return { conversationId: raced.id, isNew: false };
}

export async function sendHumanMessage(
  db: DB,
  params: {
    conversationId: number;
    senderUserId: number;
    senderProfileId: number;
    senderRole: HumanRole;
    content: string;
  },
  log: Log,
  options?: SendHumanMessageOptions,
) {
  const [conversation] = await db.select().from(conversations)
    .where(eq(conversations.id, params.conversationId)).limit(1);
  if (!conversation || conversation.type !== "human_direct") {
    const error = new Error("INVALID_CONVERSATION_TYPE");
    (error as Error & { status?: number }).status = 422;
    throw error;
  }
  const participant = params.senderRole === "employer"
    ? conversation.employerId === params.senderProfileId
    : conversation.freelancerId === params.senderProfileId;
  if (!participant) {
    const error = new Error("NOT_A_PARTICIPANT");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }

  const [rate] = await db.select({ total: count() }).from(messages).where(and(
    eq(messages.conversationId, params.conversationId),
    eq(messages.senderId, params.senderUserId),
    gte(messages.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
    or(eq(messages.role, "human_employer"), eq(messages.role, "human_freelancer")),
  ));
  if (Number(rate?.total ?? 0) >= 30) {
    const error = new Error("MESSAGE_RATE_LIMIT");
    (error as Error & { status?: number }).status = 429;
    throw error;
  }

  const content = sanitiseText(params.content).slice(0, 2000);
  if (!content) {
    const error = new Error("MESSAGE_EMPTY");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  const [saved] = await db.insert(messages).values({
    conversationId: params.conversationId,
    senderId: params.senderUserId,
    role: params.senderRole === "employer" ? "human_employer" : "human_freelancer",
    content,
  }).returning();
  await db.update(conversations).set({ lastMessageAt: saved.createdAt })
    .where(eq(conversations.id, params.conversationId));

  const recipientProfileId = params.senderRole === "employer"
    ? conversation.freelancerId : conversation.employerId;
  if (recipientProfileId == null) return saved;
  const profileTable = params.senderRole === "employer" ? freelancerProfilesTable : employerProfilesTable;
  const profileIdColumn = params.senderRole === "employer" ? freelancerProfilesTable.id : employerProfilesTable.id;
  const [recipient] = await db.select({ userId: params.senderRole === "employer"
    ? freelancerProfilesTable.userId : employerProfilesTable.userId })
    .from(profileTable).where(eq(profileIdColumn, recipientProfileId)).limit(1);
  const [sender] = await db.select({ name: usersTable.name }).from(usersTable)
    .where(eq(usersTable.id, params.senderUserId)).limit(1);
  if (!recipient?.userId) return saved;

  const senderName = sender?.name || "Someone";
  const notifType = options?.notificationOverride?.type ?? NotificationType.NEW_MESSAGE;
  const notifEntityType = options?.notificationOverride?.entityType ?? "conversation";
  const notifEntityId = options?.notificationOverride?.entityId ?? params.conversationId;
  const notifMessage = options?.notificationOverride?.message
    ?? `New message from ${senderName}: ${content.slice(0, 100)}${content.length > 100 ? "..." : ""}`;

  createNotification(db, {
    userId: recipient.userId,
    type: notifType,
    entityType: notifEntityType,
    entityId: notifEntityId,
    message: notifMessage,
  }).catch((err) => log.warn({ err, conversationId: params.conversationId }, "message notification failed"));

  if (!await shouldSuppressEmail(db, params.conversationId, params.senderUserId)) {
    const emailPath = options?.emailPath ?? `/messages/${params.conversationId}`;
    const emailSubject = options?.emailSubject ?? `New message from ${senderName} on TalentLock`;
    sendNotificationEmailAsync(
      db,
      recipient.userId,
      emailSubject,
      `${senderName} sent you a message: "${content.slice(0, 200)}${content.length > 200 ? "..." : ""}"`,
      emailPath,
      log,
    );
  }
  return saved;
}

export async function shouldSuppressEmail(db: DB, conversationId: number, senderUserId: number) {
  const [recent] = await db.select({ id: messages.id }).from(messages).where(and(
    eq(messages.conversationId, conversationId),
    ne(messages.senderId, senderUserId),
    or(eq(messages.role, "human_employer"), eq(messages.role, "human_freelancer")),
    gte(messages.readAt, new Date(Date.now() - 5 * 60 * 1000)),
  )).orderBy(desc(messages.readAt)).limit(1);
  return Boolean(recent);
}

export async function markConversationRead(db: DB, conversationId: number, readerUserId: number) {
  const where = and(
    eq(messages.conversationId, conversationId),
    ne(messages.senderId, readerUserId),
    isNull(messages.readAt),
    or(eq(messages.role, "human_employer"), eq(messages.role, "human_freelancer")),
  );
  const unread = await db.select({ id: messages.id }).from(messages).where(where);
  if (unread.length) await db.update(messages).set({ readAt: new Date() }).where(where);
  return unread.length;
}

export async function getUnreadConversationCount(
  db: DB,
  userId: number,
  profileIds: { employerId: number | null; freelancerId: number | null },
) {
  const participant = [];
  if (profileIds.employerId != null) participant.push(eq(conversations.employerId, profileIds.employerId));
  if (profileIds.freelancerId != null) participant.push(eq(conversations.freelancerId, profileIds.freelancerId));
  if (!participant.length) return 0;
  const rows = await db.select({ conversationId: messages.conversationId }).from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(
      or(...participant),
      eq(conversations.type, "human_direct"),
      ne(messages.senderId, userId),
      isNull(messages.readAt),
      or(eq(messages.role, "human_employer"), eq(messages.role, "human_freelancer")),
    )).groupBy(messages.conversationId);
  return rows.length;
}

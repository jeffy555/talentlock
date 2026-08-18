import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, ne, or, sql, SQL } from "drizzle-orm";
import {
  conversations,
  employerProfilesTable,
  freelancerProfilesTable,
  messages,
  meetingsTable,
  bookingsTable,
  jobRequirementsTable,
  usersTable,
  db,
} from "@workspace/db";
import { GetConversationsDirectQueryParams } from "@workspace/api-zod";
import { parsePagination, paginatedResponse } from "../lib/paginationUtils";
import { sanitiseIlikeQuery } from "../lib/searchUtils";
import {
  findOrCreateConversation,
  getUnreadConversationCount,
  markConversationRead,
  sendHumanMessage,
} from "../lib/conversationsUtils";
import { profileIdsForUser, resolveUserByClerkId } from "../lib/accessControl";

const router = Router();
const humanMessageWhere = or(eq(messages.role, "human_employer"), eq(messages.role, "human_freelancer"));

function numberParam(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function currentUser(req: Request) {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) return null;
  return resolveUserByClerkId(clerkId);
}

async function conversationAccess(conversationId: number, userId: number) {
  const [conversation] = await db.select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation) return { conversation: null, status: 404 as const };
  const profiles = await profileIdsForUser(userId);
  const participant =
    (profiles.employerId != null && profiles.employerId === conversation.employerId) ||
    (profiles.freelancerId != null && profiles.freelancerId === conversation.freelancerId);
  return participant
    ? { conversation, status: null }
    : { conversation: null, status: 403 as const };
}

router.post("/conversations/direct", async (req, res) => {
  const user = await currentUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const profiles = await profileIdsForUser(user.id);
  const bodyEmployerId = numberParam(req.body?.employerId);
  const bodyFreelancerId = numberParam(req.body?.freelancerId);
  const bookingId = req.body?.bookingId == null ? null : numberParam(req.body.bookingId);
  const meetingId = req.body?.meetingId == null ? null : numberParam(req.body.meetingId);
  if ((req.body?.bookingId != null && bookingId == null) || (req.body?.meetingId != null && meetingId == null)) {
    res.status(400).json({ error: "Invalid bookingId or meetingId" });
    return;
  }

  let employerId: number | null = null;
  let freelancerId: number | null = null;

  try {
    // Prefer resolving both parties from meeting/booking so clients can pass only the scope id.
    if (meetingId != null) {
      const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, meetingId)).limit(1);
      if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
      const isEmployerParty = profiles.employerId === meeting.employerId;
      const isFreelancerParty = profiles.freelancerId === meeting.freelancerId;
      if (!isEmployerParty && !isFreelancerParty) {
        res.status(403).json({ error: "Meeting is not scoped to both participants" });
        return;
      }
      employerId = meeting.employerId;
      freelancerId = meeting.freelancerId;
    } else if (bookingId != null) {
      const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
      if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
      const isEmployerParty = profiles.employerId === booking.employerId;
      const isFreelancerParty = profiles.freelancerId === booking.freelancerId;
      if (!isEmployerParty && !isFreelancerParty) {
        res.status(403).json({ error: "Booking is not scoped to both participants" });
        return;
      }
      employerId = booking.employerId;
      freelancerId = booking.freelancerId;
    } else {
      employerId = profiles.employerId;
      freelancerId = profiles.freelancerId;
      if (employerId != null) freelancerId = bodyFreelancerId;
      else if (freelancerId != null) employerId = bodyEmployerId;
      else {
        res.status(403).json({ error: "No employer or freelancer profile found" });
        return;
      }
    }

    if (employerId == null || freelancerId == null) {
      res.status(400).json({ error: "Both conversation participants are required" });
      return;
    }
    const resolvedEmployerId = employerId;
    const resolvedFreelancerId = freelancerId;

    const [freelancer] = await db.select({ id: freelancerProfilesTable.id })
      .from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, resolvedFreelancerId)).limit(1);
    const [employer] = await db.select({ id: employerProfilesTable.id })
      .from(employerProfilesTable).where(eq(employerProfilesTable.id, resolvedEmployerId)).limit(1);
    if (!freelancer || !employer) { res.status(404).json({ error: "Conversation participant not found" }); return; }

    const result = await findOrCreateConversation(db, {
      employerId: resolvedEmployerId,
      freelancerId: resolvedFreelancerId,
      bookingId,
      meetingId,
      initiatorUserId: user.id,
    });
    res.status(result.isNew ? 201 : 200).json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to create direct conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations/direct", async (req, res) => {
  const user = await currentUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = GetConversationsDirectQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const profiles = await profileIdsForUser(user.id);
  const participant: SQL[] = [];
  if (profiles.employerId != null) participant.push(eq(conversations.employerId, profiles.employerId));
  if (profiles.freelancerId != null) participant.push(eq(conversations.freelancerId, profiles.freelancerId));

  const conditions: SQL[] = [
    eq(conversations.type, "human_direct"),
  ];
  if (participant.length) {
    conditions.push(or(...participant)!);
  }

  const searchPattern = parsed.data.q ? sanitiseIlikeQuery(parsed.data.q) : null;
  if (searchPattern) {
    const nameFilters: SQL[] = [];
    if (profiles.employerId != null) {
      nameFilters.push(and(
        eq(conversations.employerId, profiles.employerId),
        exists(
          db.select({ id: freelancerProfilesTable.id })
            .from(freelancerProfilesTable)
            .where(and(
              eq(freelancerProfilesTable.id, conversations.freelancerId),
              ilike(freelancerProfilesTable.name, searchPattern),
            )),
        ),
      )!);
    }
    if (profiles.freelancerId != null) {
      nameFilters.push(and(
        eq(conversations.freelancerId, profiles.freelancerId),
        exists(
          db.select({ id: employerProfilesTable.id })
            .from(employerProfilesTable)
            .where(and(
              eq(employerProfilesTable.id, conversations.employerId),
              ilike(employerProfilesTable.companyName, searchPattern),
            )),
        ),
      )!);
    }
    if (nameFilters.length) {
      conditions.push(or(...nameFilters)!);
    }
  }

  if (parsed.data.unread === true) {
    conditions.push(exists(
      db.select({ id: messages.id })
        .from(messages)
        .where(and(
          eq(messages.conversationId, conversations.id),
          humanMessageWhere,
          isNull(messages.readAt),
          ne(messages.senderId, user.id),
        )),
    ));
  }

  const where = and(...conditions);
  const { page, pageSize, offset } = parsePagination(parsed.data);

  try {
    const [rows, totalResult] = await Promise.all([
      db.select().from(conversations).where(where).orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(conversations).where(where),
    ]);

    if (rows.length === 0) {
      res.json(paginatedResponse([], Number(totalResult[0]?.total ?? 0), page, pageSize));
      return;
    }

    const conversationIds = rows.map((r) => r.id);
    const freelancerIds = [...new Set(rows.map((r) => r.freelancerId).filter((id): id is number => id != null))];
    const employerIds = [...new Set(rows.map((r) => r.employerId).filter((id): id is number => id != null))];
    const bookingIds = [...new Set(rows.map((r) => r.bookingId).filter((id): id is number => id != null))];
    const meetingIds = [...new Set(rows.map((r) => r.meetingId).filter((id): id is number => id != null))];

    const [
      freelancerParties,
      employerParties,
      lastMessageRows,
      unreadRows,
      bookingRows,
      meetingRows,
    ] = await Promise.all([
      freelancerIds.length
        ? db
          .select({
            id: freelancerProfilesTable.id,
            name: freelancerProfilesTable.name,
            avatarUrl: usersTable.avatarUrl,
            userId: freelancerProfilesTable.userId,
          })
          .from(freelancerProfilesTable)
          .innerJoin(usersTable, eq(freelancerProfilesTable.userId, usersTable.id))
          .where(inArray(freelancerProfilesTable.id, freelancerIds))
        : Promise.resolve([]),
      employerIds.length
        ? db
          .select({
            id: employerProfilesTable.id,
            name: employerProfilesTable.companyName,
            avatarUrl: usersTable.avatarUrl,
            userId: employerProfilesTable.userId,
          })
          .from(employerProfilesTable)
          .innerJoin(usersTable, eq(employerProfilesTable.userId, usersTable.id))
          .where(inArray(employerProfilesTable.id, employerIds))
        : Promise.resolve([]),
      db.execute<{ conversation_id: number; content: string; created_at: Date }>(sql`
        SELECT DISTINCT ON (conversation_id)
          conversation_id,
          content,
          created_at
        FROM messages
        WHERE conversation_id IN (${sql.join(conversationIds.map((id) => sql`${id}`), sql`, `)})
          AND role IN ('human_employer', 'human_freelancer')
        ORDER BY conversation_id, created_at DESC
      `),
      db
        .select({
          conversationId: messages.conversationId,
          total: count(),
        })
        .from(messages)
        .where(and(
          inArray(messages.conversationId, conversationIds),
          humanMessageWhere,
          isNull(messages.readAt),
          ne(messages.senderId, user.id),
        ))
        .groupBy(messages.conversationId),
      bookingIds.length
        ? db
          .select({
            id: bookingsTable.id,
            jobRequirementId: bookingsTable.jobRequirementId,
          })
          .from(bookingsTable)
          .where(inArray(bookingsTable.id, bookingIds))
        : Promise.resolve([]),
      meetingIds.length
        ? db
          .select({ id: meetingsTable.id, title: meetingsTable.title })
          .from(meetingsTable)
          .where(inArray(meetingsTable.id, meetingIds))
        : Promise.resolve([]),
    ]);

    const jobIds = [
      ...new Set(
        bookingRows
          .map((b) => b.jobRequirementId)
          .filter((id): id is number => id != null),
      ),
    ];
    const jobRows = jobIds.length
      ? await db
        .select({ id: jobRequirementsTable.id, title: jobRequirementsTable.title })
        .from(jobRequirementsTable)
        .where(inArray(jobRequirementsTable.id, jobIds))
      : [];

    const freelancerById = new Map(freelancerParties.map((p) => [p.id, p]));
    const employerById = new Map(employerParties.map((p) => [p.id, p]));
    const lastMessageList = Array.isArray(lastMessageRows)
      ? lastMessageRows
      : ((lastMessageRows as { rows?: Array<{ conversation_id: number; content: string; created_at: Date }> }).rows ?? []);
    const lastByConversation = new Map(
      lastMessageList.map((row) => [
        row.conversation_id,
        { content: row.content, createdAt: row.created_at },
      ]),
    );
    const unreadByConversation = new Map(unreadRows.map((r) => [r.conversationId, Number(r.total)]));
    const bookingById = new Map(bookingRows.map((b) => [b.id, b]));
    const jobById = new Map(jobRows.map((j) => [j.id, j]));
    const meetingById = new Map(meetingRows.map((m) => [m.id, m]));

    const data = rows.map((conversation) => {
      const isEmployer = profiles.employerId === conversation.employerId;
      const other = isEmployer
        ? (conversation.freelancerId != null ? freelancerById.get(conversation.freelancerId) : undefined)
        : (conversation.employerId != null ? employerById.get(conversation.employerId) : undefined);
      const last = lastByConversation.get(conversation.id);

      let context: { bookingTitle?: string; meetingTitle?: string } = {};
      if (conversation.bookingId != null) {
        const booking = bookingById.get(conversation.bookingId);
        const job = booking?.jobRequirementId != null ? jobById.get(booking.jobRequirementId) : undefined;
        context = { bookingTitle: job?.title ?? "Booking" };
      } else if (conversation.meetingId != null) {
        const meeting = meetingById.get(conversation.meetingId);
        context = { meetingTitle: meeting?.title ?? "Discovery Meeting" };
      }

      return {
        conversationId: conversation.id,
        otherPartyName: other?.name ?? "Deleted User",
        otherPartyAvatar: other?.avatarUrl ?? null,
        lastMessagePreview: last?.content?.slice(0, 60) ?? "",
        lastMessageAt: last?.createdAt ?? conversation.lastMessageAt ?? conversation.createdAt,
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
        ...context,
      };
    });

    res.json(paginatedResponse(data, Number(totalResult[0]?.total ?? 0), page, pageSize));
  } catch (err) {
    req.log.error({ err }, "Failed to list direct conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/conversations/:id/messages", async (req, res) => {
  const user = await currentUser(req);
  const id = numberParam(req.params.id);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (id == null) { res.status(400).json({ error: "Invalid conversation ID" }); return; }
  const access = await conversationAccess(id, user.id);
  if (access.status) { res.status(access.status).json({ error: access.status === 404 ? "Conversation not found" : "Forbidden" }); return; }
  const { page, pageSize, offset } = parsePagination(req.query);
  try {
    const where = and(eq(messages.conversationId, id), humanMessageWhere);
    const [rows, totalResult] = await Promise.all([
      db.select({
        id: messages.id,
        content: messages.content,
        senderId: messages.senderId,
        senderType: messages.role,
        createdAt: messages.createdAt,
        readAt: messages.readAt,
        senderName: usersTable.name,
      }).from(messages)
        .leftJoin(usersTable, eq(messages.senderId, usersTable.id))
        .where(where).orderBy(asc(messages.createdAt)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(messages).where(where),
    ]);
    await markConversationRead(db, id, user.id);
    res.json(paginatedResponse(rows.map((row) => ({
      ...row,
      senderType: "human",
    })), Number(totalResult[0]?.total ?? 0), page, pageSize));
  } catch (err) {
    req.log.error({ err }, "Failed to get direct messages");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/conversations/:id/messages", async (req, res) => {
  const user = await currentUser(req);
  const id = numberParam(req.params.id);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (id == null) { res.status(400).json({ error: "Invalid conversation ID" }); return; }
  if (typeof req.body?.content !== "string" || req.body.content.length > 2000) {
    res.status(400).json({ error: "Message content must be between 1 and 2000 characters" });
    return;
  }
  const profiles = await profileIdsForUser(user.id);
  const access = await conversationAccess(id, user.id);
  if (access.status) { res.status(access.status).json({ error: access.status === 404 ? "Conversation not found" : "Forbidden" }); return; }
  const senderRole = profiles.employerId === access.conversation?.employerId ? "employer"
    : profiles.freelancerId === access.conversation?.freelancerId ? "freelancer" : null;
  const senderProfileId = senderRole === "employer" ? profiles.employerId : profiles.freelancerId;
  if (!senderRole || senderProfileId == null) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const message = await sendHumanMessage(db, {
      conversationId: id,
      senderUserId: user.id,
      senderProfileId,
      senderRole,
      content: req.body.content,
    }, req.log);
    res.status(201).json({
      ...message,
      senderType: message.role,
      senderName: user.name,
      readAt: message.readAt ?? null,
    });
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 422) { res.status(422).json({ error: "This is not a direct conversation", code: "INVALID_CONVERSATION_TYPE" }); return; }
    if (status === 429) { res.status(429).json({ error: "Too many messages", code: "MESSAGE_RATE_LIMIT" }); return; }
    if (status === 400) { res.status(400).json({ error: "Message cannot be empty" }); return; }
    req.log.error({ err }, "Failed to send direct message");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/conversations/:id/read", async (req, res) => {
  const user = await currentUser(req);
  const id = numberParam(req.params.id);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (id == null) { res.status(400).json({ error: "Invalid conversation ID" }); return; }
  const access = await conversationAccess(id, user.id);
  if (access.status) { res.status(access.status).json({ error: access.status === 404 ? "Conversation not found" : "Forbidden" }); return; }
  try {
    const markedRead = await markConversationRead(db, id, user.id);
    res.json({ markedRead });
  } catch (err) {
    req.log.error({ err }, "Failed to mark direct conversation read");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/messages/unread-count", async (req, res) => {
  const user = await currentUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const count = await getUnreadConversationCount(db, user.id, await profileIdsForUser(user.id));
    res.json({ count });
  } catch (err) {
    req.log.error({ err }, "Failed to count unread direct conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

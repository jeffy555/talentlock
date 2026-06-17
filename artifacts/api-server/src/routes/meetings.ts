import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { meetingsTable, freelancerProfilesTable, employerProfilesTable, usersTable } from "@workspace/db";
import { eq, or, and, count } from "drizzle-orm";
import { CreateMeetingBody, UpdateMeetingBody } from "@workspace/api-zod";
import { randomBytes } from "crypto";
import {
  createNotification,
  NotificationType,
  userIdFromFreelancerProfileId,
  userIdFromEmployerProfileId,
  freelancerNameForProfile,
  employerCompanyForProfile,
} from "../lib/createNotification";
import { sendNotificationEmailAsync } from "../lib/emailService";
import { resolveUserByClerkId, canAccessMeeting, profileIdsForUser } from "../lib/accessControl";
import { parsePagination, paginatedResponse } from "../lib/paginationUtils";
import { sanitiseText } from "../lib/sanitise";

const router = Router();

async function enrichMeeting(m: typeof meetingsTable.$inferSelect) {
  const [f] = await db
    .select({ name: freelancerProfilesTable.name, clerkId: freelancerProfilesTable.clerkId })
    .from(freelancerProfilesTable)
    .where(eq(freelancerProfilesTable.id, m.freelancerId))
    .limit(1);
  const [e] = await db
    .select({ name: employerProfilesTable.companyName, clerkId: employerProfilesTable.clerkId })
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.id, m.employerId))
    .limit(1);

  const [[fu], [eu]] = await Promise.all([
    f?.clerkId
      ? db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.clerkId, f.clerkId)).limit(1)
      : Promise.resolve([undefined]),
    e?.clerkId
      ? db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.clerkId, e.clerkId)).limit(1)
      : Promise.resolve([undefined]),
  ]);

  return {
    ...m,
    freelancerName: f?.name ?? null,
    employerName: e?.name ?? null,
    freelancerEmail: fu?.email ?? null,
    employerEmail: eu?.email ?? null,
  };
}

router.get("/meetings", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);

    const conditions = [];
    if (freelancer && employer) {
      conditions.push(or(eq(meetingsTable.freelancerId, freelancer.id), eq(meetingsTable.employerId, employer.id))!);
    } else if (freelancer) {
      conditions.push(eq(meetingsTable.freelancerId, freelancer.id));
    } else if (employer) {
      conditions.push(eq(meetingsTable.employerId, employer.id));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20), 100);
    const offset = (page - 1) * pageSize;

    const [rows, countResult] = await Promise.all([
      db.select().from(meetingsTable).where(whereClause).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(meetingsTable).where(whereClause),
    ]);

    const enriched = await Promise.all(rows.map(enrichMeeting));
    const total = Number(countResult[0]?.count ?? 0);
    res.json(paginatedResponse(enriched, total, page, pageSize));
  } catch (err) {
    req.log.error({ err }, "Failed to list meetings");
    res.status(500).json({ error: "Internal server error" });
  }
});

function generateJitsiLink(): string {
  // Random room name on a free Jitsi server — no auth required for either party.
  // Use cryptographically-strong randomness so room URLs cannot be guessed.
  const slug = randomBytes(12).toString("base64url");
  return `https://meet.jit.si/TalentLock-${slug}`;
}

router.post("/meetings", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateMeetingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);
    if (!employer) { res.status(400).json({ error: "Employer profile required to schedule a meeting" }); return; }

    const data = { ...parsed.data } as any;
    // Auto-provision a Jitsi video link if the employer didn't supply one.
    if (!data.meetingLink || typeof data.meetingLink !== "string" || !data.meetingLink.trim()) {
      data.meetingLink = generateJitsiLink();
    }

    const clean = {
      ...data,
      title: sanitiseText(data.title),
      agenda: data.agenda != null ? sanitiseText(data.agenda) : data.agenda,
    };

    const [meeting] = await db.insert(meetingsTable)
      .values({ ...clean, employerId: employer.id, status: "pending" })
      .returning();

    const freelancerUserId = await userIdFromFreelancerProfileId(meeting.freelancerId);
    const employerName = await employerCompanyForProfile(employer.id);
    if (freelancerUserId) {
      const meetMsg = `${employerName} requested a discovery meeting`;
      createNotification(db, {
        userId: freelancerUserId,
        type: NotificationType.MEETING_REQUESTED,
        entityType: "meeting",
        entityId: meeting.id,
        message: meetMsg,
      }).catch((err) => req.log.warn({ err, meetingId: meeting.id }, "notification write failed"));
      sendNotificationEmailAsync(
        db, freelancerUserId, "New meeting request on TalentLock", meetMsg,
        `/meetings/${meeting.id}`, req.log,
      );
    }

    res.status(201).json(await enrichMeeting(meeting));
  } catch (err) {
    req.log.error({ err }, "Failed to create meeting");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/meetings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const access = await canAccessMeeting(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Meeting not found" : "Forbidden" });
      return;
    }
    const [m] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id)).limit(1);
    if (!m) { res.status(404).json({ error: "Meeting not found" }); return; }
    res.json(await enrichMeeting(m));
  } catch (err) {
    req.log.error({ err }, "Failed to get meeting");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/meetings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = UpdateMeetingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const access = await canAccessMeeting(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Meeting not found" : "Forbidden" });
      return;
    }
    const [before] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id)).limit(1);
    if (!before) { res.status(404).json({ error: "Meeting not found" }); return; }

    const clean = {
      ...parsed.data,
      title: parsed.data.title != null ? sanitiseText(parsed.data.title) : parsed.data.title,
      agenda: parsed.data.agenda != null ? sanitiseText(parsed.data.agenda) : parsed.data.agenda,
    };

    const [updated] = await db.update(meetingsTable)
      .set({ ...clean as any, updatedAt: new Date() })
      .where(eq(meetingsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Meeting not found" }); return; }

    if (parsed.data.status && parsed.data.status !== before.status) {
      const { employerId: callerEmployerId, freelancerId: callerFreelancerId } = await profileIdsForUser(user.id);
      const isEmployer = callerEmployerId !== null && callerEmployerId === updated.employerId;
      const isFreelancer = callerFreelancerId !== null && callerFreelancerId === updated.freelancerId;
      let recipientUserId: number | null = null;
      let otherName = "the other party";
      if (isEmployer) {
        recipientUserId = await userIdFromFreelancerProfileId(updated.freelancerId);
        otherName = await employerCompanyForProfile(updated.employerId);
      } else if (isFreelancer) {
        recipientUserId = await userIdFromEmployerProfileId(updated.employerId);
        otherName = await freelancerNameForProfile(updated.freelancerId);
      }
      if (recipientUserId) {
        const meetStatusMsg = `Your meeting with ${otherName} has been ${parsed.data.status}`;
        createNotification(db, {
          userId: recipientUserId,
          type: NotificationType.MEETING_STATUS_CHANGED,
          entityType: "meeting",
          entityId: id,
          message: meetStatusMsg,
        }).catch((err) => req.log.warn({ err, meetingId: id }, "notification write failed"));
        sendNotificationEmailAsync(
          db, recipientUserId, "Meeting status updated on TalentLock", meetStatusMsg,
          `/meetings/${id}`, req.log,
        );
      }
    }

    res.json(await enrichMeeting(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update meeting");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

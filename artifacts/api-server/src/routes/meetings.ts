import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  meetingsTable,
  freelancerProfilesTable,
  employerProfilesTable,
  usersTable,
  teamsTable,
  teamMembersTable,
  employerCandidateNotesTable,
} from "@workspace/db";
import { eq, or, and, count, ilike, exists, inArray, type SQL } from "drizzle-orm";
import { CreateMeetingBody, UpdateMeetingBody, PostMeetingFeedbackBody, ListMeetingsQueryParams } from "@workspace/api-zod";
import { randomBytes } from "crypto";
import {
  createNotification,
  NotificationType,
  userIdFromFreelancerProfileId,
  userIdFromEmployerProfileId,
  freelancerNameForProfile,
  employerCompanyForProfile,
} from "../lib/createNotification";
import { sendNotificationEmailAsync, sendDirectEmailAsync } from "../lib/emailService";
import { resolveUserByClerkId, canAccessMeeting, profileIdsForUser } from "../lib/accessControl";
import { parsePagination, paginatedResponse } from "../lib/paginationUtils";
import { sanitiseText } from "../lib/sanitise";
import { sanitiseIlikeQuery } from "../lib/searchUtils";
import { generateMeetingBrief } from "../lib/meetingBriefGenerator";
import { generateInterviewHandoffSummary } from "../lib/interviewHandoffSummary";
import { checkTokenQuota } from "../lib/subscriptionGating";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type MeetingRow = typeof meetingsTable.$inferSelect;
type EnrichMeetingOpts = {
  viewerEmployerProfileId: number | null;
  includeFeedbackBody?: boolean;
};

/** Batch-enrich meetings (3 queries total) instead of 4 round-trips per row. */
async function enrichMeetings(rows: MeetingRow[], opts: EnrichMeetingOpts) {
  if (rows.length === 0) return [];

  const freelancerIds = [...new Set(rows.map((r) => r.freelancerId))];
  const employerIds = [...new Set(rows.map((r) => r.employerId))];

  const [freelancers, employers] = await Promise.all([
    db
      .select({
        id: freelancerProfilesTable.id,
        name: freelancerProfilesTable.name,
        clerkId: freelancerProfilesTable.clerkId,
      })
      .from(freelancerProfilesTable)
      .where(inArray(freelancerProfilesTable.id, freelancerIds)),
    db
      .select({
        id: employerProfilesTable.id,
        name: employerProfilesTable.companyName,
        clerkId: employerProfilesTable.clerkId,
        verificationLevel: employerProfilesTable.verificationLevel,
      })
      .from(employerProfilesTable)
      .where(inArray(employerProfilesTable.id, employerIds)),
  ]);

  const freelancerById = new Map(freelancers.map((f) => [f.id, f]));
  const employerById = new Map(employers.map((e) => [e.id, e]));
  const clerkIds = [
    ...new Set(
      [...freelancers, ...employers]
        .map((p) => p.clerkId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const emailByClerkId = new Map<string, string | null>();
  if (clerkIds.length > 0) {
    const emails = await db
      .select({ clerkId: usersTable.clerkId, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.clerkId, clerkIds));
    for (const row of emails) {
      if (row.clerkId) emailByClerkId.set(row.clerkId, row.email ?? null);
    }
  }

  return rows.map((m) => {
    const f = freelancerById.get(m.freelancerId);
    const e = employerById.get(m.employerId);
    const isEmployerParty =
      opts.viewerEmployerProfileId != null && opts.viewerEmployerProfileId === m.employerId;

    const base = {
      ...m,
      freelancerName: f?.name ?? null,
      employerName: e?.name ?? null,
      employerVerificationLevel: e?.verificationLevel ?? "unverified",
      freelancerEmail: f?.clerkId ? (emailByClerkId.get(f.clerkId) ?? null) : null,
      employerEmail: e?.clerkId ? (emailByClerkId.get(e.clerkId) ?? null) : null,
      hasInterviewFeedback: isEmployerParty && m.feedbackSubmittedAt != null,
    };

    if (!isEmployerParty) {
      return {
        ...base,
        disposition: null,
        feedbackText: null,
        feedbackSummary: null,
        nextRoundPanelEmail: null,
        nextRoundPanelName: null,
        nextRoundTeamMemberId: null,
        interviewResult: null,
        feedbackMessageId: null,
        hasInterviewFeedback: false,
      };
    }

    if (!opts.includeFeedbackBody) {
      return {
        ...base,
        feedbackText: null,
        feedbackSummary: null,
      };
    }

    return base;
  });
}

async function enrichMeeting(m: MeetingRow, opts: EnrichMeetingOpts) {
  const [enriched] = await enrichMeetings([m], opts);
  return enriched;
}

async function resolveViewerEmployerId(clerkId: string): Promise<number | null> {
  const [employer] = await db
    .select({ id: employerProfilesTable.id })
    .from(employerProfilesTable)
    .where(eq(employerProfilesTable.clerkId, clerkId))
    .limit(1);
  return employer?.id ?? null;
}

router.get("/meetings", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = ListMeetingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const params = parsed.data;
  try {
    const [[freelancer], [employer]] = await Promise.all([
      db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1),
      db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1),
    ]);

    const conditions: SQL[] = [];
    if (freelancer && employer) {
      conditions.push(or(eq(meetingsTable.freelancerId, freelancer.id), eq(meetingsTable.employerId, employer.id))!);
    } else if (freelancer) {
      conditions.push(eq(meetingsTable.freelancerId, freelancer.id));
    } else if (employer) {
      conditions.push(eq(meetingsTable.employerId, employer.id));
    }
    if (params.status) conditions.push(eq(meetingsTable.status, params.status));

    const searchPattern = params.q ? sanitiseIlikeQuery(params.q) : null;
    if (searchPattern) {
      conditions.push(or(
        ilike(meetingsTable.title, searchPattern),
        ilike(meetingsTable.agenda, searchPattern),
        exists(
          db.select({ id: freelancerProfilesTable.id })
            .from(freelancerProfilesTable)
            .where(and(
              eq(freelancerProfilesTable.id, meetingsTable.freelancerId),
              ilike(freelancerProfilesTable.name, searchPattern),
            )),
        ),
        exists(
          db.select({ id: employerProfilesTable.id })
            .from(employerProfilesTable)
            .where(and(
              eq(employerProfilesTable.id, meetingsTable.employerId),
              ilike(employerProfilesTable.companyName, searchPattern),
            )),
        ),
      )!);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const { page, pageSize, offset } = parsePagination(params);

    const [rows, countResult] = await Promise.all([
      db.select().from(meetingsTable).where(whereClause).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(meetingsTable).where(whereClause),
    ]);

    const enriched = await enrichMeetings(rows, {
      viewerEmployerProfileId: employer?.id ?? null,
      includeFeedbackBody: false,
    });
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
      // dateStyle/timeStyle cannot be combined with timeZoneName in Node/V8.
      const scheduledAt = meeting.scheduledAt
        ? new Intl.DateTimeFormat("en-GB", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
            timeZoneName: "short",
          }).format(new Date(meeting.scheduledAt))
        : "To be confirmed";
      const emailBody = [
        `${employerName} invited you to a discovery meeting.`,
        `Scheduled for: ${scheduledAt}`,
        meeting.meetingLink ? `Meeting link: ${meeting.meetingLink}` : null,
        "Open TalentLock to accept or decline this invitation.",
      ].filter(Boolean).join("\n\n");
      createNotification(db, {
        userId: freelancerUserId,
        type: NotificationType.MEETING_REQUESTED,
        entityType: "meeting",
        entityId: meeting.id,
        message: meetMsg,
      }).catch((err) => req.log.warn({ err, meetingId: meeting.id }, "notification write failed"));
      sendNotificationEmailAsync(
        db, freelancerUserId, `Discovery meeting invite from ${employerName}`, emailBody,
        `/meetings/${meeting.id}`, req.log,
      );
    }

    res.status(201).json(await enrichMeeting(meeting, {
      viewerEmployerProfileId: employer.id,
      includeFeedbackBody: true,
    }));
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
    const viewerEmployerProfileId = await resolveViewerEmployerId(clerkId);
    res.json(await enrichMeeting(m, { viewerEmployerProfileId, includeFeedbackBody: true }));
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

    res.json(await enrichMeeting(updated, {
      viewerEmployerProfileId: await resolveViewerEmployerId(clerkId),
      includeFeedbackBody: true,
    }));

    // Fire-and-forget AI meeting brief when a meeting first becomes confirmed.
    // Never awaited — must not delay or affect the PATCH response.
    if (updated.status === "confirmed" && before.status !== "confirmed") {
      generateMeetingBrief(db, id, req.log)
        .catch((err) => req.log.warn({ err, meetingId: id }, "meeting brief generation failed"));
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update meeting");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/meetings/:id/brief — employer-only manual (re)generation.
// Returns 202; the client polls GET /api/meetings/:id until briefGeneratedAt is set.
router.post("/meetings/:id/brief", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id)).limit(1);
    if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

    const { employerId } = await profileIdsForUser(user.id);
    if (employerId === null || employerId !== meeting.employerId) {
      res.status(403).json({ error: "Only the employer on this meeting can generate a brief" });
      return;
    }
    if (meeting.status !== "confirmed") {
      res.status(422).json({ error: "Meeting must be confirmed to generate a brief" });
      return;
    }

    res.status(202).json({ message: "Brief generation started" });

    generateMeetingBrief(db, id, req.log)
      .catch((err) => req.log.warn({ err, meetingId: id }, "meeting brief manual generation failed"));
  } catch (err) {
    req.log.error({ err }, "Failed to start meeting brief generation");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/meetings/:id/feedback — employer hiring decision (internal only; A / Hybrid C / AI-1 / F2).
router.post("/meetings/:id/feedback", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PostMeetingFeedbackBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const user = await resolveUserByClerkId(clerkId);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const access = await canAccessMeeting(user.id, id);
    if (!access.ok) {
      res.status(access.status).json({ error: access.status === 404 ? "Meeting not found" : "Forbidden" });
      return;
    }

    const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id)).limit(1);
    if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }

    const { employerId } = await profileIdsForUser(user.id);
    if (employerId === null || employerId !== meeting.employerId) {
      res.status(403).json({ error: "Only the employer on this meeting can submit interview feedback" });
      return;
    }
    if (meeting.status !== "completed") {
      res.status(422).json({ error: "Meeting must be completed before submitting interview feedback" });
      return;
    }
    if (meeting.feedbackSubmittedAt != null) {
      res.status(409).json({ error: "Interview feedback already submitted" });
      return;
    }

    const feedbackText = sanitiseText(parsed.data.feedbackText).trim();
    if (feedbackText.length < 20 || feedbackText.length > 2000) {
      res.status(400).json({ error: "feedbackText must be between 20 and 2000 characters" });
      return;
    }

    const disposition = parsed.data.disposition;
    let nextRoundTeamMemberId: number | null = null;
    let nextRoundPanelEmail: string | null = null;
    let nextRoundPanelName: string | null = null;
    let panelNotifyUserId: number | null = null;
    let panelNotifyEmail: string | null = null;
    let panelDisplayName: string | null = null;

    if (disposition === "next_round") {
      const [ownedTeam] = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.ownerUserId, user.id))
        .limit(1);

      let activeMembers: Array<typeof teamMembersTable.$inferSelect> = [];
      if (ownedTeam) {
        activeMembers = await db
          .select()
          .from(teamMembersTable)
          .where(and(
            eq(teamMembersTable.teamId, ownedTeam.id),
            eq(teamMembersTable.status, "active"),
          ));
      }

      if (activeMembers.length > 0) {
        const memberId = parsed.data.nextRoundTeamMemberId;
        if (memberId == null) {
          res.status(400).json({ error: "nextRoundTeamMemberId is required when your team has members" });
          return;
        }
        const member = activeMembers.find((m) => m.id === memberId);
        if (!member) {
          res.status(400).json({ error: "nextRoundTeamMemberId must be an active member of your team" });
          return;
        }
        nextRoundTeamMemberId = member.id;
        panelNotifyEmail = member.invitedEmail;
        panelDisplayName = member.invitedEmail;
        panelNotifyUserId = member.userId ?? null;
        if (member.userId) {
          const [memberUser] = await db
            .select({ email: usersTable.email, name: usersTable.name })
            .from(usersTable)
            .where(eq(usersTable.id, member.userId))
            .limit(1);
          if (memberUser?.email) panelNotifyEmail = memberUser.email;
          if (memberUser?.name) panelDisplayName = memberUser.name;
        }
      } else {
        const email = parsed.data.nextRoundPanelEmail?.trim().toLowerCase() ?? "";
        if (!email || !EMAIL_RE.test(email)) {
          res.status(400).json({ error: "nextRoundPanelEmail is required for next-round handoff" });
          return;
        }
        nextRoundPanelEmail = email;
        nextRoundPanelName = parsed.data.nextRoundPanelName
          ? sanitiseText(parsed.data.nextRoundPanelName).trim().slice(0, 200) || null
          : null;
        panelNotifyEmail = email;
        panelDisplayName = nextRoundPanelName ?? email;
        const [matched] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.email, email))
          .limit(1);
        panelNotifyUserId = matched?.id ?? null;
      }

      const quota = await checkTokenQuota(db, user.id);
      if (!quota.allowed) {
        res.status(402).json({
          error: "Monthly AI token limit reached",
          code: "TOKEN_LIMIT",
          planNeeded: quota.planNeeded ?? "employer_growth",
        });
        return;
      }
    }

    const [freelancer] = await db
      .select({ name: freelancerProfilesTable.name })
      .from(freelancerProfilesTable)
      .where(eq(freelancerProfilesTable.id, meeting.freelancerId))
      .limit(1);
    const candidateName = freelancer?.name ?? "Candidate";

    let feedbackSummary: string | null = null;
    if (disposition === "next_round") {
      try {
        const result = await generateInterviewHandoffSummary({
          feedbackText,
          candidateName,
          meetingTitle: meeting.title,
          dbClient: db,
          employerUserId: user.id,
        });
        feedbackSummary = result.summary;
      } catch (err) {
        req.log.error({ err, meetingId: id }, "Failed to generate interview handoff summary");
        res.status(500).json({ error: "Could not generate handoff summary. Please try again." });
        return;
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [locked] = await tx.select()
        .from(meetingsTable)
        .where(eq(meetingsTable.id, id))
        .for("update")
        .limit(1);
      if (!locked) {
        const err = new Error("MEETING_NOT_FOUND");
        (err as Error & { status?: number }).status = 404;
        throw err;
      }
      if (locked.feedbackSubmittedAt != null) {
        const err = new Error("FEEDBACK_ALREADY_SUBMITTED");
        (err as Error & { status?: number }).status = 409;
        throw err;
      }
      if (locked.status !== "completed") {
        const err = new Error("MEETING_NOT_COMPLETED");
        (err as Error & { status?: number }).status = 422;
        throw err;
      }

      const [row] = await tx.update(meetingsTable)
        .set({
          disposition,
          feedbackText,
          feedbackSummary,
          feedbackSubmittedAt: new Date(),
          nextRoundTeamMemberId,
          nextRoundPanelEmail,
          nextRoundPanelName,
          interviewResult: null,
          feedbackMessageId: null,
          updatedAt: new Date(),
        })
        .where(eq(meetingsTable.id, id))
        .returning();

      if (disposition === "proceed_to_booking" || disposition === "rejected") {
        await tx
          .insert(employerCandidateNotesTable)
          .values({
            employerUserId: user.id,
            freelancerId: locked.freelancerId,
            latestMeetingId: locked.id,
            disposition,
            feedbackText,
            feedbackSummary: null,
          })
          .onConflictDoUpdate({
            target: [
              employerCandidateNotesTable.employerUserId,
              employerCandidateNotesTable.freelancerId,
            ],
            set: {
              latestMeetingId: locked.id,
              disposition,
              feedbackText,
              feedbackSummary: null,
              updatedAt: new Date(),
            },
          });
      }

      return row;
    });

    if (disposition === "next_round" && panelNotifyEmail) {
      const employerName = await employerCompanyForProfile(updated.employerId);
      const summaryBody = [
        `${employerName} shared confidential interview notes for the next round.`,
        `Candidate: ${candidateName}`,
        `Meeting: ${updated.title}`,
        "",
        "Handoff summary:",
        feedbackSummary ?? feedbackText,
        "",
        "These notes are internal — do not share with the candidate.",
      ].join("\n");

      if (panelNotifyUserId) {
        createNotification(db, {
          userId: panelNotifyUserId,
          type: NotificationType.MEETING_NEXT_ROUND_PANEL,
          entityType: "meeting",
          entityId: id,
          message: `Next-round interview handoff for ${candidateName}`,
        }).catch((err) => req.log.warn({ err, meetingId: id }, "panel notification write failed"));
        sendNotificationEmailAsync(
          db,
          panelNotifyUserId,
          `Next-round handoff — ${candidateName}`,
          summaryBody,
          `/meetings/${id}`,
          req.log,
        );
      } else {
        sendDirectEmailAsync(
          panelNotifyEmail,
          `Next-round handoff — ${candidateName}`,
          summaryBody,
          `/meetings/${id}`,
          req.log,
        );
      }
      void panelDisplayName;
    }

    res.status(201).json(await enrichMeeting(updated, {
      viewerEmployerProfileId: employerId,
      includeFeedbackBody: true,
    }));
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 409) {
      res.status(409).json({ error: "Interview feedback already submitted" });
      return;
    }
    if (status === 422) {
      res.status(422).json({ error: "Meeting must be completed before submitting interview feedback" });
      return;
    }
    if (status === 404) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }
    req.log.error({ err }, "Failed to submit meeting interview feedback");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

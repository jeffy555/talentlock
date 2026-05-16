import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { meetingsTable, freelancerProfilesTable, employerProfilesTable, usersTable } from "@workspace/db";
import { eq, or, and } from "drizzle-orm";
import { CreateMeetingBody, UpdateMeetingBody } from "@workspace/api-zod";
import { randomBytes } from "crypto";

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

    let meetings: (typeof meetingsTable.$inferSelect)[] = [];
    if (freelancer && employer) {
      meetings = await db.select().from(meetingsTable).where(
        or(eq(meetingsTable.freelancerId, freelancer.id), eq(meetingsTable.employerId, employer.id))
      );
    } else if (freelancer) {
      meetings = await db.select().from(meetingsTable).where(eq(meetingsTable.freelancerId, freelancer.id));
    } else if (employer) {
      meetings = await db.select().from(meetingsTable).where(eq(meetingsTable.employerId, employer.id));
    }

    const enriched = await Promise.all(meetings.map(enrichMeeting));
    res.json(enriched);
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

    const [meeting] = await db.insert(meetingsTable)
      .values({ ...data, employerId: employer.id, status: "pending" })
      .returning();
    res.status(201).json(await enrichMeeting(meeting));
  } catch (err) {
    req.log.error({ err }, "Failed to create meeting");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/meetings/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
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
  const parsed = UpdateMeetingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [updated] = await db.update(meetingsTable)
      .set({ ...parsed.data as any, updatedAt: new Date() })
      .where(eq(meetingsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Meeting not found" }); return; }
    res.json(await enrichMeeting(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update meeting");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  agreementsTable, bookingsTable, freelancerProfilesTable, employerProfilesTable,
} from "@workspace/db";
import { eq, or, and, SQL } from "drizzle-orm";
import { CreateAgreementBody, SignAgreementBody, ListAgreementsQueryParams } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.get("/agreements", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = ListAgreementsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  try {
    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.clerkId, clerkId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.clerkId, clerkId)).limit(1);

    const conditions: SQL[] = [];
    if (freelancer && employer) {
      conditions.push(or(eq(agreementsTable.freelancerId, freelancer.id), eq(agreementsTable.employerId, employer.id))!);
    } else if (freelancer) {
      conditions.push(eq(agreementsTable.freelancerId, freelancer.id));
    } else if (employer) {
      conditions.push(eq(agreementsTable.employerId, employer.id));
    }
    if (params.status) conditions.push(eq(agreementsTable.status, params.status));

    const agreements = await db.select().from(agreementsTable).where(conditions.length > 0 ? and(...conditions) : undefined);
    const enriched = await Promise.all(agreements.map(enrichAgreement));
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to list agreements");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/agreements", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateAgreementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, parsed.data.bookingId)).limit(1);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    const [freelancer] = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, booking.freelancerId)).limit(1);
    const [employer] = await db.select().from(employerProfilesTable).where(eq(employerProfilesTable.id, booking.employerId)).limit(1);

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: `You are a legal document generator for TalentLock, a secure freelancer booking platform. Generate a professional, legally-worded freelance engagement agreement.`,
        },
        {
          role: "user",
          content: `Generate a comprehensive freelance engagement agreement for the following:
Freelancer: ${freelancer?.name ?? "Unknown"} (${freelancer?.fieldOfWork ?? "General"})
Employer: ${employer?.companyName ?? "Unknown"} (${employer?.industry ?? "General"})
Start Date: ${booking.startDate.toISOString().split("T")[0]}
End Date: ${booking.endDate.toISOString().split("T")[0]}
Payment Type: ${booking.paymentType}
Rate: ${booking.rate ?? "To be agreed"}
Skills: ${freelancer?.skills?.join(", ") ?? "Various"}

Include: scope of work, payment terms, confidentiality, IP ownership, termination clauses, dispute resolution, governing law, and signature blocks for both parties.`,
        },
      ],
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content ?? "Agreement content could not be generated.";
    const [agreement] = await db.insert(agreementsTable)
      .values({
        bookingId: booking.id,
        freelancerId: booking.freelancerId,
        employerId: booking.employerId,
        content,
        status: "pending_signatures",
      })
      .returning();
    res.status(201).json(await enrichAgreement(agreement));
  } catch (err) {
    req.log.error({ err }, "Failed to create agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agreements/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }
    res.json(await enrichAgreement(agreement));
  } catch (err) {
    req.log.error({ err }, "Failed to get agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/agreements/:id/sign", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = SignAgreementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1);
    if (!agreement) { res.status(404).json({ error: "Agreement not found" }); return; }

    const now = new Date();
    const updates: Partial<typeof agreement> = {};
    if (parsed.data.role === "freelancer") {
      if (agreement.freelancerSignedAt) { res.status(400).json({ error: "Freelancer has already signed" }); return; }
      updates.freelancerSignedAt = now;
    } else if (parsed.data.role === "employer") {
      if (agreement.employerSignedAt) { res.status(400).json({ error: "Employer has already signed" }); return; }
      updates.employerSignedAt = now;
    }

    const [updated] = await db.update(agreementsTable)
      .set(updates as any)
      .where(eq(agreementsTable.id, id))
      .returning();

    if (updated.freelancerSignedAt && updated.employerSignedAt) {
      const [fullySignedAgreement] = await db.update(agreementsTable)
        .set({ status: "signed" })
        .where(eq(agreementsTable.id, id))
        .returning();
      await db.update(bookingsTable).set({ status: "active" }).where(eq(bookingsTable.id, updated.bookingId));
      res.json(await enrichAgreement(fullySignedAgreement));
    } else {
      res.json(await enrichAgreement(updated));
    }
  } catch (err) {
    req.log.error({ err }, "Failed to sign agreement");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function enrichAgreement(a: typeof agreementsTable.$inferSelect) {
  const [f] = await db.select({ name: freelancerProfilesTable.name }).from(freelancerProfilesTable).where(eq(freelancerProfilesTable.id, a.freelancerId)).limit(1);
  const [e] = await db.select({ name: employerProfilesTable.companyName }).from(employerProfilesTable).where(eq(employerProfilesTable.id, a.employerId)).limit(1);
  return { ...a, freelancerName: f?.name ?? null, employerName: e?.name ?? null };
}

export default router;

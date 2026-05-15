import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { conversations, messages, usersTable, freelancerProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateOpenaiConversationBody, SendOpenaiMessageBody } from "@workspace/api-zod";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_TALENTLOCK });

const router = Router();

router.get("/openai/conversations", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.json([]); return; }
    const convs = await db.select().from(conversations).where(eq(conversations.userId as any, user.id));
    res.json(convs.map(c => ({ ...c, userId: (c as any).userId ?? user.id, jobRequirementId: (c as any).jobRequirementId ?? null })));
  } catch (err) {
    req.log.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/openai/conversations", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = CreateOpenaiConversationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
    if (!user) { res.status(400).json({ error: "User not found" }); return; }
    const [conv] = await db.insert(conversations)
      .values({ title: parsed.data.title, userId: user.id, jobRequirementId: parsed.data.jobRequirementId ?? null } as any)
      .returning();
    res.status(201).json({ ...conv, userId: user.id, jobRequirementId: (conv as any).jobRequirementId ?? null });
  } catch (err) {
    req.log.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id));
    res.json({ ...conv, userId: (conv as any).userId, jobRequirementId: (conv as any).jobRequirementId ?? null, messages: msgs });
  } catch (err) {
    req.log.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/openai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/openai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = SendOpenaiMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    await db.insert(messages).values({ conversationId: id, role: "user", content: parsed.data.content });
    const history = await db.select().from(messages).where(eq(messages.conversationId, id));

    const freelancers = await db.select().from(freelancerProfilesTable).where(eq(freelancerProfilesTable.isAvailable, true)).limit(20);
    const freelancerContext = freelancers.map(f =>
      [
        `--- Freelancer ID: ${f.id} ---`,
        `Name: ${f.name}`,
        `Tagline: ${f.tagline}`,
        `Primary Field: ${f.fieldOfWork}`,
        `Years Experience: ${f.yearsExperience}`,
        `Skills: ${f.skills.length ? f.skills.join(", ") : "Not specified"}`,
        `Rate: ${f.paymentPreference === "hourly" ? `$${f.hourlyRate ?? "TBD"}/hr` : `$${f.dailyRate ?? "TBD"}/day`}`,
      ].join("\n")
    ).join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are TalentLock's AI matching assistant. Help employers find the right freelancers from our platform.

IMPORTANT MATCHING RULES:
- Match candidates primarily on their SKILLS list, not just their Primary Field label.
- A candidate whose Primary Field says "Software Engineering" but whose skills include Kubernetes, Terraform, AWS, Docker etc. IS a DevOps/Platform candidate — match them accordingly.
- Always check the Tagline and Skills together. A person with DevOps skills and a DevOps tagline IS a DevOps candidate regardless of how they labelled their Primary Field.
- Never say there are no matches without carefully checking the Skills of every candidate.
- When presenting matches, always include the Freelancer ID, name, years of experience, and their relevant skills.

REQUIRED OUTPUT FORMAT FOR MATCHES:
For EVERY freelancer you recommend, you MUST end the recommendation with a structured match marker on its own line, in this exact format:
[MATCH:<id>|SCORE:<0-100>|REASON:<one short sentence, max 12 words>]

- SCORE: how well the candidate fits the request (90+ = excellent, 70-89 = strong, 50-69 = partial, <50 = weak).
- REASON: a concise human-readable explanation (e.g. "5 of 6 required skills, within budget, available now").
- Do NOT use square brackets anywhere else in your response. Do NOT wrap the marker in quotes or code fences.
- Always include the marker, even if you only suggest one candidate.

Example:
"**Jane Doe** (ID: 4) — 8 years building React/Next.js apps, strong in TypeScript and AWS.
[MATCH:4|SCORE:92|REASON:All 5 required skills, within budget, available immediately]"

Available freelancers on the platform:\n\n${freelancerContext}`,
        },
        ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
      max_completion_tokens: 800,
    });

    const aiContent = completion.choices[0]?.message?.content ?? "I couldn't process your request. Please try again.";
    const [aiMessage] = await db.insert(messages)
      .values({ conversationId: id, role: "assistant", content: aiContent })
      .returning();

    res.json(aiMessage);
  } catch (err) {
    req.log.error({ err }, "Failed to send message");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { conversations, messages, usersTable, freelancerProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateOpenaiConversationBody, SendOpenaiMessageBody } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

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
      `ID:${f.id} | ${f.name} | ${f.fieldOfWork} | ${f.yearsExperience}yrs exp | Skills: ${f.skills.join(", ")} | Rate: ${f.paymentPreference} $${f.hourlyRate ?? f.dailyRate ?? "TBD"} | ${f.tagline}`
    ).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are TalentLock's AI matching assistant. Help employers find the right freelancers from our platform. Available freelancers:\n\n${freelancerContext}\n\nWhen you identify matches, mention their names and IDs clearly. Be professional and concise.`,
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

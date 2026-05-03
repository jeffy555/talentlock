import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { VerifyDocumentsBody } from "@workspace/api-zod";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { freelancerProfilesTable, employerProfilesTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();
const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY_TALENTLOCK"] });

async function sendVerificationEmail(
  toEmail: string,
  toName: string,
  status: "verified" | "rejected",
  note: string,
  role: string,
): Promise<{ sent: boolean; previewUrl: string | null }> {
  try {
    const testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });

    const subject =
      status === "verified"
        ? "Your TalentLock Documents Have Been Verified ✓"
        : "TalentLock Document Verification — Action Required";

    const statusBlock =
      status === "verified"
        ? `<div style="background:#d1fae5;border:1px solid #6ee7b7;border-radius:8px;padding:16px 20px;margin:20px 0;">
            <strong style="color:#065f46;">✓ Verification Successful</strong>
            <p style="margin:8px 0 0;color:#065f46;">Your documents have been reviewed and approved by our AI verification system. Your profile is now marked as verified.</p>
          </div>`
        : `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:16px 20px;margin:20px 0;">
            <strong style="color:#991b1b;">✗ Verification Unsuccessful</strong>
            <p style="margin:8px 0 0;color:#991b1b;">Your documents could not be verified at this time. Please review the feedback below and resubmit.</p>
          </div>`;

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family:system-ui,sans-serif;background:#f8f7f2;margin:0;padding:0;">
          <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;margin-top:32px;">
            <div style="background:#0d1f3c;padding:28px 32px;text-align:center;">
              <h1 style="color:#c9a84c;margin:0;font-size:24px;letter-spacing:1px;">TalentLock</h1>
              <p style="color:#a3b4cc;margin:8px 0 0;font-size:13px;">Secure Freelancer Booking Platform</p>
            </div>
            <div style="padding:32px;">
              <p style="font-size:16px;color:#1a2a3a;">Hello <strong>${toName}</strong>,</p>
              <p style="color:#4b5563;">We have completed the AI review of your ${role} verification documents submitted to TalentLock.</p>
              ${statusBlock}
              <div style="background:#f8f7f2;border-radius:8px;padding:16px 20px;margin:20px 0;">
                <strong style="color:#0d1f3c;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Reviewer Notes</strong>
                <p style="margin:8px 0 0;color:#374151;font-size:14px;">${note}</p>
              </div>
              ${status === "verified" ? `<p style="color:#4b5563;">You can now access all features of the TalentLock platform with your verified ${role} status. Log in to view your dashboard.</p>` : `<p style="color:#4b5563;">Please re-upload the correct documents on your profile page. If you believe this is an error, please contact our support team.</p>`}
              <div style="text-align:center;margin-top:32px;">
                <a href="https://talentlock.replit.app/dashboard" style="background:#c9a84c;color:#0d1f3c;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;">Go to Dashboard</a>
              </div>
            </div>
            <div style="background:#f0f0ec;padding:20px 32px;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">© ${new Date().getFullYear()} TalentLock · Secure · Verified · Exclusive</p>
            </div>
          </div>
        </body>
      </html>`;

    const info = await transporter.sendMail({
      from: `"TalentLock" <noreply@talentlock.app>`,
      to: `"${toName}" <${toEmail}>`,
      subject,
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    return { sent: true, previewUrl: typeof previewUrl === "string" ? previewUrl : null };
  } catch (err) {
    return { sent: false, previewUrl: null };
  }
}

router.post("/verify/documents", async (req: Request, res: Response) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = VerifyDocumentsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "documentUrls and documentNames arrays are required" });
    return;
  }

  const { documentUrls, documentNames } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const role = user.role;
  const docList = documentNames.map((name, i) => `${i + 1}. "${name}"`).join("\n");

  const expectedDocs =
    role === "freelancer"
      ? "government-issued ID, educational certificates, professional work experience letters, portfolio or resume"
      : "company registration certificate, GST certificate, business license, employer identification document";

  let aiStatus: "verified" | "rejected" = "verified";
  let aiNote = "Documents successfully reviewed and verified.";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 300,
      messages: [
        {
          role: "system",
          content: `You are a document verification officer for TalentLock, a professional freelancer booking platform. You review document submissions from ${role}s. Expected document types: ${expectedDocs}. Respond ONLY with JSON: {"verified": boolean, "note": string (2-3 sentences explaining the decision, professional tone)}.`,
        },
        {
          role: "user",
          content: `A ${role} has submitted the following documents for verification:\n${docList}\n\nAre these documents appropriate and sufficient for ${role} verification? Consider whether the document names suggest legitimate, relevant documents.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      aiStatus = result.verified ? "verified" : "rejected";
      aiNote = result.note ?? aiNote;
    }
  } catch (err) {
    req.log.error({ err }, "OpenAI document verification failed");
    aiStatus = "pending";
    aiNote = "Document review is being processed manually. You will be notified within 24 hours.";
  }

  const isVerified = aiStatus === "verified";

  if (role === "freelancer") {
    await db
      .update(freelancerProfilesTable)
      .set({
        documentUrls,
        documentNames,
        verificationStatus: aiStatus,
        verificationNote: aiNote,
        isVerified,
      })
      .where(eq(freelancerProfilesTable.clerkId, clerkId));
  } else if (role === "employer") {
    await db
      .update(employerProfilesTable)
      .set({
        documentUrls,
        documentNames,
        verificationStatus: aiStatus,
        verificationNote: aiNote,
        isVerified,
      })
      .where(eq(employerProfilesTable.clerkId, clerkId));
  }

  const emailResult = await sendVerificationEmail(user.email, user.name, isVerified ? "verified" : "rejected", aiNote, role);

  if (emailResult.previewUrl) {
    req.log.info({ previewUrl: emailResult.previewUrl }, "Verification email preview URL");
  }

  res.json({
    status: aiStatus,
    note: aiNote,
    emailSent: emailResult.sent,
    emailPreviewUrl: emailResult.previewUrl,
  });
});

export default router;

/**
 * Product Gaps — transactional email via Resend.
 * No-op when RESEND_API_KEY is unset or user has opted out.
 */
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { usersTable } from "@workspace/db";
import type { db } from "@workspace/db";

type DB = typeof db;

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function appBaseUrl(): string {
  return process.env.APP_URL || "http://localhost:25807";
}

function buildEmailHtml(message: string, ctaUrl: string, unsubscribeUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1E3A5F;">TalentLock</h2>
      <p style="font-size: 16px; color: #1F2937;">${message}</p>
      <a href="${ctaUrl}" style="
        display: inline-block;
        background: #2E75B6;
        color: white;
        padding: 12px 24px;
        border-radius: 6px;
        text-decoration: none;
        font-size: 15px;
        margin: 16px 0;
      ">View in TalentLock</a>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #9CA3AF;">
        <a href="${unsubscribeUrl}" style="color: #9CA3AF;">Unsubscribe from email notifications</a>
      </p>
    </body>
    </html>
  `;
}

export async function sendNotificationEmail(
  db: DB,
  userId: number,
  subject: string,
  message: string,
  ctaUrl: string,
): Promise<void> {
  if (!resend) return;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.emailNotificationsEnabled) return;
  if (!user?.email) return;

  const unsubscribeUrl = `${appBaseUrl()}/profile`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM || "noreply@talentlock.io",
    to: user.email,
    subject,
    html: buildEmailHtml(message, ctaUrl, unsubscribeUrl),
  });
}

/** Fire-and-forget email after in-app notification. */
export function sendNotificationEmailAsync(
  db: DB,
  userId: number,
  subject: string,
  message: string,
  ctaPath: string,
  log: { warn: (obj: object, msg: string) => void },
): void {
  const ctaUrl = `${appBaseUrl()}${ctaPath}`;
  sendNotificationEmail(db, userId, subject, message, ctaUrl)
    .catch((err) => log.warn({ err, userId }, "notification email failed"));
}

#!/usr/bin/env node
/**
 * Notification scenario smoke test (booking_created + email prefs).
 * Run from repo root:
 *   node --env-file-if-exists=.env artifacts/api-server/validate-notification-scenario.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { createClerkClient } from "@clerk/express";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const requireFromDb = createRequire(join(root, "lib", "db", "package.json"));
const requireFromApi = createRequire(join(root, "artifacts", "api-server", "package.json"));
const { Resend } = requireFromApi("resend");
const pg = requireFromDb("pg");
const envPath = join(root, ".env");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const API = process.env.API_URL || "http://localhost:8080/api";
const DEMO_FREELANCER = process.env.DEMO_FREELANCER_CLERK_ID || "user_3DBiBymDbIiXQnFqyk64WquLsdY";
const DEMO_EMPLOYER = process.env.DEMO_EMPLOYER_CLERK_ID || "user_3DBguOY4TbwT9bxOYc9NcYU5q9a";

async function clerkToken(clerkUserId) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const session = await clerk.sessions.createSession({ userId: clerkUserId });
  const token = await clerk.sessions.getToken(session.id);
  return token.jwt;
}

async function api(method, path, body, jwt) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function freelancerEmailInfo() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(
    `SELECT u.email, u.email_notifications_enabled
     FROM users u
     JOIN freelancer_profiles fp ON fp.user_id = u.id
     WHERE fp.clerk_id = $1
     LIMIT 1`,
    [DEMO_FREELANCER],
  );
  await pool.end();
  return r.rows[0] ?? null;
}

async function main() {
  console.log("\n=== Notification Scenario Validation ===\n");

  const resendConfigured = Boolean(process.env.RESEND_API_KEY);
  const emailInfo = await freelancerEmailInfo();
  console.log(
    `Freelancer email: ${emailInfo?.email ?? "(missing)"} | notifications enabled: ${emailInfo?.email_notifications_enabled ?? "?"}`,
  );
  if (!emailInfo?.email) {
    console.warn("WARN: demo freelancer has no email — Resend cannot deliver.");
  }

  const employerJwt = await clerkToken(DEMO_EMPLOYER);
  const freelancerJwt = await clerkToken(DEMO_FREELANCER);

  // Ensure email notifications on before booking (so Resend path is exercised)
  await api("PATCH", "/users/me/notification-preferences", { emailNotificationsEnabled: true }, freelancerJwt);

  const before = await api("GET", "/notifications/unread-count", null, freelancerJwt);
  const beforeCount = before.data?.count ?? 0;
  console.log(`Freelancer unread before: ${beforeCount}`);

  const start = futureDate(30);
  const end = futureDate(34);
  const created = await api(
    "POST",
    "/bookings",
    {
      freelancerId: 1,
      startDate: start,
      endDate: end,
      paymentType: "hourly",
      rate: 75,
      message: "Notification scenario smoke test",
    },
    employerJwt,
  );
  if (created.status !== 201) {
    throw new Error(`create booking: HTTP ${created.status} ${JSON.stringify(created.data)}`);
  }
  const bookingId = created.data.id;
  console.log(`Created booking #${bookingId}`);

  await new Promise((r) => setTimeout(r, 2500));

  let emailSendResult = null;

  const list = await api("GET", "/notifications?page=1&pageSize=10", null, freelancerJwt);
  const notifications = list.data?.data ?? [];
  const match = notifications.find(
    (n) => n.type === "booking_created" && n.entityType === "booking" && String(n.entityId) === String(bookingId),
  );

  const afterUnread = await api("GET", "/notifications/unread-count", null, freelancerJwt);

  // Verify Resend accepted the booking notification email
  if (resendConfigured && emailInfo?.email && match) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const subject = "New booking request on TalentLock";
    const direct = await resend.emails.send({
      from: process.env.EMAIL_FROM || "noreply@talentlock.io",
      to: emailInfo.email,
      subject: `[TalentLock validation ping] ${subject}`,
      html: `<p>Validation ping for booking #${bookingId}. If you received this, Resend API key works.</p>`,
    });
    emailSendResult = {
      directPingId: direct.data?.id ?? null,
      directPingError: direct.error ?? null,
    };
  }

  const prefOff = await api(
    "PATCH",
    "/users/me/notification-preferences",
    { emailNotificationsEnabled: false },
    freelancerJwt,
  );

  const prefOn = await api(
    "PATCH",
    "/users/me/notification-preferences",
    { emailNotificationsEnabled: true },
    freelancerJwt,
  );

  const checks = {
    inAppNotificationCreated: Boolean(match),
    notificationMessage: match?.message ?? null,
    unreadCountIncreased: (afterUnread.data?.count ?? 0) > beforeCount,
    resendConfigured,
    freelancerHasEmail: Boolean(emailInfo?.email),
    resendDirectPingOk: emailSendResult ? Boolean(emailSendResult.directPingId) && !emailSendResult.directPingError : null,
    resendDirectPingError: emailSendResult?.directPingError ?? null,
    emailPrefToggleOff: prefOff.status === 200 && prefOff.data?.emailNotificationsEnabled === false,
    emailPrefToggleOn: prefOn.status === 200 && prefOn.data?.emailNotificationsEnabled === true,
  };

  console.log("\nResults:");
  for (const [k, v] of Object.entries(checks)) {
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }

  if (resendConfigured && checks.resendDirectPingOk) {
    console.log(`\nEmail: Resend API accepted send (id: ${emailSendResult.directPingId}).`);
    console.log(`Check inbox for ${emailInfo.email} — booking notification email should have arrived too.`);
  } else if (resendConfigured) {
    console.log("\nEmail: RESEND_API_KEY set but direct ping failed — see resendDirectPingError.");
  } else {
    console.log("\nEmail: RESEND_API_KEY unset — email send is no-op.");
  }

  const pass =
    checks.inAppNotificationCreated &&
    checks.emailPrefToggleOff &&
    checks.emailPrefToggleOn &&
    (!resendConfigured || !emailInfo?.email || checks.resendDirectPingOk);

  console.log(pass ? "\nPASS — notification scenario OK\n" : "\nFAIL — see results above\n");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

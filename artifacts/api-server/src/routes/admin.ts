import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  bookingsTable,
  jobRequirementsTable,
  agreementsTable,
  meetingsTable,
  jobInterestsTable,
  notificationsTable,
  subscriptionsTable,
  auditLogsTable,
  freelancerProfilesTable,
  employerProfilesTable,
} from "@workspace/db";
import { sql, desc, eq, gte, count, and } from "drizzle-orm";
import {
  verifyAdminCredentials,
  issueAdminCookie,
  clearAdminCookie,
  isAdminRequest,
  requireAdmin,
} from "../lib/adminAuth";

const router: IRouter = Router();

// Naive in-memory rate limit: 10 attempts / 5 min per IP.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX = 10;

router.post("/admin/login", async (req, res) => {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (entry && entry.resetAt > now && entry.count >= LOGIN_MAX) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }

  const { username, password } = (req.body ?? {}) as {
    username?: string;
    password?: string;
  };
  if (!verifyAdminCredentials(username, password)) {
    res.status(401).json({ error: "Invalid admin credentials." });
    return;
  }
  // Reset rate limit on success.
  loginAttempts.delete(ip);
  issueAdminCookie(res);
  try {
    await db.insert(auditLogsTable).values({
      event: "admin.login",
      email: typeof username === "string" ? username : null,
      role: "admin",
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to write admin login audit");
  }
  res.json({ ok: true });
});

router.post("/admin/logout", async (req, res) => {
  const wasAdmin = isAdminRequest(req);
  clearAdminCookie(res);
  if (wasAdmin) {
    try {
      await db.insert(auditLogsTable).values({
        event: "admin.logout",
        role: "admin",
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      });
    } catch (err) {
      req.log.error({ err }, "Failed to write admin logout audit");
    }
  }
  res.json({ ok: true });
});

router.get("/admin/me", (req, res) => {
  res.json({ admin: isAdminRequest(req) });
});

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [users] = await db.select({ c: count() }).from(usersTable);
    const [freelancers] = await db.select({ c: count() }).from(usersTable).where(eq(usersTable.role, "freelancer"));
    const [employers] = await db.select({ c: count() }).from(usersTable).where(eq(usersTable.role, "employer"));
    const [bookings] = await db.select({ c: count() }).from(bookingsTable);
    const [activeBookings] = await db.select({ c: count() }).from(bookingsTable).where(eq(bookingsTable.status, "active"));
    const [pendingBookings] = await db.select({ c: count() }).from(bookingsTable).where(eq(bookingsTable.status, "pending"));
    const [jobs] = await db.select({ c: count() }).from(jobRequirementsTable);
    const [openJobs] = await db.select({ c: count() }).from(jobRequirementsTable).where(eq(jobRequirementsTable.status, "open"));
    const [agreements] = await db.select({ c: count() }).from(agreementsTable);
    const [meetings] = await db.select({ c: count() }).from(meetingsTable);
    const [interests] = await db.select({ c: count() }).from(jobInterestsTable);
    const [subs] = await db.select({ c: count() }).from(subscriptionsTable);
    const [recentLogins] = await db
      .select({ c: count() })
      .from(auditLogsTable)
      .where(and(eq(auditLogsTable.event, "user.login"), gte(auditLogsTable.createdAt, oneDayAgo)));

    const planBreakdown = await db
      .select({ plan: subscriptionsTable.plan, c: count() })
      .from(subscriptionsTable)
      .groupBy(subscriptionsTable.plan);

    res.json({
      users: {
        total: users.c,
        freelancers: freelancers.c,
        employers: employers.c,
      },
      bookings: {
        total: bookings.c,
        active: activeBookings.c,
        pending: pendingBookings.c,
      },
      jobs: { total: jobs.c, open: openJobs.c },
      agreements: agreements.c,
      meetings: meetings.c,
      interests: interests.c,
      subscriptions: { total: subs.c, byPlan: planBreakdown },
      activity: { loginsLast24h: recentLogins.c },
    });
  } catch (err) {
    (_req as any).log?.error({ err }, "Failed to load admin stats");
    res.status(500).json({ error: "Failed to load stats." });
  }
});

router.get("/admin/users", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit);
  res.json(rows);
});

router.get("/admin/audit", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);
  res.json(rows);
});

router.get("/admin/bookings", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      startDate: bookingsTable.startDate,
      endDate: bookingsTable.endDate,
      paymentType: bookingsTable.paymentType,
      rate: bookingsTable.rate,
      createdAt: bookingsTable.createdAt,
      freelancerName: freelancerProfilesTable.name,
      employerCompany: employerProfilesTable.companyName,
    })
    .from(bookingsTable)
    .leftJoin(freelancerProfilesTable, eq(bookingsTable.freelancerId, freelancerProfilesTable.id))
    .leftJoin(employerProfilesTable, eq(bookingsTable.employerId, employerProfilesTable.id))
    .orderBy(desc(bookingsTable.createdAt))
    .limit(limit);
  res.json(rows);
});

router.get("/admin/jobs", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await db
    .select({
      id: jobRequirementsTable.id,
      title: jobRequirementsTable.title,
      status: jobRequirementsTable.status,
      createdAt: jobRequirementsTable.createdAt,
      employerCompany: employerProfilesTable.companyName,
    })
    .from(jobRequirementsTable)
    .leftJoin(employerProfilesTable, eq(jobRequirementsTable.employerId, employerProfilesTable.id))
    .orderBy(desc(jobRequirementsTable.createdAt))
    .limit(limit);
  res.json(rows);
});

router.get("/admin/subscriptions", requireAdmin, async (_req, res) => {
  const rows = await db
    .select({
      id: subscriptionsTable.id,
      userId: subscriptionsTable.userId,
      plan: subscriptionsTable.plan,
      status: subscriptionsTable.status,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      updatedAt: subscriptionsTable.updatedAt,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
    })
    .from(subscriptionsTable)
    .leftJoin(usersTable, eq(subscriptionsTable.userId, usersTable.id))
    .orderBy(desc(subscriptionsTable.updatedAt));
  res.json(rows);
});

router.post("/admin/wipe-all-data", requireAdmin, async (req, res) => {
  try {
    await db.execute(sql`
      TRUNCATE TABLE
        audit_logs, messages, conversations, agreements, meetings,
        bookings, job_requirements, subscriptions,
        freelancer_profiles, employer_profiles, users
      RESTART IDENTITY CASCADE
    `);
    req.log.warn({ ip: req.ip }, "Admin wiped all data");
    res.json({ ok: true, message: "All data wiped and sequences reset." });
  } catch (err) {
    req.log.error({ err }, "Failed to wipe data");
    res.status(500).json({ error: "Wipe failed" });
  }
});

export default router;

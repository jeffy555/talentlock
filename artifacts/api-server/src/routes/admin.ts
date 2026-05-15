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

router.post("/admin/migrate", requireAdmin, async (req, res) => {
  try {
    await db.execute(sql`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS proposed_rate NUMERIC(10,2);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS last_proposed_by TEXT;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS negotiation_status TEXT NOT NULL DEFAULT 'agreed';
      ALTER TABLE agreements ADD COLUMN IF NOT EXISTS freelancer_downloaded_at TIMESTAMPTZ;
      ALTER TABLE agreements ADD COLUMN IF NOT EXISTS employer_downloaded_at TIMESTAMPTZ;
    `);
    req.log.info("Admin ran production migration for negotiation + vault columns");
    res.json({ ok: true, message: "Migration applied (idempotent)." });
  } catch (err) {
    req.log.error({ err }, "Migration failed");
    res.status(500).json({ error: "Migration failed" });
  }
});

router.post("/admin/seed-demo", requireAdmin, async (req, res) => {
  const demoFreelancers = [
    { clerkId: "demo_teacher_01", name: "Sarah Mitchell", email: "sarah.mitchell@demo.talentlock.io", tagline: "Experienced High School Teacher · 11 Years", bio: "Passionate educator with 11 years in secondary education, specialising in English Literature and creative writing. Skilled at differentiated instruction, curriculum design, and motivating students of all learning styles.", fieldOfWork: "Teaching & Education", skills: ["Curriculum Design","Differentiated Instruction","Classroom Management","English Literature","Creative Writing","GCSE/A-Level Teaching"], yearsExperience: 11, paymentPreference: "hourly", hourlyRate: "65", dailyRate: null },
    { clerkId: "demo_professor_02", name: "Dr. Robert Adeyemi", email: "robert.adeyemi@demo.talentlock.io", tagline: "University Professor & Academic Researcher · 18 Years", bio: "PhD in Economics from Oxford. Full professor with 18 years of academic experience covering macroeconomics, behavioural finance, and policy research. Published in 30+ peer-reviewed journals. Available for lecturing, research consulting, and curriculum advisory roles.", fieldOfWork: "Research & Academia", skills: ["Macroeconomics","Econometrics","Academic Research","Policy Analysis","Lecturing","Peer Review","SPSS","R"], yearsExperience: 18, paymentPreference: "daily", hourlyRate: null, dailyRate: "1800" },
    { clerkId: "demo_tutor_03", name: "Emma Nakamura", email: "emma.nakamura@demo.talentlock.io", tagline: "Academic Tutor — Maths & Sciences · 6 Years", bio: "First-class Mathematics graduate specialising in one-to-one and small-group tutoring for ages 10–18. Proven track record of improving exam grades by 2+ bands. Calm, patient approach that builds confidence alongside knowledge.", fieldOfWork: "Teaching & Education", skills: ["Mathematics","Physics","Chemistry","GCSE Tutoring","A-Level Tutoring","Exam Technique","SAT Prep","IB Maths"], yearsExperience: 6, paymentPreference: "hourly", hourlyRate: "55", dailyRate: null },
    { clerkId: "demo_trainer_04", name: "Michael Lawson", email: "michael.lawson@demo.talentlock.io", tagline: "Corporate L&D Trainer & Facilitator · 14 Years", bio: "Senior learning & development professional with 14 years designing and delivering corporate training programmes for Fortune 500 companies. Expert in leadership development, change management, and high-impact facilitation. Certified coach (ICF ACC).", fieldOfWork: "Teaching & Education", skills: ["Leadership Development","Facilitation","Change Management","E-Learning Design","LMS Platforms","Instructional Design","Executive Coaching","Workshop Delivery"], yearsExperience: 14, paymentPreference: "daily", hourlyRate: null, dailyRate: "2200" },
    { clerkId: "demo_designer_05", name: "Isabella Reyes", email: "isabella.reyes@demo.talentlock.io", tagline: "Senior Graphic Designer · Brand & Visual Identity · 9 Years", bio: "Award-winning graphic designer specialising in brand identity, packaging, and print. Former creative lead at a top-10 London agency. Translates business strategy into compelling visual language that resonates with target audiences.", fieldOfWork: "Graphic Design", skills: ["Adobe Illustrator","Adobe Photoshop","InDesign","Brand Identity","Packaging Design","Typography","Print Design","Figma"], yearsExperience: 9, paymentPreference: "daily", hourlyRate: null, dailyRate: "950" },
    { clerkId: "demo_writer_06", name: "Oliver Bennett", email: "oliver.bennett@demo.talentlock.io", tagline: "Content Writer & Copywriter · B2B & SaaS · 8 Years", bio: "Strategic writer with 8 years crafting high-converting copy and long-form content for SaaS, fintech, and B2B brands. Expert in SEO content strategy, white papers, and sales enablement. Former head of content at two Series-B startups.", fieldOfWork: "Content Writing & Copywriting", skills: ["SEO Copywriting","Long-Form Content","White Papers","Case Studies","Email Campaigns","Content Strategy","B2B Writing","SaaS Copywriting"], yearsExperience: 8, paymentPreference: "hourly", hourlyRate: "95", dailyRate: null },
    { clerkId: "demo_editor_07", name: "Natasha Kowalski", email: "natasha.kowalski@demo.talentlock.io", tagline: "Senior Editor — Books, Articles & Scripts · 12 Years", bio: "Professional editor with 12 years across publishing, journalism, and digital media. Developmental and copy editing for non-fiction, business books, and feature articles. Former commissioning editor at a major UK publisher.", fieldOfWork: "Content Writing & Copywriting", skills: ["Developmental Editing","Copy Editing","Proofreading","Style Guides","Non-Fiction","Journalism","Script Editing","Publishing"], yearsExperience: 12, paymentPreference: "hourly", hourlyRate: "80", dailyRate: null },
    { clerkId: "demo_videographer_08", name: "Kwame Asante", email: "kwame.asante@demo.talentlock.io", tagline: "Videographer & Video Director · Corporate & Commercial · 7 Years", bio: "Creative videographer specialising in corporate films, product commercials, and event documentation. Skilled from pre-production through to final colour grade. Past clients include FTSE 100 companies and global NGOs.", fieldOfWork: "Video Production & Editing", skills: ["Sony / RED Camera Operation","Adobe Premiere Pro","DaVinci Resolve","Colour Grading","Motion Graphics","Drone Operation","Live Events","Corporate Films"], yearsExperience: 7, paymentPreference: "daily", hourlyRate: null, dailyRate: "1100" },
    { clerkId: "demo_electrician_09", name: "Brian O'Connor", email: "brian.oconnor@demo.talentlock.io", tagline: "Master Electrician · Residential & Commercial · 20 Years", bio: "Fully licensed master electrician with 20 years of experience across residential, commercial, and industrial installations. Specialises in smart home wiring, solar panel integration, and EV charger installation. All work certified and insured.", fieldOfWork: "Engineering (Civil/Mechanical/Electrical)", skills: ["Electrical Installation","Fault Diagnosis","Smart Home Wiring","Solar Integration","EV Charger Installation","18th Edition Wiring","PAT Testing","Emergency Lighting"], yearsExperience: 20, paymentPreference: "hourly", hourlyRate: "75", dailyRate: null },
    { clerkId: "demo_plumber_10", name: "Carlos Mendez", email: "carlos.mendez@demo.talentlock.io", tagline: "Licensed Plumber & Gas Engineer · 15 Years", bio: "Gas Safe registered plumber and heating engineer with 15 years handling emergency call-outs, full bathroom fit-outs, and central heating installations. Reliable, tidy, and fully insured.", fieldOfWork: "Engineering (Civil/Mechanical/Electrical)", skills: ["Plumbing Installation","Boiler Installation","Central Heating","Bathroom Fitting","Gas Safe Registered","Leak Detection","Underfloor Heating","Emergency Plumbing"], yearsExperience: 15, paymentPreference: "hourly", hourlyRate: "70", dailyRate: null },
    { clerkId: "demo_carpenter_11", name: "Henry Williams", email: "henry.williams@demo.talentlock.io", tagline: "Master Carpenter · Bespoke Joinery & Fit-Out · 17 Years", bio: "Skilled master carpenter specialising in bespoke furniture, fitted kitchens, and commercial shopfitting. Combines traditional joinery techniques with modern CNC precision. Portfolio spans luxury residential homes and high-street retail interiors.", fieldOfWork: "Engineering (Civil/Mechanical/Electrical)", skills: ["Bespoke Furniture","Fitted Kitchens","Shopfitting","CNC Machining","Hardwood Joinery","Cabinet Making","Timber Framing","Site Management"], yearsExperience: 17, paymentPreference: "daily", hourlyRate: null, dailyRate: "550" },
    { clerkId: "demo_welder_12", name: "Angela Foster", email: "angela.foster@demo.talentlock.io", tagline: "Certified Welder · Structural & Artistic · 10 Years", bio: "Coded welder with 10 years across structural steel fabrication, pipework, and artistic metalwork. Holds AWS D1.1 and ASME Section IX certifications. Experienced in MIG, TIG, and stick welding across carbon steel, stainless, and aluminium.", fieldOfWork: "Engineering (Civil/Mechanical/Electrical)", skills: ["MIG Welding","TIG Welding","Stick Welding","Structural Steel","Pipe Welding","Aluminium Fabrication","AWS D1.1 Certified","Blueprint Reading"], yearsExperience: 10, paymentPreference: "hourly", hourlyRate: "65", dailyRate: null },
  ];

  try {
    let seeded = 0;
    for (const f of demoFreelancers) {
      const inserted = await db.insert(usersTable).values({
        clerkId: f.clerkId, role: "freelancer", email: f.email, name: f.name,
      }).onConflictDoNothing().returning();

      if (inserted.length === 0) continue;
      const user = inserted[0];

      await db.insert(freelancerProfilesTable).values({
        clerkId: f.clerkId, userId: user.id, name: f.name, tagline: f.tagline,
        bio: f.bio, fieldOfWork: f.fieldOfWork, skills: f.skills,
        yearsExperience: f.yearsExperience, paymentPreference: f.paymentPreference as any,
        hourlyRate: f.hourlyRate ?? undefined, dailyRate: f.dailyRate ?? undefined,
        isVerified: true, isAvailable: true, verificationStatus: "verified",
      } as any).onConflictDoNothing();

      seeded++;
    }
    req.log.info({ seeded }, "Admin seeded demo freelancers");
    res.json({ ok: true, seeded, message: `${seeded} demo freelancers seeded.` });
  } catch (err) {
    req.log.error({ err }, "Failed to seed demo data");
    res.status(500).json({ error: "Seed failed" });
  }
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

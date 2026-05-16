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
    await db.execute(sql`
      UPDATE agreements a
      SET
        freelancer_signed_at      = NOW(),
        freelancer_signature_name = fp.name,
        status                    = 'signed'
      FROM freelancer_profiles fp
      WHERE a.freelancer_id        = fp.id
        AND fp.clerk_id            LIKE 'demo_%'
        AND a.employer_signed_at   IS NOT NULL
        AND a.freelancer_signed_at IS NULL
    `);
    await db.execute(sql`
      UPDATE bookings b
      SET status = 'active'
      FROM agreements a
      WHERE a.booking_id = b.id
        AND a.status     = 'signed'
        AND b.status    != 'active'
    `);
    req.log.info("Admin ran production migration for negotiation + vault columns + demo-freelancer auto-sign fix");
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

router.post("/admin/seed-jobs", requireAdmin, async (req, res) => {
  const now = new Date();
  const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000);

  const demoJobs = [
    {
      title: "Senior Frontend Engineer (React / TypeScript)",
      fieldOfWork: "Web Development",
      description: "We're a fast-growing B2B SaaS company looking for a senior frontend engineer to lead our design-system overhaul and own our customer-facing dashboard. You'll work closely with product and design to ship high-quality, accessible UI at pace. The role is fully remote with optional quarterly on-site meetups in London.\n\nYou'll be responsible for architecting reusable component libraries, mentoring two mid-level engineers, and driving our move from class components to React hooks. TypeScript strict mode is non-negotiable — we care deeply about type safety.",
      requiredSkills: ["React","TypeScript","Tailwind CSS","React Query","Vite","Storybook","Accessibility (WCAG)","Figma handoff"],
      minExperience: 5, paymentType: "daily", budget: "900", startDate: d(14), endDate: d(104),
    },
    {
      title: "Data Scientist — Marketing Analytics",
      fieldOfWork: "Data Science & Analytics",
      description: "Our growth team needs a data scientist to build and maintain our marketing mix models, attribution pipelines, and customer lifetime value forecasts. You'll own the analytics layer end-to-end — from raw event data in BigQuery through to executive dashboards in Looker.\n\nThe ideal candidate has hands-on experience with incrementality testing, is comfortable writing production-quality Python, and can communicate statistical findings clearly to non-technical stakeholders.",
      requiredSkills: ["Python","SQL","BigQuery","Looker","Marketing Mix Modelling","A/B Testing","pandas","scikit-learn"],
      minExperience: 4, paymentType: "daily", budget: "850", startDate: d(7), endDate: d(97),
    },
    {
      title: "Curriculum Designer — Corporate eLearning",
      fieldOfWork: "Teaching & Education",
      description: "We are redesigning our entire onboarding and compliance training suite (12 modules) for a workforce of 3 000 employees across five countries. We need an experienced instructional designer to lead content architecture, write scripts, and produce SCORM-compliant courses in Articulate 360.\n\nYou'll collaborate with subject-matter experts across HR, Legal, and Finance to ensure accuracy while keeping learner engagement high. Experience with microlearning formats and knowledge-check design is essential.",
      requiredSkills: ["Instructional Design","Articulate 360","SCORM","Storyboarding","Adult Learning Theory","LMS Administration","Script Writing","Microlearning"],
      minExperience: 5, paymentType: "daily", budget: "650", startDate: d(21), endDate: d(111),
    },
    {
      title: "Brand Identity Designer — Startup Rebrand",
      fieldOfWork: "Graphic Design",
      description: "We're a Series-A fintech pivoting from B2C to B2B and need a brand identity designer to craft a new visual system from scratch — logo, colour palette, typography, iconography, and a full brand-guidelines document. The deliverable is a production-ready Figma file and a PDF brand book.\n\nWe want something that conveys trust, clarity, and quiet confidence. Think less flashy fintech, more considered consultancy. You'll present three distinct directions before refining to one.",
      requiredSkills: ["Brand Identity","Logo Design","Figma","Adobe Illustrator","Typography","Colour Theory","Brand Guidelines","Presentation Design"],
      minExperience: 6, paymentType: "fixed", budget: "7500", startDate: d(10), endDate: d(55),
    },
    {
      title: "Technical Content Writer — Developer Documentation",
      fieldOfWork: "Content Writing & Copywriting",
      description: "Our API platform currently has patchy, inconsistent docs that are costing us developer adoption. We need a technical writer who can audit what we have, rewrite the getting-started guides, create code-snippet tutorials in Python and JavaScript, and establish a style guide for future contributors.\n\nThe ideal candidate has shipped documentation for a developer-facing product before and is comfortable reading source code to verify accuracy.",
      requiredSkills: ["Technical Writing","API Documentation","Markdown","OpenAPI / Swagger","Python","JavaScript","Developer Portals","Style Guides"],
      minExperience: 4, paymentType: "hourly", budget: "90", startDate: d(5), endDate: d(65),
    },
    {
      title: "EV Charging Infrastructure Electrician",
      fieldOfWork: "Engineering (Civil/Mechanical/Electrical)",
      description: "We are rolling out a network of 150 EV chargers across retail car parks in the South East of England over six months. We need licensed electricians with specific experience in OZEV-approved EV charger installation (both AC 7kW and DC 50kW+ rapid chargers), DNO liaison, and on-site commissioning.\n\nWork is site-based and will involve occasional overnight stays. White-van supply and full indemnity insurance required.",
      requiredSkills: ["EV Charger Installation","18th Edition Wiring","OZEV Approved Installer","DNO Liaison","Three-Phase Power","Commissioning","Site Management","PAT Testing"],
      minExperience: 5, paymentType: "daily", budget: "600", startDate: d(28), endDate: d(208),
    },
    {
      title: "Academic Researcher — Behavioural Economics",
      fieldOfWork: "Research & Academia",
      description: "A think-tank focused on consumer financial wellbeing is seeking a behavioural economics researcher for a 3-month project examining how choice architecture in banking apps affects saving behaviour. Deliverables include a literature review, an experimental design proposal, and a 10 000-word policy report.\n\nThe researcher will work independently with fortnightly check-ins. Access to participant panels and survey tools will be provided.",
      requiredSkills: ["Behavioural Economics","Experimental Design","Quantitative Research","Qualitative Research","Academic Writing","Policy Analysis","SPSS or R","Literature Review"],
      minExperience: 7, paymentType: "fixed", budget: "18000", startDate: d(14), endDate: d(104),
    },
    {
      title: "Corporate Video Producer — Product Launch Campaign",
      fieldOfWork: "Video Production & Editing",
      description: "We're launching a new hardware product in Q3 and need a videographer/director to plan and shoot a suite of launch assets: a 90-second hero film, three 15-second social cutdowns, and a 4-minute explainer for our website. Shooting takes place over two days at our HQ in Manchester.\n\nPost-production including colour grade, motion graphics, and music licensing is included in scope. We'll provide a brand brief and mood board.",
      requiredSkills: ["Video Direction","Sony FX Series / RED","Adobe Premiere Pro","DaVinci Resolve","Motion Graphics (After Effects)","Colour Grading","Music Licensing","Storyboarding"],
      minExperience: 6, paymentType: "fixed", budget: "12000", startDate: d(30), endDate: d(65),
    },
    {
      title: "Private Mathematics Tutor — A-Level & IB",
      fieldOfWork: "Teaching & Education",
      description: "A family is seeking a specialist mathematics tutor for a Year 13 student preparing for both A-Level Further Mathematics and IB HL Mathematics examinations in May. Sessions are two hours, twice per week, delivered online via Zoom with a shared digital whiteboard.\n\nThe student is predicted A*/7 but needs to solidify proof by induction, complex numbers, and differential equations. Previous exam-coaching experience is essential.",
      requiredSkills: ["A-Level Mathematics","IB HL Mathematics","Further Mathematics","Proof by Induction","Complex Numbers","Differential Equations","Exam Technique","Zoom / Online Teaching"],
      minExperience: 3, paymentType: "hourly", budget: "75", startDate: d(3), endDate: d(63),
    },
    {
      title: "Bespoke Kitchen & Joinery Installer",
      fieldOfWork: "Engineering (Civil/Mechanical/Electrical)",
      description: "A residential developer completing a 6-unit luxury apartment scheme in Edinburgh requires a skilled carpenter/joiner to install bespoke fitted kitchens, wardrobes, and bathroom vanity units supplied by a specialist manufacturer. All units are pre-assembled flat-pack requiring precise site fitting, scribing, and finishing.\n\nWork is five days per week on-site. The developer will provide a site induction and all relevant health & safety documentation.",
      requiredSkills: ["Kitchen Installation","Bespoke Joinery","Scribing & Fitting","Floating Floors","Silicone Finishing","Reading Technical Drawings","CSCS Card","Site Safety"],
      minExperience: 8, paymentType: "daily", budget: "500", startDate: d(21), endDate: d(91),
    },
    {
      title: "Ghostwriter — Business Memoir & Leadership Book",
      fieldOfWork: "Content Writing & Copywriting",
      description: "A FTSE 250 CEO is looking for an experienced ghostwriter to co-author a 60 000-word business memoir and leadership guide. The project begins with a series of recorded interview sessions (approx. 20 hours) before moving into structured drafting. The author has a clear vision for the narrative arc; the ghostwriter's role is to bring it to life in a compelling, publishable voice.\n\nStrict NDA required. Expected delivery in 8 months.",
      requiredSkills: ["Ghostwriting","Long-Form Non-Fiction","Interviewing","Narrative Structure","Business Writing","Publishing Process","NDA-Comfortable","Voice Matching"],
      minExperience: 8, paymentType: "fixed", budget: "35000", startDate: d(10), endDate: d(250),
    },
    {
      title: "DevOps Engineer — AWS Migration & CI/CD",
      fieldOfWork: "DevOps & Cloud Infrastructure",
      description: "We are migrating a legacy monolith (Node.js / PostgreSQL) from a managed VPS to AWS (ECS Fargate + RDS Aurora). We need a senior DevOps engineer to design the target architecture, write Terraform modules, configure GitHub Actions pipelines, and oversee a zero-downtime cutover.\n\nThe engagement is approximately 10 weeks. You'll work alongside our two backend engineers and report directly to our CTO. Must have hands-on experience with ECS, RDS, and Terraform.",
      requiredSkills: ["AWS ECS Fargate","Terraform","GitHub Actions","RDS Aurora","Docker","Networking (VPC / ALB)","Secrets Manager","Zero-Downtime Deployments"],
      minExperience: 6, paymentType: "daily", budget: "950", startDate: d(14), endDate: d(84),
    },
  ];

  try {
    // Find or create a demo employer
    const EMPLOYER_CLERK_ID = "demo_employer_jobs_01";
    let [existingUser] = await db.select().from(usersTable).where(eq(usersTable.clerkId, EMPLOYER_CLERK_ID)).limit(1);

    if (!existingUser) {
      const [newUser] = await db.insert(usersTable).values({
        clerkId: EMPLOYER_CLERK_ID, role: "employer",
        email: "demo.employer@demo.talentlock.io",
        name: "TalentLock Demo Corp",
      }).returning();
      existingUser = newUser;
    }

    let [employerProfile] = await db.select().from(employerProfilesTable)
      .where(eq(employerProfilesTable.clerkId, EMPLOYER_CLERK_ID)).limit(1);

    if (!employerProfile) {
      [employerProfile] = await db.insert(employerProfilesTable).values({
        clerkId: EMPLOYER_CLERK_ID, userId: existingUser.id,
        companyName: "TalentLock Demo Corp",
        industry: "Professional Services",
        companySize: "50-250",
        description: "A demonstration employer account showcasing the TalentLock platform with diverse hiring requirements across multiple industries.",
        isVerified: true, verificationStatus: "verified",
      }).returning();
    }

    let seeded = 0;
    for (const j of demoJobs) {
      await db.insert(jobRequirementsTable).values({
        employerId: employerProfile.id,
        title: j.title,
        fieldOfWork: j.fieldOfWork,
        description: j.description,
        requiredSkills: j.requiredSkills,
        minExperience: j.minExperience,
        paymentType: j.paymentType as "hourly" | "daily" | "fixed",
        budget: j.budget,
        startDate: j.startDate,
        endDate: j.endDate,
        status: "open",
      });
      seeded++;
    }

    req.log.info({ seeded }, "Admin seeded demo job listings");
    res.json({ ok: true, seeded, message: `${seeded} demo job listings seeded.` });
  } catch (err) {
    req.log.error({ err }, "Failed to seed demo jobs");
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

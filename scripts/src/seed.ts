import { db } from "@workspace/db";
import { usersTable, freelancerProfilesTable } from "@workspace/db";
import { onConflictDoNothing } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";

const SYSTEM_USER_CLERK_ID = "system";

async function ensureSystemUser(): Promise<void> {
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkId, SYSTEM_USER_CLERK_ID))
    .limit(1);

  if (existing) {
    console.log("System user already exists.");
    return;
  }

  await db.insert(usersTable).values({
    clerkId: SYSTEM_USER_CLERK_ID,
    role: "employer",
    email: "system@talentlock.internal",
    name: "TalentLock System",
  });
  console.log("Created system user for platform token logging.");
}

async function seed() {
  console.log("Ensuring system user...");
  await ensureSystemUser();

  console.log("Seeding demo freelancers...");

  const demoFreelancers = [
    // ── Education ────────────────────────────────────────────────
    {
      clerkId: "demo_teacher_01",
      name: "Sarah Mitchell",
      email: "sarah.mitchell@demo.talentlock.io",
      tagline: "Experienced High School Teacher · 11 Years",
      bio: "Passionate educator with 11 years in secondary education, specialising in English Literature and creative writing. Skilled at differentiated instruction, curriculum design, and motivating students of all learning styles.",
      fieldOfWork: "Teaching & Education",
      skills: ["Curriculum Design", "Differentiated Instruction", "Classroom Management", "English Literature", "Creative Writing", "GCSE/A-Level Teaching"],
      yearsExperience: 11,
      paymentPreference: "hourly" as const,
      hourlyRate: "65",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_professor_02",
      name: "Dr. Robert Adeyemi",
      email: "robert.adeyemi@demo.talentlock.io",
      tagline: "University Professor & Academic Researcher · 18 Years",
      bio: "PhD in Economics from Oxford. Full professor with 18 years of academic experience covering macroeconomics, behavioural finance, and policy research. Published in 30+ peer-reviewed journals. Available for lecturing, research consulting, and curriculum advisory roles.",
      fieldOfWork: "Research & Academia",
      skills: ["Macroeconomics", "Econometrics", "Academic Research", "Policy Analysis", "Lecturing", "Peer Review", "SPSS", "R"],
      yearsExperience: 18,
      paymentPreference: "daily" as const,
      dailyRate: "1800",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_tutor_03",
      name: "Emma Nakamura",
      email: "emma.nakamura@demo.talentlock.io",
      tagline: "Academic Tutor — Maths & Sciences · 6 Years",
      bio: "First-class Mathematics graduate specialising in one-to-one and small-group tutoring for ages 10–18. Proven track record of improving exam grades by 2+ bands. Calm, patient approach that builds confidence alongside knowledge.",
      fieldOfWork: "Teaching & Education",
      skills: ["Mathematics", "Physics", "Chemistry", "GCSE Tutoring", "A-Level Tutoring", "Exam Technique", "SAT Prep", "IB Maths"],
      yearsExperience: 6,
      paymentPreference: "hourly" as const,
      hourlyRate: "55",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_trainer_04",
      name: "Michael Lawson",
      email: "michael.lawson@demo.talentlock.io",
      tagline: "Corporate L&D Trainer & Facilitator · 14 Years",
      bio: "Senior learning & development professional with 14 years designing and delivering corporate training programmes for Fortune 500 companies. Expert in leadership development, change management, and high-impact facilitation. Certified coach (ICF ACC).",
      fieldOfWork: "Teaching & Education",
      skills: ["Leadership Development", "Facilitation", "Change Management", "E-Learning Design", "LMS Platforms", "Instructional Design", "Executive Coaching", "Workshop Delivery"],
      yearsExperience: 14,
      paymentPreference: "daily" as const,
      dailyRate: "2200",
      isVerified: true,
      isAvailable: true,
    },

    // ── Creative ──────────────────────────────────────────────────
    {
      clerkId: "demo_designer_05",
      name: "Isabella Reyes",
      email: "isabella.reyes@demo.talentlock.io",
      tagline: "Senior Graphic Designer · Brand & Visual Identity · 9 Years",
      bio: "Award-winning graphic designer specialising in brand identity, packaging, and print. Former creative lead at a top-10 London agency. Translates business strategy into compelling visual language that resonates with target audiences.",
      fieldOfWork: "Graphic Design",
      skills: ["Adobe Illustrator", "Adobe Photoshop", "InDesign", "Brand Identity", "Packaging Design", "Typography", "Print Design", "Figma"],
      yearsExperience: 9,
      paymentPreference: "daily" as const,
      dailyRate: "950",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_writer_06",
      name: "Oliver Bennett",
      email: "oliver.bennett@demo.talentlock.io",
      tagline: "Content Writer & Copywriter · B2B & SaaS · 8 Years",
      bio: "Strategic writer with 8 years crafting high-converting copy and long-form content for SaaS, fintech, and B2B brands. Expert in SEO content strategy, white papers, and sales enablement. Former head of content at two Series-B startups.",
      fieldOfWork: "Content Writing & Copywriting",
      skills: ["SEO Copywriting", "Long-Form Content", "White Papers", "Case Studies", "Email Campaigns", "Content Strategy", "B2B Writing", "SaaS Copywriting"],
      yearsExperience: 8,
      paymentPreference: "hourly" as const,
      hourlyRate: "95",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_editor_07",
      name: "Natasha Kowalski",
      email: "natasha.kowalski@demo.talentlock.io",
      tagline: "Senior Editor — Books, Articles & Scripts · 12 Years",
      bio: "Professional editor with 12 years across publishing, journalism, and digital media. Developmental and copy editing for non-fiction, business books, and feature articles. Former commissioning editor at a major UK publisher.",
      fieldOfWork: "Content Writing & Copywriting",
      skills: ["Developmental Editing", "Copy Editing", "Proofreading", "Style Guides", "Non-Fiction", "Journalism", "Script Editing", "Publishing"],
      yearsExperience: 12,
      paymentPreference: "hourly" as const,
      hourlyRate: "80",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_videographer_08",
      name: "Kwame Asante",
      email: "kwame.asante@demo.talentlock.io",
      tagline: "Videographer & Video Director · Corporate & Commercial · 7 Years",
      bio: "Creative videographer specialising in corporate films, product commercials, and event documentation. Skilled from pre-production through to final colour grade. Past clients include FTSE 100 companies and global NGOs.",
      fieldOfWork: "Video Production & Editing",
      skills: ["Sony / RED Camera Operation", "Adobe Premiere Pro", "DaVinci Resolve", "Colour Grading", "Motion Graphics", "Drone Operation", "Live Events", "Corporate Films"],
      yearsExperience: 7,
      paymentPreference: "daily" as const,
      dailyRate: "1100",
      isVerified: true,
      isAvailable: true,
    },

    // ── Trades ────────────────────────────────────────────────────
    {
      clerkId: "demo_electrician_09",
      name: "Brian O'Connor",
      email: "brian.oconnor@demo.talentlock.io",
      tagline: "Master Electrician · Residential & Commercial · 20 Years",
      bio: "Fully licensed master electrician with 20 years of experience across residential, commercial, and industrial installations. Specialises in smart home wiring, solar panel integration, and EV charger installation. All work certified and insured.",
      fieldOfWork: "Engineering (Civil/Mechanical/Electrical)",
      skills: ["Electrical Installation", "Fault Diagnosis", "Smart Home Wiring", "Solar Integration", "EV Charger Installation", "17th/18th Edition Wiring Regulations", "PAT Testing", "Emergency Lighting"],
      yearsExperience: 20,
      paymentPreference: "hourly" as const,
      hourlyRate: "75",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_plumber_10",
      name: "Carlos Mendez",
      email: "carlos.mendez@demo.talentlock.io",
      tagline: "Licensed Plumber & Gas Engineer · 15 Years",
      bio: "Gas Safe registered plumber and heating engineer with 15 years handling everything from emergency call-outs to full bathroom fit-outs and central heating system installations. Reliable, tidy, and fully insured.",
      fieldOfWork: "Engineering (Civil/Mechanical/Electrical)",
      skills: ["Plumbing Installation", "Boiler Installation", "Central Heating", "Bathroom Fitting", "Gas Safe Registered", "Leak Detection", "Underfloor Heating", "Emergency Plumbing"],
      yearsExperience: 15,
      paymentPreference: "hourly" as const,
      hourlyRate: "70",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_carpenter_11",
      name: "Henry Williams",
      email: "henry.williams@demo.talentlock.io",
      tagline: "Master Carpenter · Bespoke Joinery & Fit-Out · 17 Years",
      bio: "Skilled master carpenter specialising in bespoke furniture, fitted kitchens, and commercial shopfitting. Combines traditional joinery techniques with modern CNC precision. Portfolio spans luxury residential homes and high-street retail interiors.",
      fieldOfWork: "Engineering (Civil/Mechanical/Electrical)",
      skills: ["Bespoke Furniture", "Fitted Kitchens", "Shopfitting", "CNC Machining", "Hardwood Joinery", "Cabinet Making", "Timber Framing", "Site Management"],
      yearsExperience: 17,
      paymentPreference: "daily" as const,
      dailyRate: "550",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_welder_12",
      name: "Angela Foster",
      email: "angela.foster@demo.talentlock.io",
      tagline: "Certified Welder · Structural & Artistic · 10 Years",
      bio: "Coded welder with 10 years across structural steel fabrication, pipework, and artistic metalwork. Holds AWS D1.1 and ASME Section IX certifications. Experienced in MIG, TIG, and stick welding across carbon steel, stainless, and aluminium.",
      fieldOfWork: "Engineering (Civil/Mechanical/Electrical)",
      skills: ["MIG Welding", "TIG Welding", "Stick Welding", "Structural Steel", "Pipe Welding", "Aluminium Fabrication", "AWS D1.1 Certified", "Blueprint Reading"],
      yearsExperience: 10,
      paymentPreference: "hourly" as const,
      hourlyRate: "65",
      isVerified: true,
      isAvailable: true,
    },

    // ── DevOps & Cloud ───────────────────────────────────────────
    {
      clerkId: "demo_devops_50",
      name: "Alex Petrov",
      email: "alex.petrov@demo.talentlock.io",
      tagline: "Senior DevOps & SRE Engineer · AWS & Kubernetes · 9 Years",
      bio: "Site reliability and DevOps engineer with 9 years building and operating large-scale cloud infrastructure on AWS and GCP. Expert in Kubernetes (EKS/GKE), Terraform, Helm, and GitHub Actions. Has led zero-downtime migrations, implemented observability stacks (Prometheus, Grafana, PagerDuty), and reduced infrastructure costs by 40% through right-sizing and spot strategy.",
      fieldOfWork: "DevOps & Cloud Infrastructure",
      skills: ["AWS / GCP", "Kubernetes (EKS/GKE)", "Terraform", "Helm", "GitHub Actions", "Prometheus & Grafana", "Incident Management", "Docker", "Networking (VPC/ALB)", "Cost Optimisation"],
      yearsExperience: 9,
      paymentPreference: "daily" as const,
      dailyRate: "1050",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_cloud_51",
      name: "Maria Santos",
      email: "maria.santos@demo.talentlock.io",
      tagline: "Cloud Architect · Multi-Cloud & Security · 12 Years",
      bio: "Cloud architect and AWS Certified Solutions Architect Professional with 12 years designing enterprise cloud strategies across AWS, Azure, and GCP. Specialises in well-architected reviews, multi-cloud governance, landing zone design, and cloud security posture management.",
      fieldOfWork: "DevOps & Cloud Infrastructure",
      skills: ["AWS Solutions Architect Professional", "Azure", "GCP", "Landing Zone Design", "Cloud Security (CSPM)", "Multi-Cloud Governance", "Well-Architected Framework", "IAM & Compliance", "Disaster Recovery", "FinOps"],
      yearsExperience: 12,
      paymentPreference: "daily" as const,
      dailyRate: "1300",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_platform_52",
      name: "Ben Clarke",
      email: "ben.clarke@demo.talentlock.io",
      tagline: "Platform Engineer · Kubernetes & Internal Developer Platforms · 6 Years",
      bio: "Platform engineer with 6 years building internal developer platforms that help product teams ship faster and safer. Expert in Kubernetes, ArgoCD, Crossplane, and Backstage. Has designed golden-path CI/CD templates and self-service infrastructure portals that reduced deployment lead times from days to minutes.",
      fieldOfWork: "DevOps & Cloud Infrastructure",
      skills: ["Kubernetes", "ArgoCD / GitOps", "Crossplane", "Backstage (IDP)", "Helm", "CI/CD Design", "Platform Engineering", "Go", "Developer Experience", "Service Mesh (Istio)"],
      yearsExperience: 6,
      paymentPreference: "daily" as const,
      dailyRate: "950",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_sre_53",
      name: "Daniel Okonkwo",
      email: "daniel.okonkwo@demo.talentlock.io",
      tagline: "Site Reliability Engineer · Observability & On-Call · 11 Years",
      bio: "SRE with 11 years keeping mission-critical systems online for fintech and e-commerce platforms. Deep expertise in SLI/SLO design, chaos engineering, incident response, and building reliable on-call rotations. Reduced P1 incidents by 60% at a Series C payments company through better alerting and runbooks.",
      fieldOfWork: "DevOps & Cloud Infrastructure",
      skills: ["SRE / SLI-SLO", "Prometheus", "Grafana", "PagerDuty", "Chaos Engineering", "Linux Administration", "Python", "AWS", "Incident Response", "Capacity Planning"],
      yearsExperience: 11,
      paymentPreference: "daily" as const,
      dailyRate: "1150",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_cicd_54",
      name: "Elena Vasquez",
      email: "elena.vasquez@demo.talentlock.io",
      tagline: "DevOps Engineer · CI/CD & Infrastructure as Code · 8 Years",
      bio: "DevOps engineer with 8 years automating build, test, and deployment pipelines for distributed engineering teams. Specialises in Terraform, Ansible, Jenkins, and GitLab CI. Has migrated monolithic release processes to trunk-based delivery with automated rollbacks and blue-green deployments.",
      fieldOfWork: "DevOps & Cloud Infrastructure",
      skills: ["Terraform", "Ansible", "Jenkins", "GitLab CI", "Docker", "Kubernetes", "Blue-Green Deployments", "Infrastructure as Code", "Bash / Python", "AWS"],
      yearsExperience: 8,
      paymentPreference: "hourly" as const,
      hourlyRate: "110",
      isVerified: true,
      isAvailable: true,
    },
  ];

  let seeded = 0;
  for (const f of demoFreelancers) {
    const { clerkId, name, email, ...profile } = f;

    const inserted = await db.insert(usersTable).values({
      clerkId,
      role: "freelancer",
      email,
      name,
    }).onConflictDoNothing().returning();

    if (inserted.length === 0) {
      console.log(`  Skipped (already exists): ${name}`);
      continue;
    }

    const user = inserted[0];
    await db.insert(freelancerProfilesTable).values({
      clerkId,
      userId: user.id,
      name,
      ...profile,
    } as any).onConflictDoNothing();

    console.log(`  Seeded: ${name}`);
    seeded++;
  }

  console.log(`\nDone — ${seeded} new freelancers seeded (${demoFreelancers.length - seeded} already existed).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

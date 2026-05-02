import { db } from "@workspace/db";
import { usersTable, freelancerProfilesTable, employerProfilesTable, jobRequirementsTable } from "@workspace/db";

async function seed() {
  console.log("Seeding demo data...");

  const existingFreelancers = await db.select().from(freelancerProfilesTable).limit(1);
  if (existingFreelancers.length > 0) {
    console.log("Data already exists, skipping seed.");
    process.exit(0);
  }

  const demoFreelancers = [
    {
      clerkId: "demo_clerk_f1",
      name: "Alexandra Chen",
      tagline: "Senior Full-Stack Engineer · 9 Years Experience",
      bio: "Passionate engineer with expertise in building scalable web applications. Led engineering teams at two Y Combinator startups. Specializing in React, Node.js, and cloud architecture.",
      fieldOfWork: "Software Engineering",
      skills: ["React", "TypeScript", "Node.js", "PostgreSQL", "AWS", "Docker"],
      yearsExperience: 9,
      paymentPreference: "hourly" as const,
      hourlyRate: "185",
      portfolioUrl: "https://alexandrachen.dev",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_clerk_f2",
      name: "Marcus Webb",
      tagline: "UX/UI Design Lead · 7 Years Experience",
      bio: "Design leader who bridges strategy and execution. Previously at Figma and Stripe. Creates design systems that scale and interfaces that convert.",
      fieldOfWork: "UX/UI Design",
      skills: ["Figma", "Design Systems", "User Research", "Prototyping", "Motion Design"],
      yearsExperience: 7,
      paymentPreference: "daily" as const,
      dailyRate: "1200",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_clerk_f3",
      name: "Priya Sharma",
      tagline: "Data Engineer & ML Specialist · 6 Years Experience",
      bio: "Expert in building data pipelines and ML systems at scale. Former data lead at a fintech unicorn. Specializes in Python, Spark, and real-time analytics.",
      fieldOfWork: "Data Engineering",
      skills: ["Python", "Apache Spark", "dbt", "Airflow", "TensorFlow", "Snowflake"],
      yearsExperience: 6,
      paymentPreference: "hourly" as const,
      hourlyRate: "165",
      isVerified: true,
      isAvailable: false,
    },
    {
      clerkId: "demo_clerk_f4",
      name: "James Okafor",
      tagline: "DevOps & Platform Engineer · 8 Years Experience",
      bio: "Infrastructure and reliability expert. Built zero-downtime deployment systems for companies processing millions of transactions daily.",
      fieldOfWork: "DevOps / Platform",
      skills: ["Kubernetes", "Terraform", "AWS", "GCP", "CI/CD", "Prometheus", "Go"],
      yearsExperience: 8,
      paymentPreference: "hourly" as const,
      hourlyRate: "175",
      isVerified: false,
      isAvailable: true,
    },
    {
      clerkId: "demo_clerk_f5",
      name: "Sofia Lindqvist",
      tagline: "Product Manager & Strategist · 10 Years Experience",
      bio: "Seasoned PM who has launched 12 products from 0 to 1. Deep expertise in B2B SaaS, growth loops, and cross-functional leadership.",
      fieldOfWork: "Product Management",
      skills: ["Product Strategy", "Agile", "Data Analysis", "Roadmapping", "OKRs", "Go-to-Market"],
      yearsExperience: 10,
      paymentPreference: "daily" as const,
      dailyRate: "1500",
      isVerified: true,
      isAvailable: true,
    },
    {
      clerkId: "demo_clerk_f6",
      name: "Daniel Torres",
      tagline: "Mobile Engineer (iOS/Android) · 5 Years Experience",
      bio: "Cross-platform mobile expert. Built apps with millions of downloads. Strong focus on performance optimization and native animations.",
      fieldOfWork: "Mobile Development",
      skills: ["React Native", "Swift", "Kotlin", "Expo", "Firebase", "App Store Optimization"],
      yearsExperience: 5,
      paymentPreference: "hourly" as const,
      hourlyRate: "145",
      isVerified: true,
      isAvailable: true,
    },
  ];

  for (const f of demoFreelancers) {
    const [user] = await db.insert(usersTable).values({
      clerkId: f.clerkId,
      role: "freelancer",
      email: `${f.name.toLowerCase().replace(/\s/g, ".")}@demo.talentlock.io`,
      name: f.name,
    }).returning();

    await db.insert(freelancerProfilesTable).values({
      ...f,
      userId: user.id,
    } as any);
  }

  console.log(`Seeded ${demoFreelancers.length} demo freelancers.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

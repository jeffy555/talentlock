#!/usr/bin/env node
/**
 * Seeds 5 DevOps engineer demo profiles for AI Match testing.
 * Run: node scripts/seed-devops-profiles.mjs
 */
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../lib/db/package.json"));
const pg = require("pg");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnvFile() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile();

const DEVOPS_PROFILES = [
  {
    clerkId: "demo_devops_50",
    name: "Alex Petrov",
    email: "alex.petrov@demo.talentlock.io",
    tagline: "Senior DevOps & SRE Engineer · AWS & Kubernetes · 9 Years",
    bio: "Site reliability and DevOps engineer with 9 years building and operating large-scale cloud infrastructure on AWS and GCP. Expert in Kubernetes (EKS/GKE), Terraform, Helm, and GitHub Actions.",
    fieldOfWork: "DevOps & Cloud Infrastructure",
    skills: ["AWS / GCP", "Kubernetes (EKS/GKE)", "Terraform", "Helm", "GitHub Actions", "Prometheus & Grafana", "Incident Management", "Docker", "Networking (VPC/ALB)", "Cost Optimisation"],
    yearsExperience: 9,
    paymentPreference: "daily",
    dailyRate: "1050",
  },
  {
    clerkId: "demo_cloud_51",
    name: "Maria Santos",
    email: "maria.santos@demo.talentlock.io",
    tagline: "Cloud Architect · Multi-Cloud & Security · 12 Years",
    bio: "Cloud architect and AWS Certified Solutions Architect Professional with 12 years designing enterprise cloud strategies across AWS, Azure, and GCP.",
    fieldOfWork: "DevOps & Cloud Infrastructure",
    skills: ["AWS Solutions Architect Professional", "Azure", "GCP", "Landing Zone Design", "Cloud Security (CSPM)", "Multi-Cloud Governance", "Well-Architected Framework", "IAM & Compliance", "Disaster Recovery", "FinOps"],
    yearsExperience: 12,
    paymentPreference: "daily",
    dailyRate: "1300",
  },
  {
    clerkId: "demo_platform_52",
    name: "Ben Clarke",
    email: "ben.clarke@demo.talentlock.io",
    tagline: "Platform Engineer · Kubernetes & Internal Developer Platforms · 6 Years",
    bio: "Platform engineer with 6 years building internal developer platforms that help product teams ship faster and safer. Expert in Kubernetes, ArgoCD, Crossplane, and Backstage.",
    fieldOfWork: "DevOps & Cloud Infrastructure",
    skills: ["Kubernetes", "ArgoCD / GitOps", "Crossplane", "Backstage (IDP)", "Helm", "CI/CD Design", "Platform Engineering", "Go", "Developer Experience", "Service Mesh (Istio)"],
    yearsExperience: 6,
    paymentPreference: "daily",
    dailyRate: "950",
  },
  {
    clerkId: "demo_sre_53",
    name: "Daniel Okonkwo",
    email: "daniel.okonkwo@demo.talentlock.io",
    tagline: "Site Reliability Engineer · Observability & On-Call · 11 Years",
    bio: "SRE with 11 years keeping mission-critical systems online for fintech and e-commerce platforms. Deep expertise in SLI/SLO design, chaos engineering, and incident response.",
    fieldOfWork: "DevOps & Cloud Infrastructure",
    skills: ["SRE / SLI-SLO", "Prometheus", "Grafana", "PagerDuty", "Chaos Engineering", "Linux Administration", "Python", "AWS", "Incident Response", "Capacity Planning"],
    yearsExperience: 11,
    paymentPreference: "daily",
    dailyRate: "1150",
  },
  {
    clerkId: "demo_cicd_54",
    name: "Elena Vasquez",
    email: "elena.vasquez@demo.talentlock.io",
    tagline: "DevOps Engineer · CI/CD & Infrastructure as Code · 8 Years",
    bio: "DevOps engineer with 8 years automating build, test, and deployment pipelines for distributed engineering teams. Specialises in Terraform, Ansible, Jenkins, and GitLab CI.",
    fieldOfWork: "DevOps & Cloud Infrastructure",
    skills: ["Terraform", "Ansible", "Jenkins", "GitLab CI", "Docker", "Kubernetes", "Blue-Green Deployments", "Infrastructure as Code", "Bash / Python", "AWS"],
    yearsExperience: 8,
    paymentPreference: "hourly",
    hourlyRate: "110",
  },
];

async function ensureFreelancer(client, profile) {
  const existingUser = await client.query(
    `SELECT id FROM users WHERE TRIM(clerk_id) = $1 LIMIT 1`,
    [profile.clerkId],
  );

  let userId;
  if (existingUser.rows[0]) {
    userId = existingUser.rows[0].id;
  } else {
    const ins = await client.query(
      `INSERT INTO users (clerk_id, role, email, name, created_at, updated_at)
       VALUES ($1, 'freelancer', $2, $3, NOW(), NOW()) RETURNING id`,
      [profile.clerkId, profile.email, profile.name],
    );
    userId = ins.rows[0].id;
  }

  const existingProfile = await client.query(
    `SELECT id FROM freelancer_profiles WHERE TRIM(clerk_id) = $1 LIMIT 1`,
    [profile.clerkId],
  );
  if (existingProfile.rows[0]) {
    return { name: profile.name, status: "skipped" };
  }

  await client.query(
    `INSERT INTO freelancer_profiles (
       user_id, clerk_id, name, tagline, bio, field_of_work, skills, years_experience,
       payment_preference, hourly_rate, daily_rate, is_verified, is_available, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, true, NOW(), NOW())`,
    [
      userId,
      profile.clerkId,
      profile.name,
      profile.tagline,
      profile.bio,
      profile.fieldOfWork,
      profile.skills,
      profile.yearsExperience,
      profile.paymentPreference,
      profile.hourlyRate ?? null,
      profile.dailyRate ?? null,
    ],
  );

  return { name: profile.name, status: "seeded" };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const results = [];
    for (const profile of DEVOPS_PROFILES) {
      results.push(await ensureFreelancer(client, profile));
    }
    await client.query("COMMIT");

    const seeded = results.filter((r) => r.status === "seeded");
    const skipped = results.filter((r) => r.status === "skipped");
    console.log(`Seeded ${seeded.length} DevOps profiles:`);
    for (const r of seeded) console.log(`  + ${r.name}`);
    if (skipped.length) {
      console.log(`Skipped ${skipped.length} (already exist):`);
      for (const r of skipped) console.log(`  - ${r.name}`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

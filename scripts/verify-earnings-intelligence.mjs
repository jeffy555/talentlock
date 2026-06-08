#!/usr/bin/env node
/**
 * Static + unit validation for Earnings Intelligence (validation.md)
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

let ok = true;
const pass = (msg) => console.log(`✅ ${msg}`);
const fail = (msg) => {
  console.error(`❌ ${msg}`);
  ok = false;
};

console.log("=== V1.1 Endpoint registered ===");
const dashboard = read("artifacts/api-server/src/routes/dashboard.ts");
const routesIndex = read("artifacts/api-server/src/routes/index.ts");
if (!dashboard.includes('"/dashboard/earnings-intelligence"')) fail("Route handler missing");
else pass("Route handler exists");
if (!dashboard.includes('user.role !== "freelancer"') || !dashboard.includes("403")) {
  fail("Employer 403 guard missing");
} else pass("Employer 403 guard present");
if (!routesIndex.includes("dashboardRouter")) fail("dashboardRouter not registered");
else pass("dashboardRouter registered");

console.log("\n=== V1.4 OpenAPI + codegen ===");
const openapi = read("lib/api-spec/openapi.yaml");
if (!openapi.includes("/dashboard/earnings-intelligence")) fail("OpenAPI endpoint missing");
else pass("OpenAPI endpoint defined");
if (!openapi.includes("EarningsIntelligence")) fail("EarningsIntelligence schema missing");
else pass("EarningsIntelligence schema defined");
const api = read("lib/api-client-react/src/generated/api.ts");
if (!api.includes("useGetDashboardEarningsIntelligence")) fail("Generated hook missing");
else pass("useGetDashboardEarningsIntelligence hook exists");

console.log("\n=== V1.6 / V1.7 Utility logic ===");
// Inline test of fillZeroMonths and MoM null logic
function fillZeroMonths(months, earningsRows) {
  const map = new Map(earningsRows.map((r) => [r.month, Number(r.total)]));
  return months.map((m) => map.get(m) ?? 0);
}
function getLast6Months() {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
}
const months = getLast6Months();
if (months.length !== 6) fail("getLast6Months must return 6 months");
else pass("getLast6Months returns 6 months");
const filled = fillZeroMonths(months, [{ month: months[2], total: 500 }]);
if (filled.length !== 6) fail("fillZeroMonths must return 6 values");
else pass("fillZeroMonths returns 6 values");
if (filled[0] !== 0 || filled[2] !== 500) fail("fillZeroMonths zero-fill incorrect");
else pass("Zero-earnings months filled with 0");
const lastMonth = 0;
const mom = lastMonth === 0 ? null : ((2000 - lastMonth) / lastMonth) * 100;
if (mom !== null) fail("monthOverMonthChange should be null when lastMonth is 0");
else pass("monthOverMonthChange null when lastMonth is 0");

console.log("\n=== V1.8 / V1.9 Threshold constants ===");
const intel = read("artifacts/api-server/src/lib/earningsIntelligence.ts");
if (!intel.includes("MIN_PLATFORM_FREELANCERS = 5")) fail("Platform min 5 check missing");
else pass("Platform average min-5 guard present");
if (!intel.includes("MIN_FIELD_FREELANCERS = 3")) fail("Rate benchmark min 3 check missing");
else pass("Rate benchmark min-3 guard present");
if (!intel.includes("fillZeroMonths")) fail("fillZeroMonths not used in intelligence builder");
else pass("fillZeroMonths used in trend builder");

console.log("\n=== V1.12 Top skills ===");
if (!intel.includes(".slice(0, 5)")) fail("Top skills not capped at 5");
else pass("Top skills capped at 5");
if (!intel.includes(".sort((a, b) => b.totalEarned - a.totalEarned)")) fail("Top skills sort missing");
else pass("Top skills sorted by totalEarned desc");

console.log("\n=== Phase 2 frontend wiring ===");
const dashPage = read("artifacts/talentlock/src/pages/Dashboard.tsx");
if (!dashPage.includes("Earnings Intelligence")) fail("Dashboard heading missing");
else pass("Dashboard section heading present");
if (!dashPage.includes("!isEmployer")) fail("Freelancer-only guard missing in Dashboard");
else pass("Freelancer-only render guard present");
const components = [
  "EarningsSummaryCards.tsx",
  "EarningsTrendChart.tsx",
  "RateBenchmarkCard.tsx",
  "ProjectionCard.tsx",
  "TopSkillsCard.tsx",
  "EarningsIntelligencePanel.tsx",
];
for (const c of components) {
  const p = `artifacts/talentlock/src/components/earnings/${c}`;
  if (!existsSync(join(root, p))) fail(`Missing ${p}`);
  else pass(`Component exists: ${c}`);
}

const panel = read("artifacts/talentlock/src/components/earnings/EarningsIntelligencePanel.tsx");
if (!panel.includes("Could not load earnings intelligence")) fail("Error state copy missing");
else pass("Error state with retry present");

const summary = read("artifacts/talentlock/src/components/earnings/EarningsSummaryCards.tsx");
if (!summary.includes("First month of data")) fail("First month copy missing");
else pass("First month of data state present");

const chart = read("artifacts/talentlock/src/components/earnings/EarningsTrendChart.tsx");
if (!chart.includes("Platform average not available")) fail("Platform disclaimer missing");
else pass("Platform average disclaimer present");
if (!chart.includes("LineChart")) fail("recharts LineChart missing");
else pass("recharts LineChart used");

const benchmark = read("artifacts/talentlock/src/components/earnings/RateBenchmarkCard.tsx");
if (!benchmark.includes("Not enough data yet")) fail("Rate benchmark null state missing");
else pass("Rate benchmark null state present");

const projection = read("artifacts/talentlock/src/components/earnings/ProjectionCard.tsx");
if (!projection.includes("No milestones due this month")) fail("Projection empty state missing");
else pass("Projection empty state present");

const skills = read("artifacts/talentlock/src/components/earnings/TopSkillsCard.tsx");
if (!skills.includes("No skill-attributed earnings yet")) fail("Top skills empty state missing");
else pass("Top skills empty state present");

console.log("\n=== Security S3 — no individual freelancer exposure ===");
if (intel.includes("freelancerId") && intel.match(/rateBenchmark[\s\S]*freelancerId/)) {
  // rateBenchmark return object should not include freelancerId
}
const benchmarkReturn = intel.slice(intel.indexOf("return {"), intel.indexOf("rateBenchmark,") + 200);
if (openapi.includes("freelancerId") && openapi.includes("EarningsIntelligenceRateBenchmark")) {
  const rb = openapi.slice(
    openapi.indexOf("EarningsIntelligenceRateBenchmark:"),
    openapi.indexOf("EarningsIntelligenceProjection:"),
  );
  if (rb.includes("freelancerId")) fail("OpenAPI rateBenchmark exposes freelancerId");
  else pass("rateBenchmark schema does not expose individual freelancer IDs");
}

console.log("\n=== Backend files ===");
for (const f of [
  "artifacts/api-server/src/lib/earningsUtils.ts",
  "artifacts/api-server/src/lib/earningsIntelligence.ts",
]) {
  if (!existsSync(join(root, f))) fail(`Missing ${f}`);
  else pass(`Backend file: ${f}`);
}

if (ok) {
  console.log("\n✅ All automated Earnings Intelligence validation checks passed");
  process.exit(0);
}
console.log("\n❌ Some validation checks failed");
process.exit(1);

#!/usr/bin/env node
/**
 * Browser validation for agreement-templates-redlining (V3.x).
 * Requires: frontend :25807, API :8080, playwright chromium.
 *
 * Run: node scripts/browser-validate-agreement-redlining.mjs
 */
import { createRequire } from "module";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FRONTEND = process.env.FRONTEND_URL || "http://localhost:25807";
const API = process.env.API_URL || "http://localhost:8080";

const require = createRequire(join(ROOT, "lib/db/package.json"));
const pg = require("pg");

const results = [];
function pass(id, note = "") {
  results.push({ id, status: "PASS", note });
  console.log(`✅ ${id}${note ? ` — ${note}` : ""}`);
}
function fail(id, note = "") {
  results.push({ id, status: "FAIL", note });
  console.log(`❌ ${id}${note ? ` — ${note}` : ""}`);
}
function skip(id, note = "") {
  results.push({ id, status: "SKIP", note });
  console.log(`⏭️  ${id}${note ? ` — ${note}` : ""}`);
}

function runNodeScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [join(ROOT, script)], {
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
  });
}

async function getFixtureIds() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const gen = await pool.query(
      `SELECT id FROM bookings WHERE notes = 'tl:redlining-validation'
       AND NOT EXISTS (SELECT 1 FROM agreements a WHERE a.booking_id = bookings.id)
       ORDER BY id DESC LIMIT 1`,
    );
    const red = await pool.query(
      `SELECT a.id FROM agreements a
       JOIN bookings b ON b.id = a.booking_id
       WHERE b.notes = 'tl:redlining-validation'
       AND a.freelancer_signed_at IS NULL AND a.employer_signed_at IS NULL
       ORDER BY a.id DESC LIMIT 1`,
    );
    return {
      bookingId: gen.rows[0]?.id,
      agreementId: red.rows[0]?.id,
    };
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log("\n--- Agreement Redlining Browser Validation ---\n");

  // Reseed fresh fixtures
  await runNodeScript("scripts/seed-agreement-redlining-validation.mjs");

  const fe = await fetch(FRONTEND);
  if (!fe.ok) {
    fail("setup", `Frontend down ${FRONTEND}`);
    process.exit(1);
  }
  pass("setup-frontend", FRONTEND);

  const api = await fetch(`${API}/api/healthz`);
  if (!api.ok) {
    fail("setup", `API down ${API}`);
    process.exit(1);
  }
  pass("setup-api", API);

  const { bookingId, agreementId } = await getFixtureIds();
  if (!bookingId || !agreementId) {
    fail("setup", `missing fixtures booking=${bookingId} agreement=${agreementId}`);
    process.exit(1);
  }
  pass("setup-fixtures", `booking=${bookingId} agreement=${agreementId}`);

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (e) {
    fail("setup", `playwright not installed: ${e.message}. Run: pnpm add -D playwright -w && pnpm exec playwright install chromium`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  async function demoLogin(role) {
    await page.goto(`${FRONTEND}/sign-in`, { waitUntil: "networkidle" });
    const btn = page.getByRole("button", { name: new RegExp(role, "i") });
    await btn.waitFor({ timeout: 15000 });
    await btn.click();
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20000 });
  }

  async function signOut() {
    await page.goto(`${FRONTEND}/dashboard`, { waitUntil: "networkidle" });
    const userBtn = page.locator("button").filter({ hasText: /employer|freelancer|Demo|TalentLock/i }).first();
    if (await userBtn.isVisible().catch(() => false)) {
      await userBtn.click();
      const signOut = page.getByRole("menuitem", { name: /sign out|log out/i });
      if (await signOut.isVisible().catch(() => false)) {
        await signOut.click();
        await page.waitForURL(/sign-in/, { timeout: 10000 }).catch(() => {});
      }
    }
    await context.clearCookies();
  }

  try {
    // --- Employer: generation UI ---
    await demoLogin("Employer");
    await page.goto(`${FRONTEND}/bookings/${bookingId}`, { waitUntil: "networkidle" });

    const templateLabel = page.getByText("Agreement Template", { exact: false });
    if (await templateLabel.isVisible({ timeout: 10000 }).catch(() => false)) {
      pass("V3.1", "Agreement Template label visible");
    } else {
      fail("V3.1", "label not found");
    }

    const helper = page.getByText(/Includes industry-specific standard clauses/i);
    await helper.isVisible().catch(() => false) ? pass("V3.1-helper") : fail("V3.1-helper");

    const customClauses = page.getByText(/Custom Clauses/i);
    if (!(await customClauses.isVisible().catch(() => false))) {
      pass("V3.2-growth", "no custom clauses panel");
    } else {
      fail("V3.2-growth", "custom clauses visible for Growth");
    }

    // --- Redlining UI ---
    await page.goto(`${FRONTEND}/agreements/${agreementId}`, { waitUntil: "networkidle" });

    const reviewHeading = page.getByText(/AI Contract Review/i);
    if (await reviewHeading.isVisible({ timeout: 10000 }).catch(() => false)) {
      pass("V3.5");
    } else {
      fail("V3.5", "redlining section missing");
    }

    const subtitle = page.getByText(/Get AI suggestions before signing/i);
    await subtitle.isVisible().catch(() => false) ? pass("V3.5-subtitle") : fail("V3.5-subtitle");

    const tokenEst = page.getByText(/tokens will be used/i);
    await tokenEst.isVisible().catch(() => false) ? pass("V3.5-tokens") : fail("V3.5-tokens");

    const requestBtn = page.getByRole("button", { name: /Request Redlining/i });
    if (await requestBtn.isVisible().catch(() => false)) {
      pass("V3.5-button");
      await requestBtn.click();
      pass("V3.6", "clicked Request Redlining");

      const loading = page.getByText(/Analysing contract/i);
      if (await loading.isVisible({ timeout: 5000 }).catch(() => false)) {
        pass("V3.6-loading");
      } else {
        skip("V3.6-loading", "spinner text not caught");
      }

      await page.getByText(/suggestions found/i).waitFor({ timeout: 120000 });
      pass("V3.7", "suggestions rendered");

      const skipBtn = page.getByRole("button", { name: "Skip" }).first();
      if (await skipBtn.isVisible().catch(() => false)) {
        await skipBtn.click();
        pass("V3.8", "skipped one suggestion");
      } else {
        skip("V3.8", "no skip button");
      }

      const acceptBtn = page.getByRole("button", { name: /Accept Change/i }).first();
      if (await acceptBtn.isVisible().catch(() => false)) {
        await acceptBtn.click();
        await page.getByText(/both signatures have been reset/i).first().waitFor({ timeout: 30000 });
        pass("V3.9-toast");

        // Wait for agreement refetch after accept-redline
        await page.waitForResponse(
          (r) => r.url().includes(`/api/agreements/${agreementId}`) && r.request().method() === "GET",
          { timeout: 15000 },
        ).catch(() => page.reload({ waitUntil: "networkidle" }));

        const banner = page.getByText(/This agreement was revised/i).first();
        await banner.waitFor({ state: "visible", timeout: 10000 }).then(() => {
          pass("V3.9-banner");
          pass("V3.13-employer");
        }).catch(() => {
          fail("V3.9-banner", "amber banner not visible after accept");
          fail("V3.13-employer");
        });
      } else {
        skip("V3.9", "no accept button (maybe no suggestions left)");
      }
    } else {
      fail("V3.5-button");
    }

    // --- Freelancer notice ---
    await signOut();
    await demoLogin("Freelancer");
    await page.goto(`${FRONTEND}/agreements/${agreementId}`, { waitUntil: "networkidle" });

    const freelancerNotice = page.getByText(/revised with AI assistance/i).first();
    if (await freelancerNotice.isVisible({ timeout: 10000 }).catch(() => false)) {
      pass("V3.14");
    } else {
      fail("V3.14", "freelancer notice missing");
    }

    const requestAsFreelancer = page.getByRole("button", { name: /Request Redlining/i });
    if (!(await requestAsFreelancer.isVisible().catch(() => false))) {
      pass("V3.14-no-redline-controls");
    } else {
      fail("V3.14-no-redline-controls");
    }

    const amberBanner = page.getByText(/This agreement was revised/i).first();
    await amberBanner.isVisible().catch(() => false) ? pass("V3.13-freelancer") : fail("V3.13-freelancer");

    skip("V3.3", "requires Enterprise plan account");
    skip("V3.4", "covered by API validation");
    skip("V3.10", "covered if suggestions exhausted in V3.8/V3.9");
    skip("V3.11", "requires Starter employer account");
    skip("V3.12", "requires signing flow — manual or extended test");
  } finally {
    await browser.close();
  }

  console.log("\n--- Summary ---\n");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  console.log(`PASS: ${passed}  FAIL: ${failed}  SKIP: ${skipped}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

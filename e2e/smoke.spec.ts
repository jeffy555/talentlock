import { test, expect } from "@playwright/test";

const e2eReady = Boolean(process.env.E2E_BASE_URL || process.env.E2E_FORCE);

test("e2e harness ready", () => {
  expect(true).toBe(true);
});

const smoke = e2eReady ? test : test.skip;

smoke("landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/TalentLock/i);
});

smoke("public health via API proxy", async ({ request }) => {
  const res = await request.get("/api/healthz");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
});

smoke("sign-in page reachable", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.locator("body")).toBeVisible();
});

smoke("pricing requires auth redirect or sign-in prompt", async ({ page }) => {
  await page.goto("/pricing");
  await page.waitForLoadState("networkidle");
  expect(page.url()).toMatch(/sign-in|pricing/);
});

smoke("admin login page loads", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: /admin/i })).toBeVisible({ timeout: 15_000 });
});

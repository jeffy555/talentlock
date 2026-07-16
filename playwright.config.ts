import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:25807";
const e2eReady = Boolean(process.env.E2E_BASE_URL || process.env.E2E_FORCE);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer:
    !e2eReady || process.env.E2E_SKIP_WEBSERVER
      ? undefined
      : {
        command: "pnpm --filter @workspace/talentlock run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

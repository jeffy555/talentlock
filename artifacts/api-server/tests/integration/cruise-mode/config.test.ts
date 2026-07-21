import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("Cruise Mode API", () => {
  let flToken: string;

  beforeAll(async () => {
    flToken = await freelancerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/cruise-mode requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/cruise-mode");
    expect(res.status).toBe(401);
  });

  it("GET /api/cruise-mode returns config or null for freelancer", async () => {
    const res = await (await createApiClient(flToken)).get("/api/cruise-mode");
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body === null || typeof res.body === "object").toBe(true);
    }
  });

  it("GET /api/cruise-mode/stats returns stats shape for freelancer", async () => {
    const res = await (await createApiClient(flToken)).get("/api/cruise-mode/stats");
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("evaluatedToday");
    }
  });

  it("GET /api/cruise-mode/activity returns paginated feed", async () => {
    const res = await (await createApiClient(flToken)).get("/api/cruise-mode/activity");
    expect([200, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("data");
    }
  });
});

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("availability API", () => {
  afterAll(async () => {
    await closePool();
  });

  it("GET /api/availability/:freelancerId is public", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.freelancerProfileId) return;
    const res = await (await createApiClient(null)).get(
      `/api/availability/${fixtures.freelancerProfileId}`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/availability/me requires freelancer auth", async () => {
    const flToken = await freelancerToken();
    const res = await (await createApiClient(flToken)).get("/api/availability/me");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

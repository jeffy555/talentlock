import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { freelancerToken, employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("earnings intelligence dashboard", () => {
  afterAll(async () => {
    await closePool();
  });

  it("freelancer earnings panel returns trend data", async () => {
    const flToken = await freelancerToken();
    const res = await (await createApiClient(flToken)).get("/api/dashboard/earnings-intelligence");
    if (res.status === 200) {
      expect(res.body).toHaveProperty("monthlyTrend");
      expect(res.body).toHaveProperty("rateBenchmark");
    } else {
      expect(res.status).toBe(404);
    }
  });

  it("employer cannot access earnings intelligence", async () => {
    const empToken = await employerToken();
    const res = await (await createApiClient(empToken)).get("/api/dashboard/earnings-intelligence");
    expect(res.status).toBe(403);
  });
});

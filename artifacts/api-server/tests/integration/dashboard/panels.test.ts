import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("dashboard API", () => {
  let empToken: string;
  let flToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/dashboard/stats requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/dashboard/stats");
    expect(res.status).toBe(401);
  });

  it("GET /api/dashboard/stats returns role-specific metrics", async () => {
    const res = await (await createApiClient(empToken)).get("/api/dashboard/stats");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      activeBookings: expect.any(Number),
      completedBookings: expect.any(Number),
      role: expect.any(String),
    });
  });

  it("GET /api/dashboard/earnings-intelligence is freelancer-only", async () => {
    const asEmployer = await (await createApiClient(empToken)).get("/api/dashboard/earnings-intelligence");
    expect(asEmployer.status).toBe(403);

    const asFreelancer = await (await createApiClient(flToken)).get("/api/dashboard/earnings-intelligence");
    expect([200, 404]).toContain(asFreelancer.status);
    if (asFreelancer.status === 200) {
      expect(asFreelancer.body).toHaveProperty("monthlyTrend");
    }
  });

  it("GET /api/dashboard/spend-analytics is employer-only", async () => {
    const asFreelancer = await (await createApiClient(flToken)).get("/api/dashboard/spend-analytics");
    expect(asFreelancer.status).toBe(403);

    const asEmployer = await (await createApiClient(empToken)).get("/api/dashboard/spend-analytics");
    expect(asEmployer.status).toBe(200);
    expect(asEmployer.body).toHaveProperty("spendTrend");
  });

  it("GET /api/dashboard/hiring-analytics accepts window param", async () => {
    for (const window of ["30d", "90d", "12m"] as const) {
      const res = await (await createApiClient(empToken)).get(
        `/api/dashboard/hiring-analytics?window=${window}`,
      );
      expect(res.status).toBe(200);
    }
  });

  it("GET /api/dashboard/activity returns recent feed", async () => {
    const res = await (await createApiClient(empToken)).get("/api/dashboard/activity");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

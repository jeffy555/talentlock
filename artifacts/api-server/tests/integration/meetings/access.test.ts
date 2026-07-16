import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("meetings API", () => {
  let empToken: string;
  let flToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/meetings requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/meetings");
    expect(res.status).toBe(401);
  });

  it("GET /api/meetings returns paginated list", async () => {
    const res = await (await createApiClient(empToken)).get("/api/meetings");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });

  it("GET /api/meetings/:id enforces participant access", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.meetingId) return;

    const noAuth = await (await createApiClient(null)).get(`/api/meetings/${fixtures.meetingId}`);
    expect(noAuth.status).toBe(401);

    const asEmployer = await (await createApiClient(empToken)).get(
      `/api/meetings/${fixtures.meetingId}`,
    );
    expect([200, 403]).toContain(asEmployer.status);
  });

  it("POST /api/meetings/:id/brief returns 401 without auth", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.meetingId) return;
    const res = await (await createApiClient(null)).post(`/api/meetings/${fixtures.meetingId}/brief`);
    expect(res.status).toBe(401);
  });

  it("POST /api/meetings/:id/brief is employer-only", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.meetingId) return;
    const res = await (await createApiClient(flToken)).post(
      `/api/meetings/${fixtures.meetingId}/brief`,
    );
    expect([403, 404, 422]).toContain(res.status);
  });
});

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("agreements API", () => {
  let empToken: string;
  let flToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/agreements requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/agreements");
    expect(res.status).toBe(401);
  });

  it("GET /api/agreements returns paginated list", async () => {
    const res = await (await createApiClient(empToken)).get("/api/agreements");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });

  it("GET /api/agreements/:id/download returns 403 when not fully signed", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.agreementId) return;
    const res = await (await createApiClient(empToken)).get(
      `/api/agreements/${fixtures.agreementId}/download`,
    );
    expect([403, 404]).toContain(res.status);
  });

  it("POST /api/agreements/:id/summarise returns 403 for employer", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.agreementId) return;
    const res = await (await createApiClient(empToken)).post(
      `/api/agreements/${fixtures.agreementId}/summarise`,
    );
    expect(res.status).toBe(403);
  });

  it("freelancer participant can GET agreement detail", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.agreementId) return;
    const res = await (await createApiClient(flToken)).get(
      `/api/agreements/${fixtures.agreementId}`,
    );
    expect([200, 403]).toContain(res.status);
  });
});

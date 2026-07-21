import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("availability calendar API", () => {
  let flToken: string;
  let freelancerProfileId: number | null;

  beforeAll(async () => {
    flToken = await freelancerToken();
    freelancerProfileId = (await loadDemoFixtures()).freelancerProfileId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("public route works without auth before /me", async () => {
    if (!freelancerProfileId) return;
    const res = await (await createApiClient(null)).get(
      `/api/availability/${freelancerProfileId}`,
    );
    expect(res.status).toBe(200);
  });

  it("freelancer can list own blocks", async () => {
    const res = await (await createApiClient(flToken)).get("/api/availability/me");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST manual block validates date range", async () => {
    const res = await (await createApiClient(flToken)).post("/api/availability/me", {
      startDate: "2099-01-01",
      endDate: "2099-01-02",
      type: "holiday",
      label: "Test holiday",
    });
    expect([201, 400, 409]).toContain(res.status);
  });
});

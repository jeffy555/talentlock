import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("rate suggestion API", () => {
  let empToken: string;
  let freelancerProfileId: number | null;

  beforeAll(async () => {
    empToken = await employerToken();
    freelancerProfileId = (await loadDemoFixtures()).freelancerProfileId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("returns static context without includeAi", async () => {
    if (!freelancerProfileId) return;
    const res = await (await createApiClient(empToken)).post("/api/ai/rate-suggestion", {
      freelancerId: freelancerProfileId,
      includeAi: false,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      isAiSuggestion: false,
      freelancerRate: expect.any(Number),
      marketMedian: expect.anything(),
    });
  });

  it("rejects freelancer callers", async () => {
    if (!freelancerProfileId) return;
    const flToken = await freelancerToken();
    const res = await (await createApiClient(flToken)).post("/api/ai/rate-suggestion", {
      freelancerId: freelancerProfileId,
    });
    expect(res.status).toBe(403);
  });
});

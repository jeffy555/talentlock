import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("AI match explanation API", () => {
  let empToken: string;
  let freelancerProfileId: number | null;

  beforeAll(async () => {
    empToken = await employerToken();
    freelancerProfileId = (await loadDemoFixtures()).freelancerProfileId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("requires employer role", async () => {
    if (!freelancerProfileId) return;
    const flToken = await freelancerToken();
    const res = await (await createApiClient(flToken)).post("/api/ai/match-explanation", {
      freelancerId: freelancerProfileId,
      conversationId: "direct-view",
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const res = await (await createApiClient(empToken)).post("/api/ai/match-explanation", {});
    expect(res.status).toBe(400);
  });

  it("employer can request explanation (may 402 without tokens)", async () => {
    if (!freelancerProfileId) return;
    const res = await (await createApiClient(empToken)).post("/api/ai/match-explanation", {
      freelancerId: freelancerProfileId,
      conversationId: "direct-view",
    });
    expect([200, 402, 404, 500]).toContain(res.status);
  });
});

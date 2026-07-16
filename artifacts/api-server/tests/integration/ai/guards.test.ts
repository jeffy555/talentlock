import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("AI endpoint auth guards", () => {
  let empToken: string;
  let flToken: string;
  let freelancerProfileId: number | null;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
    const fixtures = await loadDemoFixtures();
    freelancerProfileId = fixtures.freelancerProfileId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("POST /api/ai/job-description requires auth", async () => {
    const res = await (await createApiClient(null)).post("/api/ai/job-description", {
      mode: "generate",
      content: "Need a React dev",
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/ai/job-description rejects freelancer role", async () => {
    const res = await (await createApiClient(flToken)).post("/api/ai/job-description", {
      mode: "generate",
      content: "Need a React dev",
    });
    expect(res.status).toBe(403);
  });

  it("POST /api/ai/proposal requires auth", async () => {
    const res = await (await createApiClient(null)).post("/api/ai/proposal", {
      bookingId: 1,
      tone: "professional",
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/ai/proposal rejects employer role", async () => {
    const res = await (await createApiClient(empToken)).post("/api/ai/proposal", {
      bookingId: 1,
      tone: "professional",
    });
    expect(res.status).toBe(403);
  });

  it("POST /api/ai/rate-suggestion returns static data without includeAi", async () => {
    if (!freelancerProfileId) return;
    const res = await (await createApiClient(empToken)).post("/api/ai/rate-suggestion", {
      freelancerId: freelancerProfileId,
      includeAi: false,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      isAiSuggestion: false,
      freelancerRate: expect.any(Number),
    });
  });

  it("POST /api/ai/match-explanation requires employer", async () => {
    if (!freelancerProfileId) return;
    const res = await (await createApiClient(flToken)).post("/api/ai/match-explanation", {
      freelancerId: freelancerProfileId,
      conversationId: "direct-view",
    });
    expect(res.status).toBe(403);
  });

  it("POST /api/agreements requires auth", async () => {
    const res = await (await createApiClient(null)).post("/api/agreements", { bookingId: 1 });
    expect(res.status).toBe(401);
  });
});

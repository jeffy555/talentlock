import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("reviews API", () => {
  afterAll(async () => {
    await closePool();
  });

  it("GET /api/reviews/freelancer/:id is public", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.freelancerProfileId) return;
    const res = await (await createApiClient(null)).get(
      `/api/reviews/freelancer/${fixtures.freelancerProfileId}`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/reviews requires auth", async () => {
    const res = await (await createApiClient(null)).post("/api/reviews", {
      bookingId: 1,
      rating: 5,
      comment: "Great work",
    });
    expect(res.status).toBe(401);
  });
});

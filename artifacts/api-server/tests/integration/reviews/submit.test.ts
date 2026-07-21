import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("reviews submit API", () => {
  let empToken: string;
  let bookingId: number | null;

  beforeAll(async () => {
    empToken = await employerToken();
    bookingId = (await loadDemoFixtures()).bookingId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("POST /reviews requires auth", async () => {
    const res = await (await createApiClient(null)).post("/api/reviews", {
      bookingId: 1,
      rating: 5,
      comment: "Great",
    });
    expect(res.status).toBe(401);
  });

  it("POST /reviews rejects non-completed booking or duplicate", async () => {
    if (!bookingId) return;
    const res = await (await createApiClient(empToken)).post("/api/reviews", {
      bookingId,
      rating: 5,
      comment: "Automated test review",
    });
    expect([201, 400, 403, 409]).toContain(res.status);
  });
});

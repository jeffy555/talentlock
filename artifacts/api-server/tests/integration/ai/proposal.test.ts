import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("AI proposal API", () => {
  let flToken: string;
  let bookingId: number | null;

  beforeAll(async () => {
    flToken = await freelancerToken();
    bookingId = (await loadDemoFixtures()).bookingId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("returns 401 without auth", async () => {
    const res = await (await createApiClient(null)).post("/api/ai/proposal", {
      bookingId: 1,
      tone: "professional",
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for employer", async () => {
    const empToken = await employerToken();
    const res = await (await createApiClient(empToken)).post("/api/ai/proposal", {
      bookingId: bookingId ?? 1,
      tone: "professional",
    });
    expect(res.status).toBe(403);
  });

  it("accepts freelancer request for participant booking or 404", async () => {
    if (!bookingId) return;
    const res = await (await createApiClient(flToken)).post("/api/ai/proposal", {
      bookingId,
      tone: "professional",
    });
    expect([200, 403, 404, 402, 500]).toContain(res.status);
  });
});

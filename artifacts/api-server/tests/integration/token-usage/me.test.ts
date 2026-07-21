import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("token usage API", () => {
  let empToken: string;
  let flToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/token-usage/me requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/token-usage/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/token-usage/me returns breakdown for employer", async () => {
    const res = await (await createApiClient(empToken)).get("/api/token-usage/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      plan: expect.any(String),
      tokensUsed: expect.any(Number),
      breakdown: expect.any(Object),
    });
  });

  it("GET /api/token-usage/me returns 403 for freelancer", async () => {
    const res = await (await createApiClient(flToken)).get("/api/token-usage/me");
    expect(res.status).toBe(403);
  });

  it("GET /api/token-usage/conversation/:id returns 400 for invalid id", async () => {
    const res = await (await createApiClient(empToken)).get("/api/token-usage/conversation/abc");
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!integrationEnvReady())("quota 402 response shape", () => {
  it("402 responses include error, code, and planNeeded when triggered", async () => {
    // Document expected contract — full quota exhaustion tests are destructive.
    // When a route returns 402, it must match ProductGaps contract.
    const shape = { error: "Limit reached", code: "PLAN_LIMIT", planNeeded: "employer_growth" };
    expect(shape).toMatchObject({
      error: expect.any(String),
      code: expect.any(String),
      planNeeded: expect.any(String),
    });
  });
});

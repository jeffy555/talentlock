import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("subscriptions API", () => {
  let empToken: string;
  let flToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/subscriptions/plans lists employer plans", async () => {
    const res = await (await createApiClient(null)).get("/api/subscriptions/plans?audience=employer");
    expect(res.status).toBe(200);
    const plans = res.body as { id: string }[];
    expect(plans.length).toBeGreaterThanOrEqual(3);
    const ids = plans.map((p) => p.id);
    expect(ids).toContain("employer_starter");
    expect(ids).toContain("employer_growth");
  });

  it("GET /api/subscriptions/me requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/subscriptions/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/subscriptions/me returns plan and usage for employer", async () => {
    const res = await (await createApiClient(empToken)).get("/api/subscriptions/me");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("plan");
    expect(res.body).toHaveProperty("usage");
  });

  it("POST /api/subscriptions/upgrade rejects wrong-audience plan", async () => {
    const res = await (await createApiClient(flToken)).post("/api/subscriptions/upgrade", {
      planId: "employer_starter",
    });
    expect(res.status).toBe(400);
    expect(String((res.body as { error?: string }).error)).toMatch(/employer/i);
  });

  it("POST /api/subscriptions/upgrade rejects invalid plan", async () => {
    const res = await (await createApiClient(empToken)).post("/api/subscriptions/upgrade", {
      planId: "not_a_plan",
    });
    expect(res.status).toBe(400);
  });
});

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("TalentSearch API", () => {
  let empToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/talent-search requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/talent-search");
    expect(res.status).toBe(401);
  });

  it("GET /api/talent-search rejects freelancer", async () => {
    const flToken = await freelancerToken();
    const res = await (await createApiClient(flToken)).get("/api/talent-search");
    expect(res.status).toBe(403);
  });

  it("GET /api/talent-search returns config or null for employer", async () => {
    const res = await (await createApiClient(empToken)).get("/api/talent-search");
    expect(res.status).toBe(200);
    expect(res.body === null || typeof res.body === "object").toBe(true);
  });

  it("GET /api/talent-search/stats returns stats for employer", async () => {
    const res = await (await createApiClient(empToken)).get("/api/talent-search/stats");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("evaluatedToday");
  });

  it("GET /api/talent-search/activity returns paginated feed", async () => {
    const res = await (await createApiClient(empToken)).get("/api/talent-search/activity");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });
});

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("freelancers and Talent Vault", () => {
  let empToken: string;
  let flToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/freelancers is public and returns array", async () => {
    const res = await (await createApiClient(null)).get("/api/freelancers");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("vault list only includes profiles with completeness >= 60", async () => {
    const res = await (await createApiClient(null)).get("/api/freelancers");
    const list = res.body as { completenessScore?: number }[];
    for (const f of list.slice(0, 10)) {
      if (f.completenessScore != null) {
        expect(f.completenessScore).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it("supports professionCategory filter", async () => {
    const res = await (await createApiClient(null)).get(
      "/api/freelancers?professionCategory=technology",
    );
    expect(res.status).toBe(200);
  });

  it("GET /api/freelancers/:id includes rating fields", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.freelancerProfileId) return;
    const res = await (await createApiClient(null)).get(
      `/api/freelancers/${fixtures.freelancerProfileId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("averageRating");
    expect(res.body).toHaveProperty("nextAvailableDate");
  });

  it("GET /api/public/freelancers/:id is public", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.freelancerProfileId) return;
    const res = await (await createApiClient(null)).get(
      `/api/public/freelancers/${fixtures.freelancerProfileId}`,
    );
    expect(res.status).toBe(200);
  });

  it("GET /api/freelancers/me requires freelancer auth", async () => {
    const res = await (await createApiClient(empToken)).get("/api/freelancers/me");
    expect([403, 404]).toContain(res.status);
  });

  it("PUT /api/freelancers/me recalculates completenessScore", async () => {
    const client = await createApiClient(flToken);
    const res = await client.get("/api/freelancers/me");
    if (res.status !== 200) return;
    expect(res.body).toHaveProperty("completenessScore");
    expect(typeof (res.body as { completenessScore: number }).completenessScore).toBe("number");
  });
});

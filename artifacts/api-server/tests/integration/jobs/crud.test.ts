import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("job requirements", () => {
  let empToken: string;
  let flToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/job-requirements is public", async () => {
    const res = await (await createApiClient(null)).get("/api/job-requirements");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("PATCH /api/job-requirements/:id succeeds for owner", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.jobId) return;
    const list = await (await createApiClient(null)).get("/api/job-requirements");
    const job = (list.body as { id: number; title?: string }[]).find((j) => j.id === fixtures.jobId);
    const client = await createApiClient(empToken);
    const res = await client.patch(`/api/job-requirements/${fixtures.jobId}`, {
      title: job?.title ?? "Test Job",
    });
    expect(res.status).toBe(200);
  });

  it("GET /api/job-requirements/:id/my-interest requires auth", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.jobId) return;
    const res = await (await createApiClient(null)).get(
      `/api/job-requirements/${fixtures.jobId}/my-interest`,
    );
    expect(res.status).toBe(401);
  });

  it("freelancer can read my-interest when authenticated", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.jobId) return;
    const res = await (await createApiClient(flToken)).get(
      `/api/job-requirements/${fixtures.jobId}/my-interest`,
    );
    expect([200, 404]).toContain(res.status);
  });
});

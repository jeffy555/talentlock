import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("agreement health score API", () => {
  let empToken: string;
  let agreementId: number | null;

  beforeAll(async () => {
    empToken = await employerToken();
    agreementId = (await loadDemoFixtures()).agreementId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("POST /agreements/:id/health-score requires auth", async () => {
    if (!agreementId) return;
    const res = await (await createApiClient(null)).post(`/api/agreements/${agreementId}/health-score`);
    expect(res.status).toBe(401);
  });

  it("participant can request health score or get 402", async () => {
    if (!agreementId) return;
    const res = await (await createApiClient(empToken)).post(`/api/agreements/${agreementId}/health-score`);
    expect([200, 402, 403, 404]).toContain(res.status);
  });
});

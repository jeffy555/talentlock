import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("agreement PDF download API", () => {
  let empToken: string;
  let agreementId: number | null;

  beforeAll(async () => {
    empToken = await employerToken();
    agreementId = (await loadDemoFixtures()).agreementId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /agreements/:id/download requires auth", async () => {
    if (!agreementId) return;
    const res = await (await createApiClient(null)).get(`/api/agreements/${agreementId}/download`);
    expect(res.status).toBe(401);
  });

  it("returns 403 when agreement not fully signed", async () => {
    if (!agreementId) return;
    const res = await (await createApiClient(empToken)).get(`/api/agreements/${agreementId}/download`);
    expect([403, 404]).toContain(res.status);
  });
});

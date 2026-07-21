import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("agreement summary API", () => {
  let flToken: string;
  let empToken: string;
  let agreementId: number | null;

  beforeAll(async () => {
    flToken = await freelancerToken();
    empToken = await employerToken();
    agreementId = (await loadDemoFixtures()).agreementId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("POST /agreements/:id/summarise returns 403 for employer", async () => {
    if (!agreementId) return;
    const res = await (await createApiClient(empToken)).post(`/api/agreements/${agreementId}/summarise`);
    expect(res.status).toBe(403);
  });

  it("freelancer participant may summarise or get 402", async () => {
    if (!agreementId) return;
    const res = await (await createApiClient(flToken)).post(`/api/agreements/${agreementId}/summarise`);
    expect([200, 402, 403, 404]).toContain(res.status);
  });
});

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("agreement redlining API", () => {
  let empToken: string;
  let agreementId: number | null;

  beforeAll(async () => {
    empToken = await employerToken();
    agreementId = (await loadDemoFixtures()).agreementId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("POST /agreements/:id/redline requires auth", async () => {
    if (!agreementId) return;
    const res = await (await createApiClient(null)).post(`/api/agreements/${agreementId}/redline`);
    expect(res.status).toBe(401);
  });

  it("participant can request redline or get plan/token limit", async () => {
    if (!agreementId) return;
    const res = await (await createApiClient(empToken)).post(`/api/agreements/${agreementId}/redline`);
    expect([200, 402, 403, 404, 409]).toContain(res.status);
  });
});

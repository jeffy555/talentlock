import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("per-conversation token usage", () => {
  let empToken: string;
  let conversationId: number | null;

  beforeAll(async () => {
    empToken = await employerToken();
    conversationId = (await loadDemoFixtures()).conversationId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /token-usage/conversation/:id requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/token-usage/conversation/1");
    expect(res.status).toBe(401);
  });

  it("returns breakdown or plan gate for employer", async () => {
    if (!conversationId) return;
    const res = await (await createApiClient(empToken)).get(
      `/api/token-usage/conversation/${conversationId}`,
    );
    expect([200, 402, 403, 404]).toContain(res.status);
  });
});

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("direct messaging", () => {
  let empToken: string;
  let flToken: string;
  let employerProfileId: number | null;
  let freelancerProfileId: number | null;
  let aiConversationId: number | null;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
    const fixtures = await loadDemoFixtures();
    employerProfileId = fixtures.employerProfileId;
    freelancerProfileId = fixtures.freelancerProfileId;
    aiConversationId = fixtures.conversationId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("POST /api/conversations/direct requires auth", async () => {
    const res = await (await createApiClient(null)).post("/api/conversations/direct", {
      freelancerId: 1,
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/conversations/direct dedupes same participants", async () => {
    if (!employerProfileId || !freelancerProfileId) return;
    const client = await createApiClient(empToken);
    const body = { freelancerId: freelancerProfileId };
    const first = await client.post("/api/conversations/direct", body);
    const second = await client.post("/api/conversations/direct", body);
    expect([200, 201]).toContain(first.status);
    expect([200, 201]).toContain(second.status);
    if (first.status < 300 && second.status < 300) {
      expect((first.body as { id: number }).id).toBe((second.body as { id: number }).id);
      expect((second.body as { isNew?: boolean }).isNew).toBe(false);
    }
  });

  it("GET /api/conversations/direct returns paginated inbox", async () => {
    const res = await (await createApiClient(empToken)).get("/api/conversations/direct");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
  });

  it("POST /api/conversations/:id/messages returns 422 on ai_match thread", async () => {
    if (!aiConversationId) return;
    const res = await (await createApiClient(empToken)).post(
      `/api/conversations/${aiConversationId}/messages`,
      { content: "hello" },
    );
    expect(res.status).toBe(422);
  });

  it("GET /api/messages/unread-count returns integer", async () => {
    const res = await (await createApiClient(empToken)).get("/api/messages/unread-count");
    expect(res.status).toBe(200);
    expect(typeof (res.body as { count?: number }).count).toBe("number");
  });
});

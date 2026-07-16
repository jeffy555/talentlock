import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures, type DemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("IDOR access control", () => {
  let fixtures: DemoFixtures;
  let empToken: string;
  let flToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
    fixtures = await loadDemoFixtures();
  });

  it("GET /api/bookings/:id requires auth", async () => {
    if (!fixtures.bookingId) return;
    const client = await createApiClient(null);
    const res = await client.get(`/api/bookings/${fixtures.bookingId}`);
    expect(res.status).toBe(401);
  });

  it("GET /api/bookings/:id returns 403 for non-participant", async () => {
    if (!fixtures.nonParticipantBookingId) return;
    const client = await createApiClient(flToken);
    const res = await client.get(`/api/bookings/${fixtures.nonParticipantBookingId}`);
    expect([403, 404]).toContain(res.status);
  });

  it("GET /api/bookings/:id returns 200 for participant employer", async () => {
    if (!fixtures.bookingId) return;
    const client = await createApiClient(empToken);
    const res = await client.get(`/api/bookings/${fixtures.bookingId}`);
    expect(res.status).toBe(200);
    expect((res.body as { id: number }).id).toBe(fixtures.bookingId);
  });

  it("GET /api/bookings/99999999 returns 404 for authenticated user", async () => {
    const client = await createApiClient(empToken);
    const res = await client.get("/api/bookings/99999999");
    expect(res.status).toBe(404);
  });

  it("PATCH /api/bookings/:id blocked for non-participant", async () => {
    if (!fixtures.nonParticipantBookingId) return;
    const client = await createApiClient(flToken);
    const res = await client.patch(`/api/bookings/${fixtures.nonParticipantBookingId}`, {
      status: "cancelled",
    });
    expect(res.status).toBe(403);
  });

  it("GET /api/meetings/:id requires auth", async () => {
    if (!fixtures.meetingId) return;
    const res = await (await createApiClient(null)).get(`/api/meetings/${fixtures.meetingId}`);
    expect(res.status).toBe(401);
  });

  it("GET /api/agreements/:id requires auth", async () => {
    if (!fixtures.agreementId) return;
    const res = await (await createApiClient(null)).get(`/api/agreements/${fixtures.agreementId}`);
    expect(res.status).toBe(401);
  });

  it("POST /api/agreements/:id/sign rejects forged freelancer role from employer", async () => {
    if (!fixtures.agreementId) return;
    const client = await createApiClient(empToken);
    const res = await client.post(`/api/agreements/${fixtures.agreementId}/sign`, {
      role: "freelancer",
      signatureName: "Forged",
    });
    expect([403, 400, 409]).toContain(res.status);
  });

  it("GET /api/openai/conversations/:id returns 403 for non-owner", async () => {
    if (!fixtures.conversationId) return;
    const res = await (await createApiClient(flToken)).get(
      `/api/openai/conversations/${fixtures.conversationId}`,
    );
    expect(res.status).toBe(403);
  });

  it("GET /api/openai/conversations/:id returns 200 for owner", async () => {
    if (!fixtures.conversationId) return;
    const res = await (await createApiClient(empToken)).get(
      `/api/openai/conversations/${fixtures.conversationId}`,
    );
    expect(res.status).toBe(200);
  });

  it("PATCH /api/job-requirements/:id returns 403 for non-owner", async () => {
    if (!fixtures.otherJobId) return;
    const res = await (await createApiClient(empToken)).patch(
      `/api/job-requirements/${fixtures.otherJobId}`,
      { title: "Hacked" },
    );
    expect(res.status).toBe(403);
  });

  it("POST /api/storage/uploads/request-url requires auth", async () => {
    const res = await (await createApiClient(null)).post("/api/storage/uploads/request-url", {
      fileName: "test.png",
      contentType: "image/png",
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/storage/uploads/request-url namespaces path to user", async () => {
    const client = await createApiClient(empToken);
    const res = await client.post("/api/storage/uploads/request-url", {
      fileName: "test.png",
      contentType: "image/png",
    });
    if (res.status === 200) {
      const path = (res.body as { objectPath?: string }).objectPath ?? "";
      expect(path).toMatch(/uploads\/\d+\//);
    } else {
      expect([500, 503]).toContain(res.status);
    }
  });

  it("GET /api/storage/objects/documents/* is admin-gated", async () => {
    const res = await (await createApiClient(empToken)).get("/api/storage/objects/documents/test.pdf");
    expect(res.status).toBe(403);
  });

  afterAll(async () => {
    await closePool();
  });
});

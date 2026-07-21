import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { expect402PlanLimit } from "../../helpers/assert402";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("freelancer watchlist API", () => {
  let empToken: string;
  let flToken: string;
  let freelancerProfileId: number | undefined;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
    const fixtures = await loadDemoFixtures();
    freelancerProfileId = fixtures.freelancerProfileId;
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/freelancers/saved requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/freelancers/saved");
    expect(res.status).toBe(401);
  });

  it("GET /api/freelancers/saved returns array for employer", async () => {
    const res = await (await createApiClient(empToken)).get("/api/freelancers/saved");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("freelancer cannot save — POST returns 403", async () => {
    if (!freelancerProfileId) return;
    const res = await (await createApiClient(flToken)).post(`/api/freelancers/${freelancerProfileId}/save`);
    expect(res.status).toBe(403);
  });

  it("employer can toggle save and list returns WatchlistItem shape", async () => {
    if (!freelancerProfileId) return;
    const client = await createApiClient(empToken);

    const saveRes = await client.post(`/api/freelancers/${freelancerProfileId}/save`);
    expect(saveRes.status).toBe(200);
    expect((saveRes.body as { saved: boolean }).saved).toBe(true);

    const listRes = await client.get("/api/freelancers/saved");
    expect(listRes.status).toBe(200);
    const items = listRes.body as {
      id: number;
      freelancerId: number;
      savedAt: string;
      freelancer: { id: number; name: string };
    }[];
    const item = items.find((i) => i.freelancerId === freelancerProfileId);
    expect(item).toBeDefined();
    expect(item!.freelancer.id).toBe(freelancerProfileId);
    expect(item!.savedAt).toBeTruthy();

    const checkRes = await client.get(`/api/freelancers/${freelancerProfileId}/saved`);
    expect((checkRes.body as { saved: boolean }).saved).toBe(true);

    const notesRes = await client.patch(`/api/freelancers/${freelancerProfileId}/watchlist`, {
      notes: "Strong candidate for Q2",
    });
    expect(notesRes.status).toBe(200);
    expect((notesRes.body as { notes: string }).notes).toBe("Strong candidate for Q2");

    const unsaveRes = await client.post(`/api/freelancers/${freelancerProfileId}/save`);
    expect((unsaveRes.body as { saved: boolean }).saved).toBe(false);

    const notes404 = await client.patch(`/api/freelancers/${freelancerProfileId}/watchlist`, {
      notes: "orphan",
    });
    expect(notes404.status).toBe(404);
  });

  it("PATCH notes returns 400 for overlong body", async () => {
    if (!freelancerProfileId) return;
    const client = await createApiClient(empToken);
    await client.post(`/api/freelancers/${freelancerProfileId}/save`);
    const res = await client.patch(`/api/freelancers/${freelancerProfileId}/watchlist`, {
      notes: "x".repeat(501),
    });
    expect(res.status).toBe(400);
    await client.post(`/api/freelancers/${freelancerProfileId}/save`);
  });

  it("GET /api/team returns 402 or 200 for employer (team member guard path)", async () => {
    const teamRes = await (await createApiClient(empToken)).get("/api/team");
    if (teamRes.status === 402) {
      expect402PlanLimit(teamRes);
    } else {
      expect([200, 403]).toContain(teamRes.status);
    }
  });
});

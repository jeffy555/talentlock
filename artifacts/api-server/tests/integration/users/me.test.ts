import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("users API", () => {
  let empToken: string;
  let flToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/users/me returns 401 without auth", async () => {
    const res = await (await createApiClient(null)).get("/api/users/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/users/me returns profile for demo employer", async () => {
    const res = await (await createApiClient(empToken)).get("/api/users/me");
    expect(res.status).toBe(200);
    expect((res.body as { role?: string }).role).toBeTruthy();
  });

  it("PUT /api/users/me updates display name", async () => {
    const client = await createApiClient(empToken);
    const original = await client.get("/api/users/me");
    const name = (original.body as { name?: string }).name ?? "Demo Employer";
    const res = await client.put("/api/users/me", { name: `${name}` });
    expect(res.status).toBe(200);
  });

  it("PATCH /api/users/me/notification-preferences toggles email flag", async () => {
    const client = await createApiClient(empToken);
    const res = await client.patch("/api/users/me/notification-preferences", {
      emailNotificationsEnabled: true,
    });
    expect(res.status).toBe(200);
    expect((res.body as { success?: boolean }).success).toBe(true);
  });
});

describe.skipIf(!integrationEnvReady())("users role isolation", () => {
  it("freelancer cannot access employer profile endpoint", async () => {
    const flToken = await freelancerToken();
    const res = await (await createApiClient(flToken)).get("/api/employers/me");
    expect([403, 404]).toContain(res.status);
  });
});

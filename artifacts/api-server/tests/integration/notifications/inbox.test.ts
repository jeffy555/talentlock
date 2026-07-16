import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("notifications API", () => {
  let empToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/notifications requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("GET /api/notifications returns paginated list", async () => {
    const res = await (await createApiClient(empToken)).get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("total");
  });

  it("GET /api/notifications/unread-count returns count", async () => {
    const res = await (await createApiClient(empToken)).get("/api/notifications/unread-count");
    expect(res.status).toBe(200);
    expect(typeof (res.body as { count?: number }).count).toBe("number");
  });

  it("PATCH /api/notifications/read-all marks notifications read", async () => {
    const res = await (await createApiClient(empToken)).patch("/api/notifications/read-all");
    expect(res.status).toBe(200);
    expect((res.body as { success?: boolean }).success).toBe(true);
  });
});

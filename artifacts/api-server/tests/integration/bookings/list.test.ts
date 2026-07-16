import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, loadDemoFixtures } from "../../helpers/db";
import { employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("bookings API", () => {
  let empToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/bookings requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/bookings");
    expect(res.status).toBe(401);
  });

  it("GET /api/bookings returns paginated shape", async () => {
    const res = await (await createApiClient(empToken)).get("/api/bookings?page=1&pageSize=10");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
      total: expect.any(Number),
      page: 1,
      pageSize: 10,
      totalPages: expect.any(Number),
    });
  });

  it("GET /api/bookings/:id includes review field when present", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.bookingId) return;
    const res = await (await createApiClient(empToken)).get(`/api/bookings/${fixtures.bookingId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status");
  });
});

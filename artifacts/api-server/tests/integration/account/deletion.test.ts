import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, countActiveBookingsForClerk } from "../../helpers/db";
import { employerToken, DEMO_EMPLOYER } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("account deletion", () => {
  let empToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/account/delete-request requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/account/delete-request");
    expect(res.status).toBe(401);
  });

  it("GET /api/account/delete-request returns status shape", async () => {
    const res = await (await createApiClient(empToken)).get("/api/account/delete-request");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status");
  });

  it("POST /api/account/delete-request returns 409 when active bookings exist", async () => {
    const active = await countActiveBookingsForClerk(DEMO_EMPLOYER());
    if (active === 0) return;

    const res = await (await createApiClient(empToken)).post("/api/account/delete-request", {
      reason: "test",
    });
    expect(res.status).toBe(409);
    expect((res.body as { code?: string }).code).toBe("ACTIVE_BOOKINGS_EXIST");
  });
});

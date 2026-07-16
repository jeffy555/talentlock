import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("product gaps — Talent Vault", () => {
  afterAll(async () => {
    await closePool();
  });

  it("GET /freelancers supports keyword search ?q=", async () => {
    const res = await (await createApiClient(null)).get("/api/freelancers?q=react");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /freelancers supports ?availableFrom= filter", async () => {
    const res = await (await createApiClient(null)).get("/api/freelancers?availableFrom=2026-12-01");
    expect(res.status).toBe(200);
  });

  it("paginated bookings list uses standard shape", async () => {
    const empToken = await (await import("../../helpers/clerkAuth")).employerToken();
    const res = await (await createApiClient(empToken)).get("/api/bookings?page=1&pageSize=5");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalPages");
  });
});

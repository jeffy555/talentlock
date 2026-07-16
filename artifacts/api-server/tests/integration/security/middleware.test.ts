import { describe, expect, it, beforeAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("security middleware", () => {
  beforeAll(async () => {
    await createApiClient(null);
  });

  it("GET /api/healthz returns 200", async () => {
    const client = await createApiClient(null);
    const res = await client.get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });

  it("sets security headers via Helmet", async () => {
    const client = await createApiClient(null);
    const res = await client.get("/api/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("rejects JSON body over 1MB with 413", async () => {
    const client = await createApiClient(null);
    const big = { data: "x".repeat(1024 * 1024 + 1) };
    const res = await client.post("/api/admin/login", big);
    expect(res.status).toBe(413);
  });
});

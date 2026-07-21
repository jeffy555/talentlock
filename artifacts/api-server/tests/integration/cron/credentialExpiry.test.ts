import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("credential expiry cron endpoint", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("returns 500 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const client = await createApiClient(null);
    const res = await client.post("/api/cron/credential-expiry");
    expect(res.status).toBe(500);
  });

  it("returns 401 when x-cron-secret header is missing", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const client = await createApiClient(null);
    const res = await client.post("/api/cron/credential-expiry");
    expect(res.status).toBe(401);
  });

  it("returns 401 when x-cron-secret header is wrong", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const client = await createApiClient(null);
    const res = await client.post("/api/cron/credential-expiry", undefined, {
      headers: { "x-cron-secret": "wrong-secret" },
    });
    expect(res.status).toBe(401);
  });

  it("runs the scan and returns a summary when the secret matches", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const client = await createApiClient(null);
    const res = await client.post("/api/cron/credential-expiry", undefined, {
      headers: { "x-cron-secret": "test-cron-secret" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      documentsScanned: expect.any(Number),
      documentAlertsSent: expect.any(Number),
      documentsExpired: expect.any(Number),
      licencesScanned: expect.any(Number),
      licenceAlertsSent: expect.any(Number),
    });
  });

  it("is not protected by admin CSRF middleware (never returns a CSRF 403)", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const client = await createApiClient(null);
    const res = await client.post("/api/cron/credential-expiry", undefined, {
      headers: { "x-cron-secret": "test-cron-secret" },
    });
    expect(res.status).not.toBe(403);
  });
});

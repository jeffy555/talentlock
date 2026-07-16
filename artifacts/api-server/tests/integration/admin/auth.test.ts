import { describe, expect, it, beforeAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { adminLogin } from "../../helpers/adminSession";
import { adminEnvReady, integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("admin auth and CSRF", () => {
  it("POST /api/admin/login rejects wrong password", async () => {
    if (!process.env.ADMIN_PASSWORD) return;
    const client = await createApiClient(null);
    const res = await client.post("/api/admin/login", {
      username: "admin",
      password: "wrong-password-xyz",
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/csrf-token returns token when CSRF configured", async () => {
    const client = await createApiClient(null);
    const res = await client.get("/api/admin/csrf-token");
    expect(res.status).toBe(200);
    expect((res.body as { token?: string }).token).toBeTruthy();
  });

  describe.skipIf(!adminEnvReady())("authenticated admin", () => {
    let cookies: string[];
    let csrfToken: string;

    beforeAll(async () => {
      const session = await adminLogin();
      cookies = session.cookies;
      csrfToken = session.csrfToken;
    });

    it("admin POST without CSRF is rejected", async () => {
      const client = await createApiClient(null);
      const res = await client.withCookies(cookies).post("/api/admin/logout");
      expect(res.status).toBe(403);
    });

    it("admin POST with CSRF succeeds for logout", async () => {
      const client = await createApiClient(null);
      const res = await client.withCookies(cookies).post("/api/admin/logout", undefined, {
        headers: { "x-csrf-token": csrfToken },
      });
      expect(res.status).toBe(200);
    });
  });
});

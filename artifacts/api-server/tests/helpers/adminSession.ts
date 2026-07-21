import { loadTestEnv } from "../setup/env";
import { createApiClient } from "./apiClient";

export async function adminLogin(): Promise<{ cookies: string[]; csrfToken: string }> {
  loadTestEnv();
  const password = process.env.ADMIN_PASSWORD;
  const username = process.env.ADMIN_USERNAME ?? "admin";
  if (!password) throw new Error("ADMIN_PASSWORD required for admin integration tests");

  const client = await createApiClient(null);
  const login = await client.post("/api/admin/login", { username, password });
  if (login.status !== 200) {
    throw new Error(`Admin login failed: ${login.status} ${JSON.stringify(login.body)}`);
  }

  const setCookie = login.headers["set-cookie"];
  const cookies = setCookie ? [setCookie.split(";")[0]!] : [];

  const csrfClient = await createApiClient(null);
  const csrfRes = await csrfClient.withCookies(cookies).get("/api/admin/csrf-token");
  const csrfToken = (csrfRes.body as { token?: string })?.token;
  if (!csrfToken) throw new Error("Failed to fetch CSRF token");

  return { cookies, csrfToken };
}

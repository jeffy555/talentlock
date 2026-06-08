const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

let cachedToken: string | null = null;

export async function getAdminCsrfToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await fetch(`${basePath}/api/admin/csrf-token`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch CSRF token");
  const data = (await res.json()) as { token: string };
  cachedToken = data.token;
  return data.token;
}

export function clearAdminCsrfToken(): void {
  cachedToken = null;
}

/** Fetch wrapper for admin POST/PATCH/DELETE — attaches x-csrf-token. */
export async function adminMutate(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAdminCsrfToken();
  const headers = new Headers(init.headers);
  headers.set("x-csrf-token", token);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...init, credentials: "include", headers });
}

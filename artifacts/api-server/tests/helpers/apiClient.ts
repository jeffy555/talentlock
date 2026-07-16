import type TestAgent from "supertest/lib/agent";
import { getAgent } from "./testApp";

export type ApiResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

function normalizeHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) out[k.toLowerCase()] = String(v);
  }
  return out;
}

export class ApiClient {
  private agent: TestAgent | null = null;
  private token: string | null = null;
  private cookies: string[] = [];

  async init() {
    if (!this.agent) this.agent = await getAgent();
    return this;
  }

  withToken(token: string | null) {
    this.token = token;
    return this;
  }

  withCookies(cookies: string[]) {
    this.cookies = cookies;
    return this;
  }

  private applyAuth(req: ReturnType<TestAgent["get"]>) {
    if (this.token) req.set("Authorization", `Bearer ${this.token}`);
    if (this.cookies.length) req.set("Cookie", this.cookies.join("; "));
    return req;
  }

  async request(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse> {
    await this.init();
    const agent = this.agent!;
    let req = agent[method.toLowerCase() as "get"](path);
    req = this.applyAuth(req);
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) req.set(k, v);
    }
    if (options.body !== undefined) {
      req = req.send(options.body);
    }
    const res = await req;
    return {
      status: res.status,
      body: res.body,
      headers: normalizeHeaders(res.headers as Record<string, unknown>),
    };
  }

  get(path: string, opts?: { headers?: Record<string, string> }) {
    return this.request("GET", path, opts);
  }

  post(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) {
    return this.request("POST", path, { body, headers: opts?.headers });
  }

  patch(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) {
    return this.request("PATCH", path, { body, headers: opts?.headers });
  }

  put(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) {
    return this.request("PUT", path, { body, headers: opts?.headers });
  }

  delete(path: string, opts?: { headers?: Record<string, string> }) {
    return this.request("DELETE", path, opts);
  }
}

export async function createApiClient(token?: string | null) {
  const client = new ApiClient();
  await client.init();
  if (token !== undefined) client.withToken(token);
  return client;
}

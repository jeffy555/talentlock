import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireCronSecret } from "../../src/lib/cronAuth";

function mockRes() {
  const res: { statusCode?: number; body?: unknown; status: (code: number) => typeof res; json: (body: unknown) => typeof res } = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function mockReq(headers: Record<string, string> = {}) {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as any;
}

describe("requireCronSecret", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("fails closed with 500 when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    requireCronSecret(req, res as any, next);
    expect(res.statusCode).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when header is missing", () => {
    process.env.CRON_SECRET = "correct-secret";
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    requireCronSecret(req, res as any, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when header is wrong", () => {
    process.env.CRON_SECRET = "correct-secret";
    const req = mockReq({ "x-cron-secret": "wrong-secret" });
    const res = mockRes();
    const next = vi.fn();
    requireCronSecret(req, res as any, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when header matches", () => {
    process.env.CRON_SECRET = "correct-secret";
    const req = mockReq({ "x-cron-secret": "correct-secret" });
    const res = mockRes();
    const next = vi.fn();
    requireCronSecret(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it("rejects different-length secrets without throwing", () => {
    process.env.CRON_SECRET = "a-much-longer-correct-secret-value";
    const req = mockReq({ "x-cron-secret": "short" });
    const res = mockRes();
    const next = vi.fn();
    expect(() => requireCronSecret(req, res as any, next)).not.toThrow();
    expect(res.statusCode).toBe(401);
  });
});

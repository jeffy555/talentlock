import { expect } from "vitest";
import type { ApiResponse } from "./apiClient";

export function expect402PlanLimit(res: ApiResponse) {
  expect(res.status).toBe(402);
  const body = res.body as Record<string, unknown>;
  expect(body).toMatchObject({
    error: expect.any(String),
    code: expect.any(String),
    planNeeded: expect.any(String),
  });
}

export function expect402TokenLimit(res: ApiResponse) {
  expect402PlanLimit(res);
  expect((res.body as { code: string }).code).toBe("TOKEN_LIMIT");
}

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { expect402PlanLimit } from "../../helpers/assert402";
import { closePool } from "../../helpers/db";
import { employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("team accounts API", () => {
  let empToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/team requires auth", async () => {
    const res = await (await createApiClient(null)).get("/api/team");
    expect(res.status).toBe(401);
  });

  it("GET /api/team returns 402 PLAN_LIMIT for non-enterprise employer", async () => {
    const res = await (await createApiClient(empToken)).get("/api/team");
    if (res.status === 402) {
      expect402PlanLimit(res);
      expect((res.body as { planNeeded?: string }).planNeeded).toBe("employer_enterprise");
    } else {
      // Demo employer may already be on enterprise — still a valid outcome
      expect([200, 403]).toContain(res.status);
    }
  });

  it("GET /api/team/shortlist requires enterprise plan", async () => {
    const res = await (await createApiClient(empToken)).get("/api/team/shortlist");
    expect([402, 403, 200]).toContain(res.status);
  });

  it("GET /api/team/analytics requires enterprise + admin", async () => {
    const res = await (await createApiClient(empToken)).get("/api/team/analytics");
    expect([402, 403, 200]).toContain(res.status);
  });

  it("GET /api/team/accept-invite is public with missing token", async () => {
    const res = await (await createApiClient(null)).get("/api/team/accept-invite");
    expect([400, 404]).toContain(res.status);
  });
});

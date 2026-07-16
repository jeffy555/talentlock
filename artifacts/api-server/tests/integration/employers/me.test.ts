import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("employers API", () => {
  let empToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/employers/me returns profile for employer", async () => {
    const res = await (await createApiClient(empToken)).get("/api/employers/me");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("companyName");
    expect(res.body).toHaveProperty("verificationLevel");
  });

  it("employer profile response never includes aiNotes", async () => {
    const res = await (await createApiClient(empToken)).get("/api/employers/me");
    expect(JSON.stringify(res.body)).not.toContain("aiNotes");
  });

  it("GET /api/employer-documents/me uses allowlist fields only", async () => {
    const res = await (await createApiClient(empToken)).get("/api/employer-documents/me");
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("aiNotes");
    expect(body).not.toContain("fileUrl");
  });

  it("freelancer gets 404 on /employers/me", async () => {
    const flToken = await freelancerToken();
    const res = await (await createApiClient(flToken)).get("/api/employers/me");
    expect(res.status).toBe(404);
  });
});

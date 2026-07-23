import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("freelancer document verification", () => {
  afterAll(async () => {
    await closePool();
  });

  it("POST /api/documents/upload-url requires auth", async () => {
    const res = await (await createApiClient(null)).post("/api/documents/upload-url", {
      documentType: "passport",
      mimeType: "image/png",
      fileSize: 1000,
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/documents/upload-url rejects employer", async () => {
    const empToken = await employerToken();
    const res = await (await createApiClient(empToken)).post("/api/documents/upload-url", {
      documentType: "passport",
      mimeType: "image/png",
      fileSize: 1000,
    });
    expect(res.status).toBe(403);
  });

  it("GET /api/documents/me returns verificationLevel and documents for freelancer", async () => {
    const flToken = await freelancerToken();
    const res = await (await createApiClient(flToken)).get("/api/documents/me");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("verificationLevel");
    expect(Array.isArray(res.body.documents)).toBe(true);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("fileUrl");
  });
});

describe.skipIf(!integrationEnvReady())("employer document verification", () => {
  afterAll(async () => {
    await closePool();
  });

  it("POST /api/employer-documents/upload-url rejects freelancer", async () => {
    const flToken = await freelancerToken();
    const res = await (await createApiClient(flToken)).post("/api/employer-documents/upload-url", {
      documentType: "company_registration",
      filename: "reg.png",
      mimeType: "image/png",
    });
    expect(res.status).toBe(403);
  });

  it("GET /api/employer-documents/me never exposes aiNotes or fileUrl", async () => {
    const empToken = await employerToken();
    const res = await (await createApiClient(empToken)).get("/api/employer-documents/me");
    expect(res.status).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("aiNotes");
    expect(json).not.toContain("fileUrl");
  });
});

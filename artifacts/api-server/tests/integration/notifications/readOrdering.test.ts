import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("notifications route ordering", () => {
  let empToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("PATCH /notifications/read-all succeeds (registered before /:id/read)", async () => {
    const res = await (await createApiClient(empToken)).patch("/api/notifications/read-all");
    expect(res.status).toBe(200);
  });

  it("PATCH /notifications/:id/read returns 404 for unknown id", async () => {
    const res = await (await createApiClient(empToken)).patch("/api/notifications/99999999/read");
    expect([404, 400]).toContain(res.status);
  });
});

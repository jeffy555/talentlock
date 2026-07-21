import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, getPool } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("input sanitisation", () => {
  let empToken: string;
  let flToken: string;
  let originalBio: string | null = null;
  let freelancerClerkId: string;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
    freelancerClerkId = process.env.DEMO_FREELANCER_CLERK_ID ?? "user_3DBiBymDbIiXQnFqyk64WquLsdY";

    const pool = getPool();
    const row = await pool.query(
      `SELECT bio FROM freelancer_profiles fp
       JOIN users u ON u.id = fp.user_id WHERE u.clerk_id = $1`,
      [freelancerClerkId],
    );
    originalBio = row.rows[0]?.bio ?? null;
  });

  afterAll(async () => {
    if (originalBio !== null) {
      const pool = getPool();
      await pool.query(
        `UPDATE freelancer_profiles fp SET bio = $1
         FROM users u WHERE u.id = fp.user_id AND u.clerk_id = $2`,
        [originalBio, freelancerClerkId],
      );
    }
    await closePool();
  });

  it("strips HTML from freelancer bio on PUT /freelancers/me", async () => {
    const client = await createApiClient(flToken);
    const malicious = "<script>alert(1)</script>Safe bio text for testing sanitisation.";
    const put = await client.put("/api/freelancers/me", { bio: malicious });
    expect(put.status).toBe(200);
    expect((put.body as { bio?: string }).bio).not.toContain("<script>");
    expect((put.body as { bio?: string }).bio).toContain("Safe bio");

    const get = await client.get("/api/freelancers/me");
    expect((get.body as { bio?: string }).bio).not.toContain("<script>");
  });

  it("strips HTML from job description on PATCH", async () => {
    const pool = getPool();
    const job = await pool.query(
      `SELECT jr.id FROM job_requirements jr
       JOIN employer_profiles ep ON ep.id = jr.employer_id
       JOIN users u ON u.id = ep.user_id
       WHERE u.clerk_id = $1 ORDER BY jr.id DESC LIMIT 1`,
      [process.env.DEMO_EMPLOYER_CLERK_ID ?? "user_3DBguOY4TbwT9bxOYc9NcYU5q9a"],
    );
    const jobId = job.rows[0]?.id;
    if (!jobId) return;

    const client = await createApiClient(empToken);
    const res = await client.patch(`/api/job-requirements/${jobId}`, {
      description: "<b>bold</b><script>x</script> description",
    });
    if (res.status === 200) {
      expect(String((res.body as { description?: string }).description)).not.toContain("<script>");
    }
  });
});

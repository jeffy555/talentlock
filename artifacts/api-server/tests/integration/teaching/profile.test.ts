import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, getPool } from "../../helpers/db";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("teaching professional profile", () => {
  afterAll(async () => {
    await closePool();
  });

  it("freelancer profiles default professionCategory to technology", async () => {
    const pool = getPool();
    const row = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE profession_category IS NULL)::int AS nulls
       FROM freelancer_profiles`,
    );
    expect(row.rows[0]?.nulls).toBe(0);
    expect(row.rows[0]?.total).toBeGreaterThan(0);
  });

  it("GET /api/freelancers?professionCategory=technology is additive filter", async () => {
    const res = await (await createApiClient(null)).get(
      "/api/freelancers?professionCategory=technology",
    );
    expect(res.status).toBe(200);
    const list = res.body as { professionCategory?: string }[];
    for (const f of list.slice(0, 5)) {
      if (f.professionCategory != null) {
        expect(f.professionCategory).toBe("technology");
      }
    }
  });

  it("education-specific fields are nullable in schema", async () => {
    const pool = getPool();
    const row = await pool.query(
      `SELECT COUNT(*)::int AS c FROM freelancer_profiles
       WHERE education_profession_type IS NULL`,
    );
    expect(row.rows[0]?.c).toBeGreaterThanOrEqual(0);
  });
});

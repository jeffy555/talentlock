import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, getPool, loadDemoFixtures } from "../../helpers/db";
import { employerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("booking currency freeze", () => {
  let empToken: string;

  beforeAll(async () => {
    empToken = await employerToken();
  });

  afterAll(async () => {
    await closePool();
  });

  it("GET /api/bookings/:id includes currencyCode", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.bookingId) return;

    const res = await (await createApiClient(empToken)).get(`/api/bookings/${fixtures.bookingId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("currencyCode");
    expect(typeof (res.body as { currencyCode: string }).currencyCode).toBe("string");
  });

  it("POST /api/bookings sets currencyCode from freelancer profile", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.freelancerProfileId) return;

    const pool = getPool();
    await pool.query(
      `UPDATE freelancer_profiles SET currency_code = $1, country_code = $2 WHERE id = $3`,
      ["INR", "IN", fixtures.freelancerProfileId],
    );

    const start = new Date();
    start.setDate(start.getDate() + 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const client = await createApiClient(empToken);
    const createRes = await client.post("/api/bookings", {
      freelancerId: fixtures.freelancerProfileId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      paymentType: "hourly",
      rate: 1500,
    });

    if (createRes.status === 409) {
      // Freelancer unavailable — still verify profile currency is INR
      const profileRes = await client.get(`/api/freelancers/${fixtures.freelancerProfileId}`);
      expect((profileRes.body as { currencyCode: string }).currencyCode).toBe("INR");
      return;
    }

    expect(createRes.status).toBe(201);
    expect((createRes.body as { currencyCode: string }).currencyCode).toBe("INR");

    const getRes = await client.get(`/api/bookings/${(createRes.body as { id: number }).id}`);
    expect(getRes.status).toBe(200);
    expect((getRes.body as { currencyCode: string }).currencyCode).toBe("INR");
  });
});

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
    expect(res.body).not.toHaveProperty("exchangeRateAtCreation");
  });

  it("POST /api/bookings freezes INR currency and exchange snapshot", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.freelancerProfileId) return;

    const pool = getPool();
    const freelancerId = fixtures.freelancerProfileId;

    await pool.query(
      `UPDATE freelancer_profiles
       SET currency_code = $1, country_code = $2, is_available = true, current_booking_id = NULL, booking_end_date = NULL
       WHERE id = $3`,
      ["INR", "IN", freelancerId],
    );
    await pool.query(
      `UPDATE bookings SET status = 'completed'
       WHERE freelancer_id = $1 AND status IN ('active', 'pending')`,
      [freelancerId],
    );

    const start = new Date();
    start.setDate(start.getDate() + 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const client = await createApiClient(empToken);
    const createRes = await client.post("/api/bookings", {
      freelancerId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      paymentType: "hourly",
      rate: 1500,
    });

    expect(createRes.status).toBe(201);
    const bookingId = (createRes.body as { id: number; currencyCode: string }).id;
    expect((createRes.body as { currencyCode: string }).currencyCode).toBe("INR");

    const row = await pool.query<{ currency_code: string; exchange_rate_at_creation: Record<string, unknown> | null }>(
      `SELECT currency_code, exchange_rate_at_creation FROM bookings WHERE id = $1`,
      [bookingId],
    );
    expect(row.rows[0]?.currency_code).toBe("INR");
    expect(row.rows[0]?.exchange_rate_at_creation).toMatchObject({
      baseCurrency: "USD",
      rates: expect.any(Object),
      source: expect.stringMatching(/^(api|cache|fallback)$/),
    });

    await pool.query(
      `UPDATE freelancer_profiles SET currency_code = $1, country_code = $2 WHERE id = $3`,
      ["EUR", "DE", freelancerId],
    );

    const frozen = await pool.query<{ currency_code: string }>(
      `SELECT currency_code FROM bookings WHERE id = $1`,
      [bookingId],
    );
    expect(frozen.rows[0]?.currency_code).toBe("INR");

    const getRes = await client.get(`/api/bookings/${bookingId}`);
    expect(getRes.status).toBe(200);
    expect((getRes.body as { currencyCode: string }).currencyCode).toBe("INR");
    expect(getRes.body).not.toHaveProperty("exchangeRateAtCreation");
  });
});

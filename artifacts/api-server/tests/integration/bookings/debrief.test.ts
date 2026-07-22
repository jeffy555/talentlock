import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, getPool, loadDemoFixtures, type DemoFixtures } from "../../helpers/db";
import { employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";

const SAMPLE_DEBRIEF = {
  employer: {
    engagementSnapshot: {
      freelancerName: "Test Freelancer",
      field: "Technology",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-04-01T00:00:00.000Z",
      rate: 95,
      rateType: "hourly",
      milestonesCompleted: 1,
      milestonesTotal: 1,
    },
    outcomeSummary: "Engagement completed successfully.",
    performanceSignals: ["Milestones delivered on time"],
    rehireRecommendation: {
      verdict: "strong_rehire",
      reasons: ["Strong delivery"],
    },
    internalNotesTemplate: "Internal notes for HR.",
  },
  freelancer: {
    engagementSnapshot: {
      companyName: "Test Corp",
      jobTitle: "Developer",
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-04-01T00:00:00.000Z",
      rate: 95,
      rateType: "hourly",
    },
    whatYouDelivered: "Shipped the dashboard.",
    strengthsDemonstrated: ["React"],
    growthAreas: ["Portfolio depth"],
    profileSuggestions: ["Add a case study"],
  },
  generatedAt: "2026-04-02T12:00:00.000Z",
};

describe.skipIf(!integrationEnvReady())("booking debrief API", () => {
  let fixtures: DemoFixtures;
  let empToken: string;
  let flToken: string;
  let debriefBookingId: number | null = null;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
    fixtures = await loadDemoFixtures();

    if (fixtures.bookingId) {
      const pool = getPool();
      debriefBookingId = fixtures.bookingId;
      await pool.query(
        `UPDATE bookings
         SET status = 'completed',
             debrief_content = $1::jsonb,
             debrief_generated_at = NOW(),
             debrief_regenerated_at = NULL
         WHERE id = $2`,
        [JSON.stringify(SAMPLE_DEBRIEF), debriefBookingId],
      );
    }
  });

  afterAll(async () => {
    if (debriefBookingId) {
      const pool = getPool();
      await pool.query(
        `UPDATE bookings
         SET debrief_content = NULL,
             debrief_generated_at = NULL,
             debrief_regenerated_at = NULL
         WHERE id = $1`,
        [debriefBookingId],
      );
    }
    await closePool();
  });

  it("GET /api/bookings/:id/debrief requires auth", async () => {
    if (!debriefBookingId) return;
    const res = await (await createApiClient(null)).get(`/api/bookings/${debriefBookingId}/debrief`);
    expect(res.status).toBe(401);
  });

  it("GET /api/bookings/:id/debrief returns 403 for non-participant", async () => {
    if (!fixtures.nonParticipantBookingId) return;
    const pool = getPool();
    await pool.query(
      `UPDATE bookings
       SET status = 'completed',
           debrief_content = $1::jsonb,
           debrief_generated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(SAMPLE_DEBRIEF), fixtures.nonParticipantBookingId],
    );
    const res = await (await createApiClient(flToken)).get(
      `/api/bookings/${fixtures.nonParticipantBookingId}/debrief`,
    );
    expect([403, 404]).toContain(res.status);
    await pool.query(
      `UPDATE bookings
       SET debrief_content = NULL, debrief_generated_at = NULL
       WHERE id = $1`,
      [fixtures.nonParticipantBookingId],
    );
  });

  it("GET /api/bookings/:id/debrief returns 404 when not ready", async () => {
    if (!fixtures.bookingId) return;
    const pool = getPool();
    await pool.query(
      `UPDATE bookings SET debrief_content = NULL, debrief_generated_at = NULL WHERE id = $1`,
      [fixtures.bookingId],
    );
    const res = await (await createApiClient(empToken)).get(`/api/bookings/${fixtures.bookingId}/debrief`);
    expect(res.status).toBe(404);
    expect((res.body as { error?: string }).error).toMatch(/not ready/i);
    await pool.query(
      `UPDATE bookings
       SET debrief_content = $1::jsonb, debrief_generated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(SAMPLE_DEBRIEF), fixtures.bookingId],
    );
  });

  it("employer GET returns employer slice only", async () => {
    if (!debriefBookingId) return;
    const res = await (await createApiClient(empToken)).get(`/api/bookings/${debriefBookingId}/debrief`);
    expect(res.status).toBe(200);
    const body = res.body as {
      debrief: Record<string, unknown>;
      disclaimer?: string;
    };
    expect(body.debrief.outcomeSummary).toBeDefined();
    expect(body.debrief.internalNotesTemplate).toBeDefined();
    expect(body.debrief.whatYouDelivered).toBeUndefined();
    expect(body.debrief.profileSuggestions).toBeUndefined();
    expect(body.disclaimer).toBeTruthy();
  });

  it("freelancer GET returns freelancer slice only", async () => {
    if (!debriefBookingId) return;
    const res = await (await createApiClient(flToken)).get(`/api/bookings/${debriefBookingId}/debrief`);
    expect(res.status).toBe(200);
    const body = res.body as { debrief: Record<string, unknown> };
    expect(body.debrief.whatYouDelivered).toBeDefined();
    expect(body.debrief.profileSuggestions).toBeDefined();
    expect(body.debrief.internalNotesTemplate).toBeUndefined();
    expect(body.debrief.rehireRecommendation).toBeUndefined();
  });

  it("GET /api/bookings/:id never includes raw debriefContent", async () => {
    if (!debriefBookingId) return;
    const res = await (await createApiClient(empToken)).get(`/api/bookings/${debriefBookingId}`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.debriefContent).toBeUndefined();
    expect(body.hasDebrief).toBe(true);
    expect(body.debriefGeneratedAt).toBeTruthy();
  });

  it("POST /api/bookings/:id/debrief returns 202 then 429 on cooldown", async () => {
    if (!debriefBookingId) return;
    const pool = getPool();
    await pool.query(
      `UPDATE bookings SET debrief_regenerated_at = NULL WHERE id = $1`,
      [debriefBookingId],
    );

    const first = await (await createApiClient(empToken)).post(`/api/bookings/${debriefBookingId}/debrief`);
    expect([202, 402]).toContain(first.status);

    if (first.status === 202) {
      const second = await (await createApiClient(empToken)).post(`/api/bookings/${debriefBookingId}/debrief`);
      expect(second.status).toBe(429);
      expect((second.body as { code?: string }).code).toBe("DEBRIEF_REGEN_COOLDOWN");
    }
  });

  it("POST /api/bookings/:id/debrief returns 422 for non-completed booking", async () => {
    if (!fixtures.bookingId) return;
    const pool = getPool();
    const prev = await pool.query(`SELECT status FROM bookings WHERE id = $1`, [fixtures.bookingId]);
    const originalStatus = prev.rows[0]?.status ?? "active";
    await pool.query(`UPDATE bookings SET status = 'active' WHERE id = $1`, [fixtures.bookingId]);
    const res = await (await createApiClient(empToken)).post(`/api/bookings/${fixtures.bookingId}/debrief`);
    expect(res.status).toBe(422);
    await pool.query(`UPDATE bookings SET status = $1 WHERE id = $2`, [originalStatus, fixtures.bookingId]);
  });
});

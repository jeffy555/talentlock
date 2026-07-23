import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool, getPool, loadDemoFixtures } from "../../helpers/db";
import { DEMO_EMPLOYER, employerToken, freelancerToken } from "../../helpers/clerkAuth";
import { integrationEnvReady } from "../../setup/env";
import { writeLocalObject } from "../../../src/lib/localObjectStorage";

const SAMPLE_AGREEMENT_TEXT =
  "FREELANCE SERVICES AGREEMENT\n\n".repeat(20) +
  "The Client engages the Contractor to perform professional services. " +
  "Payment shall be made within thirty days of invoice. " +
  "All work product shall be owned by the Client upon full payment. " +
  "Either party may terminate with fourteen days written notice.";

async function findBookingWithoutAgreement(): Promise<number | null> {
  const pool = getPool();
  const employerClerk = DEMO_EMPLOYER();
  const row = await pool.query(
    `SELECT b.id FROM bookings b
     JOIN employer_profiles ep ON ep.id = b.employer_id
     JOIN users u ON u.id = ep.user_id
     WHERE u.clerk_id = $1
       AND b.negotiation_status != 'negotiating'
       AND NOT EXISTS (SELECT 1 FROM agreements a WHERE a.booking_id = b.id)
     ORDER BY b.id DESC
     LIMIT 1`,
    [employerClerk],
  );
  return row.rows[0]?.id ?? null;
}

async function insertUploadedAgreement(params: {
  bookingId: number;
  uploadStage: string;
  content?: string;
}): Promise<number> {
  const pool = getPool();
  const booking = await pool.query(
    `SELECT freelancer_id, employer_id FROM bookings WHERE id = $1`,
    [params.bookingId],
  );
  const { freelancer_id, employer_id } = booking.rows[0];
  const row = await pool.query(
    `INSERT INTO agreements (
       booking_id, freelancer_id, employer_id, content, status, source, upload_stage, amendments
     ) VALUES ($1, $2, $3, $4, 'draft', 'employer_upload', $5, '[]'::jsonb)
     RETURNING id`,
    [
      params.bookingId,
      freelancer_id,
      employer_id,
      params.content ?? SAMPLE_AGREEMENT_TEXT,
      params.uploadStage,
    ],
  );
  return row.rows[0].id as number;
}

async function deleteAgreement(id: number): Promise<void> {
  await getPool().query(`DELETE FROM agreements WHERE id = $1`, [id]);
}

describe.skipIf(!integrationEnvReady())("employer uploaded agreement API", () => {
  let empToken: string;
  let flToken: string;
  let employerUserId: number | null;

  beforeAll(async () => {
    empToken = await employerToken();
    flToken = await freelancerToken();
    const pool = getPool();
    const row = await pool.query(
      `SELECT u.id FROM users u WHERE u.clerk_id = $1 LIMIT 1`,
      [DEMO_EMPLOYER()],
    );
    employerUserId = row.rows[0]?.id ?? null;
  });

  afterAll(async () => {
    await closePool();
  });

  it("POST /api/agreements/upload-url requires auth", async () => {
    const res = await (await createApiClient(null)).post("/api/agreements/upload-url", {
      bookingId: 1,
      filename: "contract.pdf",
      mimeType: "application/pdf",
      fileSize: 1000,
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/agreements/upload-url rejects freelancer", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.bookingId) return;
    const res = await (await createApiClient(flToken)).post("/api/agreements/upload-url", {
      bookingId: fixtures.bookingId,
      filename: "contract.pdf",
      mimeType: "application/pdf",
      fileSize: 1000,
    });
    expect(res.status).toBe(403);
  });

  it("POST /api/agreements/upload-url rejects invalid mime type", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.bookingId) return;
    const res = await (await createApiClient(empToken)).post("/api/agreements/upload-url", {
      bookingId: fixtures.bookingId,
      filename: "photo.png",
      mimeType: "image/png",
      fileSize: 1000,
    });
    expect(res.status).toBe(400);
    expect((res.body as { code?: string }).code).toBe("INVALID_FILE_TYPE");
  });

  it("POST /api/agreements/upload-confirm rejects missing file", async () => {
    const bookingId = await findBookingWithoutAgreement();
    if (!bookingId || !employerUserId) return;

    const res = await (await createApiClient(empToken)).post("/api/agreements/upload-confirm", {
      bookingId,
      storagePath: `uploads/${employerUserId}/agreements/${bookingId}/missing.txt`,
      filename: "missing.txt",
      mimeType: "text/plain",
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/agreements/upload-confirm creates employer_upload agreement from TXT", async () => {
    const bookingId = await findBookingWithoutAgreement();
    if (!bookingId || !employerUserId) return;

    const urlRes = await (await createApiClient(empToken)).post("/api/agreements/upload-url", {
      bookingId,
      filename: "my-contract.txt",
      mimeType: "text/plain",
      fileSize: SAMPLE_AGREEMENT_TEXT.length,
    });
    expect(urlRes.status).toBe(200);

    const { uploadUrl, storagePath } = urlRes.body as { uploadUrl: string; storagePath: string };
    expect(storagePath).toContain(`uploads/${employerUserId}/agreements/${bookingId}/`);

    await writeLocalObject(storagePath, Buffer.from(SAMPLE_AGREEMENT_TEXT, "utf-8"));

    const confirmRes = await (await createApiClient(empToken)).post("/api/agreements/upload-confirm", {
      bookingId,
      storagePath,
      filename: "my-contract.txt",
      mimeType: "text/plain",
    });

    expect([201, 402]).toContain(confirmRes.status);
    if (confirmRes.status !== 201) return;

    const agreement = confirmRes.body as {
      id: number;
      source: string;
      uploadStage: string;
      content: string;
    };
    expect(agreement.source).toBe("employer_upload");
    expect(agreement.uploadStage).toBe("summary_ready");
    expect(agreement.content).toContain("FREELANCE SERVICES AGREEMENT");

    const duplicateRes = await (await createApiClient(empToken)).post("/api/agreements/upload-confirm", {
      bookingId,
      storagePath,
      filename: "my-contract.txt",
      mimeType: "text/plain",
    });
    expect(duplicateRes.status).toBe(400);

    await deleteAgreement(agreement.id);
  });

  it("POST /api/agreements/:id/sign blocks employer until finalized", async () => {
    const bookingId = await findBookingWithoutAgreement();
    if (!bookingId) return;

    const agreementId = await insertUploadedAgreement({
      bookingId,
      uploadStage: "enriched",
    });

    try {
      const res = await (await createApiClient(empToken)).post(`/api/agreements/${agreementId}/sign`, {
        role: "employer",
        signatureName: "Test Employer",
      });
      expect(res.status).toBe(400);
      expect((res.body as { code?: string }).code).toBe("UPLOAD_NOT_FINALIZED");
    } finally {
      await deleteAgreement(agreementId);
    }
  });

  it("PATCH /api/agreements/:id/amendments updates employer_upload agreement", async () => {
    const bookingId = await findBookingWithoutAgreement();
    if (!bookingId) return;

    const agreementId = await insertUploadedAgreement({
      bookingId,
      uploadStage: "summary_ready",
    });

    try {
      const res = await (await createApiClient(empToken)).patch(`/api/agreements/${agreementId}/amendments`, {
        amendments: ["Include a mutual confidentiality clause for twelve months."],
      });
      expect(res.status).toBe(200);
      const body = res.body as { amendments: Array<{ text: string }> };
      expect(body.amendments).toHaveLength(1);
      expect(body.amendments[0].text).toContain("confidentiality");
    } finally {
      await deleteAgreement(agreementId);
    }
  });

  it("PATCH /api/agreements/:id/amendments rejects freelancer", async () => {
    const fixtures = await loadDemoFixtures();
    if (!fixtures.agreementId) return;
    const res = await (await createApiClient(flToken)).patch(
      `/api/agreements/${fixtures.agreementId}/amendments`,
      { amendments: ["Freelancer should not edit this."] },
    );
    expect(res.status).toBe(403);
  });

  it("POST /api/agreements/:id/enrich requires employer", async () => {
    const bookingId = await findBookingWithoutAgreement();
    if (!bookingId) return;

    const agreementId = await insertUploadedAgreement({
      bookingId,
      uploadStage: "summary_ready",
    });

    try {
      const res = await (await createApiClient(flToken)).post(`/api/agreements/${agreementId}/enrich`);
      expect(res.status).toBe(403);
    } finally {
      await deleteAgreement(agreementId);
    }
  });

  it("POST /api/agreements/:id/finalize requires enriched stage", async () => {
    const bookingId = await findBookingWithoutAgreement();
    if (!bookingId) return;

    const agreementId = await insertUploadedAgreement({
      bookingId,
      uploadStage: "summary_ready",
    });

    try {
      const res = await (await createApiClient(empToken)).post(`/api/agreements/${agreementId}/finalize`);
      expect(res.status).toBe(400);
      expect((res.body as { code?: string }).code).toBe("NOT_ENRICHED");
    } finally {
      await deleteAgreement(agreementId);
    }
  });
});

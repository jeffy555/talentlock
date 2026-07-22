import { describe, expect, it, afterAll } from "vitest";
import { createApiClient } from "../../helpers/apiClient";
import { closePool } from "../../helpers/db";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("currency reference routes", () => {
  afterAll(async () => {
    await closePool();
  });

  it("GET /api/countries returns 10 countries without auth", async () => {
    const res = await (await createApiClient(null)).get("/api/countries");
    expect(res.status).toBe(200);
    const body = res.body as { countries: { code: string; currencyCode: string }[] };
    expect(body.countries).toHaveLength(10);
    expect(body.countries.some((c) => c.code === "IN" && c.currencyCode === "INR")).toBe(true);
  });

  it("GET /api/exchange-rates returns rates object", async () => {
    const res = await (await createApiClient(null)).get("/api/exchange-rates");
    expect(res.status).toBe(200);
    const body = res.body as { baseCurrency: string; rates: Record<string, number> };
    expect(body.baseCurrency).toBe("USD");
    expect(body.rates.USD).toBe(1);
  });
});

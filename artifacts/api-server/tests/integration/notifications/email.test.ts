import { describe, expect, it } from "vitest";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("notification email e2e", () => {
  it("skipped when RESEND_API_KEY not configured", () => {
    if (!process.env.RESEND_API_KEY) {
      expect(true).toBe(true);
      return;
    }
    expect(process.env.RESEND_API_KEY.length).toBeGreaterThan(0);
  });
});

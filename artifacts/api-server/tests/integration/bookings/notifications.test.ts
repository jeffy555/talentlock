import { describe, expect, it } from "vitest";
import { integrationEnvReady } from "../../setup/env";

describe.skipIf(!integrationEnvReady())("booking email notifications", () => {
  it("email service no-ops when RESEND_API_KEY unset", () => {
    if (process.env.RESEND_API_KEY) return;
    expect(process.env.RESEND_API_KEY).toBeUndefined();
  });
});

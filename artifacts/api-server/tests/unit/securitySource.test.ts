import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(rel: string) {
  return readFileSync(join(workspaceRoot, rel), "utf8");
}

describe("security hardening source checks (validate-security-hardening port)", () => {
  it("logger redacts authorization header", () => {
    const src = read("artifacts/api-server/src/lib/logger.ts");
    expect(src).toContain('censor: "[REDACTED]"');
    expect(src).toContain("req.headers.authorization");
  });

  it("sanitise.ts exists", () => {
    expect(existsSync(join(workspaceRoot, "artifacts/api-server/src/lib/sanitise.ts"))).toBe(true);
  });

  it("agreements route logs sign and download audit events", () => {
    const src = read("artifacts/api-server/src/routes/agreements.ts");
    expect(src).toContain('action: "agreement.signed"');
    expect(src).toContain('action: "agreement.downloaded"');
  });

  it("tokenLogger includes rate_suggestion feature", () => {
    const src = read("artifacts/api-server/src/lib/tokenLogger.ts");
    expect(src).toContain("rate_suggestion");
  });

  it("account deletion module exists", () => {
    expect(existsSync(join(workspaceRoot, "artifacts/api-server/src/lib/accountDeletion.ts"))).toBe(true);
  });
});

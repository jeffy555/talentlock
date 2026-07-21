import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEGACY_SCRIPT_MAP } from "../regression/legacy-map";

const apiServerRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceRoot = join(apiServerRoot, "../..");

describe("legacy script migration coverage", () => {
  it("every legacy script file exists in the repo", () => {
    for (const entry of LEGACY_SCRIPT_MAP) {
      const path = join(workspaceRoot, entry.script);
      expect(existsSync(path), `missing legacy script: ${entry.script}`).toBe(true);
    }
  });

  it("every mapped Vitest suite file exists", () => {
    const suites = new Set<string>();
    for (const entry of LEGACY_SCRIPT_MAP) {
      for (const rel of entry.vitest) suites.add(rel);
    }
    for (const rel of suites) {
      const path = join(apiServerRoot, rel);
      expect(existsSync(path), `missing vitest suite: ${rel}`).toBe(true);
    }
  });

  it("covers all P0 legacy scripts", () => {
    const p0 = LEGACY_SCRIPT_MAP.filter((e) => e.priority === "P0");
    expect(p0.length).toBeGreaterThanOrEqual(3);
  });
});

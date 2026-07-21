import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "../../src");

function readPage(rel: string) {
  return readFileSync(join(srcRoot, rel), "utf8");
}

describe("exclusivity copy alignment", () => {
  it("BookingDetail shows Exclusivity Locked only when status is active", () => {
    const src = readPage("pages/BookingDetail.tsx");
    expect(src).toContain("booking.status === 'active'");
    expect(src).toContain("Exclusivity Locked");
    expect(src).toContain("Exclusivity Pending");
    // Locked copy must be gated on active, not on pending
    const lockedIdx = src.indexOf("Exclusivity Locked");
    const activeGateIdx = src.indexOf("booking.status === 'active'");
    expect(activeGateIdx).toBeGreaterThan(-1);
    expect(lockedIdx).toBeGreaterThan(activeGateIdx);
  });

  it("BookingsList shows Exclusivity Locked only for active bookings", () => {
    const src = readPage("pages/BookingsList.tsx");
    expect(src).toMatch(/booking\.status === ["']active["']/);
    expect(src).toContain("Exclusivity Locked");
  });

  it("FreelancerDetail does not claim lock-on-request in success copy", () => {
    const src = readPage("pages/FreelancerDetail.tsx");
    expect(src).not.toMatch(/exclusivity locked/i);
  });
});

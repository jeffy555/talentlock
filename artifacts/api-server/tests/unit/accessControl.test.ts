import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const accessControlSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../src/lib/accessControl.ts"),
  "utf8",
);

describe("accessControl exports", () => {
  const exports = [
    "resolveUserByClerkId",
    "canAccessBooking",
    "canAccessMeeting",
    "canAccessJobRequirement",
    "canAccessConversation",
    "canAccessAgreement",
    "agreementRoleForUser",
  ];

  for (const name of exports) {
    it(`exports ${name}`, () => {
      expect(accessControlSrc).toContain(`export async function ${name}`);
    });
  }
});

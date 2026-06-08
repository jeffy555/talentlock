#!/usr/bin/env node
/**
 * Phase 3 validation: trigger presence in route handlers
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const checks = [
  { file: "artifacts/api-server/src/routes/bookings.ts", types: ["BOOKING_CREATED", "BOOKING_STATUS_CHANGED", "RATE_COUNTER_PROPOSED", "RATE_AGREED"] },
  { file: "artifacts/api-server/src/routes/agreements.ts", types: ["AGREEMENT_READY", "AGREEMENT_SIGNED", "AGREEMENT_FULLY_SIGNED"] },
  { file: "artifacts/api-server/src/routes/meetings.ts", types: ["MEETING_REQUESTED", "MEETING_STATUS_CHANGED"] },
  { file: "artifacts/api-server/src/routes/milestones.ts", types: ["MILESTONE_COMPLETED", "MILESTONE_APPROVED"] },
  { file: "artifacts/api-server/src/routes/reviews.ts", types: ["REVIEW_RECEIVED", "REVIEW_REPLIED"] },
  { file: "artifacts/api-server/src/lib/documentReview.ts", types: ["DOCUMENT_VERIFIED", "DOCUMENT_REJECTED"] },
  { file: "artifacts/api-server/src/routes/admin.ts", types: ["DOCUMENT_REJECTED"] },
];

let ok = true;
for (const { file, types } of checks) {
  const content = read(file);
  for (const type of types) {
    if (!content.includes(`NotificationType.${type}`)) {
      console.error(`❌ ${file}: missing trigger NotificationType.${type}`);
      ok = false;
    }
  }
  if (!content.includes(".catch(") && content.includes("createNotification")) {
    console.error(`❌ ${file}: createNotification calls should use .catch()`);
    ok = false;
  }
}

// No await createNotification in route files
const routeFiles = checks.map((c) => c.file).filter((f) => f.includes("/routes/"));
for (const file of routeFiles) {
  const content = read(file);
  if (/await\s+createNotification/.test(content)) {
    console.error(`❌ ${file}: must not await createNotification`);
    ok = false;
  }
}

if (ok) {
  console.log("✅ Phase 3: all notification triggers present");
  process.exit(0);
}
process.exit(1);

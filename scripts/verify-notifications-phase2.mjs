#!/usr/bin/env node
/**
 * Phase 2 validation: API routes, utility, OpenAPI
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

let ok = true;
const fail = (msg) => { console.error(`❌ ${msg}`); ok = false; };

// createNotification utility
const util = read("artifacts/api-server/src/lib/createNotification.ts");
if (!util.includes("Never await this function")) fail("createNotification JSDoc missing await warning");
if (!util.includes("BOOKING_CREATED")) fail("NotificationType constants missing");
if (!util.includes("DOCUMENT_REJECTED")) fail("NotificationType incomplete");

// Route order
const routes = read("artifacts/api-server/src/routes/notifications.ts");
const readAllIdx = routes.indexOf('"/notifications/read-all"');
const idReadIdx = routes.indexOf('"/notifications/:id/read"');
if (readAllIdx === -1 || idReadIdx === -1) fail("read-all or :id/read route missing");
else if (readAllIdx > idReadIdx) fail("read-all must be registered BEFORE :id/read");

if (!routes.includes("/notifications/unread-count")) fail("unread-count endpoint missing");
if (!routes.includes("pageSize")) fail("pagination not implemented");

// Router registration
const index = read("artifacts/api-server/src/routes/index.ts");
if (!index.includes("notificationsRouter")) fail("notifications router not registered");

// OpenAPI
const openapi = read("lib/api-spec/openapi.yaml");
if (!openapi.includes("/notifications/unread-count")) fail("OpenAPI missing unread-count");
if (!openapi.includes("entityType")) fail("OpenAPI Notification schema missing entityType");
if (!openapi.includes("NotificationsListResult")) fail("OpenAPI missing paginated response");

// Codegen hooks
const api = read("lib/api-client-react/src/generated/api.ts");
for (const hook of [
  "useGetNotificationsUnreadCount",
  "useListNotifications",
  "useMarkAllNotificationsRead",
  "useMarkNotificationRead",
]) {
  if (!api.includes(hook)) fail(`Generated hook missing: ${hook}`);
}

// orval config
const orval = read("lib/api-spec/orval.config.ts");
if (!orval.includes("indexFiles: false")) fail("orval.config.ts indexFiles must be false");

const zodIndex = read("lib/api-zod/src/index.ts");
if (!zodIndex.includes('./generated/api')) fail("api-zod index must export generated/api");

if (ok) {
  console.log("✅ Phase 2: backend infrastructure verified");
  process.exit(0);
}
process.exit(1);

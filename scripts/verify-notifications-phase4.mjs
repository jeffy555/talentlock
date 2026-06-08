#!/usr/bin/env node
/**
 * Phase 4 validation: frontend component wiring
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const requiredFiles = [
  "artifacts/talentlock/src/components/UnreadBadge.tsx",
  "artifacts/talentlock/src/components/NotificationItem.tsx",
  "artifacts/talentlock/src/components/NotificationPanel.tsx",
  "artifacts/talentlock/src/components/NotificationBell.tsx",
  "artifacts/talentlock/src/components/ErrorBoundary.tsx",
  "artifacts/talentlock/src/lib/notificationRoutes.ts",
  "artifacts/talentlock/src/lib/formatRelativeTime.ts",
];

let ok = true;
const fail = (msg) => {
  console.error(`❌ ${msg}`);
  ok = false;
};

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    fail(`Missing file: ${file}`);
  }
}

const layout = read("artifacts/talentlock/src/components/layout/AppLayout.tsx");
if (!layout.includes("NotificationBell")) fail("AppLayout missing NotificationBell");
if (!layout.includes("ErrorBoundary")) fail("AppLayout missing ErrorBoundary wrapper");
if (layout.includes("n.title") || layout.includes("notif.link")) {
  console.error("❌ AppLayout still uses legacy title/link notification fields");
  ok = false;
}

const bell = read("artifacts/talentlock/src/components/NotificationBell.tsx");
if (!bell.includes("useGetNotificationsUnreadCount")) {
  console.error("❌ NotificationBell must use useGetNotificationsUnreadCount");
  ok = false;
}
if (!bell.includes("refetchInterval: 30_000")) {
  console.error("❌ NotificationBell must poll every 30s");
  ok = false;
}
if (!bell.includes("refetchIntervalInBackground: false")) {
  console.error("❌ NotificationBell must disable background polling");
  ok = false;
}

const panel = read("artifacts/talentlock/src/components/NotificationPanel.tsx");
if (!panel.includes("Today")) {
  console.error("❌ NotificationPanel missing Today grouping");
  ok = false;
}
if (!panel.includes("Earlier")) {
  console.error("❌ NotificationPanel missing Earlier grouping");
  ok = false;
}
if (!panel.includes("useListNotifications")) {
  console.error("❌ NotificationPanel must use useListNotifications");
  ok = false;
}

const badge = read("artifacts/talentlock/src/components/UnreadBadge.tsx");
if (!badge.includes("bg-red-500")) {
  console.error("❌ UnreadBadge must use red badge (bg-red-500)");
  ok = false;
}

const routes = read("artifacts/talentlock/src/lib/notificationRoutes.ts");
if (!routes.includes("/meetings/")) {
  console.error("❌ notificationRoutes missing meeting route");
  ok = false;
}

if (ok) {
  console.log("✅ Phase 4: frontend components verified");
  process.exit(0);
}
process.exit(1);

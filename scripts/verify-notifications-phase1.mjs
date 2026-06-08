#!/usr/bin/env node
/**
 * Phase 1 validation: notifications schema shape
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(root, "lib/db/src/schema/notifications.ts");
const content = readFileSync(schemaPath, "utf8");

const required = [
  'serial("id")',
  'integer("user_id")',
  'text("type")',
  'text("entity_type")',
  'text("entity_id")',
  'text("message")',
  'boolean("read")',
  'timestamp("created_at"',
];

const forbidden = ['title', 'link'];

let ok = true;
for (const field of required) {
  if (!content.includes(field)) {
    console.error(`❌ Missing schema field/pattern: ${field}`);
    ok = false;
  }
}
for (const field of forbidden) {
  if (content.includes(`"${field}"`) || content.includes(`'${field}'`)) {
    console.error(`❌ Legacy column still present: ${field}`);
    ok = false;
  }
}

if (ok) {
  console.log("✅ Phase 1: notifications schema has correct columns (entity_type, entity_id; no title/link)");
  process.exit(0);
}
process.exit(1);

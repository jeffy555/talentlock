import { pgTable, text, serial, timestamp, integer, index, jsonb } from "drizzle-orm/pg-core";

// Security Hardening Phase 2 — inspection: ipAddress/userAgent existed; added entityType/entityId;
// metadata migrated text → jsonb. event column is free-form text (no enum constraint).

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  clerkId: text("clerk_id"),
  email: text("email"),
  role: text("role"),
  event: text("event").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCreated: index("audit_logs_created_idx").on(t.createdAt),
  byEvent: index("audit_logs_event_idx").on(t.event),
  byUser: index("audit_logs_user_idx").on(t.userId),
}));

export type AuditLog = typeof auditLogsTable.$inferSelect;

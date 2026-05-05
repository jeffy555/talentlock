import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  clerkId: text("clerk_id"),
  email: text("email"),
  role: text("role"),
  event: text("event").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCreated: index("audit_logs_created_idx").on(t.createdAt),
  byEvent: index("audit_logs_event_idx").on(t.event),
  byUser: index("audit_logs_user_idx").on(t.userId),
}));

export type AuditLog = typeof auditLogsTable.$inferSelect;

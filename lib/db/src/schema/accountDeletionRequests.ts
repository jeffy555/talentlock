import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const accountDeletionRequestsTable = pgTable("account_deletion_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  status: text("status").notNull().default("pending"), // pending | processing | complete | rejected
  reason: text("reason"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
}, (t) => ({
  userIdx: index("idx_account_deletion_user_id").on(t.userId),
}));

export type AccountDeletionRequest = typeof accountDeletionRequestsTable.$inferSelect;

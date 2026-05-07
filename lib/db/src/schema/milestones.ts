import { pgTable, text, serial, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  status: text("status").notNull().default("pending"), // pending | completed | approved
  completedAt: timestamp("completed_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  byBooking: index("milestones_booking_idx").on(t.bookingId),
}));

export const insertMilestoneSchema = createInsertSchema(milestonesTable).omit({
  id: true, createdAt: true, updatedAt: true, completedAt: true, approvedAt: true,
});
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type Milestone = typeof milestonesTable.$inferSelect;

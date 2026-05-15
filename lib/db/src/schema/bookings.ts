import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  freelancerId: integer("freelancer_id").notNull(),
  employerId: integer("employer_id").notNull(),
  jobRequirementId: integer("job_requirement_id"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"), // pending | active | completed | cancelled
  paymentType: text("payment_type").notNull().default("hourly"),
  rate: numeric("rate", { precision: 10, scale: 2 }),
  notes: text("notes"),
  proposedRate: numeric("proposed_rate", { precision: 10, scale: 2 }),
  lastProposedBy: text("last_proposed_by"),
  negotiationStatus: text("negotiation_status").notNull().default("agreed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;

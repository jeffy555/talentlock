import { pgTable, text, serial, timestamp, integer, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { freelancerProfilesTable } from "./freelancerProfiles";
import { bookingsTable } from "./bookings";

// Availability Calendar — Codebase inspection (Task 1.1):
// freelancerProfiles.isAvailable  — boolean column is_available (notNull, default true)
// freelancerProfiles.availableFrom — timestamp column available_from (nullable)
// bookings.startDate / endDate    — timestamp columns start_date / end_date (both notNull)
// booking status confirmed        — no "confirmed"; use "active" for in-progress confirmed bookings
// booking status cancelled        — "cancelled"
// booking status completed        — "completed"
// availability_blocks table       — did not exist prior to this migration

export const availabilityBlocksTable = pgTable("availability_blocks", {
  id: serial("id").primaryKey(),
  freelancerId: integer("freelancer_id").notNull().references(() => freelancerProfilesTable.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason").notNull(), // booked | holiday | unavailable
  label: text("label"),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  freelancerIdx: index("idx_availability_freelancer_id").on(t.freelancerId),
  endDateIdx: index("idx_availability_end_date").on(t.endDate),
}));

export const insertAvailabilityBlockSchema = createInsertSchema(availabilityBlocksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAvailabilityBlock = z.infer<typeof insertAvailabilityBlockSchema>;
export type AvailabilityBlock = typeof availabilityBlocksTable.$inferSelect;

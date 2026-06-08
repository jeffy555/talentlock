import { pgTable, text, serial, timestamp, integer, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";
import { usersTable } from "./users";

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id),
  employerId: integer("employer_id").notNull().references(() => usersTable.id),
  freelancerId: integer("freelancer_id").notNull().references(() => usersTable.id),
  rating: integer("rating").notNull(), // 1–5
  comment: text("comment"),
  reply: text("reply"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byFreelancer: index("reviews_freelancer_idx").on(t.freelancerId),
  byBooking: index("reviews_booking_idx").on(t.bookingId),
  uniqBooking: unique("reviews_booking_uq").on(t.bookingId),
}));

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;

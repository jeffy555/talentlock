import { pgTable, text, serial, timestamp, integer, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  reviewerId: integer("reviewer_id").notNull(),
  revieweeId: integer("reviewee_id").notNull(),
  reviewerRole: text("reviewer_role").notNull(), // employer | freelancer
  rating: integer("rating").notNull(), // 1-5
  title: text("title"),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byReviewee: index("reviews_reviewee_idx").on(t.revieweeId),
  byBooking: index("reviews_booking_idx").on(t.bookingId),
  onePerBookingPerReviewer: unique("reviews_booking_reviewer_uq").on(t.bookingId, t.reviewerId),
}));

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({
  id: true, createdAt: true,
});
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;

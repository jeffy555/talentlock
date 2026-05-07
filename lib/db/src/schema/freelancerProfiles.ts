import { pgTable, text, serial, timestamp, integer, boolean, numeric, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const freelancerProfilesTable = pgTable("freelancer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  clerkId: text("clerk_id").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  bio: text("bio"),
  fieldOfWork: text("field_of_work").notNull(),
  skills: text("skills").array().notNull().default([]),
  yearsExperience: integer("years_experience").notNull().default(0),
  resumeUrl: text("resume_url"),
  portfolioUrl: text("portfolio_url"),
  paymentPreference: text("payment_preference").notNull().default("hourly"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  dailyRate: numeric("daily_rate", { precision: 10, scale: 2 }),
  achievements: text("achievements"),
  isVerified: boolean("is_verified").notNull().default(false),
  documentUrls: text("document_urls").array().default([]),
  documentNames: text("document_names").array().default([]),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  verificationNote: text("verification_note"),
  isAvailable: boolean("is_available").notNull().default(true),
  currentBookingId: integer("current_booking_id"),
  bookingEndDate: timestamp("booking_end_date", { withTimezone: true }),
  subscriptionPlan: text("subscription_plan").notNull().default("basic"),
  availableFrom: timestamp("available_from", { withTimezone: true }),
  availabilityNote: text("availability_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFreelancerProfileSchema = createInsertSchema(freelancerProfilesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertFreelancerProfile = z.infer<typeof insertFreelancerProfileSchema>;
export type FreelancerProfile = typeof freelancerProfilesTable.$inferSelect;

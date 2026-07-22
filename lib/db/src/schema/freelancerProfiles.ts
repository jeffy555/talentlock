// Teaching Professional Profile — Phase 1 inspection:
// Q1: skills is text("skills").array() — teachingSubjects/teachingLevels use .array()
// Q2: no location/timezone column exists — location added as nullable text

import { pgTable, text, serial, timestamp, integer, boolean, numeric, real, jsonb, date } from "drizzle-orm/pg-core";
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
  verificationLevel: text("verification_level").notNull().default("unverified"),
  // unverified | partially_verified | fully_verified
  isAvailable: boolean("is_available").notNull().default(true),
  currentBookingId: integer("current_booking_id"),
  bookingEndDate: timestamp("booking_end_date", { withTimezone: true }),
  subscriptionPlan: text("subscription_plan").notNull().default("basic"),
  availableFrom: timestamp("available_from", { withTimezone: true }),
  nextAvailableDate: date("next_available_date"),
  availabilityNote: text("availability_note"),
  resumeAnalysis: jsonb("resume_analysis"),
  averageRating: numeric("average_rating", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").notNull().default(0),
  completenessScore: integer("completeness_score").notNull().default(0),
  professionCategory: text("profession_category").notNull().default("technology"),
  educationProfessionType: text("education_profession_type"),
  teachingSubjects: text("teaching_subjects").array(),
  teachingLevels: text("teaching_levels").array(),
  yearsTeachingExperience: integer("years_teaching_experience"),
  highestDegree: text("highest_degree"),
  degreeSubject: text("degree_subject"),
  degreeInstitution: text("degree_institution"),
  teachingLicenceState: text("teaching_licence_state"),
  teachingLicenceExpiry: timestamp("teaching_licence_expiry", { withTimezone: true }),
  teachingLicenceAlertStage: text("teaching_licence_alert_stage").notNull().default("none"),
  // none | 90d | 30d | 7d | expired
  dbsCheckStatus: text("dbs_check_status"),
  researchPublications: text("research_publications"),
  preferredTeachingMode: text("preferred_teaching_mode"),
  location: text("location"),
  countryCode: text("country_code").notNull().default("US"),
  currencyCode: text("currency_code").notNull().default("USD"),
  talentSearchNotificationsToday: integer("talent_search_notifications_today").notNull().default(0),
  talentSearchNotificationsResetAt: timestamp("talent_search_notifications_reset_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFreelancerProfileSchema = createInsertSchema(freelancerProfilesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertFreelancerProfile = z.infer<typeof insertFreelancerProfileSchema>;
export type FreelancerProfile = typeof freelancerProfilesTable.$inferSelect;

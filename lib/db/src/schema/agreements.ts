import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agreementsTable = pgTable("agreements", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  freelancerId: integer("freelancer_id").notNull(),
  employerId: integer("employer_id").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("draft"), // draft | redlined | partially_signed | fully_signed
  freelancerSignedAt: timestamp("freelancer_signed_at", { withTimezone: true }),
  employerSignedAt: timestamp("employer_signed_at", { withTimezone: true }),
  freelancerSignatureName: text("freelancer_signature_name"),
  employerSignatureName: text("employer_signature_name"),
  documentUrl: text("document_url"),
  freelancerSignatureImageUrl: text("freelancer_signature_image_url"),
  employerSignatureImageUrl: text("employer_signature_image_url"),
  freelancerDownloadedAt: timestamp("freelancer_downloaded_at", { withTimezone: true }),
  employerDownloadedAt: timestamp("employer_downloaded_at", { withTimezone: true }),
  healthScore: integer("health_score"),
  healthScoreDetail: jsonb("health_score_detail"),
  healthScoredAt: timestamp("health_scored_at", { withTimezone: true }),
  freelancerSummary: jsonb("freelancer_summary"),
  freelancerSummaryScoredAt: timestamp("freelancer_summary_scored_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgreementSchema = createInsertSchema(agreementsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertAgreement = z.infer<typeof insertAgreementSchema>;
export type Agreement = typeof agreementsTable.$inferSelect;

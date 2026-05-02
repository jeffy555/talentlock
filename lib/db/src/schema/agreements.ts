import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agreementsTable = pgTable("agreements", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull(),
  freelancerId: integer("freelancer_id").notNull(),
  employerId: integer("employer_id").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("draft"), // draft | pending_signatures | signed | active | completed
  freelancerSignedAt: timestamp("freelancer_signed_at", { withTimezone: true }),
  employerSignedAt: timestamp("employer_signed_at", { withTimezone: true }),
  documentUrl: text("document_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgreementSchema = createInsertSchema(agreementsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertAgreement = z.infer<typeof insertAgreementSchema>;
export type Agreement = typeof agreementsTable.$inferSelect;

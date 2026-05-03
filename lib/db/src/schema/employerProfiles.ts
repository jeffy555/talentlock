import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const employerProfilesTable = pgTable("employer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  clerkId: text("clerk_id").notNull().unique(),
  companyName: text("company_name").notNull(),
  industry: text("industry").notNull(),
  companySize: text("company_size"),
  description: text("description"),
  isVerified: boolean("is_verified").notNull().default(false),
  documentUrls: text("document_urls").array().default([]),
  documentNames: text("document_names").array().default([]),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  verificationNote: text("verification_note"),
  subscriptionPlan: text("subscription_plan").notNull().default("basic"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmployerProfileSchema = createInsertSchema(employerProfilesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertEmployerProfile = z.infer<typeof insertEmployerProfileSchema>;
export type EmployerProfile = typeof employerProfilesTable.$inferSelect;

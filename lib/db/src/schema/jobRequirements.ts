import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobRequirementsTable = pgTable("job_requirements", {
  id: serial("id").primaryKey(),
  employerId: integer("employer_id").notNull(),
  title: text("title").notNull(),
  fieldOfWork: text("field_of_work").notNull(),
  description: text("description").notNull(),
  requiredSkills: text("required_skills").array().notNull().default([]),
  minExperience: integer("min_experience").notNull().default(0),
  paymentType: text("payment_type").notNull().default("hourly"),
  budget: numeric("budget", { precision: 10, scale: 2 }),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("open"), // open | filled | closed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJobRequirementSchema = createInsertSchema(jobRequirementsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertJobRequirement = z.infer<typeof insertJobRequirementSchema>;
export type JobRequirement = typeof jobRequirementsTable.$inferSelect;

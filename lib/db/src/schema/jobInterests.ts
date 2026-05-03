import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const jobInterestsTable = pgTable("job_interests", {
  id: serial("id").primaryKey(),
  jobRequirementId: integer("job_requirement_id").notNull(),
  freelancerId: integer("freelancer_id").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqJobFreelancer: uniqueIndex("job_interests_job_freelancer_uniq").on(t.jobRequirementId, t.freelancerId),
}));

export type JobInterest = typeof jobInterestsTable.$inferSelect;

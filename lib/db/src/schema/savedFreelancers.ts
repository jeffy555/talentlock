import { pgTable, serial, timestamp, integer, unique, index } from "drizzle-orm/pg-core";

export const savedFreelancersTable = pgTable("saved_freelancers", {
  id: serial("id").primaryKey(),
  employerUserId: integer("employer_user_id").notNull(),
  freelancerId: integer("freelancer_id").notNull(), // freelancer_profiles.id
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniquePair: unique("saved_freelancers_uq").on(t.employerUserId, t.freelancerId),
  byEmployer: index("saved_freelancers_employer_idx").on(t.employerUserId),
}));

export type SavedFreelancer = typeof savedFreelancersTable.$inferSelect;

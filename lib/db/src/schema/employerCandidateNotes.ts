import { pgTable, serial, timestamp, integer, text, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { freelancerProfilesTable } from "./freelancerProfiles";
import { meetingsTable } from "./meetings";

/**
 * Employer-only candidate hiring file (F2).
 * Upserted on final meeting dispositions (proceed_to_booking | rejected).
 * Never returned to freelancers or public profiles.
 */
export const employerCandidateNotesTable = pgTable("employer_candidate_notes", {
  id: serial("id").primaryKey(),
  employerUserId: integer("employer_user_id").notNull().references(() => usersTable.id),
  freelancerId: integer("freelancer_id").notNull().references(() => freelancerProfilesTable.id),
  latestMeetingId: integer("latest_meeting_id").references(() => meetingsTable.id),
  disposition: text("disposition").notNull(), // proceed_to_booking | rejected
  feedbackText: text("feedback_text").notNull(),
  feedbackSummary: text("feedback_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniquePair: unique("employer_candidate_notes_uq").on(t.employerUserId, t.freelancerId),
  byEmployer: index("employer_candidate_notes_employer_idx").on(t.employerUserId),
  byFreelancer: index("employer_candidate_notes_freelancer_idx").on(t.freelancerId),
}));

export type EmployerCandidateNote = typeof employerCandidateNotesTable.$inferSelect;

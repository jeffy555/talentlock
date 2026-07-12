import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Cached AI pre-meeting brief for the employer. Generated fire-and-forget when a
 * meeting is confirmed; overwritten on regeneration. Employer-only.
 */
export interface MeetingBrief {
  candidateSnapshot: {
    name: string;
    field: string;
    experience: string;
    rate: number;
    rateType: string;
    completenessScore: number;
    averageRating: number;
    reviewCount: number;
    verifiedCredentials: string[];
  };
  whyTheyMatch: string[];
  suggestedQuestions: string[];
  rateContext: {
    proposedRate: number;
    jobBudgetMin: number | null;
    jobBudgetMax: number | null;
    marketMedian: number;
    platformPercentile: number;
    employerHistoricalAvg: number;
    assessment: string;
    withinBudget: boolean;
  };
  watchPoints: string[];
  generatedAt: string;
}

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  freelancerId: integer("freelancer_id").notNull(),
  employerId: integer("employer_id").notNull(),
  title: text("title").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  agenda: text("agenda"),
  status: text("status").notNull().default("pending"), // pending | confirmed | cancelled | completed
  meetingLink: text("meeting_link"),
  briefContent: jsonb("brief_content").$type<MeetingBrief>(),
  briefGeneratedAt: timestamp("brief_generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetingsTable.$inferSelect;

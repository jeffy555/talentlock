import { pgTable, serial, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { employerProfilesTable } from "./employerProfiles";
import { freelancerProfilesTable } from "./freelancerProfiles";
import { bookingsTable } from "./bookings";
import { meetingsTable } from "./meetings";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  userId: integer("user_id").notNull(),
  jobRequirementId: integer("job_requirement_id"),
  type: text("type").notNull().default("ai_match"),
  employerId: integer("employer_id").references(() => employerProfilesTable.id),
  freelancerId: integer("freelancer_id").references(() => freelancerProfilesTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  meetingId: integer("meeting_id").references(() => meetingsTable.id),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  employerInbox: index("conversations_employer_inbox")
    .on(t.employerId, t.lastMessageAt)
    .where(sql`${t.type} = 'human_direct'`),
  freelancerInbox: index("conversations_freelancer_inbox")
    .on(t.freelancerId, t.lastMessageAt)
    .where(sql`${t.type} = 'human_direct'`),
  bookingUnique: uniqueIndex("conversations_booking_unique")
    .on(t.employerId, t.freelancerId, t.bookingId)
    .where(sql`${t.type} = 'human_direct' AND ${t.bookingId} IS NOT NULL`),
  unscopedUnique: uniqueIndex("conversations_unscoped_unique")
    .on(t.employerId, t.freelancerId)
    .where(sql`${t.type} = 'human_direct' AND ${t.bookingId} IS NULL`),
}));

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

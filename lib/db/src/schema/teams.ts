import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { freelancerProfilesTable } from "./freelancerProfiles";

export const teamsTable = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teamsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("invited"),
  invitedEmail: text("invited_email").notNull(),
  inviteToken: text("invite_token"),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
}, (t) => ({
  uniqTeamUser: unique().on(t.teamId, t.userId),
}));

export const teamShortlistTable = pgTable("team_shortlist", {
  id: serial("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teamsTable.id),
  freelancerId: integer("freelancer_id").notNull().references(() => freelancerProfilesTable.id),
  addedByUserId: integer("added_by_user_id").notNull().references(() => usersTable.id),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqTeamFreelancer: unique().on(t.teamId, t.freelancerId),
}));

export type Team = typeof teamsTable.$inferSelect;
export type TeamMember = typeof teamMembersTable.$inferSelect;
export type TeamShortlistEntry = typeof teamShortlistTable.$inferSelect;

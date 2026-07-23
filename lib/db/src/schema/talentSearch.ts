import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  unique,
  index,
  decimal,
} from "drizzle-orm/pg-core";
import { employerProfilesTable } from "./employerProfiles";
import { freelancerProfilesTable } from "./freelancerProfiles";
import { conversations } from "./conversations";
import { messages } from "./messages";
import { getNextMidnightUTC, type BlackoutWindow, type MatchReasons } from "./cruiseMode";

export interface TalentSearchRules {
  professionCategory: "technology" | "education" | null;
  educationSubType:
    | "school_teacher"
    | "university_lecturer"
    | "tutor"
    | "researcher"
    | null;
  requiredSkills: string[];
  preferredSkills: string[];
  minRate: number | null;
  maxRate: number | null;
  rateType: "hourly" | "per_day" | "per_session" | "per_course";
  availableFrom: string | null;
  locationRequired: boolean;
  location: string | null;
  locationRadiusKm: number | null;
  excludedKeywords: string[];
  requireVerifiedCredentials: boolean;
  requireDbs: boolean;
  preferredFields: string[];
  matchThreshold: number; // 0-100, default 70
  messageTone: "professional" | "friendly" | "concise";
  blackoutWindows: { timezone: string; windows: BlackoutWindow[] } | null;
  dryRun: boolean;
  dailyDigest: boolean;
  version: number;
}

export const talentSearchConfigsTable = pgTable(
  "talent_search_configs",
  {
    id: text("id").primaryKey(),
    employerId: integer("employer_id")
      .notNull()
      .references(() => employerProfilesTable.id),
    isActive: boolean("is_active").notNull().default(false),
    // isActive is ONLY changed manually via /activate or /deactivate — never automatically
    isDryRun: boolean("is_dry_run").notNull().default(false),
    rules: jsonb("rules").notNull().$type<TalentSearchRules>(),
    rulesVersion: integer("rules_version").notNull().default(1),
    rawRulesText: text("raw_rules_text"),
    hoursUsedToday: decimal("hours_used_today", { precision: 4, scale: 2 }).notNull().default("0"),
    dailyLimitHours: decimal("daily_limit_hours", { precision: 4, scale: 2 }).notNull().default("6"),
    hoursResetAt: timestamp("hours_reset_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => getNextMidnightUTC()),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    uniqEmployer: unique().on(t.employerId),
  }),
);

export const talentSearchActivityTable = pgTable(
  "talent_search_activity",
  {
    id: text("id").primaryKey(),
    employerId: integer("employer_id")
      .notNull()
      .references(() => employerProfilesTable.id),
    freelancerId: integer("freelancer_id")
      .notNull()
      .references(() => freelancerProfilesTable.id),
    rulesVersion: integer("rules_version").notNull(),
    score: integer("score").notNull(),
    decision: text("decision").notNull(),
    // sent | skipped | dry_run_would_send | dry_run_skipped | blackout | duplicate |
    // daily_limit_reached | daily_freelancer_limit_reached | dm_failed
    matchReasons: jsonb("match_reasons").notNull().$type<MatchReasons>(),
    proposedMessage: text("proposed_message"),
    conversationId: integer("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: integer("message_id").references(() => messages.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    skippedReason: text("skipped_reason"),
    employerFollowUpSent: boolean("employer_follow_up_sent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    employerIdx: index("idx_talent_search_activity_employer_id").on(t.employerId),
    employerFreelancerIdx: index("idx_talent_search_activity_employer_freelancer").on(
      t.employerId,
      t.freelancerId,
    ),
    freelancerIdx: index("idx_talent_search_activity_freelancer_id").on(t.freelancerId),
  }),
);

export type TalentSearchConfig = typeof talentSearchConfigsTable.$inferSelect;
export type TalentSearchActivity = typeof talentSearchActivityTable.$inferSelect;

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
import { freelancerProfilesTable } from "./freelancerProfiles";
import { jobRequirementsTable } from "./jobRequirements";

export interface BlackoutWindow {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  days: number[]; // 0=Sun ... 6=Sat, empty=all days
}

export interface CruiseModeRules {
  requiredSkills: string[];
  preferredSkills: string[];
  minRate: number | null;
  maxRate: number | null;
  availableFrom: string | null;
  availableTo: string | null;
  maxDurationWeeks: number | null;
  minDurationWeeks: number | null;
  excludedKeywords: string[];
  preferredFields: string[];
  matchThreshold: number; // 0-100, default 70
  messageTone: "professional" | "friendly" | "concise";
  blackoutWindows: { timezone: string; windows: BlackoutWindow[] } | null;
  dailyDigest: boolean;
  version: number;
}

export interface MatchReasons {
  matched: string[];
  concerns: string[];
  blockers: string[];
}

export function getNextMidnightUTC(): Date {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

export const cruiseModeConfigsTable = pgTable(
  "cruise_mode_configs",
  {
    id: text("id").primaryKey(),
    freelancerId: integer("freelancer_id")
      .notNull()
      .references(() => freelancerProfilesTable.id),
    isActive: boolean("is_active").notNull().default(false),
    isDryRun: boolean("is_dry_run").notNull().default(false),
    rules: jsonb("rules").notNull().$type<CruiseModeRules>(),
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
    uniqFreelancer: unique().on(t.freelancerId),
  }),
);

export const cruiseModeActivityTable = pgTable(
  "cruise_mode_activity",
  {
    id: text("id").primaryKey(),
    freelancerId: integer("freelancer_id")
      .notNull()
      .references(() => freelancerProfilesTable.id),
    jobRequirementId: integer("job_requirement_id")
      .notNull()
      .references(() => jobRequirementsTable.id),
    rulesVersion: integer("rules_version").notNull(),
    score: integer("score").notNull(),
    decision: text("decision").notNull(),
    // sent | skipped | dry_run_would_send | dry_run_skipped | blackout | daily_limit_reached | cruise_mode_off
    matchReasons: jsonb("match_reasons").notNull().$type<MatchReasons>(),
    proposedMessage: text("proposed_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    skippedReason: text("skipped_reason"),
    freelancerFollowUpSent: boolean("freelancer_follow_up_sent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    freelancerIdx: index("idx_cruise_mode_activity_freelancer_id").on(t.freelancerId),
    freelancerJobIdx: index("idx_cruise_mode_activity_freelancer_job").on(
      t.freelancerId,
      t.jobRequirementId,
    ),
  }),
);

export type CruiseModeConfig = typeof cruiseModeConfigsTable.$inferSelect;
export type CruiseModeActivity = typeof cruiseModeActivityTable.$inferSelect;

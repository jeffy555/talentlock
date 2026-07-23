import type { TalentSearchRules } from "@workspace/api-client-react";

export { formatHours, scoreColour } from "@/lib/cruiseModeDisplayUtils";

export function emptyTalentSearchRules(): TalentSearchRules {
  return {
    professionCategory: null,
    educationSubType: null,
    requiredSkills: [],
    preferredSkills: [],
    minRate: null,
    maxRate: null,
    rateType: "hourly",
    availableFrom: null,
    locationRequired: false,
    location: null,
    locationRadiusKm: null,
    excludedKeywords: [],
    requireVerifiedCredentials: false,
    requireDbs: false,
    preferredFields: [],
    matchThreshold: 70,
    messageTone: "professional",
    blackoutWindows: null,
    dryRun: false,
    dailyDigest: false,
    version: 1,
  };
}

export function decisionBadgeClass(decision: string): string {
  switch (decision) {
    case "sent":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "dry_run_would_send":
      return "text-blue-700 bg-blue-50 border-blue-200";
    case "skipped":
    case "dry_run_skipped":
      return "text-slate-500 bg-slate-50 border-slate-200";
    case "blackout":
    case "daily_limit_reached":
    case "daily_freelancer_limit_reached":
    case "dm_failed":
      return "text-red-600 bg-red-50 border-red-200";
    default:
      return "text-slate-500 bg-slate-50 border-slate-200";
  }
}

export function decisionLabel(decision: string): string {
  switch (decision) {
    case "sent":
      return "✦ Sent";
    case "dry_run_would_send":
    case "dry_run_skipped":
      return "● Dry Run";
    case "skipped":
      return "○ Skipped";
    case "blackout":
      return "⊘ Blocked";
    case "daily_limit_reached":
      return "⏱ Daily limit";
    case "daily_freelancer_limit_reached":
      return "⏱ Recipient cap";
    case "dm_failed":
      return "✕ Delivery failed";
    default:
      return decision;
  }
}

export type TalentSearchStatus = "inactive" | "dry_run" | "active";

export function deriveTalentSearchStatus(
  config: { isActive: boolean; isDryRun: boolean } | null | undefined,
): TalentSearchStatus {
  if (!config?.isActive) return "inactive";
  if (config.isDryRun) return "dry_run";
  return "active";
}

import type { CruiseModeRules } from "@workspace/api-client-react";

export function emptyCruiseModeRules(): CruiseModeRules {
  return {
    requiredSkills: [],
    preferredSkills: [],
    minRate: null,
    maxRate: null,
    availableFrom: null,
    availableTo: null,
    maxDurationWeeks: null,
    minDurationWeeks: null,
    excludedKeywords: [],
    preferredFields: [],
    matchThreshold: 70,
    messageTone: "professional",
    blackoutWindows: null,
    dailyDigest: false,
    version: 1,
  };
}

export function scoreColour(score: number): string {
  if (score >= 75) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 50) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
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
      return "● Dry Run";
    case "dry_run_skipped":
      return "● Dry Run";
    case "skipped":
      return "○ Skipped";
    case "blackout":
      return "⊘ Blocked";
    case "daily_limit_reached":
      return "⏱ Daily limit";
    default:
      return decision;
  }
}

export type CruiseModeStatus = "inactive" | "dry_run" | "active";

export function deriveCruiseModeStatus(
  config: { isActive: boolean; isDryRun: boolean } | null | undefined,
): CruiseModeStatus {
  if (!config?.isActive) return "inactive";
  if (config.isDryRun) return "dry_run";
  return "active";
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

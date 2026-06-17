import type {
  CruiseModeRules,
  JobRequirement,
  MatchReasons,
} from "@workspace/db";

export interface NormalisedJob {
  title: string;
  description: string;
  skills: string[];
  minRate: number | null;
  maxRate: number | null;
  durationWeeks: number | null;
  fieldOfWork: string;
}

export interface EvaluationResult {
  score: number;
  decision: "send" | "skip";
  reasons: MatchReasons;
  proposedMessage: string | null;
}

export interface FreelancerEvaluationContext {
  name: string;
  fieldOfWork: string;
  skills: string[];
  bio: string | null;
  hourlyRate: number | null;
  dailyRate: number | null;
}

export function getNextMidnightUTC(): Date {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

function deriveDurationWeeks(startDate: Date, endDate: Date): number | null {
  const ms = endDate.getTime() - startDate.getTime();
  if (ms <= 0) return null;
  return Math.max(1, Math.round(ms / (7 * 24 * 60 * 60 * 1000)));
}

export function normaliseJob(job: JobRequirement): NormalisedJob {
  const budget = job.budget ? parseFloat(job.budget) : null;
  let minRate: number | null = null;
  let maxRate: number | null = null;
  if (job.paymentType === "hourly" && budget != null) {
    minRate = budget;
    maxRate = budget;
  }

  return {
    title: job.title,
    description: job.description,
    skills: job.requiredSkills ?? [],
    minRate,
    maxRate,
    durationWeeks: deriveDurationWeeks(job.startDate, job.endDate),
    fieldOfWork: job.fieldOfWork,
  };
}

export function preFilter(rules: CruiseModeRules, job: NormalisedJob): boolean {
  if (
    rules.excludedKeywords?.some((kw) =>
      (job.title + " " + job.description).toLowerCase().includes(kw.toLowerCase()),
    )
  ) {
    return false;
  }

  if (rules.minRate != null && job.maxRate != null && job.maxRate < rules.minRate) {
    return false;
  }
  if (rules.maxRate != null && job.minRate != null && job.minRate > rules.maxRate) {
    return false;
  }

  const jobText = (job.title + " " + job.description + " " + job.skills.join(" ")).toLowerCase();
  if (rules.requiredSkills?.length > 0) {
    const hasAnySkill = rules.requiredSkills.some((skill) =>
      jobText.includes(skill.toLowerCase()),
    );
    if (!hasAnySkill) return false;
  }

  if (rules.maxDurationWeeks != null && job.durationWeeks != null) {
    if (job.durationWeeks > rules.maxDurationWeeks) return false;
  }
  if (rules.minDurationWeeks != null && job.durationWeeks != null) {
    if (job.durationWeeks < rules.minDurationWeeks) return false;
  }

  return true;
}

export function isInBlackoutWindow(rules: CruiseModeRules): boolean {
  if (!rules.blackoutWindows?.windows?.length) return false;
  const { timezone, windows } = rules.blackoutWindows;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday ?? "");
  const currentMinutes = hour * 60 + minute;

  return windows.some((w) => {
    if (w.days.length > 0 && !w.days.includes(dayIndex)) return false;
    const [startH, startM] = w.start.split(":").map(Number);
    const [endH, endM] = w.end.split(":").map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    if (endMins > startMins) return currentMinutes >= startMins && currentMinutes < endMins;
    return currentMinutes >= startMins || currentMinutes < endMins;
  });
}

function freelancerRateLabel(freelancer: FreelancerEvaluationContext): string {
  if (freelancer.hourlyRate != null) return String(freelancer.hourlyRate);
  if (freelancer.dailyRate != null) return String(freelancer.dailyRate);
  return "0";
}

export function buildEvaluationPrompt(
  freelancer: FreelancerEvaluationContext,
  rules: CruiseModeRules,
  job: NormalisedJob,
): string {
  const rate = freelancerRateLabel(freelancer);
  const threshold = rules.matchThreshold ?? 70;
  const maxRateLabel = rules.maxRate ?? "∞";

  return `You are an AI assistant for a freelance marketplace, evaluating job fit on behalf of a freelancer.

FREELANCER PROFILE:
Name: ${freelancer.name}
Field: ${freelancer.fieldOfWork}
Skills: ${freelancer.skills.join(", ")}
Current rate: $${rate}/hr
Bio summary: ${freelancer.bio?.slice(0, 300) ?? ""}

FREELANCER CRUISE MODE RULES:
Required skills: ${rules.requiredSkills.join(", ") || "any"}
Preferred skills: ${rules.preferredSkills.join(", ") || "none specified"}
Rate range: $${rules.minRate ?? 0}–$${maxRateLabel}/hr
Max project duration: ${rules.maxDurationWeeks ? `${rules.maxDurationWeeks} weeks` : "any"}
Excluded keywords: ${rules.excludedKeywords.join(", ") || "none"}
Preferred fields: ${rules.preferredFields.join(", ") || "any"}

JOB POSTING:
Title: ${job.title}
Description: ${job.description}
Required skills: ${job.skills.join(", ")}
Rate: ${job.minRate ? `$${job.minRate}` : "not specified"}${job.maxRate ? `–$${job.maxRate}/hr` : ""}
Duration: ${job.durationWeeks ? `${job.durationWeeks} weeks` : "not specified"}
Field: ${job.fieldOfWork}

Evaluate this job for the freelancer. Return ONLY a JSON object — no preamble, no markdown:
{
  "score": <0-100>,
  "decision": "send" | "skip",
  "reasons": {
    "matched": ["<reason>", ...],
    "concerns": ["<concern>", ...],
    "blockers": ["<blocker>", ...]
  },
  "proposedMessage": "<personalised 100-150 word interest message in ${rules.messageTone} tone, written in first person as if the freelancer is writing it, referencing specific skills that match the job>"
}

Decision rules:
- score >= ${threshold}: decision = "send"
- score < ${threshold}: decision = "skip"
- If ANY blocker exists: decision = "skip" regardless of score
- proposedMessage must be non-null only when decision = "send"
- The proposedMessage must NOT mention that it was AI-generated
- Write proposedMessage in ${rules.messageTone} tone`;
}

export function validateEvaluationResponse(parsed: unknown): parsed is EvaluationResult {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (typeof p.score !== "number" || p.score < 0 || p.score > 100) return false;
  if (p.decision !== "send" && p.decision !== "skip") return false;
  if (!p.reasons || typeof p.reasons !== "object") return false;
  const reasons = p.reasons as Record<string, unknown>;
  if (!Array.isArray(reasons.matched)) return false;
  if (!Array.isArray(reasons.concerns)) return false;
  if (!Array.isArray(reasons.blockers)) return false;
  if (p.decision === "send") {
    if (typeof p.proposedMessage !== "string" || !p.proposedMessage.trim()) return false;
  }
  return true;
}

export const DEFAULT_DAILY_LIMIT_HOURS = 6;

export function parseHoursValue(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : parseFloat(value);
}

export const PARSE_RULES_SYSTEM_PROMPT = `You parse free-form Cruise Mode rules for a freelance marketplace into structured JSON.

Return ONLY a JSON object with this shape — no preamble, no markdown:
{
  "rules": {
    "requiredSkills": string[],
    "preferredSkills": string[],
    "minRate": number | null,
    "maxRate": number | null,
    "availableFrom": string | null,
    "availableTo": string | null,
    "maxDurationWeeks": number | null,
    "minDurationWeeks": number | null,
    "excludedKeywords": string[],
    "preferredFields": string[],
    "matchThreshold": number,
    "messageTone": "professional" | "friendly" | "concise",
    "blackoutWindows": { "timezone": string, "windows": [{ "start": "HH:MM", "end": "HH:MM", "days": number[] }] } | null,
    "dailyDigest": boolean,
    "version": 1
  },
  "warnings": string[]
}

Defaults when not specified: matchThreshold 70, messageTone "professional", dailyDigest false, empty arrays, null dates/rates/duration.
Add a warning for each ambiguous or missing preference the user did not specify.`;

export function defaultCruiseModeRules(): CruiseModeRules {
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

export function normaliseParsedRules(raw: Partial<CruiseModeRules>): CruiseModeRules {
  const defaults = defaultCruiseModeRules();
  return {
    ...defaults,
    ...raw,
    requiredSkills: raw.requiredSkills ?? defaults.requiredSkills,
    preferredSkills: raw.preferredSkills ?? defaults.preferredSkills,
    excludedKeywords: raw.excludedKeywords ?? defaults.excludedKeywords,
    preferredFields: raw.preferredFields ?? defaults.preferredFields,
    matchThreshold: raw.matchThreshold ?? defaults.matchThreshold,
    messageTone: raw.messageTone ?? defaults.messageTone,
    dailyDigest: raw.dailyDigest ?? defaults.dailyDigest,
    version: raw.version ?? defaults.version,
  };
}

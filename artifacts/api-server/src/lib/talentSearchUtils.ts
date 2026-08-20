import type {
  FreelancerProfile,
  MatchReasons,
  TalentSearchRules,
} from "@workspace/db";
import {
  hourlyToTalentSearchUnit,
  resolveProfileHourlyRate,
} from "./rateConversion";

export interface NormalisedFreelancer {
  id: number;
  professionCategory: string;
  educationProfessionType: string | null;
  skills: string[];
  teachingSubjects: string[] | null;
  teachingLevels: string[] | null;
  fieldOfWork: string;
  rate: number;
  bio: string | null;
  dbsCheckStatus: string | null;
  hasAnyVerifiedDocument: boolean;
  location: string | null;
  countryCode: string | null;
  stateCode: string | null;
  completenessScore: number;
}

export interface TalentSearchEvaluation {
  score: number;
  decision: "send" | "skip";
  reasons: MatchReasons;
  proposedMessage: string | null;
}

export interface EmployerContext {
  companyName: string;
  sector?: string | null;
  recentJobTitles?: string[];
}

function rateFromProfile(profile: FreelancerProfile): number {
  return resolveProfileHourlyRate(profile) ?? 0;
}

export function normaliseFreelancer(
  profile: FreelancerProfile,
  hasAnyVerifiedDocument: boolean,
  stateCode: string | null = null,
): NormalisedFreelancer {
  const locationParts = [profile.location, profile.countryCode].filter(Boolean);
  return {
    id: profile.id,
    professionCategory: profile.professionCategory,
    educationProfessionType: profile.educationProfessionType,
    skills: profile.skills ?? [],
    teachingSubjects: profile.teachingSubjects ?? null,
    teachingLevels: profile.teachingLevels ?? null,
    fieldOfWork: profile.fieldOfWork,
    // Canonical hourly; converted to rule rateType at pre-filter / prompt time.
    rate: rateFromProfile(profile),
    bio: profile.bio,
    dbsCheckStatus: profile.dbsCheckStatus,
    hasAnyVerifiedDocument,
    location: locationParts.length > 0 ? locationParts.join(" · ") : null,
    countryCode: profile.countryCode ?? null,
    stateCode,
    completenessScore: profile.completenessScore,
  };
}

export function talentSearchPreFilterReason(
  rules: TalentSearchRules,
  freelancer: NormalisedFreelancer,
): string | null {
  if (rules.professionCategory && freelancer.professionCategory !== rules.professionCategory) {
    return `Profession category does not match (requires ${rules.professionCategory})`;
  }

  if (rules.educationSubType && freelancer.educationProfessionType !== rules.educationSubType) {
    return `Education sub-type does not match (requires ${rules.educationSubType})`;
  }

  const freelancerRate = hourlyToTalentSearchUnit(freelancer.rate, rules.rateType);
  if (rules.maxRate !== null && freelancerRate > rules.maxRate) {
    return `Rate above maximum (${rules.maxRate})`;
  }
  if (rules.minRate !== null && freelancerRate < rules.minRate) {
    return `Rate below minimum (${rules.minRate})`;
  }

  const profileText = [
    ...(freelancer.skills ?? []),
    ...(freelancer.teachingSubjects ?? []),
    ...(freelancer.teachingLevels ?? []),
    freelancer.bio ?? "",
    freelancer.fieldOfWork ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (rules.requiredSkills?.length > 0) {
    const hasAny = rules.requiredSkills.some((s) => profileText.includes(s.toLowerCase()));
    if (!hasAny) {
      return `Missing required skills: ${rules.requiredSkills.join(", ")}`;
    }
  }

  const excludedHit = rules.excludedKeywords?.find((kw) =>
    profileText.includes(kw.toLowerCase()),
  );
  if (excludedHit) {
    return `Profile contains excluded keyword: ${excludedHit}`;
  }

  if (rules.requireDbs && freelancer.dbsCheckStatus !== "verified") {
    return "DBS check required but not verified";
  }

  if (rules.requireVerifiedCredentials && !freelancer.hasAnyVerifiedDocument) {
    return "Verified credentials required";
  }

  if (rules.locationRequired) {
    const requiredCountry = rules.countryCode?.trim().toUpperCase() || null;
    if (requiredCountry) {
      const freelancerCountry = freelancer.countryCode?.trim().toUpperCase() || null;
      if (!freelancerCountry || freelancerCountry !== requiredCountry) {
        return `Location country does not match (requires ${requiredCountry})`;
      }
    }
    const requiredState = rules.stateCode?.trim().toUpperCase() || null;
    if (requiredState) {
      const freelancerState = freelancer.stateCode?.trim().toUpperCase() || null;
      if (!freelancerState || freelancerState !== requiredState) {
        return `Location state does not match (requires ${requiredState})`;
      }
    }
    // Fallback for legacy rules that only stored a free-text location label.
    if (!requiredCountry && rules.location?.trim()) {
      const needle = rules.location.trim().toLowerCase();
      const haystack = `${freelancer.location ?? ""} ${freelancer.countryCode ?? ""} ${freelancer.stateCode ?? ""}`.toLowerCase();
      if (!haystack.includes(needle) && !needle.split(/[,\s]+/).some((part) => part.length > 2 && haystack.includes(part))) {
        return `Location does not match (requires ${rules.location})`;
      }
    }
  }

  return null;
}

export function talentSearchPreFilter(
  rules: TalentSearchRules,
  freelancer: NormalisedFreelancer,
): boolean {
  return talentSearchPreFilterReason(rules, freelancer) === null;
}

export function buildTalentSearchEvaluationPrompt(
  employer: EmployerContext,
  rules: TalentSearchRules,
  freelancer: NormalisedFreelancer,
): string {
  const threshold = rules.matchThreshold ?? 70;
  const maxRateLabel = rules.maxRate ?? "∞";
  const freelancerRate = hourlyToTalentSearchUnit(freelancer.rate, rules.rateType);
  const sector = employer.sector ?? "not specified";
  const recentHiring =
    employer.recentJobTitles && employer.recentJobTitles.length > 0
      ? employer.recentJobTitles.join(", ")
      : "general hiring";
  const locationLine = rules.locationRequired
    ? [
        rules.location ?? null,
        rules.countryCode ? `country=${rules.countryCode}` : null,
        rules.stateCode ? `state=${rules.stateCode}` : null,
        rules.locationRadiusKm ? `within ${rules.locationRadiusKm}km` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "specified location"
    : "remote OK / any location";

  return `You are an AI assistant for a talent marketplace, evaluating a freelancer/professional's fit on behalf of an employer and, when they match, composing an outreach message on the employer's behalf.

EMPLOYER:
Company: ${employer.companyName}
Sector: ${sector}
Recent hiring focus: ${recentHiring}

EMPLOYER TALENT SEARCH RULES:
Profession: ${rules.professionCategory ?? "any"}${rules.educationSubType ? ` — ${rules.educationSubType}` : ""}
Required skills: ${rules.requiredSkills.join(", ") || "any"}
Preferred skills: ${rules.preferredSkills.join(", ") || "none specified"}
Rate range: ${rules.minRate ?? 0}–${maxRateLabel} ${rules.rateType}
Location: ${locationLine}
DBS required: ${rules.requireDbs ? "Yes" : "No"}
Verified credentials required: ${rules.requireVerifiedCredentials ? "Yes" : "No"}
Excluded keywords: ${rules.excludedKeywords.join(", ") || "none"}
Preferred fields: ${rules.preferredFields.join(", ") || "any"}

FREELANCER PROFILE:
Field: ${freelancer.fieldOfWork}
Profession: ${freelancer.professionCategory}
Profession type: ${freelancer.educationProfessionType ?? "not specified"}
Skills: ${freelancer.skills.join(", ")}
Teaching subjects: ${freelancer.teachingSubjects?.join(", ") ?? "N/A"}
Teaching levels: ${freelancer.teachingLevels?.join(", ") ?? "N/A"}
Rate: ${freelancerRate} ${rules.rateType}
Location: ${freelancer.location ?? "not specified"} (country=${freelancer.countryCode ?? "n/a"}, state=${freelancer.stateCode ?? "n/a"})
DBS status: ${freelancer.dbsCheckStatus ?? "not provided"}
Has verified credential: ${freelancer.hasAnyVerifiedDocument ? "Yes" : "No"}
Bio summary: ${freelancer.bio?.slice(0, 300) ?? ""}

Evaluate this freelancer for the employer. Return ONLY a JSON object — no preamble, no markdown:
{
  "score": <0-100>,
  "decision": "send" | "skip",
  "reasons": {
    "matched": ["<reason>", ...],
    "concerns": ["<concern>", ...],
    "blockers": ["<blocker>", ...]
  },
  "proposedMessage": "<outreach message — see rules below>"
}

proposedMessage rules:
- 80–120 words
- Written in first person as if the employer is writing it ("I'm reaching out from...")
- ${rules.messageTone} tone
- Reference 1–2 specific match reasons naturally (do not list them mechanically)
- End with a clear, low-pressure call to action ("Would you be open to a quick call?")
- Do NOT mention that this was AI-generated
- Do NOT use a subject line — body only

Decision rules:
- score >= ${threshold}: decision = "send"
- score < ${threshold}: decision = "skip"
- If ANY blocker exists: decision = "skip" regardless of score
- proposedMessage must be non-null only when decision = "send"`;
}

export function validateTalentSearchResponse(parsed: unknown): parsed is TalentSearchEvaluation {
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

export function defaultTalentSearchRules(): TalentSearchRules {
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
    countryCode: null,
    stateCode: null,
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

export function normaliseParsedTalentSearchRules(
  raw: Partial<TalentSearchRules>,
): TalentSearchRules {
  const defaults = defaultTalentSearchRules();
  return {
    ...defaults,
    ...raw,
    professionCategory: raw.professionCategory ?? defaults.professionCategory,
    educationSubType: raw.educationSubType ?? defaults.educationSubType,
    requiredSkills: raw.requiredSkills ?? defaults.requiredSkills,
    preferredSkills: raw.preferredSkills ?? defaults.preferredSkills,
    rateType: raw.rateType ?? defaults.rateType,
    locationRequired: raw.locationRequired ?? defaults.locationRequired,
    location: raw.location ?? defaults.location,
    countryCode: raw.countryCode ?? defaults.countryCode,
    stateCode: raw.stateCode ?? defaults.stateCode,
    locationRadiusKm: raw.locationRadiusKm ?? defaults.locationRadiusKm,
    excludedKeywords: raw.excludedKeywords ?? defaults.excludedKeywords,
    requireVerifiedCredentials:
      raw.requireVerifiedCredentials ?? defaults.requireVerifiedCredentials,
    requireDbs: raw.requireDbs ?? defaults.requireDbs,
    preferredFields: raw.preferredFields ?? defaults.preferredFields,
    matchThreshold: raw.matchThreshold ?? defaults.matchThreshold,
    messageTone: raw.messageTone ?? defaults.messageTone,
    dryRun: raw.dryRun ?? defaults.dryRun,
    dailyDigest: raw.dailyDigest ?? defaults.dailyDigest,
    version: raw.version ?? defaults.version,
  };
}

export const PARSE_TALENT_SEARCH_RULES_SYSTEM_PROMPT = `You parse free-form employer TalentSearch rules for a talent marketplace into structured JSON.

Return ONLY a JSON object with this shape — no preamble, no markdown:
{
  "rules": {
    "professionCategory": "technology" | "education" | null,
    "educationSubType": "school_teacher" | "university_lecturer" | "tutor" | "researcher" | null,
    "requiredSkills": string[],
    "preferredSkills": string[],
    "minRate": number | null,
    "maxRate": number | null,
    "rateType": "hourly" | "per_day" | "per_session" | "per_course",
    "availableFrom": string | null,
    "locationRequired": boolean,
    "location": string | null,
    "countryCode": string | null,
    "stateCode": string | null,
    "locationRadiusKm": number | null,
    "excludedKeywords": string[],
    "requireVerifiedCredentials": boolean,
    "requireDbs": boolean,
    "preferredFields": string[],
    "matchThreshold": number,
    "messageTone": "professional" | "friendly" | "concise",
    "blackoutWindows": { "timezone": string, "windows": [{ "start": "HH:MM", "end": "HH:MM", "days": number[] }] } | null,
    "dryRun": boolean,
    "dailyDigest": boolean,
    "version": 1
  },
  "warnings": string[]
}

Defaults when not specified: professionCategory null, rateType "hourly", matchThreshold 70, messageTone "professional", locationRequired false, requireDbs false, requireVerifiedCredentials false, dryRun false, dailyDigest false, empty arrays, null rates/dates/location/countryCode/stateCode.
When a city/region/country is mentioned, set locationRequired true, fill location with a human label, and set countryCode (ISO-2) / stateCode when identifiable.
Add a warning for each ambiguous or missing preference the user did not specify.`;

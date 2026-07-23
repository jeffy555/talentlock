import type {
  FreelancerProfile,
  MatchReasons,
  TalentSearchRules,
} from "@workspace/db";

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
  if (profile.hourlyRate != null) return parseFloat(profile.hourlyRate);
  if (profile.dailyRate != null) return parseFloat(profile.dailyRate);
  return 0;
}

export function normaliseFreelancer(
  profile: FreelancerProfile,
  hasAnyVerifiedDocument: boolean,
): NormalisedFreelancer {
  return {
    id: profile.id,
    professionCategory: profile.professionCategory,
    educationProfessionType: profile.educationProfessionType,
    skills: profile.skills ?? [],
    teachingSubjects: profile.teachingSubjects ?? null,
    teachingLevels: profile.teachingLevels ?? null,
    fieldOfWork: profile.fieldOfWork,
    rate: rateFromProfile(profile),
    bio: profile.bio,
    dbsCheckStatus: profile.dbsCheckStatus,
    hasAnyVerifiedDocument,
    location: profile.location,
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

  if (rules.maxRate !== null && freelancer.rate > rules.maxRate) {
    return `Rate above maximum (${rules.maxRate})`;
  }
  if (rules.minRate !== null && freelancer.rate < rules.minRate) {
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
  const sector = employer.sector ?? "not specified";
  const recentHiring =
    employer.recentJobTitles && employer.recentJobTitles.length > 0
      ? employer.recentJobTitles.join(", ")
      : "general hiring";
  const locationLine = rules.locationRequired
    ? `${rules.location ?? "specified location"}${rules.locationRadiusKm ? ` (within ${rules.locationRadiusKm}km)` : ""}`
    : "remote OK";

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
Rate: ${freelancer.rate} ${rules.rateType}
Location: ${freelancer.location ?? "not specified"}
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

Defaults when not specified: professionCategory null, rateType "hourly", matchThreshold 70, messageTone "professional", locationRequired false, requireDbs false, requireVerifiedCredentials false, dryRun false, dailyDigest false, empty arrays, null rates/dates/location.
Add a warning for each ambiguous or missing preference the user did not specify.`;

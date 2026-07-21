/**
 * Product Gaps — profile completeness scoring.
 * Inspection: photo from users.avatarUrl; rate from hourlyRate/dailyRate; skills is text[].
 */
export function hasMinSkills(skills: unknown, min: number): boolean {
  if (Array.isArray(skills)) return skills.length >= min;
  if (typeof skills === "string") return skills.split(",").filter(Boolean).length >= min;
  return false;
}

type RateValue = string | number | null | undefined;

export function calculateCompletenessScore(
  profile: {
    bio?: string | null;
    skills?: string[] | null;
    hourlyRate?: RateValue;
    dailyRate?: RateValue;
    paymentPreference?: string;
    fieldOfWork?: string | null;
    isAvailable?: boolean | null;
  },
  avatarUrl?: string | null,
): number {
  let score = 0;
  if (avatarUrl) score += 15;
  if (profile.bio && profile.bio.length >= 50) score += 20;
  if (profile.skills && hasMinSkills(profile.skills, 2)) score += 20;
  const rate = profile.paymentPreference === "daily" ? profile.dailyRate : profile.hourlyRate;
  if (rate != null && Number(rate) > 0) score += 15;
  if (profile.fieldOfWork) score += 15;
  if (profile.isAvailable !== null && profile.isAvailable !== undefined) score += 15;
  return score;
}

export const COMPLETENESS_WEIGHTS = {
  photo: 15,
  bio: 20,
  skills: 20,
  rate: 15,
  field: 15,
  availability: 15,
} as const;

export const COMPLETENESS_THRESHOLD_DASHBOARD = 80;

export function getCompletenessBreakdown(
  profile: Parameters<typeof calculateCompletenessScore>[0],
  avatarUrl?: string | null,
) {
  const missing = new Set(getMissingCompletenessFields(profile, avatarUrl));
  return (Object.keys(COMPLETENESS_WEIGHTS) as CompletenessField[])
    .filter((field) => missing.has(field))
    .map((field) => ({ field, points: COMPLETENESS_WEIGHTS[field] }));
}

export type CompletenessField =
  | "photo"
  | "bio"
  | "skills"
  | "rate"
  | "field"
  | "availability";

export function getMissingCompletenessFields(
  profile: Parameters<typeof calculateCompletenessScore>[0],
  avatarUrl?: string | null,
): CompletenessField[] {
  const missing: CompletenessField[] = [];
  if (!avatarUrl) missing.push("photo");
  if (!profile.bio || profile.bio.length < 50) missing.push("bio");
  if (!profile.skills || !hasMinSkills(profile.skills, 2)) missing.push("skills");
  const rate = profile.paymentPreference === "daily" ? profile.dailyRate : profile.hourlyRate;
  if (!rate || Number(rate) <= 0) missing.push("rate");
  if (!profile.fieldOfWork) missing.push("field");
  if (profile.isAvailable === null || profile.isAvailable === undefined) missing.push("availability");
  return missing;
}

export type CompletenessField =
  | "photo"
  | "bio"
  | "skills"
  | "rate"
  | "field"
  | "availability";

function hasMinSkills(skills: unknown, min: number): boolean {
  if (Array.isArray(skills)) return skills.length >= min;
  if (typeof skills === "string") return skills.split(",").filter(Boolean).length >= min;
  return false;
}

export function getMissingCompletenessFields(
  profile: {
    bio?: string | null;
    skills?: string[] | null;
    hourlyRate?: number | null;
    dailyRate?: number | null;
    paymentPreference?: string;
    fieldOfWork?: string | null;
    isAvailable?: boolean | null;
  },
  hasAvatar: boolean,
): CompletenessField[] {
  const missing: CompletenessField[] = [];
  if (!hasAvatar) missing.push("photo");
  if (!profile.bio || profile.bio.length < 50) missing.push("bio");
  if (!profile.skills || !hasMinSkills(profile.skills, 2)) missing.push("skills");
  const rate = profile.paymentPreference === "daily" ? profile.dailyRate : profile.hourlyRate;
  if (rate == null || rate <= 0) missing.push("rate");
  if (!profile.fieldOfWork) missing.push("field");
  if (profile.isAvailable === null || profile.isAvailable === undefined) missing.push("availability");
  return missing;
}

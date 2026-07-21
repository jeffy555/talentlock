export type CompletenessField =
  | "photo"
  | "bio"
  | "skills"
  | "rate"
  | "field"
  | "availability";

export const COMPLETENESS_WEIGHTS: Record<CompletenessField, number> = {
  photo: 15,
  bio: 20,
  skills: 20,
  rate: 15,
  field: 15,
  availability: 15,
};

export const COMPLETENESS_THRESHOLD_DASHBOARD = 80;

export const COMPLETENESS_LABELS: Record<
  CompletenessField,
  { label: string; href: string }
> = {
  photo: { label: "Add a profile photo", href: "/profile#account" },
  bio: { label: "Add a bio (min 50 characters)", href: "/profile#bio" },
  skills: { label: "Add at least 2 skills", href: "/profile#skills" },
  rate: { label: "Set your rate", href: "/profile#rate" },
  field: { label: "Set your field of work", href: "/profile#field" },
  availability: { label: "Set your availability", href: "/profile#availability" },
};

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

export function getCompletenessBreakdown(
  profile: Parameters<typeof getMissingCompletenessFields>[0],
  avatarUrl?: string | null,
) {
  const missing = new Set(getMissingCompletenessFields(profile, Boolean(avatarUrl)));
  return (Object.keys(COMPLETENESS_WEIGHTS) as CompletenessField[])
    .filter((field) => missing.has(field))
    .map((field) => ({
      field,
      points: COMPLETENESS_WEIGHTS[field],
      ...COMPLETENESS_LABELS[field],
    }));
}

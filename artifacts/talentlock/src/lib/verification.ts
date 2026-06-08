import type { VerificationLevel } from "@workspace/api-client-react";

export function resolveVerificationLevel(profile: {
  verificationLevel?: string | null;
  isVerified?: boolean;
}): VerificationLevel {
  if (
    profile.verificationLevel === "fully_verified" ||
    profile.verificationLevel === "partially_verified"
  ) {
    return profile.verificationLevel;
  }
  if (profile.verificationLevel === "unverified") {
    return "unverified";
  }
  return profile.isVerified ? "partially_verified" : "unverified";
}

export function isVerifiedLevel(level: VerificationLevel): boolean {
  return level !== "unverified";
}

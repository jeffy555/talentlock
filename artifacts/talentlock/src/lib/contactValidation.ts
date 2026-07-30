/** Shared contact validation for onboarding and profile forms. */

export function isValidContactEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  const value = email.trim();
  return value.length >= 5
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** E.164-style: +{countryDial}{nationalDigits}, 8–15 digits total after +. */
export function normalizeContactPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (!trimmed) return "";
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus || trimmed.startsWith("00") ? `+${digits.replace(/^00/, "")}` : `+${digits}`;
}

export function isValidContactPhone(phone: string | null | undefined): phone is string {
  const value = normalizeContactPhone(phone);
  if (!value.startsWith("+")) return false;
  if (value.length > 17) return false;
  const digits = value.slice(1);
  return /^[1-9]\d{7,14}$/.test(digits);
}

export function composeContactPhone(dialCode: string, national: string): string {
  const dial = dialCode.replace(/\D/g, "");
  const nat = national.replace(/\D/g, "");
  if (!dial || !nat) return "";
  return normalizeContactPhone(`+${dial}${nat}`);
}

export function splitContactPhone(
  phone: string | null | undefined,
  dialByCountry: Record<string, string>,
): { countryCode: string | null; dialCode: string; national: string } {
  const normalized = normalizeContactPhone(phone ?? "");
  if (!normalized.startsWith("+")) {
    return { countryCode: null, dialCode: "", national: "" };
  }
  const digits = normalized.slice(1);
  const entries = Object.entries(dialByCountry).sort((a, b) => b[1].length - a[1].length);
  for (const [code, dial] of entries) {
    if (digits.startsWith(dial)) {
      return { countryCode: code, dialCode: dial, national: digits.slice(dial.length) };
    }
  }
  return { countryCode: null, dialCode: "", national: digits };
}

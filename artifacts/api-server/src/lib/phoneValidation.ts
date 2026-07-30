/**
 * Contact phone validation for registration and profile updates.
 * Stored format is E.164-style: +{countryDial}{nationalDigits}
 */
export function normalizePhone(phone: unknown): string {
  if (typeof phone !== "string") return "";
  const trimmed = phone.trim();
  if (!trimmed) return "";
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus || trimmed.startsWith("00") ? `+${digits.replace(/^00/, "")}` : `+${digits}`;
}

export function isValidPhone(phone: unknown): phone is string {
  const value = normalizePhone(phone);
  if (!value.startsWith("+")) return false;
  if (value.length > 17) return false; // + plus up to 15 digits
  const digits = value.slice(1);
  return /^[1-9]\d{7,14}$/.test(digits);
}

/** Split stored E.164 into dial code + national using known dial codes (longest match). */
export function splitPhone(
  phone: string | null | undefined,
  dialByCountry: Record<string, string>,
): { countryCode: string | null; dialCode: string; national: string } {
  const normalized = normalizePhone(phone ?? "");
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

export function composePhone(dialCode: string, national: string): string {
  const dial = dialCode.replace(/\D/g, "");
  const nat = national.replace(/\D/g, "");
  if (!dial || !nat) return "";
  return normalizePhone(`+${dial}${nat}`);
}

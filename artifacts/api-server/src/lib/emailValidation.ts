/**
 * Deliberately small validation for account registration. Clerk remains the
 * authority for email ownership; this rejects absent or malformed values
 * before a local user row can be created.
 */
export function isValidEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;

  const value = email.trim();
  return value.length >= 5
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

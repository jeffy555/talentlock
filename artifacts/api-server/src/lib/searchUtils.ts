/**
 * Product Gaps — full-text search query sanitiser.
 * Inspection: freelancer_profiles.skills is text[] — use array_to_string in route SQL.
 */
export function sanitiseSearchQuery(q: string): string | null {
  const cleaned = q.trim()
    .replace(/[^a-zA-Z0-9\s\-_]/g, "")
    .split(/\s+/)
    .filter((s) => s.length > 1)
    .slice(0, 10)
    .join(" & ");
  return cleaned || null;
}

/**
 * Engagement list keyword search — ILIKE pattern (escaped).
 * Returns null when the query is too short to apply.
 */
export function sanitiseIlikeQuery(q: string): string | null {
  const trimmed = q.trim().replace(/[^\w\s\-@.']/g, " ").replace(/\s+/g, " ").trim();
  if (trimmed.length < 2) return null;
  const escaped = trimmed
    .slice(0, 100)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `%${escaped}%`;
}

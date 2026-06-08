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

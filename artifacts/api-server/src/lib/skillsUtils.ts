export function normaliseSkills(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through to comma-separated
    }
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

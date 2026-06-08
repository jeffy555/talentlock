// Security Hardening — Codebase inspection (Task 1.1):
// Pino: lib/logger.ts (pino-http in app.ts)
// Body parser: app.ts — express.json/urlencoded (now 1mb limit)
// sanitize-html: installed Phase 1 (was missing)
// audit_logs: event, ipAddress, userAgent, metadata (text); entityType/entityId pending Phase 2

import sanitizeHtml from "sanitize-html";

/**
 * Strip all HTML tags. Use for plain-text fields: bio, comment, label, name, etc.
 */
export function sanitiseText(input: string | null | undefined): string {
  if (!input) return "";
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

/**
 * Allow basic formatting only. Use for rich-text fields where b/i/links are valid.
 */
export function sanitiseRichText(input: string | null | undefined): string {
  if (!input) return "";
  return sanitizeHtml(input, {
    allowedTags: ["b", "i", "em", "strong", "a", "br"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["https"],
  }).trim();
}

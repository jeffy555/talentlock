# TalentLock — Features Specification: Security Hardening

## Overview

TalentLock has been built feature-first. The core product is working — agreements, bookings, reviews, AI features, analytics, notifications, and the availability calendar are all live. Before scaling to more users or connecting real payments (Stripe), a set of security gaps must be closed. These are not speculative risks — they are well-known vulnerability classes that affect every Express + PostgreSQL + React application at this stage.

This feature covers six hardening items:

1. **Request size limits** — prevent memory exhaustion from oversized request bodies
2. **Input sanitisation** — prevent stored XSS across all free-text fields
3. **CSRF protection on admin** — prevent cross-site request forgery on the admin console
4. **Sensitive data redaction in logs** — prevent Clerk tokens and PII from appearing in Pino output
5. **Audit log extension** — capture agreement signing, plan upgrades, and admin actions
6. **GDPR account deletion** — right to erasure endpoint for users

No new database tables are required for items 1–4. Items 5 and 6 add columns to `audit_logs` and a new `account_deletion_requests` table respectively.

No codegen. No OpenAPI changes. No frontend route changes (except for item 6 which adds a settings page deletion flow).

This is a **pure backend hardening + one frontend form** feature.

---

## Module 1 — Request Size Limits

**Problem:** Express 5 accepts unlimited request body sizes by default. A malicious actor can send a 500MB JSON payload to any unauthenticated endpoint (`GET /api/freelancers`, `POST /api/reviews`, etc.) and exhaust the server's memory, causing a denial of service.

**Fix:** Add a global body size limit to the Express JSON and URL-encoded parsers in `artifacts/api-server/src/index.ts`:

```ts
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```

Additionally, add a stricter limit on the AI endpoints (which receive the longest text payloads):

```ts
// On AI routes only
app.use('/api/ai', express.json({ limit: '500kb' }));
app.use('/api/openai', express.json({ limit: '500kb' }));
```

Response when limit exceeded: Express automatically returns `HTTP 413 Payload Too Large`. No custom handler needed.

---

## Module 2 — Input Sanitisation (XSS Prevention)

**Problem:** Free-text fields across the platform are stored and rendered without sanitisation. A freelancer could inject a `<script>` tag into their bio, portfolio description, review comment, or availability label. This stored XSS payload would execute for every employer who views that freelancer's profile, potentially stealing session tokens or performing actions on their behalf.

Fields at risk (non-exhaustive):
- `freelancer_profiles.bio`, `freelancer_profiles.skills`
- `job_requirements.description`
- `reviews.comment`, `reviews.reply`
- `availability_blocks.label`
- `bookings.notes` (if present)
- `meetings.notes`

**Fix — Backend (primary defence):** Add `sanitize-html` as a dependency. Create a shared sanitisation utility `artifacts/api-server/src/lib/sanitise.ts`:

```ts
import sanitizeHtml from 'sanitize-html';

// Strip all HTML tags — plain text only
export function sanitiseText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

// For fields that allow basic formatting (bold, italic, links)
export function sanitiseRichText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'br'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['https'],
  }).trim();
}
```

Apply `sanitiseText()` to every free-text field before inserting or updating in the database. This goes in each route handler at the point where the value is consumed — not in a global middleware (to avoid stripping binary uploads).

**Fix — Frontend (secondary defence):** Ensure all user-supplied content is rendered via React's default text rendering (which escapes HTML) — never via `dangerouslySetInnerHTML`. Audit every component that renders user-supplied strings.

---

## Module 3 — CSRF Protection on Admin Console

**Problem:** The admin console (`/admin`) uses an HMAC-signed cookie (`tl_admin`, 8h TTL) for authentication — not a Clerk JWT. Cookie-based sessions are inherently CSRF-vulnerable. A malicious page could make cross-site requests to `/api/admin/*` endpoints on behalf of a logged-in admin, executing admin actions without consent.

**Fix:** Add `csrf-csrf` package. Apply CSRF middleware exclusively to admin routes.

```ts
// In artifacts/api-server/src/index.ts
import { doubleCsrf } from 'csrf-csrf';

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET!,
  cookieName: 'tl_csrf',
  cookieOptions: { secure: true, sameSite: 'strict', httpOnly: true },
  size: 64,
});

// Expose CSRF token endpoint (admin login page fetches this before submitting)
app.get('/api/admin/csrf-token', (req, res) => {
  res.json({ token: generateToken(req, res) });
});

// Apply protection to all admin state-changing routes
app.use('/api/admin', doubleCsrfProtection);
```

The admin login page (`/admin/login`) fetches the CSRF token on mount and includes it as a header (`x-csrf-token`) on every subsequent admin POST/PATCH/DELETE request.

`CSRF_SECRET` must be added to the server's environment variables — a random 64-character string.

---

## Module 4 — Sensitive Data Redaction in Pino Logs

**Problem:** Pino is the server logger. If any route handler logs `req.body`, `req.headers`, or a user object, it could write Clerk tokens, session cookies, signature image URLs, or personal data to log files. Log files are often less protected than the database itself.

**Fix:** Add a `redact` configuration to the Pino logger instantiation in `artifacts/api-server/src/index.ts` (or wherever the Pino logger is created):

```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
      'req.body.signatureImageUrl',
      'req.body.fileUrl',
      '*.clerkId',
      '*.email',
      '*.signatureImageUrl',
    ],
    censor: '[REDACTED]',
  },
});
```

Values matching these paths are replaced with `[REDACTED]` before the log entry is written. The original value is never serialised.

---

## Module 5 — Audit Log Extension

**Problem:** `audit_logs` currently records login and logout only. Legal agreements are being signed on this platform. Plan upgrades affect billing. Admin actions affect all users. None of these leave an audit trail. In a legal dispute, "who did what and when" must be incontrovertible.

**New events to log:**
- Agreement signed (both parties — with IP address and user agent)
- Agreement downloaded (one-time vault access — record who downloaded)
- Plan upgraded (which plan, from which plan, at what time)
- Admin login / logout (already logged — confirm)
- Admin user data access (which admin viewed which user record)
- Document upload (freelancer uploaded which document type)
- Account deletion requested

**Schema addition — new columns on `audit_logs`:**
```ts
// Add to audit_logs table
ipAddress:    text('ip_address'),
userAgent:    text('user_agent'),
entityType:   text('entity_type'),  // 'agreement' | 'subscription' | 'document' | 'user' | 'admin'
entityId:     text('entity_id'),
metadata:     jsonb('metadata'),    // flexible extra data (planId, documentType, etc.)
```

**New `logAudit()` utility** in `artifacts/api-server/src/lib/auditLogger.ts`:

```ts
export async function logAudit(db: DB, params: {
  userId: string | 'system' | 'admin',
  action: string,
  entityType?: string,
  entityId?: string,
  ipAddress?: string,
  userAgent?: string,
  metadata?: Record<string, unknown>,
}) { ... }
```

Called at the end of each relevant route handler. Never blocks the primary action — fire-and-forget with `.catch()`.

---

## Module 6 — GDPR Account Deletion

**Problem:** There is no way for a user to delete their account. GDPR Article 17 (right to erasure) is a legal requirement for any service processing EU personal data. Users need a self-service deletion path.

**What deletion means for TalentLock:**
- Personal data is anonymised (not hard-deleted) to preserve referential integrity: name → "Deleted User", email → null, signatureImageUrl → null
- The user's Clerk account is deleted via Clerk Admin API
- Active bookings are cancelled before deletion is allowed (or the request is rejected with a list of active bookings)
- Completed bookings remain (for the other party's records) but the deleted user's name becomes "Deleted User"
- Reviews remain (platform integrity) but reviewer name becomes "Deleted User"
- Notifications, tokens, documents are hard-deleted

**New table: `account_deletion_requests`**
```ts
id:          serial primary key
userId:      text, references users.id
status:      text ('pending' | 'processing' | 'complete' | 'rejected')
reason:      text nullable
requestedAt: timestamptz
processedAt: timestamptz nullable
rejectionReason: text nullable
```

Deletion is a two-step process:
1. User submits a deletion request → row created with `status = 'pending'`
2. A background process (or admin trigger) validates preconditions, anonymises data, deletes Clerk account, marks `status = 'complete'`

**API routes:**
- `POST /api/account/delete-request` — authenticated user submits deletion request
- `GET /api/account/delete-request` — authenticated user checks status of their request

**Frontend:** A "Delete Account" button in the `/profile` settings section, behind a confirmation dialog with the user's email typed as confirmation.

---

## Plan Gating

All hardening items apply to all users and all plans. No plan gate. No token consumption.

---

## Non-Goals (Out of Scope for This Feature)

- Full HTTPS/TLS enforcement (handled at infrastructure/reverse proxy level — not in application code)
- Penetration testing or third-party security audit
- Admin 2FA (separate feature — Admin 2FA spec)
- Rate limiting (separate feature — API Rate Limiting spec)
- Soft delete (separate feature — Soft Delete spec)
- SOC 2 compliance documentation
- Data encryption at rest (handled by Neon/PostgreSQL — not application-level)
- Content Security Policy headers beyond basic Helmet defaults

---

# P1 Follow-Up Addendum — Sanitisation Coverage Gaps (added 2026-06-09)

> Source: TalentLock Security & Production Readiness review (P1). This extends **Module 2 — Input Sanitisation**, which shipped but did not cover every free-text write path. Additive only.

## Problem

Phase 4 applied `sanitiseText` to a subset of routes (`account`, `availability`, `employers`, `freelancers`, `users`, `team`, `bookings`, `reviews`, `jobRequirements` — confirmed via import grep on 2026-06-09). Six write paths that persist user-controlled free text were **missed** and still store raw input, leaving stored-XSS exposure on those fields:

| Route | File | Unsanitised free-text field(s) | Evidence |
|---|---|---|---|
| Meetings | `routes/meetings.ts` | create `.values({ ...data })` (line ~110) and update `.set({ ...parsed.data })` (line ~178) — title / agenda / notes | no `sanitiseText` import |
| Portfolio | `routes/portfolio.ts` | `title` (≤120), `description` (≤1000) — create line ~64, update line ~90 | no `sanitiseText` import |
| Milestones | `routes/milestones.ts` | `title` (≤200), `description` (≤1000) — insert lines ~92–93 | no `sanitiseText` import |
| Job Interests | `routes/jobInterests.ts` | `message` — insert line ~51 (currently only trimmed/sliced) | no `sanitiseText` import |
| Agreement signing | `routes/agreements.ts` | `signatureName` — line ~791, persisted at ~820/~828 (currently only `.trim()`) | no `sanitiseText` import |
| AI chat | `routes/openaiChat.ts` | conversation `title` (line ~39), user message `content` (line ~122) | no `sanitiseText` import |

These persist via length-validated Zod schemas but **without HTML/script neutralisation** — the exact gap Module 2 exists to close.

## Module 2 (Extended) — Close Remaining Sanitisation Paths

**Fix:** Apply the same `sanitiseText` utility (already built in Phase 1) to the free-text fields above, on **both create and update** paths, before the DB write. Where a handler currently spreads the parsed body directly (`{ ...data }` / `{ ...parsed.data }`), sanitise the named text fields explicitly rather than relying on the spread, so no raw field slips through.

**Special cases:**
- **AI chat `content`:** sanitise the stored user message, but feed the model the sanitised value too (consistent persistence). Do not alter assistant output handling.
- **`signatureName`:** keep the existing `.trim()` + "name or image required" validation; add `sanitiseText` on top before persisting to `employerSignatureName` / `freelancerSignatureName`.

## Non-Goals (Addendum)

- No change to the `sanitiseText` implementation itself (reuse as-is).
- No re-sanitisation/backfill of existing stored rows (forward-only).
- No new routes — only the six listed above.

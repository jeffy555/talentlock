# TalentLock — Task Breakdown: Security Hardening

## Summary

Six hardening items across five phases. Phases 1–3 are pure backend changes. Phase 4 adds sanitisation to existing route handlers. Phase 5 is the only frontend work (deletion UI + admin CSRF flow). No codegen. No OpenAPI changes.

---

## Phase 1 — Middleware Hardening

### Task 1.1 — Codebase Inspection

Run all inspection commands from `plan.md`. Document:
- Exact location of Pino logger instantiation
- Existing body parser configuration
- Whether `sanitize-html`, `csrf-csrf`, `helmet`, `@clerk/backend` are already installed
- Current `audit_logs` schema
- Whether `trust proxy` is configured

### Task 1.2 — Install Missing Packages

Based on inspection results, install only what is missing:

```bash
cd artifacts/api-server

# If sanitize-html missing:
pnpm add sanitize-html
pnpm add -D @types/sanitize-html

# If csrf-csrf missing:
pnpm add csrf-csrf

# If helmet missing:
pnpm add helmet

# If @clerk/backend missing:
pnpm add @clerk/backend
```

### Task 1.3 — Add Helmet and Request Size Limits

**File:** `artifacts/api-server/src/index.ts`

Add immediately after `const app = express()` and before any route registration:

```ts
import helmet from 'helmet';

// HTTP security headers
app.use(helmet());

// Trust proxy if behind reverse proxy (check inspection result)
// app.set('trust proxy', 1);  // uncomment if needed
```

Find the existing `express.json()` call and add the size limit:
```ts
// Edit existing — do NOT add a second express.json() call
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```

### Task 1.4 — Add Pino Redact Configuration

**File:** Wherever Pino is instantiated (confirmed from inspection)

Add `redact` to the Pino options:

```ts
redact: {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.body.password',
    'req.body.token',
    'req.body.signatureImageUrl',
    'req.body.fileUrl',
    '*.clerkId',
    '*.signatureImageUrl',
  ],
  censor: '[REDACTED]',
},
```

### Task 1.5 — Create `sanitise.ts` Utility

**File:** `artifacts/api-server/src/lib/sanitise.ts` (create new)

```ts
import sanitizeHtml from 'sanitize-html';

/**
 * Strip all HTML tags. Use for plain-text fields: bio, comment, label, name, etc.
 */
export function sanitiseText(input: string | null | undefined): string {
  if (!input) return '';
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

/**
 * Allow basic formatting only. Use for rich-text fields where b/i/links are valid.
 */
export function sanitiseRichText(input: string | null | undefined): string {
  if (!input) return '';
  return sanitizeHtml(input, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'br'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['https'],
  }).trim();
}
```

### Task 1.6 — Create `auditLogger.ts` Utility

**File:** `artifacts/api-server/src/lib/auditLogger.ts` (create new)

```ts
import { db as DB } from '../db';
import { auditLogs } from '@workspace/db';
import { eq } from 'drizzle-orm';

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'agreement.signed'
  | 'agreement.downloaded'
  | 'subscription.upgraded'
  | 'document.uploaded'
  | 'admin.user_viewed'
  | 'admin.login'
  | 'admin.logout'
  | 'account.deletion_requested'
  | 'account.deletion_complete';

export async function logAudit(
  db: typeof DB,
  params: {
    userId: string | 'system' | 'admin';
    action: AuditAction;
    entityType?: string;
    entityId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await db.insert(auditLogs).values({
    userId: params.userId,
    action: params.action,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    metadata: params.metadata ?? null,
    createdAt: new Date(),
  });
}
```

`logAudit()` is always called fire-and-forget from route handlers:
```ts
logAudit(db, { ... }).catch(err => req.log.warn({ err }, 'audit log write failed'));
```

---

## Phase 2 — Database

### Task 2.1 — Extend `audit_logs` Schema

**File:** `lib/db/src/schema/` — same file as `auditLogs` table

Add only columns that do not already exist (from inspection):

```ts
// Additive columns
ipAddress:  text('ip_address'),
userAgent:  text('user_agent'),
entityType: text('entity_type'),
entityId:   text('entity_id'),
metadata:   jsonb('metadata'),
```

Also confirm the existing action/event column name and that it supports arbitrary string values (not a strict enum check constraint that would reject new action strings).

### Task 2.2 — Create `account_deletion_requests` Table

**File:** `lib/db/src/schema/` — add to appropriate schema file

```ts
export const accountDeletionRequests = pgTable('account_deletion_requests', {
  id:              serial('id').primaryKey(),
  userId:          text('user_id').notNull().references(() => users.id),
  status:          text('status').notNull().default('pending'),
  // Values: 'pending' | 'processing' | 'complete' | 'rejected'
  reason:          text('reason'),
  requestedAt:     timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt:     timestamp('processed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
});
```

### Task 2.3 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify in Neon:
- `audit_logs` has new columns: `ip_address`, `user_agent`, `entity_type`, `entity_id`, `metadata`
- `account_deletion_requests` table exists with correct columns

---

## Phase 3 — CSRF Protection + Audit Log Triggers

### Task 3.1 — Add CSRF Protection to Admin Routes

**File:** `artifacts/api-server/src/index.ts`

Add `CSRF_SECRET` to `.env.example`:
```
CSRF_SECRET=replace-with-64-char-random-string
```

Generate value: `openssl rand -hex 32`

Add to server (CRITICAL — register `csrf-token` endpoint BEFORE applying protection):

```ts
import { doubleCsrf } from 'csrf-csrf';

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET!,
  cookieName: 'tl_csrf',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    httpOnly: true,
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
});

// Step 1: Unprotected endpoint — admin login page fetches this
app.get('/api/admin/csrf-token', (req, res) => {
  res.json({ token: generateToken(req, res) });
});

// Step 2: Apply protection to all other admin state-changing routes
// Register AFTER the csrf-token endpoint
app.use('/api/admin', (req, res, next) => {
  // Skip GET and HEAD — only protect state-changing methods
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return doubleCsrfProtection(req, res, next);
});
```

### Task 3.2 — Add Audit Logging to Agreement Signing

**File:** `artifacts/api-server/src/routes/agreements.ts`

In `POST /api/agreements/:id/sign`, after successful signature save:

```ts
logAudit(db, {
  userId: internalUserId,
  action: 'agreement.signed',
  entityType: 'agreement',
  entityId: agreementId,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  metadata: { signerRole: userRole, fullySignedAt: agreement.status === 'fully_signed' ? new Date().toISOString() : null },
}).catch(err => req.log.warn({ err }, 'audit log write failed'));
```

### Task 3.3 — Add Audit Logging to Agreement Download

**File:** `artifacts/api-server/src/routes/agreements.ts`

In `GET /api/agreements/:id/download`, after successful download response:

```ts
logAudit(db, {
  userId: internalUserId,
  action: 'agreement.downloaded',
  entityType: 'agreement',
  entityId: agreementId,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
}).catch(err => req.log.warn({ err }, 'audit log write failed'));
```

### Task 3.4 — Add Audit Logging to Plan Upgrade

**File:** `artifacts/api-server/src/routes/subscriptions.ts`

In `POST /api/subscriptions/upgrade`, after successful upgrade:

```ts
logAudit(db, {
  userId: internalUserId,
  action: 'subscription.upgraded',
  entityType: 'subscription',
  entityId: internalUserId,
  ipAddress: req.ip,
  metadata: { fromPlan: previousPlan, toPlan: newPlan },
}).catch(err => req.log.warn({ err }, 'audit log write failed'));
```

### Task 3.5 — Add Audit Logging to Document Upload

**File:** `artifacts/api-server/src/routes/documents.ts`

In `POST /api/documents/confirm`, after successful upload confirmation:

```ts
logAudit(db, {
  userId: internalUserId,
  action: 'document.uploaded',
  entityType: 'document',
  entityId: documentId,
  metadata: { documentType },
}).catch(err => req.log.warn({ err }, 'audit log write failed'));
```

---

## Phase 4 — Input Sanitisation Across Routes

### Task 4.1 — Sanitise Freelancer Profile Fields

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Import: `import { sanitiseText } from '../lib/sanitise';`

In `PUT /api/freelancers/me`, before DB update:
```ts
const sanitised = {
  bio: sanitiseText(req.body.bio),
  // skills: if stored as text, sanitiseText(req.body.skills)
  // availabilityNote: sanitiseText(req.body.availabilityNote)
  // ... add all text fields confirmed from inspection
};
```

### Task 4.2 — Sanitise Job Requirement Fields

**File:** `artifacts/api-server/src/routes/jobs.ts` (or `jobRequirements.ts`)

In `POST /api/job-requirements` and `PATCH /api/job-requirements/:id`:
```ts
title:       sanitiseText(req.body.title),
description: sanitiseText(req.body.description),
```

### Task 4.3 — Sanitise Review Fields

**File:** `artifacts/api-server/src/routes/reviews.ts`

In `POST /api/reviews`:
```ts
comment: sanitiseText(req.body.comment),
```

In `POST /api/reviews/:id/reply`:
```ts
reply: sanitiseText(req.body.reply),
```

### Task 4.4 — Sanitise Availability Block Label

**File:** `artifacts/api-server/src/routes/availability.ts`

In `POST /api/availability/me`:
```ts
label: sanitiseText(req.body.label),
```

### Task 4.5 — Sanitise User and Employer Profile Fields

**File:** `artifacts/api-server/src/routes/users.ts` (and `employers.ts`)

In `PUT /api/users/me`:
```ts
firstName: sanitiseText(req.body.firstName),
lastName:  sanitiseText(req.body.lastName),
```

In `PUT /api/employers/me`:
```ts
companyName:  sanitiseText(req.body.companyName),
// description: sanitiseText(req.body.description) — if field exists
```

### Task 4.6 — Sanitise Meeting Notes

**File:** `artifacts/api-server/src/routes/meetings.ts`

In `POST /api/meetings` and `PATCH /api/meetings/:id`:
```ts
notes: sanitiseText(req.body.notes),
```

Only if `notes` field exists on meetings (confirm from inspection).

---

## Phase 5 — GDPR Deletion Endpoint + Frontend

### Task 5.1 — Create Account Route File

**File:** `artifacts/api-server/src/routes/account.ts` (create new)

#### `POST /api/account/delete-request`

Requires Clerk auth. Available to both employers and freelancers.

Guards in order:
1. Verify no active bookings (plan.md Q7 — `BOOKING_ACTIVE_STATUSES`)
2. Verify no existing pending/processing deletion request for this user → 409

Process per plan.md Q8:
1. Create `account_deletion_requests` row with `status = 'pending'`
2. Run Drizzle transaction to anonymise and hard-delete personal data
3. Call Clerk API to delete account
4. Update request status to `complete` on success, `pending` on Clerk failure

Log audit:
```ts
logAudit(db, {
  userId: internalUserId,
  action: 'account.deletion_requested',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
}).catch(err => req.log.warn({ err }, 'audit log write failed'));
```

Response: `HTTP 200 { success: true, message: 'Your account has been deleted.' }`

#### `GET /api/account/delete-request`

Returns current deletion request status for the authenticated user:
```ts
{ status: 'pending' | 'processing' | 'complete' | 'rejected' | null, rejectionReason: string | null }
```

### Task 5.2 — Register Account Routes

**File:** `artifacts/api-server/src/index.ts`

Register `accountRouter` from `./routes/account`.

### Task 5.3 — Update Admin Login Page for CSRF

**File:** `artifacts/talentlock/src/pages/AdminLogin.tsx` (or equivalent)

On component mount, fetch the CSRF token:
```ts
useEffect(() => {
  fetch('/api/admin/csrf-token')
    .then(r => r.json())
    .then(data => setCsrfToken(data.token));
}, []);
```

Include the token in the admin login POST request header:
```ts
headers: {
  'Content-Type': 'application/json',
  'x-csrf-token': csrfToken,
}
```

### Task 5.4 — Add Delete Account Section to `/profile`

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

Add at the very bottom of the profile page, below all other sections, separated by a red danger zone border:

See `UI.md` for full component spec.

---

## Acceptance Criteria

- [ ] `pnpm run typecheck` passes after all package installs
- [ ] `helmet()` middleware applied — response headers include `X-Content-Type-Options: nosniff`
- [ ] `express.json({ limit: '1mb' })` — requests > 1MB return `HTTP 413`
- [ ] Pino `redact` config applied — `authorization` header not visible in logs
- [ ] `sanitise.ts` created with `sanitiseText()` and `sanitiseRichText()`
- [ ] `<script>` tag in review comment → stored as empty string after sanitisation
- [ ] `<b>bold</b>` in bio → stored as `bold` (tags stripped)
- [ ] `audit_logs` has new columns: `ip_address`, `user_agent`, `entity_type`, `entity_id`, `metadata`
- [ ] `account_deletion_requests` table exists
- [ ] `logAudit()` utility created and fires on all 5 trigger points
- [ ] Audit entries never block primary actions (fire-and-forget `.catch()`)
- [ ] `GET /api/admin/csrf-token` returns a token without requiring auth
- [ ] Admin POST routes return `403` without valid CSRF token
- [ ] Admin GET routes work without CSRF token (not protected)
- [ ] Admin login page sends `x-csrf-token` header after fetching token
- [ ] `POST /api/account/delete-request` returns `409` when active bookings exist
- [ ] Deletion anonymises name, email, signatureImageUrl on `users`
- [ ] Deletion hard-deletes `notifications`, `token_usage`, `documents`, `availability_blocks`
- [ ] Reviews and agreements are preserved with "Deleted User" attribution
- [ ] Clerk account is deleted after TalentLock data anonymisation
- [ ] Clerk API failure → request status reset to `pending`, not `complete`
- [ ] "Delete Account" button in `/profile` settings is behind confirmation dialog
- [ ] Confirmation dialog requires typing the user's email before enabling delete button
- [ ] Active bookings error shown inline in the deletion dialog

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 (install) → 1.3 → 1.4 → 1.5 → 1.6
Task 2.1 → 2.2 → 2.3 (migration)
Task 3.1 (CSRF token endpoint FIRST) → 3.2 → 3.3 → 3.4 → 3.5
Task 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6
Task 5.1 → 5.2 → 5.3 (admin CSRF) → 5.4 (profile deletion UI)
```

CRITICAL: Task 5.3 must be completed and tested before `doubleCsrfProtection` is applied in Task 3.1. Adding CSRF protection before the frontend sends the token will lock out the admin console.

---

# Phase 6 (P1 Addendum) — Close Remaining Sanitisation Paths (added 2026-06-09)

> Implements the extended Module 2 (`features.md`) and decisions A1–A5 (`plan.md`). Reuses the Phase 1 `sanitiseText` utility. No schema, OpenAPI, or codegen changes.

### Task 6.1 — Meetings
- File: `artifacts/api-server/src/routes/meetings.ts`
- Import `sanitiseText`. Sanitise every free-text field (title/agenda/notes) on the create `.values({ ...data })` (~110) and update `.set({ ...parsed.data })` (~178) paths — explicitly, not via the spread.
- **Acceptance:** A `<script>` payload in meeting title/agenda/notes is stored neutralised on both POST and PATCH.

### Task 6.2 — Portfolio
- File: `artifacts/api-server/src/routes/portfolio.ts`
- Import `sanitiseText`. Sanitise `title` and `description` on create (~64) and update (~90).
- **Acceptance:** Portfolio title/description are sanitised on create and update; `url`/`imageUrl`/`tags` untouched.

### Task 6.3 — Milestones
- File: `artifacts/api-server/src/routes/milestones.ts`
- Import `sanitiseText`. Sanitise `title` and `description` on insert (~92–93) and any update path.
- **Acceptance:** Milestone title/description stored neutralised.

### Task 6.4 — Job Interests
- File: `artifacts/api-server/src/routes/jobInterests.ts`
- Import `sanitiseText`. For `message` (~51), apply `sanitiseText` → trim → existing length cap (per A4).
- **Acceptance:** Job-interest message is sanitised before the trim/slice; length cap preserved.

### Task 6.5 — Agreement signature name
- File: `artifacts/api-server/src/routes/agreements.ts`
- Import `sanitiseText`. After the existing `.trim()`/required-field validation (~791–794), sanitise `signatureName` before assigning to `employerSignatureName`/`freelancerSignatureName` (~820/~828).
- **Acceptance:** A script payload in `signatureName` is neutralised; "name or image required" validation still works.

### Task 6.6 — AI chat
- File: `artifacts/api-server/src/routes/openaiChat.ts`
- Import `sanitiseText`. Sanitise conversation `title` (~39) and user message `content` (~122); pass the sanitised content into the model history (per A3). Leave assistant `content` (~184) unchanged.
- **Acceptance:** Stored conversation title and user message content are sanitised; assistant output unaffected.

### Task 6.7 — Typecheck gate
- Run `pnpm run typecheck`.
- **Acceptance:** Zero new type errors.

### Phase 6 Acceptance Checklist
- [ ] `meetings.ts` sanitises title/agenda/notes on create + update
- [ ] `portfolio.ts` sanitises title/description on create + update
- [ ] `milestones.ts` sanitises title/description
- [ ] `jobInterests.ts` sanitises message (sanitise → trim → cap)
- [ ] `agreements.ts` sanitises signatureName after trim/validation
- [ ] `openaiChat.ts` sanitises conversation title + user message content (assistant unchanged)
- [ ] No double-encoding (sanitise once on write only)
- [ ] `pnpm run typecheck` passes with zero new errors

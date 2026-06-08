# TalentLock — Implementation Plan: Security Hardening

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Run all of these before writing any code and report every finding:

```bash
# 1. Find Pino logger instantiation
grep -rn "import.*pino\|require.*pino\|pino(" artifacts/api-server/src/ | head -10

# 2. Find body parser configuration
grep -n "express.json\|express.urlencoded\|bodyParser" artifacts/api-server/src/index.ts

# 3. Check for existing sanitisation libraries
cat artifacts/api-server/package.json | grep -i "sanitize\|xss\|purify"
cat artifacts/talentlock/package.json | grep -i "sanitize\|xss\|purify"

# 4. Check for existing CSRF library
cat artifacts/api-server/package.json | grep -i "csrf"
grep -rn "csrf" artifacts/api-server/src/ | head -10

# 5. Check audit_logs current schema
grep -A 20 "auditLogs\s*=" lib/db/src/schema/*.ts

# 6. Check Clerk backend SDK
cat artifacts/api-server/package.json | grep -i "clerk"
grep -rn "clerkClient\|@clerk/backend" artifacts/api-server/src/ | head -10

# 7. Check trust proxy config
grep -n "trust proxy\|trustProxy" artifacts/api-server/src/index.ts

# 8. Check for helmet
cat artifacts/api-server/package.json | grep -i "helmet"

# 9. Check free-text fields in route handlers
grep -n "req.body\." artifacts/api-server/src/routes/freelancers.ts | head -20
grep -n "req.body\." artifacts/api-server/src/routes/reviews.ts | head -10
grep -n "req.body\." artifacts/api-server/src/routes/availability.ts | head -10
```

Document all findings in a comment block at the top of each new file created.

---

## Resolved Questions

---

### Q1 — Pino Logger Location

**Decision: Inspect first. Add `redact` config wherever the logger is instantiated.**

If Pino is instantiated inline in `index.ts`:
```ts
// Find this pattern and add redact config to it
const logger = pino({ ... });
// Add redact to the existing options object
```

If Pino is in a separate `lib/logger.ts` file — edit that file.

If the server uses `req.log` via the `pino-http` middleware, the redact config goes on the `pino-http` options:
```ts
import pinoHttp from 'pino-http';
app.use(pinoHttp({
  logger: pino({
    redact: { paths: [ /* ... */ ], censor: '[REDACTED]' }
  })
}));
```

Document which approach was found and used.

---

### Q2 — Body Parser Location

**Decision: Inspect first. Edit existing parsers — do not add duplicates.**

Find the existing `express.json()` call and add `{ limit: '1mb' }` to it:
```ts
// Before
app.use(express.json());
// After
app.use(express.json({ limit: '1mb' }));
```

If no body parser is explicitly configured (Express 5 has a built-in), add it explicitly:
```ts
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
```

---

### Q3 — Sanitisation Library

**Decision: Install `sanitize-html` if not already present.**

```bash
# If not found in package.json
cd artifacts/api-server && pnpm add sanitize-html
cd artifacts/api-server && pnpm add -D @types/sanitize-html
```

If an alternative library is already present (`xss`, `dompurify`) — use it with equivalent configuration rather than adding a second library.

---

### Q4 — CSRF Library

**Decision: Install `csrf-csrf` if not already present.**

```bash
# If not found in package.json
cd artifacts/api-server && pnpm add csrf-csrf
```

`CSRF_SECRET` environment variable: must be a random 64-character string. Add to `.env.example` with a placeholder. Never hardcode.

---

### Q5 — `audit_logs` Current Schema

**Decision: Inspect first. Add new columns as additive migration only.**

After inspection, add these columns only if they do not already exist:
```ts
// Additive columns — add to auditLogs table in schema
ipAddress:  text('ip_address'),
userAgent:  text('user_agent'),
entityType: text('entity_type'),
entityId:   text('entity_id'),
metadata:   jsonb('metadata'),
```

The existing `action` (or `type`) column for 'login' | 'logout' remains unchanged. New audit events use string values like `'agreement.signed'`, `'subscription.upgraded'`, `'account.deletion_requested'`.

---

### Q6 — Clerk Backend SDK

**Decision: Inspect first. Install if missing.**

If `@clerk/backend` is not in `package.json`:
```bash
cd artifacts/api-server && pnpm add @clerk/backend
```

Usage for account deletion:
```ts
import { createClerkClient } from '@clerk/backend';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

await clerkClient.users.deleteUser(clerkUserId);
```

`CLERK_SECRET_KEY` must already be in the environment (used for existing Clerk auth middleware). Confirm it is set before using it for the deletion call.

---

### Q7 — Active Bookings for Account Deletion

**Decision: Reuse confirmed `BOOKING_ACTIVE_STATUSES` from prior features.**

Before allowing deletion, check:
```ts
const activeBookings = await db.select()
  .from(bookings)
  .where(and(
    or(
      eq(bookings.freelancerId, internalUserId),
      eq(bookings.employerId, internalUserId)
    ),
    inArray(bookings.status, BOOKING_ACTIVE_STATUSES)
  ));

if (activeBookings.length > 0) {
  return res.status(409).json({
    error: 'Cannot delete account with active bookings',
    code: 'ACTIVE_BOOKINGS_EXIST',
    bookingCount: activeBookings.length,
  });
}
```

The user must cancel all active bookings before their deletion request can be processed.

---

### Q8 — Deletion Strategy

**Decision: Option A — immediate synchronous deletion with precondition guards.**

Process in this exact order within a single Drizzle transaction where possible:

```ts
await db.transaction(async (tx) => {
  // 1. Anonymise users table
  await tx.update(users).set({
    firstName: 'Deleted',
    lastName: 'User',
    email: null,
    signatureImageUrl: null,
  }).where(eq(users.id, internalUserId));

  // 2. Anonymise freelancer_profiles (if exists)
  await tx.update(freelancerProfiles).set({
    bio: null,
    portfolioUrl: null,
  }).where(eq(freelancerProfiles.id, internalUserId));

  // 3. Hard delete: notifications, token_usage, documents
  await tx.delete(notifications).where(eq(notifications.userId, internalUserId));
  await tx.delete(tokenUsage).where(eq(tokenUsage.userId, internalUserId));
  await tx.delete(documents).where(eq(documents.userId, internalUserId));
  await tx.delete(availabilityBlocks).where(eq(availabilityBlocks.freelancerId, internalUserId));

  // 4. Update deletion request status
  await tx.update(accountDeletionRequests)
    .set({ status: 'processing', processedAt: new Date() })
    .where(eq(accountDeletionRequests.userId, internalUserId));
});

// 5. Delete Clerk account AFTER transaction commits (outside tx)
try {
  await clerkClient.users.deleteUser(clerkUserId);
  await db.update(accountDeletionRequests)
    .set({ status: 'complete' })
    .where(eq(accountDeletionRequests.userId, internalUserId));
} catch (err) {
  req.log.error({ err }, 'Clerk account deletion failed — TalentLock data already anonymised');
  await db.update(accountDeletionRequests)
    .set({ status: 'pending', rejectionReason: 'Clerk deletion failed — retry required' })
    .where(eq(accountDeletionRequests.userId, internalUserId));
}
```

**What is kept (not deleted):**
- `bookings` rows — preserved with anonymised user reference for the other party's records
- `reviews` rows — preserved for platform integrity; `employerDisplayName` becomes "Deleted User"
- `agreements` rows — legal records; preserved with "Deleted User" references
- `audit_logs` — preserved for compliance; user identity already logged at time of action

---

### Q9 — Fields to Sanitise Per Route

**Decision: Inspect all route handlers. Sanitise at write time in each handler.**

Apply `sanitiseText()` at minimum to these fields:

| Route | Fields to sanitise |
|---|---|
| `PUT /api/freelancers/me` | `bio`, `skills` (if text), `availabilityNote` |
| `POST /api/job-requirements` | `description`, `title` |
| `PATCH /api/job-requirements/:id` | same as above |
| `POST /api/reviews` | `comment` |
| `POST /api/reviews/:id/reply` | `reply` |
| `POST /api/availability/me` | `label` |
| `POST /api/meetings` | `notes` (if present) |
| `PATCH /api/meetings/:id` | `notes` (if present) |
| `POST /api/bookings` | `message` (if present) |
| `PUT /api/users/me` | `firstName`, `lastName` |
| `PUT /api/employers/me` | `companyName`, `description` |

After inspection, add to this list any additional `req.body` string fields that are stored in the database.

---

## Resolved Risks

---

### Risk 1 — Sanitisation Must Not Break Existing Data

**Resolution: Apply only on write. No backfill. No retroactive sanitisation.**

The `sanitiseText()` call is placed immediately before the Drizzle insert/update. Existing data is never retroactively modified. A TypeScript `<` in a portfolio description that was stored before this feature is unaffected.

---

### Risk 2 — CSRF Token Must Be Available Before Protection Activates

**Resolution: Order of operations in task.md is strict.**

Task order enforced:
1. Add `GET /api/admin/csrf-token` (unprotected)
2. Update admin login page to fetch and send token
3. Test admin login works with token
4. Only then apply `doubleCsrfProtection` to all `/api/admin/*` routes

Never skip step 2 before step 4.

---

### Risk 3 — Clerk API Failure During Deletion

**Resolution: Covered in Q8. Deletion request row tracks status. Retry possible.**

If Clerk call fails: data is already anonymised, request status is set back to `pending` with a rejection reason. The user can retry. An admin can also manually trigger the Clerk deletion from the admin console.

---

### Risk 4 — `req.ip` Behind Proxy

**Resolution: Inspect trust proxy config first. Add if missing.**

```ts
// In artifacts/api-server/src/index.ts — add if behind a reverse proxy
app.set('trust proxy', 1);
```

If not behind a proxy in production: leave as-is. `req.ip` is accurate.

---

### Risk 5 — Helmet

**Resolution: Install and configure if not already present.**

```bash
cat artifacts/api-server/package.json | grep helmet
# If missing:
cd artifacts/api-server && pnpm add helmet
```

Add immediately after app creation:
```ts
import helmet from 'helmet';
app.use(helmet());
```

`helmet()` with no config sets 11 HTTP security headers including `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and `Referrer-Policy`.

---

## New Package Dependencies

| Package | Where | Purpose | Install if missing |
|---|---|---|---|
| `sanitize-html` | `artifacts/api-server` | Strip HTML from free-text inputs | `cd artifacts/api-server && pnpm add sanitize-html` |
| `@types/sanitize-html` | `artifacts/api-server` | TypeScript types | `cd artifacts/api-server && pnpm add -D @types/sanitize-html` |
| `csrf-csrf` | `artifacts/api-server` | CSRF protection for admin routes | `cd artifacts/api-server && pnpm add csrf-csrf` |
| `helmet` | `artifacts/api-server` | HTTP security headers | `cd artifacts/api-server && pnpm add helmet` |
| `@clerk/backend` | `artifacts/api-server` | Clerk Admin API for account deletion | `cd artifacts/api-server && pnpm add @clerk/backend` |

---

## New Environment Variables

| Variable | Where | Value |
|---|---|---|
| `CSRF_SECRET` | `.env` (server) | Random 64-character string — generate with `openssl rand -hex 32` |

Add to `.env.example`:
```
CSRF_SECRET=your-64-character-random-string-here
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/security-hardening/features.md` read
- [ ] `specs/security-hardening/clarify.md` read
- [ ] This `plan.md` read — all 9 questions and 5 risks resolved
- [ ] `specs/security-hardening/task.md` read — phase order understood
- [ ] `specs/security-hardening/UI.md` read — deletion flow UI understood
- [ ] Codebase inspection complete — Q1–Q6 confirmed from actual files
- [ ] `CSRF_SECRET` value generated and ready for `.env`

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Middleware hardening — size limits, helmet, Pino redact, sanitise utility | ⬜ Not started |
| Phase 2 | Database — audit_logs extension + account_deletion_requests table | ⬜ Not started |
| Phase 3 | CSRF on admin + audit logging in route handlers | ⬜ Not started |
| Phase 4 | GDPR deletion endpoint + sanitisation across routes | ⬜ Not started |
| Phase 5 | Frontend — deletion UI + admin CSRF token integration | ⬜ Not started |

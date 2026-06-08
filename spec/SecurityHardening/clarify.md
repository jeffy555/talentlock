# TalentLock — Clarification & Verification: Security Hardening

This file audits `features.md` against `project.md` to surface gaps, risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| Express 5 server in `artifacts/api-server/src/index.ts` | Confirmed in `project.md` |
| Pino logger already used (`req.log` in route handlers) | Confirmed in `project.md` Notes for Cursor |
| Admin cookie auth (`tl_admin` HMAC, 8h TTL) is separate from Clerk | Confirmed in `project.md` Auth Flow Notes |
| `audit_logs` table exists | Confirmed in `project.md` schema table |
| `users` table exists with `signatureImageUrl` | Confirmed in `project.md` |
| `agreements` table with signing flow | Confirmed — `POST /api/agreements/:id/sign` |
| `subscriptions` table with upgrade flow | Confirmed — `POST /api/subscriptions/upgrade` |
| `documents` table with upload flow | Confirmed — `POST /api/documents/confirm` |
| `/profile` authenticated frontend route | Confirmed |
| `/admin/login` route exists | Confirmed |
| Clerk auth used for all non-admin routes | Confirmed in `project.md` Auth Flow Notes |
| No existing body size limits mentioned anywhere | Confirmed — not present in project.md or talentlock.mdc |
| No existing sanitisation utility | Confirmed — none referenced in any spec |
| No existing GDPR deletion endpoint | Confirmed — no `/api/account/` routes in project.md |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Where Is the Pino Logger Instantiated?

**Question:** The Pino logger needs a `redact` config added to it. Where is it created — in `index.ts` directly, in a separate `lib/logger.ts` file, or somewhere else?

**Impact:** The redact config must be added to the logger at instantiation time — it cannot be added after the fact. Wrong file = redaction never applies.

**Recommendation:**
```bash
grep -rn "pino\|createLogger\|logger" artifacts/api-server/src/index.ts | head -10
grep -rn "import.*pino\|require.*pino" artifacts/api-server/src/ | head -10
```

---

### Q2 — Where Are the Express Body Parsers Currently Configured?

**Question:** `express.json()` and `express.urlencoded()` are configured somewhere in the server setup. The size limit must be added there — not as a second duplicate middleware.

**Impact:** Adding a duplicate `express.json()` call could cause conflicts or silently override the existing one.

**Recommendation:**
```bash
grep -n "express.json\|express.urlencoded\|bodyParser" artifacts/api-server/src/index.ts
```

---

### Q3 — Does `sanitize-html` or Any Sanitisation Library Already Exist?

**Question:** Is `sanitize-html`, `xss`, `dompurify`, or any similar library already installed?

**Impact:** If already installed, import from the existing package rather than adding a new dependency.

**Recommendation:**
```bash
cat artifacts/api-server/package.json | grep -i "sanitize\|xss\|purify"
cat artifacts/talentlock/package.json | grep -i "sanitize\|xss\|purify"
```

---

### Q4 — Does `csrf-csrf` or Any CSRF Library Already Exist?

**Question:** Is any CSRF protection already in place on admin routes?

**Recommendation:**
```bash
cat artifacts/api-server/package.json | grep -i "csrf"
grep -rn "csrf" artifacts/api-server/src/ | head -10
```

---

### Q5 — What Is the Current `audit_logs` Table Schema?

**Question:** The existing `audit_logs` table records login/logout. What are its current column names and types? The new columns (`ipAddress`, `userAgent`, `entityType`, `entityId`, `metadata`) must be additive — not replacing anything.

**Impact:** If the existing table has a `type` column (for 'login' | 'logout'), the new `action` string must be compatible with that column's existing enum or check constraint.

**Recommendation:**
```bash
grep -A 20 "auditLogs\s*=" lib/db/src/schema/*.ts
```

---

### Q6 — Does the Clerk Admin API Support Account Deletion?

**Question:** Module 6 deletes the user's Clerk account via the Clerk Admin API (`DELETE /v1/users/{userId}` in Clerk's backend API). Is the Clerk backend API client (with a secret key) already available in the server codebase?

**Impact:** If the Clerk backend SDK is not installed, `@clerk/backend` must be added as a dependency before the deletion endpoint can be implemented.

**Recommendation:**
```bash
cat artifacts/api-server/package.json | grep -i "clerk"
grep -rn "clerkClient\|@clerk/backend\|clerkBackend" artifacts/api-server/src/ | head -10
```

---

### Q7 — Are There Active Bookings Validation Rules for Account Deletion?

**Question:** Module 6 says deletion should be rejected if the user has active bookings. What booking statuses count as "active" for this purpose? (Reuse confirmed values from prior features.)

**Recommendation:** Reuse `BOOKING_ACTIVE_STATUSES` constant already defined in prior analytics features. Confirm the exact values found during Earnings Intelligence / Spend Analytics inspection.

---

### Q8 — Should Account Deletion Be Immediate or Queued?

**Question:** Module 6 proposes a two-step process (request → background processing). For an initial implementation, is immediate synchronous deletion acceptable?

**Options:**
- **(A)** Immediate — validate preconditions, anonymise, delete Clerk account, all in the same HTTP request (may be slow, ~2-5 seconds)
- **(B)** Queued — create a request row, process asynchronously (requires a job runner or cron)
- **(C)** Admin-triggered — user requests deletion, admin reviews and triggers it from the admin console

**Impact:** Option B requires infrastructure not currently in the stack (no job queue). Option C is safest for the first implementation — no automated risk.

**Recommendation:** Option A for the MVP — immediate synchronous deletion. If the user has no active bookings, process everything in one request. Add a timeout note and consider running it as a background task within the same request using `res.json()` first then processing.

---

### Q9 — Which Fields Must Be Sanitised on Each Route?

**Question:** Module 2 lists fields at risk but the exact list needs confirming against the actual route handlers. Which routes accept free-text input that gets stored?

**Recommendation:** Inspect before implementing:
```bash
grep -n "req.body\." artifacts/api-server/src/routes/freelancers.ts | head -20
grep -n "req.body\." artifacts/api-server/src/routes/reviews.ts | head -20
grep -n "req.body\." artifacts/api-server/src/routes/jobs.ts | head -20
grep -n "req.body\." artifacts/api-server/src/routes/availability.ts | head -20
grep -n "req.body\." artifacts/api-server/src/routes/meetings.ts | head -20
```

---

## ⚠️ Risks & Notes

### Risk 1 — Sanitisation Must Not Break Existing Data

Applying `sanitiseText()` to fields that already contain stored data is fine — the sanitisation is applied on write, not on read. Existing stored data is not retroactively sanitised. This is acceptable: stored XSS in existing data was a pre-existing risk, and the priority is preventing new injections.

Do NOT run a backfill sanitisation pass on existing data — this risks corrupting legitimate content that happens to contain angle brackets (e.g. TypeScript generics in portfolio descriptions: `Array<string>`).

### Risk 2 — CSRF Token Must Not Break Admin Login Flow

The admin login form (`/admin/login`) fetches a CSRF token before submitting credentials. If the CSRF token endpoint is not set up before adding `doubleCsrfProtection` to admin routes, the admin will be locked out immediately.

The order must be:
1. Add `GET /api/admin/csrf-token` endpoint (no CSRF protection on this route)
2. Update `/admin/login` frontend to fetch and include the token
3. Only then apply `doubleCsrfProtection` to all other `/api/admin/*` routes

### Risk 3 — GDPR Deletion Must Handle Clerk API Errors Gracefully

If the Clerk API call to delete the user's account fails (network error, rate limit), the TalentLock data has already been anonymised. This leaves the user in a broken state — data anonymised but Clerk account still exists. The `account_deletion_requests` table allows re-processing: if the request is `status = 'processing'` and the Clerk call fails, log the error and retry on next attempt.

### Risk 4 — `req.ip` May Be Unreliable Behind a Proxy

For audit log IP addresses, `req.ip` returns the proxy's IP unless `app.set('trust proxy', true)` is configured. Confirm whether the server runs behind a reverse proxy in production.

```bash
grep -n "trust proxy\|trustProxy" artifacts/api-server/src/index.ts
```

If behind a proxy: `app.set('trust proxy', 1)` — reads from `X-Forwarded-For` header.

### Risk 5 — Helmet Middleware

If `helmet` is not already installed and configured, adding it at the same time as request size limits provides easy HTTP security headers (X-Content-Type-Options, X-Frame-Options, etc.) with zero configuration. Check before implementing:
```bash
cat artifacts/api-server/package.json | grep helmet
```

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Pino logger location | Task 1.2 (redact config) |
| Q2 | Body parser location | Task 1.1 (size limits) |
| Q3 | Sanitise-html exists? | Task 1.3 (sanitisation) |
| Q4 | CSRF library exists? | Task 1.4 (CSRF) |
| Q5 | `audit_logs` current schema | Task 2.1 (schema migration) |
| Q6 | Clerk backend SDK exists? | Task 2.3 (account deletion) |

Questions Q7, Q8, Q9 are resolved in `plan.md`.

# TalentLock — Implementation Plan: Product Gaps

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

> **Inspection completed 2026-06-07.** Findings below drive all field-name and hook-name decisions in this plan.

### Inspection Results (2026-06-07)

| Check | Finding |
|---|---|
| Email provider | `nodemailer` in `artifacts/api-server/package.json` but **no** `RESEND`/`SMTP` usage in `src/`. Plan decision: install **Resend**, no-op when `RESEND_API_KEY` unset. |
| `users` columns | `id`, `clerkId`, `role`, `email`, `name`, `avatarUrl`, `signatureImageUrl` — **no** `emailNotificationsEnabled` yet. |
| `freelancer_profiles` skills | `text("skills").array()` — PostgreSQL `text[]`. Use `array_to_string(skills, ' ')` in tsvector. |
| `freelancer_profiles` rate | `hourlyRate` / `dailyRate` (numeric) — **not** `rate`. Completeness uses `hourlyRate` (or `dailyRate` when `paymentPreference === 'daily'`). |
| Profile photo | No `profilePhotoUrl` on freelancer — use `users.avatarUrl` (join via `userId`) for completeness photo check. |
| `bookings` notes | `notes` column exists but is unused in booking flow — add separate `message` column per spec (employer intro message). |
| `GET /api/bookings` | Returns plain enriched array (no pagination). |
| Frontend list hooks | `useListBookings`, `useListAgreements`, `useListMeetings` — **not** `useGet*`. Consumers: `BookingsList.tsx`, `AgreementsList.tsx`, `MeetingsList.tsx`, `Dashboard.tsx`, `BookingDetail.tsx`. |
| Profile freelancer ID | `useGetMyFreelancerProfile()` → `freelancerProfile.id`. Public link partially exists; enhance per UI.md. |
| Freelancer profile route | `PATCH /api/freelancers/me` (not PUT). Completeness score update goes in this handler. |
| Talent Vault page | `artifacts/talentlock/src/pages/FreelancersList.tsx` (not `Freelancers.tsx`). Has client-side name filter — replace keyword leg with server `?q=` + debounce. |

Run all of these before writing any code. Report every finding.

```bash
# 1. Check for existing email provider
cat artifacts/api-server/package.json | grep -i "resend\|sendgrid\|nodemailer\|postmark"
grep -rn "RESEND\|SENDGRID\|SMTP" artifacts/api-server/src/ | head -10

# 2. Check users table columns
grep -A 25 "users\s*=" lib/db/src/schema/*.ts

# 3. Check skills column type on freelancer_profiles
grep -A 60 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "skill\|bio\|rate\|field\|avail\|photo"

# 4. Check bookings table for existing message/note column
grep -A 60 "bookings\s*=" lib/db/src/schema/*.ts | grep -i "message\|note\|description"

# 5. Check how GET /api/bookings currently returns data
grep -n "findMany\|select\|json\|return" artifacts/api-server/src/routes/bookings.ts | head -20

# 6. Check frontend consumers of list hooks
grep -rn "useGetBookings\|useGetAgreements\|useGetMeetings" artifacts/talentlock/src/ | head -20

# 7. Check freelancer ID availability on profile page
grep -n "useGetFreelancersMe\|useGetUsersMe\|\.id\|freelancerId" \
  artifacts/talentlock/src/pages/Profile.tsx | head -20
```

Document all findings in a comment block at the top of each new file.

---

## Resolved Questions

---

### Q1 — Email Provider

**Decision: Use Resend. Install if not present. Fail gracefully if not configured.**

```bash
# If not found in package.json:
cd artifacts/api-server && pnpm add resend
```

`RESEND_API_KEY` environment variable — add to `.env.example`:
```
RESEND_API_KEY=re_your_resend_api_key_here
EMAIL_FROM=noreply@talentlock.io
```

The `sendNotificationEmail()` function always checks:
```ts
if (!process.env.RESEND_API_KEY) {
  req.log.warn('RESEND_API_KEY not set — email notification skipped');
  return;
}
```

This means email sending degrades gracefully to a no-op when not configured — no crashes, no errors surfaced to users.

---

### Q2 — `users` Table Email Preferences Column

**Decision: Add `emailNotificationsEnabled` column. Inspect first.**

After confirming no equivalent column exists:
```ts
// Add to users table
emailNotificationsEnabled: boolean('email_notifications_enabled').notNull().default(true),
```

Default `true` — all existing users opt in immediately. The `sendNotificationEmail()` check ensures no emails are sent until `RESEND_API_KEY` is configured.

---

### Q3 — Skills Storage Format for tsvector

**Decision: Inspect first. Build the tsvector expression based on actual type.**

After inspection:

**If skills is `text` (CSV or plain):**
```sql
to_tsvector('english', coalesce(bio, '') || ' ' || coalesce(skills, ''))
```

**If skills is `text[]` (PostgreSQL array):**
```sql
to_tsvector('english', coalesce(bio, '') || ' ' || coalesce(array_to_string(skills, ' '), ''))
```

**If skills is `jsonb`:**
```sql
to_tsvector('english', coalesce(bio, '') || ' ' || coalesce(skills::text, ''))
```

Document which expression was used in a comment in the route file.

---

### Q4 — tsvector Implementation Strategy

**Decision: Option B — compute inline in query. Add GIN index separately.**

No generated column. The full-text search is computed inline:

```ts
// In GET /api/freelancers handler, when req.query.q is present:
import { sql } from 'drizzle-orm';

const searchQuery = sanitiseSearchQuery(req.query.q as string);

// Add to where clause
sql`to_tsvector('english', coalesce(${freelancerProfiles.bio}, '') || ' ' || coalesce(array_to_string(${freelancerProfiles.skills}, ' '), ''))
    @@ to_tsquery('english', ${searchQuery})`
```

**GIN index — waived (validated 2026-06-08):** PostgreSQL rejects expression GIN indexes on `to_tsvector(regconfig, text)` because the function is STABLE, not IMMUTABLE. Search runs inline in the list handler using `to_tsvector('simple', …)` without an index — acceptable at current scale. See `lib/db/scripts/product-gaps-backfill.sql` for notes.

---

### Q5 — Completeness Score Fields

**Decision: Inspect first. Use exact column names found.**

After inspection, map fields to the scoring function:

```ts
// Pass avatarUrl from users table alongside freelancer profile fields.
export function calculateCompletenessScore(
  profile: FreelancerProfile,
  avatarUrl?: string | null,
): number {
  let score = 0;
  if (avatarUrl) score += 15;
  if (profile.bio && profile.bio.length >= 50) score += 20;
  if (profile.skills && hasMinSkills(profile.skills, 2)) score += 20;
  const rate = profile.paymentPreference === "daily" ? profile.dailyRate : profile.hourlyRate;
  if (rate && Number(rate) > 0) score += 15;
  if (profile.fieldOfWork) score += 15;
  if (profile.isAvailable !== null && profile.isAvailable !== undefined) score += 15;
  return score;
}

function hasMinSkills(skills: unknown, min: number): boolean {
  if (Array.isArray(skills)) return skills.length >= min;
  if (typeof skills === 'string') return skills.split(',').filter(Boolean).length >= min;
  return false;
}
```

Store in `artifacts/api-server/src/lib/completenessUtils.ts`.

---

### Q6 — `bookings.message` Column

**Decision: Inspect first. Add if missing.**

After inspection, if no `message`/`notes` column exists:
```ts
// Add to bookings table
message: text('message'),  // nullable, max 500 chars validated server-side
```

Validation in `POST /api/bookings`:
```ts
if (req.body.message && req.body.message.length > 500) {
  return res.status(400).json({ error: 'Message too long', code: 'MESSAGE_TOO_LONG' });
}
```

---

### Q7 — Pagination Breaking Change Management

**Decision: Update backend and frontend in the same implementation phase.**

The pagination breaking change for `GET /api/bookings`, `GET /api/agreements`, and `GET /api/meetings` must be handled atomically:

1. Update backend endpoint to return paginated response
2. Update OpenAPI spec
3. Run codegen — new hooks generated
4. Update ALL frontend components that consume the list hooks in the same task

Frontend components to update (confirmed from inspection):
- `artifacts/talentlock/src/pages/BookingsList.tsx`
- `artifacts/talentlock/src/pages/AgreementsList.tsx`
- `artifacts/talentlock/src/pages/MeetingsList.tsx`
- `artifacts/talentlock/src/pages/Dashboard.tsx` (uses `useListBookings`)
- `artifacts/talentlock/src/pages/BookingDetail.tsx` (uses `useListAgreements`)

Never deploy the backend change without the frontend change.

---

### Q8 — Freelancer ID on Profile Page

**Decision: Use the ID from `useGetFreelancersMe()` hook.**

After inspection, the freelancer profile page likely calls `useGetFreelancersMe()`. The `id` field from that response is the freelancer's profile ID — the same ID used in `/f/:id`.

```tsx
const { data: myProfile } = useGetFreelancersMe();
const publicProfileUrl = `/f/${myProfile?.id}`;

<a href={publicProfileUrl} target="_blank" rel="noopener noreferrer">
  Preview public profile ↗
</a>
```

If the profile page uses `useGetUsersMe()` instead, check which field contains the freelancer profile ID.

---

### Q9 — Completeness Gate for Existing Users

**Decision: Option A — apply immediately with a banner on `/profile`.**

When this feature ships:
1. Run a one-time update to set `completenessScore` for all existing freelancers
2. Freelancers below 60% will no longer appear in Talent Vault results
3. They will see a prominent completeness banner on their `/profile` page

Backfill migration:
```sql
-- One-time backfill after adding completenessScore column
-- Run as part of Phase 1 migration
UPDATE freelancer_profiles fp SET completeness_score = (
  CASE WHEN u.avatar_url IS NOT NULL THEN 15 ELSE 0 END +
  CASE WHEN length(coalesce(fp.bio, '')) >= 50 THEN 20 ELSE 0 END +
  CASE WHEN coalesce(array_length(fp.skills, 1), 0) >= 2 THEN 20 ELSE 0 END +
  CASE WHEN (fp.payment_preference = 'daily' AND fp.daily_rate IS NOT NULL AND fp.daily_rate > 0)
         OR (fp.payment_preference != 'daily' AND fp.hourly_rate IS NOT NULL AND fp.hourly_rate > 0) THEN 15 ELSE 0 END +
  CASE WHEN fp.field_of_work IS NOT NULL THEN 15 ELSE 0 END +
  CASE WHEN fp.is_available IS NOT NULL THEN 15 ELSE 0 END
) FROM users u WHERE u.id = fp.user_id;
```

Adjust column names in the SQL to match actual schema found in inspection.

---

## Resolved Risks

---

### Risk 1 — Email Send Must Never Block

**Resolution: Fire-and-forget `.catch()` after `createNotification()`. Always create notification first.**

```ts
// In notification trigger point:
await createNotification(db, { userId, type, message, entityType, entityId });
// ^ awaited — notification must succeed

// Email is fire-and-forget:
sendNotificationEmail(db, userId, type, message, entityUrl)
  .catch(err => req.log.warn({ err }, 'notification email failed'));
```

---

### Risk 2 — Full-Text Search Query Injection

**Resolution: Sanitise before passing to Postgres.**

```ts
// In artifacts/api-server/src/lib/searchUtils.ts
export function sanitiseSearchQuery(q: string): string | null {
  const cleaned = q.trim()
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .split(/\s+/)
    .filter(s => s.length > 1) // ignore single chars
    .slice(0, 10)               // max 10 terms
    .join(' & ');
  return cleaned || null;
}
// "postgresql docker" → "postgresql & docker"
// "a" → null (too short — skip search filter)
// "" → null (empty — return all)
```

When `sanitiseSearchQuery` returns `null`: skip the full-text filter entirely (return all results).

---

### Risk 3 — Completeness Score Atomic With Profile Update

**Resolution: Score is always calculated and saved in the same `db.update()` call.**

```ts
// In PUT /api/freelancers/me
const updatedData = { ...sanitisedFields };
const score = calculateCompletenessScore({ ...currentProfile, ...updatedData });

await db.update(freelancerProfiles)
  .set({ ...updatedData, completenessScore: score })
  .where(eq(freelancerProfiles.id, internalUserId));
```

Never a separate update call. Never async recalculation.

---

### Risk 4 — Pagination Breaking Change

**Resolution: Backend + codegen + all frontend consumers updated in one phase (Phase 5).**

The task.md Phase 5 groups all three endpoints and all frontend consumer updates together. Never deploy half this change.

---

### Risk 5 — `emailNotificationsEnabled` Default

**Resolution: The email service function guards against sending when not configured.**

```ts
export async function sendNotificationEmail(...) {
  if (!process.env.RESEND_API_KEY) return; // no-op when not configured
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.emailNotificationsEnabled) return; // user opted out
  // proceed with send
}
```

Both guards must pass before any Resend API call is made.

---

### Risk 6 — Codegen Required After Multiple Spec Changes

**Resolution: Run codegen once after all OpenAPI spec changes are made in Phases 1–5.**

All OpenAPI changes across all 6 modules are made before running codegen — one codegen run covers all changes. Then typecheck. Then frontend.

---

## New Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `RESEND_API_KEY` | (unset) | Resend API key for transactional email |
| `EMAIL_FROM` | `noreply@talentlock.io` | From address for notification emails |

Add both to `.env.example`.

---

## New Utility Files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/lib/emailService.ts` | `sendNotificationEmail()` — Resend wrapper |
| `artifacts/api-server/src/lib/searchUtils.ts` | `sanitiseSearchQuery()` — full-text query sanitiser |
| `artifacts/api-server/src/lib/completenessUtils.ts` | `calculateCompletenessScore()` — profile scoring |
| `artifacts/api-server/src/lib/paginationUtils.ts` | `parsePagination()`, `paginatedResponse()` — shared list pagination |
| `lib/db/scripts/product-gaps-backfill.sql` | Completeness backfill + GIN index (run after schema push) |

---

## Pre-Implementation Checklist

- [x] `project.md` read in full this session
- [x] `spec/ProductGaps/features.md` read
- [x] `spec/ProductGaps/clarify.md` read
- [x] This `plan.md` read — all 9 questions and 6 risks resolved
- [x] `spec/ProductGaps/task.md` read — phase order understood
- [x] `spec/ProductGaps/UI.md` read — all component states understood
- [x] Codebase inspection complete — Q1–Q8 confirmed from actual files
- [x] `RESEND_API_KEY` available (or confirmed unavailable — email will be no-op)

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Schema — 3 new columns + backfill completeness (GIN index waived) | ✅ Complete — Neon validated 2026-06-08 |
| Phase 2 | Backend utilities — emailService, searchUtils, completenessUtils | ✅ Complete |
| Phase 3 | Backend routes — email prefs, search, completeness, booking message | ✅ Complete |
| Phase 4 | OpenAPI + codegen | ✅ Complete |
| Phase 5 | Backend pagination + frontend consumers update (atomic) | ✅ Complete |
| Phase 6 | Frontend — email prefs UI, search input, completeness banner, preview link | ✅ Complete |

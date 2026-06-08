# TalentLock — Task Breakdown: Product Gaps

## Summary

Six product gaps across six phases. Phase 5 (pagination) is the highest-risk because it is a breaking change — backend and frontend must be updated together. Phase 1 (schema) is the prerequisite for everything else.

---

## Phase 1 — Schema Changes

### Task 1.1 — Codebase Inspection

Run all inspection commands from `plan.md`. Document:
- Existing email infrastructure (any provider installed?)
- Exact column names on `users`, `freelancer_profiles`, `bookings`
- Skills column storage type on `freelancer_profiles`
- Current `GET /api/bookings` response shape (plain array or object?)
- Frontend hook consumers of the three list endpoints
- How freelancer ID is available on `/profile` page

### Task 1.2 — Add `emailNotificationsEnabled` to `users`

**File:** `lib/db/src/schema/` — same file as `users` table

Add if not present:
```ts
emailNotificationsEnabled: boolean('email_notifications_enabled').notNull().default(true),
```

### Task 1.3 — Add `completenessScore` to `freelancer_profiles`

**File:** `lib/db/src/schema/` — same file as `freelancerProfiles` table

Add if not present:
```ts
completenessScore: integer('completeness_score').notNull().default(0),
```

### Task 1.4 — Add `message` to `bookings`

**File:** `lib/db/src/schema/` — same file as `bookings` table

Add if not present (and if no equivalent column already exists):
```ts
message: text('message'),  // nullable
```

### Task 1.5 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify all three columns exist in Neon before proceeding.

### Task 1.6 — Backfill Completeness Scores

After migration, run the backfill SQL from `plan.md` Q9 to set initial completeness scores for all existing freelancers. Adjust column names to match actual schema:

```sql
UPDATE freelancer_profiles SET completeness_score = (
  CASE WHEN [photo_col] IS NOT NULL THEN 15 ELSE 0 END +
  CASE WHEN length(coalesce(bio, '')) >= 50 THEN 20 ELSE 0 END +
  CASE WHEN coalesce([skills_col]::text, '') != '' THEN 20 ELSE 0 END +
  CASE WHEN rate IS NOT NULL AND rate > 0 THEN 15 ELSE 0 END +
  CASE WHEN [field_col] IS NOT NULL THEN 15 ELSE 0 END +
  CASE WHEN is_available IS NOT NULL THEN 15 ELSE 0 END
);
```

### Task 1.7 — Add GIN Index for Full-Text Search

Run via a migration or directly in Neon:

```sql
CREATE INDEX IF NOT EXISTS idx_freelancer_fts
ON freelancer_profiles
USING gin(
  to_tsvector('english',
    coalesce(bio, '') || ' ' || coalesce([skills_col]::text, '')
  )
);
```

Use the actual skills column expression confirmed from inspection.

---

## Phase 2 — Backend Utilities

### Task 2.1 — Create `emailService.ts`

**File:** `artifacts/api-server/src/lib/emailService.ts` (create new)

Install Resend if not present:
```bash
cd artifacts/api-server && pnpm add resend
```

```ts
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendNotificationEmail(
  db: DB,
  userId: string,
  subject: string,
  message: string,
  ctaUrl: string
): Promise<void> {
  if (!resend) return; // no-op when RESEND_API_KEY not configured

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.emailNotificationsEnabled) return; // user opted out
  if (!user?.email) return; // no email on record

  const unsubscribeUrl = `${process.env.APP_URL}/api/users/me/notification-preferences?token=...`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'noreply@talentlock.io',
    to: user.email,
    subject,
    html: buildEmailHtml(message, ctaUrl, unsubscribeUrl),
  });
}

function buildEmailHtml(message: string, ctaUrl: string, unsubscribeUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1E3A5F;">TalentLock</h2>
      <p style="font-size: 16px; color: #1F2937;">${message}</p>
      <a href="${ctaUrl}" style="
        display: inline-block;
        background: #2E75B6;
        color: white;
        padding: 12px 24px;
        border-radius: 6px;
        text-decoration: none;
        font-size: 15px;
        margin: 16px 0;
      ">View in TalentLock</a>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #9CA3AF;">
        <a href="${unsubscribeUrl}" style="color: #9CA3AF;">Unsubscribe from email notifications</a>
      </p>
    </body>
    </html>
  `;
}
```

### Task 2.2 — Create `searchUtils.ts`

**File:** `artifacts/api-server/src/lib/searchUtils.ts` (create new)

Use the exact `sanitiseSearchQuery()` function from `plan.md` Risk 2.

### Task 2.3 — Create `completenessUtils.ts`

**File:** `artifacts/api-server/src/lib/completenessUtils.ts` (create new)

Use the exact `calculateCompletenessScore()` and `hasMinSkills()` functions from `plan.md` Q5. Adjust field names based on inspection.

---

## Phase 3 — Backend Route Updates

### Task 3.1 — Email Notification Hooks in Notification Triggers

**File:** `artifacts/api-server/src/routes/bookings.ts`, `agreements.ts`, `meetings.ts`, `reviews.ts`, `documents.ts`

At every existing `createNotification()` call, add a fire-and-forget email send immediately after:

```ts
// Example — booking created trigger
await createNotification(db, {
  userId: booking.freelancerId,
  type: 'booking_created',
  message: `"${employerName}" has sent you a booking request`,
  entityType: 'booking',
  entityId: booking.id,
});

// Add this immediately after:
const entityUrl = `${process.env.APP_URL}/bookings/${booking.id}`;
sendNotificationEmail(
  db,
  booking.freelancerId,
  'New booking request on TalentLock',
  `"${employerName}" has sent you a booking request`,
  entityUrl
).catch(err => req.log.warn({ err }, 'notification email failed'));
```

Apply to all 15 notification trigger points.

### Task 3.2 — Add Email Preferences Endpoint

**File:** `artifacts/api-server/src/routes/users.ts`

Add `PATCH /api/users/me/notification-preferences`:

```ts
// Request body: { emailNotificationsEnabled: boolean }
await db.update(users)
  .set({ emailNotificationsEnabled: req.body.emailNotificationsEnabled })
  .where(eq(users.id, internalUserId));
return res.json({ success: true });
```

### Task 3.3 — Add Full-Text Search to `GET /api/freelancers`

**File:** `artifacts/api-server/src/routes/freelancers.ts`

When `req.query.q` is present:

```ts
import { sanitiseSearchQuery } from '../lib/searchUtils';
import { sql } from 'drizzle-orm';

const searchQ = req.query.q ? sanitiseSearchQuery(req.query.q as string) : null;

// Add to where clause when searchQ is non-null:
if (searchQ) {
  whereConditions.push(
    sql`to_tsvector('english',
      coalesce(${freelancerProfiles.bio}, '') || ' ' ||
      coalesce(${freelancerProfiles.skills}::text, ''))
      @@ to_tsquery('english', ${searchQ})`
  );
}
```

### Task 3.4 — Add Completeness Filter to `GET /api/freelancers`

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Add to where clause (always applied):
```ts
gte(freelancerProfiles.completenessScore, 60)
```

### Task 3.5 — Update Completeness Score on Profile Save

**File:** `artifacts/api-server/src/routes/freelancers.ts`

In `PUT /api/freelancers/me`, after sanitising inputs and before the db.update call:

```ts
import { calculateCompletenessScore } from '../lib/completenessUtils';

const score = calculateCompletenessScore({ ...currentProfile, ...sanitisedFields });
await db.update(freelancerProfiles)
  .set({ ...sanitisedFields, completenessScore: score })
  .where(eq(freelancerProfiles.id, internalUserId));
```

### Task 3.6 — Add Booking Message to `POST /api/bookings`

**File:** `artifacts/api-server/src/routes/bookings.ts`

In `POST /api/bookings`, add message validation and storage:

```ts
import { sanitiseText } from '../lib/sanitise';

if (req.body.message && req.body.message.length > 500) {
  return res.status(400).json({ error: 'Message too long', code: 'MESSAGE_TOO_LONG' });
}

const message = req.body.message ? sanitiseText(req.body.message) : null;
// Include in the booking insert values
```

Add `message` to the `GET /api/bookings/:id` response.

---

## Phase 4 — OpenAPI Spec + Codegen

**File:** `lib/api-spec/openapi.yaml`

Update/add:
- `GET /api/freelancers` — add `?q=string` query param
- `POST /api/bookings` — add `message?: string` to request body
- `GET /api/bookings/:id` — add `message: string | null` to response
- `GET /api/bookings` — update response from array to paginated object
- `GET /api/agreements` — same pagination update
- `GET /api/meetings` — same pagination update
- `PATCH /api/users/me/notification-preferences` — new endpoint

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 5

---

## Phase 5 — Pagination (Backend + Frontend — Atomic)

> **CRITICAL:** Do not deploy Phase 5 backend changes without also completing all Phase 5 frontend updates in the same deployment. Partial deployment will break the UI.

### Task 5.1 — Update `GET /api/bookings` Response

**File:** `artifacts/api-server/src/routes/bookings.ts`

Change from returning a plain array to paginated response:

```ts
const page = parseInt(req.query.page as string) || 1;
const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
const offset = (page - 1) * pageSize;

const [rows, countResult] = await Promise.all([
  db.select().from(bookings).where(whereClause).limit(pageSize).offset(offset),
  db.select({ count: count() }).from(bookings).where(whereClause),
]);

const total = Number(countResult[0]?.count ?? 0);
return res.json({
  data: rows,
  total,
  page,
  pageSize,
  totalPages: Math.ceil(total / pageSize),
});
```

### Task 5.2 — Update `GET /api/agreements` and `GET /api/meetings`

Same pagination pattern as Task 5.1, applied to both routes.

### Task 5.3 — Update All Frontend Consumers

**Files:** All components confirmed from inspection that call `useGetBookings()`, `useGetAgreements()`, `useGetMeetings()`

For each component, change:
```tsx
// Before
const { data: bookings } = useGetBookings();
bookings?.map(b => ...)

// After
const { data } = useGetBookings();
const bookings = data?.data ?? [];
const totalPages = data?.totalPages ?? 1;
```

Add pagination controls (Prev / Page N of M / Next) to each list page. See `UI.md` Component 4 for full spec.

---

## Phase 6 — Frontend

### Task 6.1 — Add Profile Preview Link (Module 6)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

One-line addition after confirming freelancer ID source from inspection:

```tsx
{userRole === 'freelancer' && myProfile?.id && (
  <a
    href={`/f/${myProfile.id}`}
    target="_blank"
    rel="noopener noreferrer"
    className="text-sm text-indigo-600 hover:underline flex items-center gap-1"
  >
    Preview public profile
    <ExternalLink className="h-3 w-3" />
  </a>
)}
```

Placement: in the profile page header, next to the Save/Edit button.

### Task 6.2 — Add Search Input to Talent Vault (Module 2)

**File:** `artifacts/talentlock/src/pages/Freelancers.tsx`

Add keyword search input above or inside the existing filter panel:

```tsx
const [searchQuery, setSearchQuery] = useState('');
const [debouncedQuery] = useDebounce(searchQuery, 400); // debounce 400ms

const { data } = useGetFreelancers({
  q: debouncedQuery || undefined,
  // ... existing filters
});
```

See `UI.md` Component 2 for full spec.

### Task 6.3 — Add Completeness Banner to Profile (Module 3)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

Show banner when `userRole === 'freelancer'` and `myProfile.completenessScore < 60`:

See `UI.md` Component 3 for full spec.

### Task 6.4 — Add Email Notification Toggle to Profile (Module 1)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

Add email preferences toggle in the settings/preferences section of the profile page:

See `UI.md` Component 1 for full spec.

### Task 6.5 — Add Booking Message Field (Module 4)

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

Add optional message textarea to the booking creation form:

See `UI.md` Component 5 for full spec.

---

## Acceptance Criteria

- [ ] `users.emailNotificationsEnabled` column exists (default true)
- [ ] `freelancer_profiles.completenessScore` column exists
- [ ] `bookings.message` column exists (nullable)
- [ ] Backfill completed — all existing freelancers have non-null completeness score
- [ ] GIN index created on freelancer full-text search vector
- [ ] `emailService.ts` created — no-op when `RESEND_API_KEY` not set
- [ ] Email send is fire-and-forget — never blocks in-app notification
- [ ] Email not sent when `emailNotificationsEnabled = false`
- [ ] `sanitiseSearchQuery()` strips special chars, limits terms to 10
- [ ] `calculateCompletenessScore()` returns correct score (0–100)
- [ ] Score saved atomically with profile update
- [ ] `GET /api/freelancers?q=postgresql` returns only matching freelancers
- [ ] `GET /api/freelancers` hides freelancers with score < 60
- [ ] `POST /api/bookings` accepts optional `message` field (max 500 chars)
- [ ] `GET /api/bookings/:id` includes `message` in response
- [ ] `PATCH /api/users/me/notification-preferences` toggles email preference
- [ ] `GET /api/bookings` returns `{ data, total, page, pageSize, totalPages }`
- [ ] `GET /api/agreements` same paginated response
- [ ] `GET /api/meetings` same paginated response
- [ ] All frontend list consumers updated to use `data.data`
- [ ] Pagination controls visible on `/bookings`, `/agreements`, `/meetings` list pages
- [ ] "Preview public profile" link on `/profile` opens `/f/:id` in new tab
- [ ] Keyword search input visible on `/freelancers`
- [ ] Debounced — no API call on every keystroke
- [ ] Completeness banner visible on `/profile` when score < 60
- [ ] Banner shows current score and lists missing fields
- [ ] Banner disappears when score reaches 60+
- [ ] Email toggle visible on `/profile` settings
- [ ] Booking message textarea on `/freelancers/:id` booking flow
- [ ] Message visible on `/bookings/:id` for both parties
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7
Task 2.1 → 2.2 → 2.3
Task 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6
Task 4 (OpenAPI + codegen — after all Phase 3 routes confirmed)
Task 5.1 → 5.2 → 5.3 (ALL must be deployed together — atomic)
Task 6.1 → 6.2 → 6.3 → 6.4 → 6.5
```

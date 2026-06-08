# TalentLock — Clarification & Verification: Product Gaps

This file audits each module in `features.md` against `project.md` to surface gaps, risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `users` table exists | Confirmed in `project.md` |
| `freelancer_profiles` table exists with `bio`, `skills`, `rate` | Confirmed |
| `bookings` table exists with `PATCH /api/bookings/:id` | Confirmed |
| `agreements` table, `GET /api/agreements` exists | Confirmed |
| `meetings` table, `GET /api/meetings` exists | Confirmed |
| `notifications` table + `createNotification()` utility exists | Confirmed — Notifications Centre built |
| `GET /api/freelancers` accepts query params already (field, rate, availableFrom) | Confirmed |
| `/profile` authenticated frontend route | Confirmed |
| `/freelancers` Talent Vault route | Confirmed |
| `/bookings`, `/agreements`, `/meetings` list pages | Confirmed |
| `/freelancers/:id` booking flow | Confirmed |
| `GET /api/reviews/freelancer/:id` already uses pagination | Confirmed — consistent pattern to follow |
| `GET /api/notifications` already uses pagination | Confirmed — consistent pattern |
| Drizzle ORM, no raw SQL | Confirmed |
| Pino logging (`req.log.warn`) | Confirmed |
| Orval codegen pattern | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Which Transactional Email Provider?

**Question:** Module 1 specifies Resend as the primary provider. Is a Resend account already set up? Is an API key available? Is there any existing email infrastructure in the codebase?

**Impact:** If no provider is set up, the implementation cannot send real emails. If a different provider (SendGrid, Postmark) is already available, use that instead of adding a new one.

**Recommendation:**
```bash
cat artifacts/api-server/package.json | grep -i "resend\|sendgrid\|nodemailer\|postmark\|email"
grep -rn "email\|smtp\|resend\|sendgrid" artifacts/api-server/src/ | grep -v ".test." | head -10
```

---

### Q2 — What Are the Existing `users` Table Column Names?

**Question:** Module 1 adds `emailNotificationsEnabled` to `users`. What are the existing column names — specifically, is there already any notification preference column?

**Recommendation:**
```bash
grep -A 20 "users\s*=" lib/db/src/schema/*.ts
```

---

### Q3 — How Are `freelancer_profiles.skills` Stored?

**Question:** Module 2 (keyword search) builds a `tsvector` from `bio` and `skills`. How are skills stored — as a text array, a JSON array, or a comma-separated string? The `tsvector` generation SQL must handle the actual column type.

**Impact:** The `tsvector` expression is different for each storage type:
- Text array: `array_to_string(skills, ' ')`
- JSON: `skills::text`
- Text/CSV: `coalesce(skills, '')`

**Recommendation:**
```bash
grep -A 40 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "skill"
```

---

### Q4 — Does PostgreSQL Version Support Generated `tsvector` Columns?

**Question:** Module 2 adds a generated `tsvector` column using `GENERATED ALWAYS AS`. This requires PostgreSQL 12+. Neon uses PostgreSQL 15 — but confirm Drizzle's support for generated columns.

**Options if generated columns are not supported in Drizzle:**
- **(A)** Maintain the `tsvector` manually — update it via a trigger or in the route handler when bio/skills change
- **(B)** Compute the full-text search inline in the query without a stored column

**Recommendation:** Option B for initial implementation — compute inline:
```sql
WHERE to_tsvector('english', coalesce(bio, '') || ' ' || coalesce(skills_text, ''))
  @@ to_tsquery('english', $query)
```

Then add a GIN index separately. Simpler than maintaining a generated column.

---

### Q5 — What Fields Does `freelancer_profiles` Have for Completeness Scoring?

**Question:** Module 3 scores completeness on: photo, bio, skills, rate, field of work, and availability. What are the exact column names for each of these fields?

**Impact:** The `calculateCompletenessScore()` function references exact column names. Wrong names = score always 0.

**Recommendation:**
```bash
grep -A 60 "freelancerProfiles\s*=" lib/db/src/schema/*.ts
```

---

### Q6 — Does `bookings` Have a `message` Column Already?

**Question:** Module 4 adds a `message` column to `bookings`. Does it already exist under this or any other name?

**Recommendation:**
```bash
grep -A 50 "bookings\s*=" lib/db/src/schema/*.ts | grep -i "message\|note\|description\|context"
```

---

### Q7 — What Is the Current Response Shape of `GET /api/bookings`, `GET /api/agreements`, `GET /api/meetings`?

**Question:** Module 5 changes the response shape of these three list endpoints from a plain array to `{ data, total, page, pageSize, totalPages }`. Are any existing frontend components consuming these endpoints in a way that would break with the new shape?

**Impact:** If the frontend currently does `const bookings = data` (expecting an array), changing to `const bookings = data.data` is a breaking change for every component that uses the list hook.

**Recommendation:**
```bash
grep -rn "useGetBookings\|useGetAgreements\|useGetMeetings" artifacts/talentlock/src/ | head -20
```

---

### Q8 — Where Is the Freelancer's Own ID Available on the `/profile` Page?

**Question:** Module 6 needs the freelancer's `id` to construct the `/f/:id` URL. Is this available from `useGetFreelancersMe()`, `useGetUsersMe()`, or some other hook?

**Impact:** The preview link cannot be constructed without the ID.

**Recommendation:**
```bash
grep -n "useGetFreelancersMe\|useGetUsersMe\|freelancerId\|myProfile" \
  artifacts/talentlock/src/pages/Profile.tsx | head -20
```

---

### Q9 — Should the Completeness Gate Apply to Already-Listed Freelancers?

**Question:** When Module 3 adds `gte(freelancerProfiles.completenessScore, 60)` to `GET /api/freelancers`, existing freelancers with score < 60 will disappear from Talent Vault results. This could be jarring for freelancers who were previously visible.

**Options:**
- **(A)** Apply immediately — existing incomplete profiles disappear from Talent Vault
- **(B)** Add a grace period flag — existing freelancers get 30 days before the gate applies
- **(C)** Show incomplete freelancers to employers with a visual "Incomplete profile" badge but don't fully hide them

**Recommendation:** Option A — apply immediately. Incomplete profiles harm the employer experience more than they help freelancers. The banner on `/profile` gives clear guidance on what to complete.

---

## ⚠️ Risks & Notes

### Risk 1 — Email Send Must Never Block In-App Notification

The `sendNotificationEmail()` call must be fire-and-forget (`.catch()`) — the same pattern as `createNotification()`. If the email service is down, the in-app notification must still be created. The order is always: create notification first, then send email.

### Risk 2 — Full-Text Search Query Injection

`to_tsquery()` will throw a PostgreSQL error if the input contains unsupported characters (e.g. `!`, `&` without context, or malformed phrases). The search query must be sanitised before passing to Postgres:

```ts
function sanitiseSearchQuery(q: string): string {
  return q.trim()
    .replace(/[^a-zA-Z0-9\s\-]/g, '') // strip special chars
    .split(/\s+/)
    .filter(Boolean)
    .join(' & '); // AND all terms
}
// "postgresql docker" → "postgresql & docker"
```

### Risk 3 — Completeness Score Must Update Atomically With Profile Changes

When `PUT /api/freelancers/me` saves profile changes, the `completenessScore` must be recalculated and saved in the same update. If it's calculated separately (in a second query), there's a window where the score is stale.

```ts
const score = calculateCompletenessScore(updatedProfile);
await db.update(freelancerProfiles)
  .set({ ...updatedFields, completenessScore: score })
  .where(eq(freelancerProfiles.id, internalUserId));
```

### Risk 4 — Pagination Breaking Change

Changing `GET /api/bookings` from returning `Booking[]` to `{ data: Booking[], total, page, ... }` is a breaking change. Every frontend component that calls `useGetBookings()` and does `data.map(...)` will break. The frontend migration (Task 5.3) must happen in the same PR as the backend change — never separately.

### Risk 5 — `emailNotificationsEnabled` Default for Existing Users

Adding `emailNotificationsEnabled boolean default true` to `users` means all existing users will have email notifications enabled immediately. If Resend is not yet configured, this could cause a flood of email attempts. The `sendNotificationEmail()` function must check this flag AND check that `RESEND_API_KEY` is set in the environment before attempting any email send.

### Risk 6 — Codegen Required for Modules 1, 2, 4, 5

Modules 1, 2, 4, and 5 all change the OpenAPI spec (new query params, new request fields, changed response shapes). Codegen must be run after all OpenAPI changes before any frontend work.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Email provider availability | Task 1.1 (email service setup) |
| Q2 | `users` table columns | Task 1.2 (schema change) |
| Q3 | `skills` column storage format | Task 2.1 (tsvector expression) |
| Q5 | `freelancer_profiles` completeness fields | Task 3.1 (score function) |
| Q6 | `bookings.message` exists already? | Task 4.1 (schema change) |
| Q7 | Frontend consumers of list endpoints | Task 5.3 (breaking change) |
| Q8 | Freelancer ID on profile page | Task 6.1 (preview link) |

Questions Q4, Q9 are resolved in `plan.md`.

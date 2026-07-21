# TalentLock — Validation: Freelancer Watchlist

Run after all `task.md` phases complete.

---

## Phase 1 — Database

> **Pre-push reconciliation (mandatory):** If Drizzle warns it will **drop** `onboarding_role`, `expiry_date`, `teaching_licence_alert_stage`, or similar columns, **cancel the push**. That means local schema files are stale relative to Neon. Do not use `--force`.
>
> ```bash
> # 1. Sync code with main (schema must include onboarding + credential expiry + watchlist columns)
> git fetch origin && git merge origin/main
>
> # 2. Verify local schema markers + optional DB check
> DATABASE_URL='...' pnpm --filter @workspace/db run verify-schema
>
> # 3. Push only when verify-schema passes and Drizzle shows ADD-only changes
> DATABASE_URL='...' pnpm --filter @workspace/db run push
> ```
>
> Expected **additive-only** change for this feature: `saved_freelancers.notes`, `saved_freelancers.last_alert_at`.

- [ ] V1.0 · [ ] V1.1

### V1.0 — Schema parity script passes

```bash
pnpm --filter @workspace/db run verify-schema
```

With `DATABASE_URL` set, confirms local schema files declare all columns Neon already has, and lists pending additive columns.

### V1.1 — Columns exist

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'saved_freelancers'
  AND column_name IN ('notes', 'last_alert_at');
```

Expected: 2 rows (`notes` text, `last_alert_at` timestamp with time zone).

---

## Phase 2 — Backend

- [ ] V2.1 · [ ] V2.2 · [ ] V2.3 · [ ] V2.4 · [ ] V2.5 · [ ] V2.6 · [ ] V2.7 · [ ] V2.8

### V2.1 — List returns WatchlistItem shape

As an authenticated employer with ≥ 1 saved freelancer:

```bash
curl -s -H "Authorization: Bearer $EMPLOYER_TOKEN" \
  http://localhost:8080/api/freelancers/saved | jq '.[0] | keys'
```

Expected keys include: `id`, `freelancerId`, `savedAt`, `freelancer`. Nested `freelancer` has `name`, `hourlyRate`, `isAvailable`.

### V2.2 — Toggle save / unsave

```bash
# Save
curl -s -X POST -H "Authorization: Bearer $EMPLOYER_TOKEN" \
  http://localhost:8080/api/freelancers/1/save
# Expected: { "saved": true }

# Unsave
curl -s -X POST -H "Authorization: Bearer $EMPLOYER_TOKEN" \
  http://localhost:8080/api/freelancers/1/save
# Expected: { "saved": false }
```

### V2.3 — Notes PATCH

1. Save freelancer ID 1.
2. Patch notes:

```bash
curl -s -X PATCH -H "Authorization: Bearer $EMPLOYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Strong React candidate"}' \
  http://localhost:8080/api/freelancers/1/watchlist
# Expected: { "notes": "Strong React candidate" }
```

3. Patch when not saved → `404`.
4. Notes > 500 chars → `400`.

### V2.4 — Plan limit (starter)

Seed an `employer_starter` account with 25 saved freelancers. Attempt to save a 26th:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $STARTER_TOKEN" \
  http://localhost:8080/api/freelancers/99/save
# Expected: 402
```

Body includes `code: "PLAN_LIMIT"` and `planNeeded`.

Removing one and re-adding → `200 { saved: true }`.

### V2.5 — Team member guard

As an active enterprise team member:

```bash
curl -s -H "Authorization: Bearer $TEAM_MEMBER_TOKEN" \
  http://localhost:8080/api/freelancers/saved
# Expected: []

curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TEAM_MEMBER_TOKEN" \
  http://localhost:8080/api/freelancers/1/save
# Expected: 403
```

### V2.6 — Availability change notification

1. Employer A saves Freelancer B.
2. Set Freelancer B `isAvailable = false`.
3. `PUT /api/freelancers/me` as B with `isAvailable: true`.
4. Check employer A notifications:

```sql
SELECT type, message FROM notifications
WHERE user_id = <employer_a_id>
ORDER BY created_at DESC LIMIT 1;
```

Expected: `type = 'watchlist_update'`, message contains "now available".

5. Repeat within 24 h → no second notification (`last_alert_at` debounce).

### V2.7 — Rate change notification

1. Employer A saves Freelancer B (rate £100/hr).
2. B updates rate to £110/hr (+10%) via `PUT /api/freelancers/me`.
3. Employer A receives `watchlist_update` with "updated their rate".
4. B updates rate to £102/hr (+2% from original) within 24 h → no notification (below 5% threshold from last known + debounce).

### V2.8 — Unit tests

```bash
pnpm --filter @workspace/api-server run test -- watchlistAlerts watchlistLimits
```

Expected: all pass.

### V2.9 — Integration tests

```bash
pnpm --filter @workspace/api-server run test -- tests/integration/watchlist
```

Expected: all pass (or skip if `DATABASE_URL_TEST` not configured in CI).

---

## Phase 3 — Frontend

- [ ] V3.1 · [ ] V3.2 · [ ] V3.3 · [ ] V3.4 · [ ] V3.5

### V3.1 — Watchlist tab visible

1. Sign in as non-enterprise employer.
2. Navigate to `/freelancers`.
3. Confirm `[Search results] [Watchlist (0)]` tabs visible even with empty watchlist.

### V3.2 — Save and view

1. Save a freelancer from search results (heart fills rose).
2. Click Watchlist tab.
3. Freelancer card appears with `savedAt` ordering.
4. Expand notes → type note → Save → preview shows truncated text.

### V3.3 — Deep link

Navigate to `/freelancers?view=watchlist` → Watchlist tab active.

### V3.4 — Dashboard card

1. With ≥ 1 saved freelancer, `/dashboard` shows "Your Watchlist" card.
2. Shows up to 3 names.
3. "View watchlist →" opens `/freelancers?view=watchlist`.
4. Remove all saves → card disappears.

### V3.5 — Plan limit redirect

Starter account at limit: click heart on new freelancer → redirected to `/pricing`.

### V3.6 — Enterprise unchanged

Enterprise team member: sees `Team Shortlist` tab only, no personal Watchlist tab. Heart adds to team shortlist.

---

## Security

- [ ] S1 · [ ] S2 · [ ] S3 · [ ] S4

### S1 — Auth required

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/freelancers/saved
# Expected: 401
```

### S2 — Employer isolation

Employer A cannot PATCH notes on Employer B's watchlist entry (404 — freelancer not on *their* watchlist).

### S3 — Freelancer blocked

Freelancer token on `POST /freelancers/:id/save` → `403`.

### S4 — Notes sanitisation

PATCH with `<script>alert(1)</script>` in notes → stored value has HTML stripped/escaped (verify via GET saved list).

---

## Regression

- [ ] R1 · [ ] R2 · [ ] R3 · [ ] R4

### R1 — Team shortlist unaffected

Enterprise team shortlist CRUD still works (`GET/POST/DELETE /api/team/shortlist`).

### R2 — Talent Vault search unaffected

`GET /api/freelancers` filters, keyword search, and completeness gate unchanged.

### R3 — Freelancer profile update unaffected

`PUT /api/freelancers/me` still recalculates `completenessScore`; watchlist hook does not block response.

### R4 — Typecheck

```bash
pnpm run typecheck
```

Expected: zero errors.

---

## Sign-Off Table

| Phase | Description | Status | Date | Reviewer |
|-------|-------------|--------|------|----------|
| 1 | Database | ⬜ | | |
| 2 | Backend | ⬜ | | |
| 3 | Frontend | ⬜ | | |
| 4 | Security + Regression | ⬜ | | |

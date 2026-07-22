# TalentLock — Validation Guide: Post-Engagement AI Debrief

Run after all `task.md` phases complete. Both implementer and reviewer should execute independently.

---

## Phase 1 Validation — Database

### V1.1 — New columns on `bookings`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bookings'
  AND column_name IN ('debrief_content', 'debrief_generated_at', 'debrief_regenerated_at');
```

- [ ] `debrief_content` — `jsonb`, nullable
- [ ] `debrief_generated_at` — `timestamp with time zone`, nullable
- [ ] `debrief_regenerated_at` — `timestamp with time zone`, nullable

### V1.2 — Schema parity script

```bash
pnpm --filter @workspace/db run verify-schema
```

- [ ] Passes with Post-Engagement AI Debrief manifest entry

### V1.3 — Existing data unaffected

```sql
SELECT COUNT(*) FROM bookings WHERE debrief_content IS NOT NULL;
```

- [ ] Returns `0` immediately after migration (no backfill)

---

## Phase 2 Validation — Backend

### V2.1 — Token feature registered

```bash
grep "booking_debrief" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] Present in `TokenFeature` union and `TOKEN_FEATURES` array

### V2.2 — Notification type registered

```bash
grep "booking_debrief_ready" artifacts/api-server/src/lib/createNotification.ts
```

- [ ] `BOOKING_DEBRIEF_READY` constant exists

### V2.3 — Auto-trigger on completion

Prerequisites: test employer + freelancer with an `active` booking.

```bash
curl -X PATCH http://localhost:8080/api/bookings/<id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

- [ ] PATCH response < 500ms (debrief is fire-and-forget)
- [ ] After ~15–30s, `GET /api/bookings/<id>` shows `hasDebrief: true`
- [ ] `debrief_content` populated in DB

### V2.4 — Debrief only fires once per completion transition

Re-PATCH same booking with `status: "completed"` when already completed:

- [ ] `debriefGeneratedAt` unchanged — no duplicate auto-generation

### V2.5 — Status re-fetch guard

PATCH to `completed`, then immediately PATCH back to `active` (race test):

- [ ] If generator runs after revert, `debrief_content` remains null OR generator exits without write
- [ ] No debrief cached for non-completed booking

### V2.6 — `GET /api/bookings/:id/debrief` — employer slice

```bash
curl http://localhost:8080/api/bookings/<id>/debrief \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] 200 with `debrief.engagementSnapshot`, `debrief.outcomeSummary`, etc.
- [ ] Response does NOT include freelancer-only fields (`whatYouDelivered`, `profileSuggestions`)
- [ ] Includes `disclaimer` string

### V2.7 — `GET /api/bookings/:id/debrief` — freelancer slice

```bash
curl http://localhost:8080/api/bookings/<id>/debrief \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] 200 with freelancer sections only
- [ ] Response does NOT include `internalNotesTemplate` or `rehireRecommendation`

### V2.8 — IDOR protection

Second employer (not a participant) attempts GET:

- [ ] 403 Forbidden

Unauthenticated:

- [ ] 401 Unauthorized

Unknown booking id:

- [ ] 404 Not Found

### V2.9 — GET before ready

Booking `completed` but debrief not yet generated (immediate call):

- [ ] 404 `{ error: "Debrief not ready" }` or equivalent

### V2.10 — Manual regeneration

```bash
curl -X POST http://localhost:8080/api/bookings/<id>/debrief \
  -H "Authorization: Bearer <participant_token>"
```

- [ ] Returns 202 Accepted
- [ ] `debriefRegeneratedAt` updated in DB
- [ ] Second POST within 24h → 429 with `code: "DEBRIEF_REGEN_COOLDOWN"`

### V2.11 — Token quota

Employer at token limit attempts POST regenerate:

- [ ] 402 with `code: "TOKEN_LIMIT"` and `planNeeded`

### V2.12 — Token usage logged

```sql
SELECT feature, total_tokens FROM token_usage
WHERE feature = 'booking_debrief'
ORDER BY created_at DESC LIMIT 1;
```

- [ ] Row exists after generation
- [ ] Charged to employer `user_id`

### V2.13 — Notifications

After successful generation:

```sql
SELECT type, user_id, message FROM notifications
WHERE type = 'booking_debrief_ready'
ORDER BY created_at DESC LIMIT 2;
```

- [ ] One notification for employer user
- [ ] One notification for freelancer user
- [ ] `entity_type = 'booking'`, `entity_id = <booking_id>`

### V2.14 — Unit tests

```bash
pnpm --filter @workspace/api-server run test:unit -- bookingDebrief
```

- [ ] All pass

### V2.15 — Integration tests

```bash
pnpm --filter @workspace/api-server run test:integration -- debrief
```

- [ ] All pass (requires `DATABASE_URL_TEST` + Clerk)

### V2.16 — Typecheck

```bash
pnpm run typecheck
```

- [ ] Zero errors

---

## Phase 3 Validation — Frontend

### V3.1 — DebriefCard visible on completed booking

1. Log in as employer; open `/bookings/:id` where `status === completed`
2. Wait for debrief or click Generate

- [ ] Violet debrief card appears above review section
- [ ] Disclaimer shown first
- [ ] All employer sections render (Growth plan)

### V3.2 — Freelancer view

1. Log in as freelancer on same booking

- [ ] Indigo debrief card with freelancer sections
- [ ] No `internalNotesTemplate` or re-hire section visible

### V3.3 — Employer starter gating

1. Log in as `employer_starter` on completed booking with debrief

- [ ] Sections 1–2 visible
- [ ] Upgrade CTA replaces sections 3–5
- [ ] "View plans" links to `/pricing`

### V3.4 — Generating state

1. Click Generate on booking without debrief

- [ ] Spinner + "Generating your debrief…" shown
- [ ] Card transitions to loaded state within 60s

### V3.5 — Regenerate + cooldown

1. Click Regenerate on loaded debrief
2. Immediately click again

- [ ] First click enters generating state
- [ ] Second click within 24h shows cooldown message

### V3.6 — TOKEN_LIMIT inline

Mock or exhaust quota; click Regenerate:

- [ ] Inline error in card
- [ ] **No** redirect to `/pricing`

### V3.7 — Notification click-through

1. Click debrief notification in bell dropdown

- [ ] Navigates to `/bookings/:id`
- [ ] Debrief card visible

### V3.8 — Frontend unit tests

```bash
pnpm --filter @workspace/talentlock run test:unit
```

- [ ] Passes (no regressions)

---

## Security Validation

### S1 — Cross-party data isolation

- [ ] Freelancer API response never contains `internalNotesTemplate`
- [ ] Employer API response never contains `profileSuggestions` or `growthAreas`
- [ ] `GET /api/bookings/:id` never includes raw `debriefContent`

### S2 — Agreement content not in logs

Inspect server logs during generation:

- [ ] No full agreement `content` field in log output

### S3 — Message sanitisation

Booking with HTML in messages:

- [ ] Debrief generates without error
- [ ] No raw HTML rendered in UI sections

### S4 — Access control

- [ ] All debrief routes use `canAccessBooking()`
- [ ] Non-participant cannot POST regenerate

---

## GDPR Validation

### G1 — Account deletion nullifies debrief

1. Create completed booking with debrief
2. Submit account deletion for freelancer
3. After anonymisation completes:

```sql
SELECT debrief_content, debrief_generated_at
FROM bookings WHERE id = <booking_id>;
```

- [ ] All three debrief columns are `NULL`

---

## Regression Validation

### R1 — Booking completion still works

PATCH to `completed`:

- [ ] Freelancer `isAvailable` set to `true`
- [ ] `currentBookingId` cleared
- [ ] Availability block deleted (fire-and-forget)
- [ ] Status notification still sent

### R2 — Review flow unchanged

- [ ] Employer can still submit review after debrief loads
- [ ] Review form not blocked by debrief errors

### R3 — Meeting brief unaffected

Confirm meeting on test meeting:

- [ ] Meeting brief still generates independently

### R4 — Cancelled bookings

PATCH booking to `cancelled`:

- [ ] No debrief auto-generated
- [ ] `POST /debrief` on cancelled booking → 422

---

## Sign-Off Table

| Phase | Validator | Date | Status |
|-------|-----------|------|--------|
| 1 — Database | | | ⬜ |
| 2 — Backend | | | ⬜ |
| 3 — Frontend | | | ⬜ |
| Security | | | ⬜ |
| GDPR | | | ⬜ |
| Regression | | | ⬜ |

**Feature is not merged until every checkbox above is ✅ and sign-off table is complete.**

# TalentLock — Task Breakdown: Post-Engagement AI Debrief

Four implementation phases: Database → Backend → Frontend → Validation. Do not start Phase 2 before Phase 1 push is confirmed in Neon. Do not start Phase 3 before Phase 2 codegen and `pnpm run typecheck` pass.

---

## Phase 1 — Database

### Task 1.1 — Add debrief columns to `bookings`

**File:** `lib/db/src/schema/bookings.ts`

Add exported TypeScript interfaces per `plan.md` D1 (`EmployerDebrief`, `FreelancerDebrief`, `BookingDebriefContent`).

Add columns:

```ts
debriefContent: jsonb("debrief_content").$type<BookingDebriefContent>(),
debriefGeneratedAt: timestamp("debrief_generated_at", { withTimezone: true }),
debriefRegeneratedAt: timestamp("debrief_regenerated_at", { withTimezone: true }),
```

### Task 1.2 — Update schema parity manifest

**File:** `lib/db/verify-schema-parity.mjs`

Add `Post-Engagement AI Debrief` entry per `plan.md` D1.

### Task 1.3 — Push schema

```bash
pnpm --filter @workspace/db run verify-schema
pnpm --filter @workspace/db run push
```

Verify columns exist in Neon before Phase 2.

**Acceptance:**
- [ ] `debrief_content`, `debrief_generated_at`, `debrief_regenerated_at` exist on `bookings`
- [ ] Existing booking rows unaffected (all null)

---

## Phase 2 — Backend

### Task 2.1 — Debrief generator utility

**File:** `artifacts/api-server/src/lib/bookingDebriefGenerator.ts` (create)

Implement per `plan.md` D2:

- `loadDebriefContext(db, bookingId)` — booking, job, milestones, agreement meta, review, messages, profiles
- `buildBookingDebriefPrompt(context)` — system + user messages; JSON-only response instruction
- `validateDebriefResponse(raw)` — parse + validate structure; throw on invalid
- `generateBookingDebrief(db, bookingId, log)` — full pipeline with status re-fetch guard, token quota, OpenAI call, cache write, notifications, email

Export `DEBRIEF_DISCLAIMER` constant.

### Task 2.2 — Token feature

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

Add `"booking_debrief"` to `TokenFeature` union and `TOKEN_FEATURES` array.

### Task 2.3 — Notification type

**File:** `artifacts/api-server/src/lib/createNotification.ts`

Add `BOOKING_DEBRIEF_READY: "booking_debrief_ready"`.

### Task 2.4 — Hook auto-trigger on booking completion

**File:** `artifacts/api-server/src/routes/bookings.ts`

In existing `PATCH /bookings/:id`:

- Ensure `before.status` captured before update (already exists as `before`)
- After successful update, if `updated.status === 'completed' && before.status !== 'completed'`, fire-and-forget `generateBookingDebrief()`

### Task 2.5 — Debrief routes

**File:** `artifacts/api-server/src/routes/bookings.ts`

Add:

**`GET /bookings/:id/debrief`**
- `canAccessBooking()` guard
- 404 if `debriefGeneratedAt` is null
- Resolve caller role; return `{ debrief: EmployerDebrief | FreelancerDebrief, generatedAt, disclaimer }`
- Never return the other party's slice

**`POST /bookings/:id/debrief`**
- `canAccessBooking()` guard
- 422 if `status !== 'completed'`
- 429 if within `debriefRegeneratedAt` cooldown (`DEBRIEF_REGEN_COOLDOWN`)
- `checkTokenQuota` on employer user id → 402 `TOKEN_LIMIT`
- Fire-and-forget `generateBookingDebrief()`; set `debriefRegeneratedAt = now()` immediately (optimistic)
- Return 202 `{ message: "Debrief generation started" }`

**`GET /bookings/:id`** — add to response mapper:

```ts
debriefGeneratedAt: booking.debriefGeneratedAt,
hasDebrief: booking.debriefGeneratedAt != null,
```

Do not include `debriefContent` in list or detail responses.

### Task 2.6 — GDPR nullification

**File:** `artifacts/api-server/src/lib/accountDeletion.ts`

In `anonymiseUserData()`, nullify debrief columns on bookings for deleted user's profiles per `plan.md` D7.

### Task 2.7 — OpenAPI + codegen

**File:** `lib/api-spec/openapi.yaml`

- Add `booking_debrief` to token feature docs if listed
- Schemas: `EmployerDebrief`, `FreelancerDebrief`, `BookingDebriefResponse`, `DebriefRegenCooldownError`
- Paths: `GET/POST /bookings/{id}/debrief`
- Update `Booking` schema with `debriefGeneratedAt`, `hasDebrief`

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Post-codegen checks:
- [ ] `lib/api-zod/orval.config.ts` → `indexFiles: false`
- [ ] `lib/api-zod/src/index.ts` → exports only `./generated/api`

### Task 2.8 — Unit tests

**File:** `artifacts/api-server/tests/unit/bookingDebriefUtils.test.ts` (create)

- `validateDebriefResponse` — valid JSON, missing fields, invalid verdict enum
- `isWithinDebriefRegenCooldown` — boundary at 24h
- Role slice selection logic (if extracted)

### Task 2.9 — Integration tests

**File:** `artifacts/api-server/tests/integration/bookings/debrief.test.ts` (create)

- Unauthenticated GET → 401
- Non-participant GET → 403
- GET before generation → 404
- PATCH status to completed → debrief eventually populated (poll or mock OpenAI)
- Employer GET returns employer slice only (no `internalNotesTemplate` leak to freelancer test)
- POST regen → 202; second POST within 24h → 429
- IDOR: second employer cannot GET another booking's debrief

Use OpenAI mock from `tests/helpers/openaiMock.ts` if available.

---

## Phase 3 — Frontend

### Task 3.1 — DebriefCard component

**File:** `artifacts/talentlock/src/components/bookings/DebriefCard.tsx` (create)

Per `UI.md`:

- Props: `bookingId`, `hasDebrief`, `debriefGeneratedAt`, `userRole`, `employerPlanId`
- States: not-ready, generating (poll `useGetBooking` every 3s), loaded (`useGetBookingDebrief`), error
- Regenerate button → `usePostBookingDebrief` (202); handle 429 cooldown, 402 TOKEN_LIMIT inline
- Disclaimer always shown first
- Employer starter: sections 3–5 replaced with Growth upgrade CTA

### Task 3.2 — Booking detail integration

**File:** `artifacts/talentlock/src/pages/BookingDetail.tsx`

- Import `DebriefCard`
- Render when `booking.status === 'completed'` — **both** employer and freelancer
- Place below booking header / milestone section, **above** review form
- Do not block review submission on debrief load

### Task 3.3 — Notification UI

**File:** `artifacts/talentlock/src/components/NotificationItem.tsx`

- Icon: `ClipboardList` or `Sparkles` in violet accent
- Label badge: "Debrief ready"
- Route: existing `booking` entity type → `/bookings/:id`

### Task 3.4 — Typecheck

```bash
pnpm --filter @workspace/talentlock run typecheck
```

---

## Phase 4 — Documentation

### Task 4.1 — Update `project.md`

- Add debrief columns to `bookings` table description
- Add API routes `GET/POST /api/bookings/:id/debrief`
- Add feature #43 to Key Features Summary
- Add Cursor notes section per `plan.md`
- Add `bookingDebriefGenerator.ts` to utility registry

### Task 4.2 — Update `spec/spec.md`

- Feature index row: `Post-Engagement AI Debrief` → status per execution progress

---

## Acceptance Criteria (flat checklist)

- [ ] `bookings` has `debrief_content`, `debrief_generated_at`, `debrief_regenerated_at`
- [ ] Debrief auto-generates on first `status → completed` transition
- [ ] `GET /api/bookings/:id/debrief` returns role-filtered content only
- [ ] `POST /api/bookings/:id/debrief` returns 202; respects 24h cooldown
- [ ] `booking_debrief` token logged to employer account
- [ ] `BOOKING_DEBRIEF_READY` notification sent to both parties
- [ ] `DebriefCard` on `/bookings/:id` for completed bookings
- [ ] Employer starter sees upgrade CTA for sections 3–5
- [ ] `TOKEN_LIMIT` on regenerate shows inline error (no `/pricing` redirect)
- [ ] GDPR deletion nullifies debrief on affected bookings
- [ ] `pnpm run typecheck` passes
- [ ] Unit + integration tests pass
- [ ] `validation.md` sign-off complete

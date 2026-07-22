# TalentLock — Implementation Plan: Post-Engagement AI Debrief

> **Status: APPROVED — Ready for implementation**
> Resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, **this file wins**.

---

## Pre-Implementation Codebase Checks

```bash
# 1. Bookings schema — confirm status values and no existing debrief columns
grep -A 25 "bookingsTable" lib/db/src/schema/bookings.ts

# 2. PATCH /api/bookings/:id — locate status transition hook point
grep -n "completed\|BOOKING_COMPLETED" artifacts/api-server/src/routes/bookings.ts

# 3. Confirm booking_debrief NOT in token logger yet
grep "booking_debrief" artifacts/api-server/src/lib/tokenLogger.ts

# 4. Meeting brief generator — template for fire-and-forget + cache write
head -80 artifacts/api-server/src/lib/meetingBriefGenerator.ts

# 5. canAccessBooking usage in bookings route
grep -n "canAccessBooking" artifacts/api-server/src/routes/bookings.ts

# 6. Human messages by bookingId
grep -n "bookingId" artifacts/api-server/src/lib/conversationsUtils.ts
```

---

## Resolved Questions

### Q1 — Who Can Mark `completed`

**Decision:** Debrief fires on **any** `status → completed` transition regardless of which participant triggered it.

```ts
const BOOKING_COMPLETED_STATUS = "completed";

// In PATCH /api/bookings/:id — BEFORE db.update():
const before = /* existing row */;

// AFTER res.json() / fire-and-forget block:
if (updated.status === BOOKING_COMPLETED_STATUS && before.status !== BOOKING_COMPLETED_STATUS) {
  generateBookingDebrief(db, updated.id, req.log).catch((err) =>
    req.log.warn({ err, bookingId: updated.id }, "booking debrief generation failed"),
  );
}
```

---

### Q2 — Message History in Prompt

**Decision: Option B** — last 10 human_direct messages for `bookingId`, sanitised and truncated.

```ts
const MESSAGE_LIMIT = 10;
const MESSAGE_TRUNCATE = 500;

async function loadBookingMessages(db: DB, bookingId: number) {
  const [conv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.type, "human_direct"),
        eq(conversationsTable.bookingId, bookingId),
      ),
    )
    .limit(1);
  if (!conv) return [];

  const rows = await db
    .select({ content: messagesTable.content, senderType: messagesTable.senderType, createdAt: messagesTable.createdAt })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conv.id))
    .orderBy(desc(messagesTable.createdAt))
    .limit(MESSAGE_LIMIT);

  return rows.reverse().map((m) => ({
    sender: m.senderType,
    content: sanitiseText(m.content).slice(0, MESSAGE_TRUNCATE),
    at: m.createdAt?.toISOString() ?? "",
  }));
}
```

---

### Q3 — One OpenAI Call

**Decision: Option A** — single prompt returns `{ employer, freelancer, generatedAt }`.

```ts
export async function generateBookingDebrief(
  dbClient: DB,
  bookingId: number,
  log: Log,
): Promise<void> {
  const booking = await dbClient.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking[0] || booking[0].status !== "completed") return;

  // ... load context, checkTokenQuota, OpenAI call ...

  const parsed = validateDebriefResponse(rawJson);
  await dbClient.update(bookingsTable).set({
    debriefContent: parsed,
    debriefGeneratedAt: new Date(),
  }).where(eq(bookingsTable.id, bookingId));

  // notify both parties ...
}
```

---

### Q4 — Token Charge

**Decision:** Charge **employer user id** via `userIdFromEmployerProfileId(booking.employerId)`.

```ts
await logTokenUsage(dbClient, employerUserId, "booking_debrief", completion.usage);
```

Add `"booking_debrief"` to `TokenFeature` union and `TOKEN_FEATURES` array in `tokenLogger.ts`.

---

### Q5 — Plan Gating

**Decision: Option A** — server always generates full debrief. UI hides employer sections 3–5 for `employer_starter`.

Freelancer debrief: always show all 5 sections. No plan check on freelancer side.

---

### Q6 — Regeneration Debounce

**Decision:** 24-hour cooldown on manual `POST` only.

```ts
const DEBRIEF_REGEN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function isWithinDebriefRegenCooldown(regeneratedAt: Date | null): boolean {
  if (!regeneratedAt) return false;
  return Date.now() - regeneratedAt.getTime() < DEBRIEF_REGEN_COOLDOWN_MS;
}
```

On manual POST: if `isWithinDebriefRegenCooldown(booking.debriefRegeneratedAt)` → `429 { code: "DEBRIEF_REGEN_COOLDOWN" }`.

Update `debriefRegeneratedAt` on successful manual regeneration only (not auto-trigger).

---

### Q7 — GDPR

**Decision:** Nullify debrief columns on bookings involving deleted user.

```ts
// In anonymiseUserData() — after resolving profile ids:
await tx.update(bookingsTable)
  .set({ debriefContent: null, debriefGeneratedAt: null, debriefRegeneratedAt: null })
  .where(or(
    eq(bookingsTable.employerId, employerProfileId),
    eq(bookingsTable.freelancerId, freelancerProfileId),
  ));
```

---

### Q8 — No Auto-Refresh on Review Submit

**Decision:** Debrief is point-in-time. `performanceSignals` / review mention reflects state at generation. Manual regen only.

---

## Binding Implementation Decisions

### D1 — Schema Types on `bookings`

**File:** `lib/db/src/schema/bookings.ts`

Export interfaces (mirror `MeetingBrief` in `meetings.ts`):

```ts
export interface EmployerDebrief { /* per features.md */ }
export interface FreelancerDebrief { /* per features.md */ }
export interface BookingDebriefContent {
  employer: EmployerDebrief;
  freelancer: FreelancerDebrief;
  generatedAt: string;
}
```

Columns:

```ts
debriefContent: jsonb("debrief_content").$type<BookingDebriefContent>(),
debriefGeneratedAt: timestamp("debrief_generated_at", { withTimezone: true }),
debriefRegeneratedAt: timestamp("debrief_regenerated_at", { withTimezone: true }),
```

Add manifest entry to `lib/db/verify-schema-parity.mjs`:

```ts
{
  feature: "Post-Engagement AI Debrief",
  table: "bookings",
  schemaFile: "bookings.ts",
  schemaMarkers: [
    'debriefContent: jsonb("debrief_content")',
    'debriefGeneratedAt: timestamp("debrief_generated_at"',
    'debriefRegeneratedAt: timestamp("debrief_regenerated_at"',
  ],
  dbColumns: ["debrief_content", "debrief_generated_at", "debrief_regenerated_at"],
},
```

---

### D2 — Generator Utility

**File:** `artifacts/api-server/src/lib/bookingDebriefGenerator.ts` (create)

Exports:

- `generateBookingDebrief(db, bookingId, log)` — main pipeline
- `buildBookingDebriefPrompt(context)` — prompt builder
- `validateDebriefResponse(raw: string)` — Zod or manual JSON validation
- `DEBRIEF_DISCLAIMER` — constant string for frontend

Context loader aggregates: booking, job, milestones, agreement metadata, review (if any), messages, both profiles.

Re-fetch booking at pipeline start; exit if `status !== 'completed'`.

---

### D3 — Routes

**File:** `artifacts/api-server/src/routes/bookings.ts` (modify)

Hook auto-trigger in existing `PATCH /:id` handler.

**New routes in same file:**

```ts
router.get("/bookings/:id/debrief", async (req, res) => {
  // canAccessBooking → 401/403/404
  // if !debriefGeneratedAt → 404 { error: "Debrief not ready" }
  // return role-filtered slice only
});

router.post("/bookings/:id/debrief", async (req, res) => {
  // canAccessBooking
  // booking.status must be 'completed'
  // debounce check → 429
  // checkTokenQuota (employer user id) → 402 TOKEN_LIMIT
  // fire-and-forget generateBookingDebrief; set debriefRegeneratedAt
  // return 202
});
```

**Register order:** `GET /bookings/:id/debrief` and `POST /bookings/:id/debrief` BEFORE any conflicting routes — mount on same router; Express matches in registration order within file. Place **above** `GET /bookings/:id` if path collision — actually `/debrief` suffix is distinct from `/:id` only when registered as `/bookings/:id/debrief` — in Express, define debrief routes before `/:id` or use explicit path `/bookings/:id/debrief` which won't conflict with numeric id.

---

### D4 — Notifications

**File:** `artifacts/api-server/src/lib/createNotification.ts`

```ts
BOOKING_DEBRIEF_READY: "booking_debrief_ready",
```

Fire to both `userIdFromEmployerProfileId` and `userIdFromFreelancerProfileId` on successful cache write.

**File:** `artifacts/talentlock/src/lib/notificationRoutes.ts` — `entityType: "booking"` already routes to `/bookings/:id`.

**File:** `artifacts/talentlock/src/components/NotificationItem.tsx` — add icon + label for `booking_debrief_ready`.

---

### D5 — OpenAPI

**File:** `lib/api-spec/openapi.yaml`

Schemas: `BookingDebriefContent`, `EmployerDebrief`, `FreelancerDebrief`, `BookingDebriefResponse` (role-filtered wrapper).

Paths:

```yaml
/bookings/{id}/debrief:
  get: ...
  post: ...
```

Update `Booking` schema: `debriefGeneratedAt`, `hasDebrief`.

402 on POST for `TOKEN_LIMIT` and `PLAN_LIMIT` (if quota helper returns plan needed).

429 on POST for `DEBRIEF_REGEN_COOLDOWN`.

---

### D6 — Frontend

**File:** `artifacts/talentlock/src/components/bookings/DebriefCard.tsx` (create)

4 states: not-ready, generating (poll `hasDebrief`), loaded, error.

**File:** `artifacts/talentlock/src/pages/BookingDetail.tsx` (modify)

Render when `booking.status === 'completed'` for both roles.

Employer starter: hide sections 3–5 with upgrade CTA.

402 `TOKEN_LIMIT` on regenerate → **inline error** (not redirect to `/pricing`).

---

### D7 — Tests

**Unit:** `bookingDebriefUtils.test.ts` — `validateDebriefResponse`, cooldown helper, role slice mapper.

**Integration:** `tests/integration/bookings/debrief.test.ts` — auth, IDOR, trigger on completed, 404 until ready, cooldown 429.

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Database schema + verify-schema + push | ⬜ |
| 2 | Backend generator, routes, OpenAPI, codegen, tests | ⬜ |
| 3 | Frontend DebriefCard + BookingDetail + notifications | ⬜ |
| 4 | Validation.md checklist | ⬜ |

---

## Cursor Notes (add to `project.md` after implementation)

- Debrief auto-fires on `PATCH /api/bookings/:id` when `status` transitions to `completed` — fire-and-forget, never awaited
- `GET /api/bookings/:id/debrief` returns **role-filtered slice only** — never full `debriefContent` to client
- Token `booking_debrief` charged to **employer** account
- Re-fetch booking at start of `generateBookingDebrief()` — exit if `status !== 'completed'`
- Manual regen debounced 24h via `debriefRegeneratedAt` — auto-trigger on first completion is not debounced
- GDPR: nullify `debriefContent` + timestamps on account deletion for participant bookings
- Agreement `content` field must NEVER be passed to the debrief prompt

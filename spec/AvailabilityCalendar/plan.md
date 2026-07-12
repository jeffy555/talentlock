# TalentLock — Implementation Plan: Availability Calendar (Visual)

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Run all of these before writing any code. Report every finding.

```bash
# 1. Confirm isAvailable and availableFrom column names
grep -A 50 "freelancerProfiles\s*=" lib/db/src/schema/*.ts | grep -i "avail"

# 2. Check bookings for startDate/endDate columns
grep -A 60 "bookings\s*=" lib/db/src/schema/*.ts | grep -i "date\|start\|end"

# 3. Confirm booking status strings
grep -r "'confirmed'\|'active'\|'cancelled'\|'completed'" \
  artifacts/api-server/src/routes/bookings.ts | head -20

# 4. Check if react-day-picker is already installed
cat artifacts/talentlock/package.json | grep -i "day-picker\|calendar"

# 5. Check if availability_blocks table already exists
grep -r "availability_blocks\|availabilityBlocks" lib/db/src/schema/*.ts

# 6. Check how freelancer profile update works (for nextAvailableDate caching)
grep -n "isAvailable\|availableFrom" artifacts/api-server/src/routes/freelancers.ts | head -20
```

Document all findings in a comment block at the top of the new route and schema files.

---

## Resolved Questions

---

### Q1 — `isAvailable` / `availableFrom` Column Names

**Decision: Inspect first. Use exact names found.**

After inspection, define constants:
```ts
// Confirmed from schema inspection (Task 1.1)
// freelancerProfiles.isAvailable = [confirmed column]
// freelancerProfiles.availableFrom = [confirmed column]
// freelancerProfiles.nextAvailableDate = [add this column — Task 1.2]
```

---

### Q2 — Booking Date Range for Auto-Block

**Decision: Inspect first. Use the best available date range.**

**If `bookings.startDate` AND `bookings.endDate` exist:**
```ts
const blockStart = booking.startDate;
const blockEnd = booking.endDate;
```

**If only `bookings.startDate` exists:**
```ts
const blockStart = booking.startDate;
// blockEnd = max milestone dueDate for this booking
const blockEnd = await getMaxMilestoneDueDate(db, bookingId);
// If no milestones: blockEnd = startDate + 90 days (default assumption)
```

**If NO date columns exist:**
```ts
// Cannot determine date range — skip auto-block (plan.md Q9 resolution)
req.log.warn({ bookingId }, 'auto-block skipped — no date range on booking');
return; // do not create block
```

---

### Q3 — Booking Status Values

**Decision: Inspect first. Use exact strings. Define constants.**

```ts
// Confirmed from codebase inspection (Task 1.1)
const BOOKING_CONFIRMED_STATUS = '/* confirmed */'; // triggers auto-block CREATE
const BOOKING_CANCELLED_STATUS = '/* confirmed */'; // triggers auto-block DELETE
const BOOKING_COMPLETED_STATUS = '/* confirmed */'; // triggers auto-block DELETE
```

Auto-block is created when status changes TO `BOOKING_CONFIRMED_STATUS`.
Auto-block is deleted when status changes TO `BOOKING_CANCELLED_STATUS` or `BOOKING_COMPLETED_STATUS`.

---

### Q4 — Overlapping Block Handling in `nextAvailableDate`

**Decision: Merge overlapping and adjacent blocks before calculating first gap.**

```ts
export function calculateNextAvailableDate(
  isAvailable: boolean,
  availableFrom: Date | null,
  blocks: { startDate: Date; endDate: Date }[]
): Date | null {
  if (!isAvailable) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter to future/current blocks only
  const futureBlocks = blocks
    .filter(b => b.endDate >= today)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  // Merge overlapping and adjacent blocks
  const merged: { start: Date; end: Date }[] = [];
  for (const block of futureBlocks) {
    const last = merged[merged.length - 1];
    if (last && block.startDate <= addDays(last.end, 1)) {
      last.end = block.endDate > last.end ? block.endDate : last.end;
    } else {
      merged.push({ start: block.startDate, end: block.endDate });
    }
  }

  // Find first available date
  let candidate = today;

  // Also consider availableFrom
  if (availableFrom && availableFrom > candidate) {
    candidate = availableFrom;
  }

  // Walk through merged blocks to find first gap
  for (const block of merged) {
    if (candidate >= block.start && candidate <= block.end) {
      candidate = addDays(block.end, 1);
    }
  }

  return candidate;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
```

Store this in `artifacts/api-server/src/lib/availabilityUtils.ts`.

---

### Q5 — Employer Label Visibility

**Decision: Option B — show reason category, hide label text.**

`GET /api/availability/:freelancerId` (public) response per block:
```ts
{
  id: number,
  startDate: string,       // ISO date "2025-06-01"
  endDate: string,         // ISO date "2025-06-15"
  reason: 'booked' | 'holiday' | 'unavailable'
  // label is NOT included in this response
}
```

`GET /api/availability/me` (freelancer-only) response per block:
```ts
{
  id: number,
  startDate: string,
  endDate: string,
  reason: 'booked' | 'holiday' | 'unavailable',
  label: string | null,    // ← label included for own blocks only
  bookingId: string | null // ← included so freelancer knows which are auto
}
```

---

### Q6 — Calendar Library

**Decision: Option C — `react-day-picker`.**

If not already installed:
```bash
cd artifacts/talentlock && pnpm add react-day-picker
```

`react-day-picker` v8+ supports multi-range date highlighting via `modifiers` prop. It integrates naturally with the existing shadcn/ui DatePicker pattern. Custom CSS for block colours via `modifiersClassNames`.

---

### Q7 — Overlapping Manual Blocks

**Decision: Option A — allow overlaps.**

The backend does not reject overlapping manual blocks. The `nextAvailableDate` calculation merges them correctly (Q4). The calendar renders each block independently with its own colour band.

---

### Q8 — Maximum Future Block Date

**Decision: Option B — maximum 365 days from today.**

```ts
// Backend validation in POST /api/availability/me
const maxFutureDate = new Date();
maxFutureDate.setDate(maxFutureDate.getDate() + 365);

if (new Date(endDate) > maxFutureDate) {
  return res.status(400).json({
    error: 'Blocks cannot be created more than 365 days in the future',
    code: 'DATE_TOO_FAR'
  });
}
```

Also validate:
- `startDate <= endDate` → 400 `DATE_INVALID`
- `endDate >= today` → 400 `DATE_IN_PAST`

---

### Q9 — Auto-Block When No Dates Available

**Decision: Option A — skip silently, log Pino warn.**

```ts
// In booking confirmation handler
if (!blockStart || !blockEnd) {
  req.log.warn({ bookingId }, 'auto-block skipped — no date range on booking');
  return; // no block created
}
```

The freelancer's `isAvailable` toggle is still set to `false` by the existing booking confirmation flow — only the calendar block is skipped.

---

## Resolved Risks

---

### Risk 1 — Auto-Block Must Be Fire-and-Forget

**Resolution: Same `.catch()` pattern as Notifications Centre.**

```ts
// In booking route handler — after booking is confirmed
createAvailabilityBlock(db, {
  freelancerId: booking.freelancerId,
  startDate: blockStart,
  endDate: blockEnd,
  reason: 'booked',
  bookingId: booking.id,
}).catch(err =>
  req.log.warn({ err, bookingId: booking.id }, 'auto-block creation failed')
);
// DO NOT await
```

---

### Risk 2 — `nextAvailableDate` Performance

**Resolution: Cache on `freelancer_profiles` + indexes.**

Add `nextAvailableDate` as a nullable date column on `freelancer_profiles`. Update it whenever:
- A block is created, deleted, or modified
- The freelancer's `isAvailable` or `availableFrom` changes

```ts
// After any block change, recalculate and cache
async function refreshNextAvailableDate(db: DB, freelancerId: string) {
  const [profile, blocks] = await Promise.all([
    db.query.freelancerProfiles.findFirst({ where: eq(freelancerProfiles.id, freelancerId) }),
    db.select().from(availabilityBlocks)
      .where(and(
        eq(availabilityBlocks.freelancerId, freelancerId),
        gte(availabilityBlocks.endDate, new Date())
      ))
  ]);

  const nextDate = calculateNextAvailableDate(
    profile.isAvailable,
    profile.availableFrom,
    blocks
  );

  await db.update(freelancerProfiles)
    .set({ nextAvailableDate: nextDate })
    .where(eq(freelancerProfiles.id, freelancerId));
}
```

The Talent Vault query reads from `nextAvailableDate` column directly — no per-request calculation.

---

### Risk 3 — `availableFrom` vs Calendar Blocks Conflict

**Resolution: Handled in `calculateNextAvailableDate()` (Q4 above).**

The function takes both `availableFrom` and blocks as inputs and uses the LATER of the two as the starting candidate date. This ensures the two signals are always reconciled correctly.

---

### Risk 4 — Auto-Block Deletion on Cancellation

**Resolution: Fire-and-forget delete identified by `bookingId`.**

```ts
// In booking cancellation/completion handler
deleteAvailabilityBlockByBookingId(db, booking.id).catch(err =>
  req.log.warn({ err, bookingId: booking.id }, 'auto-block deletion failed')
);
// DO NOT await
```

```ts
async function deleteAvailabilityBlockByBookingId(db: DB, bookingId: string) {
  await db.delete(availabilityBlocks)
    .where(eq(availabilityBlocks.bookingId, bookingId));
}
```

---

### Risk 5 — `react-day-picker` Installation

**Resolution: Check first. Install if missing.**

```bash
cat artifacts/talentlock/package.json | grep "day-picker"
# If missing:
cd artifacts/talentlock && pnpm add react-day-picker
```

Version: install latest v8.x — confirm shadcn/ui compatibility.

---

### Risk 6 — Codegen Export Rules

**Resolution: Same mandatory post-codegen checks as all features.**

After `pnpm --filter @workspace/api-spec run codegen`:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 3

---

## `availabilityUtils.ts` Exports

**File:** `artifacts/api-server/src/lib/availabilityUtils.ts` (create new)

Export:
- `calculateNextAvailableDate(isAvailable, availableFrom, blocks): Date | null`
- `refreshNextAvailableDate(db, freelancerId): Promise<void>`
- `createAvailabilityBlock(db, params): Promise<void>`
- `deleteAvailabilityBlockByBookingId(db, bookingId): Promise<void>`

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/availability-calendar/features.md` read
- [ ] `specs/availability-calendar/clarify.md` read
- [ ] This `plan.md` read — all 9 questions and 6 risks resolved
- [ ] `specs/availability-calendar/task.md` read — phase order understood
- [ ] `specs/availability-calendar/UI.md` read — all calendar states understood
- [ ] Codebase inspection complete — Q1, Q2, Q3 confirmed from actual schema
- [ ] `react-day-picker` availability confirmed

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Database — `availability_blocks` table + `nextAvailableDate` column | ⬜ Not started |
| Phase 2 | Backend — utility + endpoints + auto-block triggers + OpenAPI + codegen | ⬜ Not started |
| Phase 3 | Frontend — freelancer calendar management, employer read-only views, Talent Vault filter + card | ⬜ Not started |

---

# P1 Follow-Up Addendum — Premature Availability Lock (added 2026-06-09)

> Binding decisions for Module 8 in `features.md`. Agent reads this alongside `task.md`. No open blockers — verified against `bookings.ts` on 2026-06-09.

### A1 — Where the lock is set today

Confirmed in `artifacts/api-server/src/routes/bookings.ts`, inside the `POST /bookings` transaction:

```ts
await tx.update(freelancerProfilesTable)
  .set({ isAvailable: false, currentBookingId: booking.id, bookingEndDate: parsed.data.endDate as any })
  .where(eq(freelancerProfilesTable.id, parsed.data.freelancerId));
```

This runs while the booking status is `"pending"`.

### A2 — Decision: move the lock to the `active` transition (all confirmation paths)

**Remove** the `freelancerProfilesTable` update from `POST /bookings`. The created booking stays `pending`, the freelancer stays `isAvailable: true`, `currentBookingId` stays null.

**Shared helper** (binding): extract `lockFreelancerForActiveBooking(db, booking, log?)` in `artifacts/api-server/src/lib/availabilityUtils.ts` that:

1. Sets `isAvailable: false`, `currentBookingId: booking.id`, `bookingEndDate: booking.endDate ?? null`
2. Fire-and-forget `createAvailabilityBlock(...)` when start/end dates exist (same `.catch()` pattern as today)

**Call sites that must invoke the helper whenever booking → `active`:**

1. **Primary:** `POST /api/agreements/:id/sign` — both places that run `db.update(bookingsTable).set({ status: "active" })` after `fully_signed` (normal dual-sign and demo-freelancer auto-sign).
2. **Secondary:** `PATCH /bookings/:id` when `status === BOOKING_CONFIRMED_STATUS` (`"active"`).

```ts
if (parsed.data.status === BOOKING_CONFIRMED_STATUS) {
  await lockFreelancerForActiveBooking(db, updated, req.log);
}
```

The existing `cancelled`/`completed` reset (`isAvailable: true, currentBookingId: null, bookingEndDate: null`) is already correct and stays unchanged.

### A3 — Interaction with the P0 AuthHardening spec

`PATCH /bookings/:id` and `POST /agreements/:id/sign` are gated by `specs/AuthHardening/`. Apply the AuthHardening guard first; the availability lock lives inside the already-authorised handler.

### A4 — Edge case: exclusivity guard on create (updated 2026-07-12)

`POST /api/bookings` must reject when the target freelancer is already exclusive:

```ts
// inside the create transaction, after resolving freelancerId
if (!freelancer.isAvailable || hasActiveBooking) {
  return { gate: null, booking: null, unavailable: true };
}
// respond 409 { error: "...", code: "FREELANCER_UNAVAILABLE" }
```

Pending bookings do **not** block create. Double-confirm race (two agreements signing concurrently) remains a residual edge; the create guard + `isAvailable` flip closes the product gap.

### Addendum Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 4 (Addendum) | Move availability lock from pending-create to active-confirm (PATCH path) | ✅ Done 2026-06-09 |
| Phase 4b (Addendum) | Align lock with agreement fully-signed → active + create exclusivity guard | ✅ Done 2026-07-12 |

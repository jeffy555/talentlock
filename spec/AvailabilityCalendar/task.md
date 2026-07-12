# TalentLock — Task Breakdown: Availability Calendar (Visual)

## Summary

Build a full availability calendar system: new `availability_blocks` table, `nextAvailableDate` cache column, server-side utilities, REST endpoints, auto-block triggers on booking events, and frontend calendar components on four surfaces. Three phases: Database → Backend → Frontend.

---

## Phase 1 — Database

### Task 1.1 — Codebase Inspection

Before any schema changes, run all checks from `plan.md`. Document:
- Exact `isAvailable` and `availableFrom` column names on `freelancer_profiles`
- Whether `bookings` has `startDate`/`endDate` columns
- Confirmed booking status strings (confirmed, cancelled, completed)
- Whether `react-day-picker` is installed
- Whether `availability_blocks` table already exists

### Task 1.2 — Create `availability_blocks` Table

**File:** `lib/db/src/schema/` — appropriate schema file

```ts
export const availabilityBlocks = pgTable('availability_blocks', {
  id:           serial('id').primaryKey(),
  freelancerId: text('freelancer_id').notNull().references(() => freelancerProfiles.id),
  startDate:    date('start_date').notNull(),
  endDate:      date('end_date').notNull(),
  reason:       text('reason').notNull(), // 'booked' | 'holiday' | 'unavailable'
  label:        text('label'),            // optional, max 100 chars, freelancer-private
  bookingId:    text('booking_id').references(() => bookings.id), // null for manual blocks
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  freelancerIdx: index('idx_availability_freelancer_id').on(t.freelancerId),
  endDateIdx:    index('idx_availability_end_date').on(t.endDate),
}));
```

### Task 1.3 — Add `nextAvailableDate` to `freelancer_profiles`

**File:** `lib/db/src/schema/` — same file as `freelancerProfiles`

Add if not present:
```ts
nextAvailableDate: date('next_available_date'), // nullable, computed cache
```

### Task 1.4 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify in Neon:
- `availability_blocks` table exists with all columns and both indexes
- `freelancer_profiles.next_available_date` column exists

---

## Phase 2 — Backend

### Task 2.1 — Create `availabilityUtils.ts`

**File:** `artifacts/api-server/src/lib/availabilityUtils.ts` (create new)

Implement all four exports from `plan.md`:
- `calculateNextAvailableDate()` — exact implementation from plan.md Q4
- `refreshNextAvailableDate()` — fetches blocks + recalculates + updates cached column
- `createAvailabilityBlock()` — inserts a block row
- `deleteAvailabilityBlockByBookingId()` — deletes by bookingId

Include the `addDays()` helper used internally.

### Task 2.2 — Create Availability Route File

**File:** `artifacts/api-server/src/routes/availability.ts` (create new)

#### `GET /api/availability/:freelancerId` — Public (no auth required)

Returns blocks for a freelancer. Employer/public response — NO label, NO bookingId:
```ts
{
  freelancerId: string,
  nextAvailableDate: string | null,
  blocks: {
    id: number,
    startDate: string,
    endDate: string,
    reason: 'booked' | 'holiday' | 'unavailable'
  }[]
}
```

Only return blocks where `endDate >= today`. Order by `startDate ASC`.

#### `GET /api/availability/me` — Freelancer only

Returns own blocks with full detail including label and bookingId:
```ts
{
  nextAvailableDate: string | null,
  blocks: {
    id: number,
    startDate: string,
    endDate: string,
    reason: 'booked' | 'holiday' | 'unavailable',
    label: string | null,
    bookingId: string | null,   // non-null = auto-created from booking
    createdAt: string
  }[]
}
```

Returns 403 for employers. Only returns the authenticated freelancer's own blocks.

#### `POST /api/availability/me` — Freelancer only

Request body:
```ts
{
  startDate: string,    // "YYYY-MM-DD"
  endDate: string,      // "YYYY-MM-DD"
  reason: 'holiday' | 'unavailable',  // 'booked' not allowed manually
  label?: string        // max 100 chars
}
```

Validation (return 400 on failure):
- `startDate <= endDate` → `DATE_INVALID`
- `endDate >= today` → `DATE_IN_PAST`
- `endDate <= today + 365 days` → `DATE_TOO_FAR`
- `reason` must be `holiday` or `unavailable` (not `booked` — that's auto-only)
- `label` max 100 chars → `LABEL_TOO_LONG`

On success:
1. Insert block
2. Call `refreshNextAvailableDate(db, freelancerId)` — can be awaited here (not fire-and-forget) since this is a direct user action, not a background trigger

Return `HTTP 201` with the created block (full detail format).

#### `DELETE /api/availability/me/:id` — Freelancer only

Guards:
1. Fetch block — 404 if not found
2. Verify `block.freelancerId === internalUserId` — 403 if not
3. Verify `block.bookingId === null` — if bookingId is set, return 409:
   ```ts
   return res.status(409).json({
     error: 'Cannot delete an auto-created booking block. Cancel the booking to remove it.',
     code: 'BLOCK_IS_AUTO'
   });
   ```

On success:
1. Delete block
2. Call `refreshNextAvailableDate(db, freelancerId)` — awaited

Return `HTTP 200 { success: true }`.

### Task 2.3 — Add Auto-Block Triggers to Bookings Route

**File:** `artifacts/api-server/src/routes/bookings.ts`

Import `createAvailabilityBlock` and `deleteAvailabilityBlockByBookingId` from `availabilityUtils`.

**On booking confirmation** (when status changes TO `BOOKING_CONFIRMED_STATUS`):

```ts
// Determine date range (from plan.md Q2)
const blockStart = booking.startDate ?? null;
const blockEnd = booking.endDate ?? await getMaxMilestoneDueDate(db, bookingId);

if (blockStart && blockEnd) {
  createAvailabilityBlock(db, {
    freelancerId: booking.freelancerId,
    startDate: blockStart,
    endDate: blockEnd,
    reason: 'booked',
    bookingId: booking.id,
  }).catch(err => req.log.warn({ err, bookingId }, 'auto-block creation failed'));
  // refreshNextAvailableDate is called inside createAvailabilityBlock
} else {
  req.log.warn({ bookingId }, 'auto-block skipped — no date range on booking');
}
```

**On booking cancellation or completion** (when status changes TO cancelled or completed):

```ts
deleteAvailabilityBlockByBookingId(db, booking.id)
  .catch(err => req.log.warn({ err, bookingId }, 'auto-block deletion failed'));
// refreshNextAvailableDate called inside deleteAvailabilityBlockByBookingId
```

### Task 2.4 — Update `GET /api/freelancers/:id`

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Add `nextAvailableDate` to the response (read from the cached column):
```ts
nextAvailableDate: profile.nextAvailableDate ?? null
```

### Task 2.5 — Update `GET /api/freelancers` (Talent Vault)

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Add `?availableFrom=YYYY-MM-DD` filter:
```ts
if (query.availableFrom) {
  const filterDate = new Date(query.availableFrom as string);
  // Only return freelancers where nextAvailableDate <= filterDate
  // i.e. they will be available by the requested date
  .where(and(
    /* existing filters */,
    or(
      isNull(freelancerProfiles.nextAvailableDate),
      lte(freelancerProfiles.nextAvailableDate, filterDate)
    )
  ))
}
```

Also add `nextAvailableDate` to each freelancer in the list response.

### Task 2.6 — Register Routes

**File:** `artifacts/api-server/src/index.ts`

Register `availabilityRouter` from `./routes/availability`.

**Route ordering — CRITICAL:** Register `GET /api/availability/me` BEFORE `GET /api/availability/:freelancerId` to avoid `me` being matched as a freelancer ID.

### Task 2.7 — OpenAPI Spec + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add:
- `GET /api/availability/{freelancerId}`
- `GET /api/availability/me`
- `POST /api/availability/me`
- `DELETE /api/availability/me/{id}`

Update `GET /api/freelancers` to add `availableFrom` query param.
Update `GET /api/freelancers/{id}` response to include `nextAvailableDate`.

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 3

---

## Phase 3 — Frontend

### Task 3.1 — Install `react-day-picker` if Needed

```bash
cat artifacts/talentlock/package.json | grep "day-picker"
# If missing:
cd artifacts/talentlock && pnpm add react-day-picker
```

### Task 3.2 — Verify Generated Hooks

Confirm:
- `useGetAvailabilityFreelancerId()`
- `useGetAvailabilityMe()`
- `usePostAvailabilityMe()`
- `useDeleteAvailabilityMeId()`

If missing, re-run codegen.

### Task 3.3 — Create `availabilityUtils.ts` (Frontend)

**File:** `artifacts/talentlock/src/lib/availabilityUtils.ts` (create new)

```ts
export function formatNextAvailable(dateStr: string | null): string {
  if (!dateStr) return 'Not available';
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date <= today) return 'Available now';
  return `Available ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date)}`;
}

export function getAvailabilityColour(reason: string): string {
  switch (reason) {
    case 'booked':      return 'bg-indigo-200 text-indigo-800';
    case 'holiday':     return 'bg-amber-200 text-amber-800';
    case 'unavailable': return 'bg-red-200 text-red-800';
    default:            return 'bg-slate-200 text-slate-700';
  }
}

export type BlockReason = 'booked' | 'holiday' | 'unavailable';
```

### Task 3.4 — Create `<AvailabilityCalendar />` (Read-Only)

**File:** `artifacts/talentlock/src/components/availability/AvailabilityCalendar.tsx` (create new)

Read-only calendar used on employer views and public profile. See `UI.md` Component 1.

Props:
```ts
interface AvailabilityCalendarProps {
  blocks: { startDate: string; endDate: string; reason: string }[];
  nextAvailableDate: string | null;
}
```

### Task 3.5 — Create `<AvailabilityManager />` (Freelancer Edit)

**File:** `artifacts/talentlock/src/components/availability/AvailabilityManager.tsx` (create new)

Full management interface for the freelancer's own calendar. See `UI.md` Component 2.

Uses `useGetAvailabilityMe()`, `usePostAvailabilityMe()`, `useDeleteAvailabilityMeId()`.

### Task 3.6 — Create `<AddBlockModal />` (Freelancer)

**File:** `artifacts/talentlock/src/components/availability/AddBlockModal.tsx` (create new)

Modal/sheet for creating a new availability block. See `UI.md` Component 3.

### Task 3.7 — Integrate Into `/profile` (Freelancer)

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

Replace the existing `isAvailable` toggle + `availableFrom` date field with the new `<AvailabilityManager />`. Keep the toggle and date visible as quick controls above the calendar.

DOM order:
```
[Profile fields]
[Verification section]      ← existing
[Availability section]      ← UPDATED — now contains AvailabilityManager
[Portfolio section]         ← existing
```

### Task 3.8 — Integrate Into `/freelancers/:id` (Employer View)

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

Add `<AvailabilityCalendar />` below the Rate Benchmark card (or bio section). See `UI.md` Page Integration 2.

### Task 3.9 — Integrate Into `/f/:id` (Public Profile)

**File:** `artifacts/talentlock/src/pages/PublicProfile.tsx`

Add `<AvailabilityCalendar />` below the bio section. Same placement as employer view.

### Task 3.10 — Update Talent Vault Filter

**File:** `artifacts/talentlock/src/pages/Freelancers.tsx`

Add "Available from" date picker to the existing filter panel. Uses shadcn/ui `<DatePicker>`. When a date is selected, appends `?availableFrom=YYYY-MM-DD` to the query.

See `UI.md` Page Integration 4.

### Task 3.11 — Update Talent Vault Cards

**File:** `artifacts/talentlock/src/components/FreelancerCard.tsx` (or equivalent)

Replace/augment the existing availability text with the new `nextAvailableDate` formatted display. See `UI.md` Page Integration 4 for card badge spec.

---

## Acceptance Criteria

- [ ] `availability_blocks` table exists with correct columns and two indexes
- [ ] `freelancer_profiles.next_available_date` column exists
- [ ] `availabilityUtils.ts` created with all four utility functions
- [ ] `calculateNextAvailableDate` correctly handles overlapping/adjacent blocks
- [ ] `calculateNextAvailableDate` considers both `availableFrom` and blocks
- [ ] `GET /api/availability/:freelancerId` is public (no auth needed)
- [ ] `GET /api/availability/:freelancerId` does NOT include label or bookingId
- [ ] `GET /api/availability/me` registered BEFORE `/:freelancerId` (no route conflict)
- [ ] `GET /api/availability/me` returns 403 for employers
- [ ] `POST /api/availability/me` rejects `reason: 'booked'` with 400
- [ ] `POST /api/availability/me` rejects dates > 365 days in future with 400
- [ ] `POST /api/availability/me` rejects endDate in past with 400
- [ ] `POST /api/availability/me` calls `refreshNextAvailableDate` after insert
- [ ] `DELETE /api/availability/me/:id` returns 409 when block has bookingId
- [ ] `DELETE /api/availability/me/:id` returns 403 for wrong freelancer
- [ ] Auto-block created (fire-and-forget) when booking is confirmed
- [ ] Auto-block deleted (fire-and-forget) when booking is cancelled/completed
- [ ] Auto-block skipped gracefully when no date range available on booking
- [ ] `GET /api/freelancers/:id` includes `nextAvailableDate`
- [ ] `GET /api/freelancers?availableFrom=` filters correctly
- [ ] All codegen hooks confirmed
- [ ] `<AvailabilityCalendar />` shows coloured blocks for booked/holiday/unavailable
- [ ] `<AvailabilityCalendar />` is month-navigable with prev/next
- [ ] `<AvailabilityManager />` shows freelancer's blocks with delete option
- [ ] Auto-created blocks show as non-deletable (no delete button)
- [ ] `<AddBlockModal />` validates dates client-side before API call
- [ ] "Available from" filter on Talent Vault works end-to-end
- [ ] `nextAvailableDate` displayed correctly on Talent Vault cards
- [ ] Calendar visible on `/freelancers/:id` and `/f/:id`
- [ ] Freelancer dashboard shows `<AvailabilityManager />` on `/profile`
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 → 1.4
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 (codegen + typecheck)
Task 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8 → 3.9 → 3.10 → 3.11
```

---

# Phase 4 (P1 Addendum) — Defer Availability Lock to Confirmation (added 2026-06-09)

> Implements Module 8 (`features.md`) and decisions A1–A4 (`plan.md`). Coordinate with `specs/AuthHardening/` since both edit `PATCH /bookings/:id`.

### Task 4.1 — Remove premature lock from `POST /bookings`
- File: `artifacts/api-server/src/routes/bookings.ts`
- In the create transaction, **delete** the `freelancerProfilesTable` update that sets `isAvailable: false` / `currentBookingId` / `bookingEndDate`.
- Leave the booking insert (status `pending`) and any negotiation defaults untouched.
- **Acceptance:** Creating a booking via `POST /bookings` leaves the target freelancer `isAvailable: true`, `currentBookingId: null`, and still visible in the Talent Vault.

### Task 4.2 — Add lock to the `active` confirmation path in `PATCH /bookings/:id`
- File: `artifacts/api-server/src/routes/bookings.ts`
- In the branch where `status === BOOKING_CONFIRMED_STATUS` ("active"), add the `freelancerProfilesTable` update setting `isAvailable: false`, `currentBookingId: updated.id`, `bookingEndDate: updated.endDate ?? null`, in the same block as the existing `createAvailabilityBlock` call.
- Ensure the AuthHardening participant guard (if already applied) wraps this mutation.
- **Acceptance:** Confirming a booking (status → active) flips the freelancer to unavailable AND creates the `booked` auto-block. Cancelling/completing still restores availability (unchanged existing reset).

### Task 4.3 — Typecheck gate
- Run `pnpm run typecheck`.
- **Acceptance:** Zero new type errors introduced by Tasks 4.1–4.2.

### Phase 4 Acceptance Checklist
- [x] `POST /bookings` no longer mutates `freelancerProfilesTable` availability fields
- [x] Pending booking leaves freelancer available + Vault-visible
- [x] `PATCH /bookings/:id` → `active` sets `isAvailable: false` + `currentBookingId` + `bookingEndDate`
- [x] `active` transition still creates the `booked` availability auto-block
- [x] `cancelled`/`completed` still restores `isAvailable: true`
- [x] Coordinated with AuthHardening guard on the same handler
- [x] `pnpm run typecheck` passes with zero new errors

---

# Phase 4b (P1 Addendum) — Align Lock with Agreement Fully-Signed Path (added 2026-07-12)

> Extends Module 8 / decisions A2–A4 (`plan.md`). The primary confirmation path is agreement signing, not PATCH.

### Task 4b.1 — Shared lock helper
- File: `artifacts/api-server/src/lib/availabilityUtils.ts`
- Add `lockFreelancerForActiveBooking(dbConn, booking, log?)` that:
  1. Updates `freelancer_profiles`: `isAvailable: false`, `currentBookingId`, `bookingEndDate`
  2. Fire-and-forget `createAvailabilityBlock` when `startDate` and `endDate` exist (`reason: "booked"`)
- Refactor `PATCH /bookings/:id` active branch to call this helper (behaviour unchanged).
- **Acceptance:** Helper is the single source of lock + auto-block for `active` transitions.

### Task 4b.2 — Lock on agreement fully signed
- File: `artifacts/api-server/src/routes/agreements.ts`
- After every `db.update(bookingsTable).set({ status: "active" })` on fully signed (normal dual-sign **and** demo auto-sign), load the booking row if needed and `await lockFreelancerForActiveBooking(db, booking, req.log)`.
- **Acceptance:** Completing e-sign → `fully_signed` → booking `active` flips the freelancer unavailable and creates the `booked` auto-block.

### Task 4b.3 — Exclusivity guard on `POST /bookings`
- File: `artifacts/api-server/src/routes/bookings.ts`
- Inside the create transaction: if `isAvailable === false` OR an `active` booking exists for `freelancerId`, abort and return `409` `{ error, code: "FREELANCER_UNAVAILABLE" }`.
- Pending bookings do not block create.
- **Acceptance:** A second employer cannot create a booking against a locked / actively engaged freelancer.

### Task 4b.4 — Typecheck gate
- Run `pnpm --filter @workspace/api-server run typecheck` (or workspace typecheck).
- **Acceptance:** Zero new type errors.

### Phase 4b Acceptance Checklist
- [x] `lockFreelancerForActiveBooking` exists and is used by PATCH active + agreement sign paths
- [x] Agreement fully signed → booking active → `isAvailable: false` + auto-block
- [x] Demo auto-sign path also locks
- [x] `POST /bookings` returns 409 `FREELANCER_UNAVAILABLE` when talent is locked/active
- [x] Pending create still leaves talent available
- [x] Typecheck passes

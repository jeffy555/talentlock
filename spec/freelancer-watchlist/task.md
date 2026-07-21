# TalentLock — Task Breakdown: Freelancer Watchlist

Three implementation phases: Database → Backend → Frontend. Tests run as part of Phase 2 (backend) and validated in `validation.md`.

---

## Phase 1 — Database

### Task 1.1 — Add watchlist columns to `saved_freelancers`

**File:** `lib/db/src/schema/savedFreelancers.ts`

```ts
notes: text("notes"),
lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
```

### Task 1.2 — Push schema

```bash
pnpm --filter @workspace/db run push
```

Verify both columns exist in Neon before Phase 2.

---

## Phase 2 — Backend

### Task 2.1 — Watchlist limit helper

**File:** `artifacts/api-server/src/lib/watchlistLimits.ts` (create) — per `plan.md` D5.

### Task 2.2 — Team membership guard helper

**File:** `artifacts/api-server/src/lib/teamMembership.ts` (create or extend existing) — per `plan.md` D4 `isActiveTeamMember()`.

### Task 2.3 — Change-detection utility

**File:** `artifacts/api-server/src/lib/watchlistAlerts.ts` (create) — per `plan.md` D7.

**File:** `artifacts/api-server/src/lib/createNotification.ts` — add `WATCHLIST_UPDATE: "watchlist_update"`.

### Task 2.4 — Harden `savedFreelancers` routes

**File:** `artifacts/api-server/src/routes/savedFreelancers.ts`

1. Replace N+1 list with JOIN query (`plan.md` D2).
2. Return `WatchlistItem[]` shape with nested `freelancer`.
3. Add team-member guard on all four endpoints (`plan.md` D4).
4. Add plan limit check on save-add (`plan.md` D5).
5. Add `PATCH /freelancers/:id/watchlist` (`plan.md` D6).

### Task 2.5 — Hook profile update alerts

**File:** `artifacts/api-server/src/routes/freelancers.ts`

In `PUT /api/freelancers/me`:
- Capture `before` snapshot (isAvailable, hourlyRate, dailyRate, name) before update.
- After successful update, fire-and-forget `notifyWatchlistSubscribers()` (`plan.md` D7).

### Task 2.6 — OpenAPI + codegen

**File:** `lib/api-spec/openapi.yaml`

- Add `WatchlistItem`, `PatchWatchlistNotesBody`, `PatchWatchlistNotesResponse` schemas.
- Update `GET /freelancers/saved` response type.
- Add `PATCH /freelancers/{id}/watchlist`.

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Post-codegen checks:
- `lib/api-zod/orval.config.ts` → `indexFiles: false`
- `lib/api-zod/src/index.ts` → exports only `./generated/api`

### Task 2.7 — Unit tests

**File:** `artifacts/api-server/tests/unit/watchlistAlerts.test.ts` (create)

- `shouldNotifyAvailability` — false→true only
- `shouldNotifyRateChange` — ≥ 5% threshold, null→value
- Debounce logic (mock dates)

**File:** `artifacts/api-server/tests/unit/watchlistLimits.test.ts` (create)

- Limits per plan ID

### Task 2.8 — Integration tests

**File:** `artifacts/api-server/tests/integration/watchlist/savedFreelancers.test.ts` (create)

- Employer can save/unsave
- List returns `WatchlistItem` with `savedAt`
- Notes PATCH 404 when not saved
- 402 at plan limit (mock or seed)
- Team member gets 403 on save
- Non-employer gets empty list / 403

---

## Phase 3 — Frontend

### Task 3.1 — Extract shared watchlist components

**File:** `artifacts/talentlock/src/components/watchlist/WatchlistToggleButton.tsx` (create)

Extract `PersonalSaveButton` from `FreelancersList.tsx`. Update aria-labels to "watchlist" copy (`plan.md` D8).

**File:** `artifacts/talentlock/src/components/watchlist/WatchlistNotesEditor.tsx` (create)

Inline notes editor per `UI.md` — props: `freelancerId`, `initialNotes`, `onSaved`.

Uses `usePatchWatchlistNotes` (generated).

### Task 3.2 — Watchlist tab on Talent Vault

**File:** `artifacts/talentlock/src/pages/FreelancersList.tsx`

1. Add `watchlist` to `VaultView` type.
2. Parse `?view=watchlist` from URL on mount.
3. Personal employers: always show `[Search results] [Watchlist (N)]` tab bar (mirror enterprise team-shortlist pattern).
4. Remove legacy `showSavedOnly` filter chip.
5. Watchlist panel: grid of `FreelancerCard` + `WatchlistNotesEditor` + empty state.
6. Add "No longer in Talent Vault" badge when `completenessScore < 60`.
7. On 402 from save toggle → `setLocation("/pricing")`.

### Task 3.3 — Freelancer detail page copy

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

- Update heart button aria-label and toast copy to "watchlist".
- On 402 from save → redirect `/pricing`.

### Task 3.4 — Dashboard summary card

**File:** `artifacts/talentlock/src/components/watchlist/WatchlistSummaryCard.tsx` (create) — per `plan.md` D10.

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx` — render for `user.role === "employer"`.

### Task 3.5 — Notification centre label (optional)

**File:** `artifacts/talentlock/src/components/notifications/NotificationItem.tsx` (or equivalent)

If notification types are mapped to labels, add `watchlist_update` → "Watchlist update". Link click navigates to `/freelancers/{entityId}`.

---

## Acceptance Criteria

- [ ] `notes` and `last_alert_at` columns exist on `saved_freelancers`
- [ ] `GET /api/freelancers/saved` returns `WatchlistItem[]` via single JOIN (no N+1)
- [ ] `PATCH /api/freelancers/:id/watchlist` updates notes (max 500 chars, sanitised)
- [ ] `POST /api/freelancers/:id/save` enforces plan limits (25 starter / 100 growth) with 402
- [ ] Active team members cannot use personal watchlist endpoints (403/[])
- [ ] Profile rate/availability changes notify watchlist employers (debounced 24 h)
- [ ] `WATCHLIST_UPDATE` notification type created
- [ ] Personal employers see dedicated Watchlist tab on `/freelancers`
- [ ] Dashboard shows watchlist summary when count > 0
- [ ] UI copy uses "Watchlist" (personal) and "Team Shortlist" (enterprise)
- [ ] `pnpm run typecheck` passes
- [ ] Unit + integration tests pass

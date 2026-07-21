# TalentLock — Implementation Plan: Freelancer Watchlist

> **Status: APPROVED — Ready for implementation**
> Resolves every question from `clarify.md` with exact code. Wins over `task.md` on conflict.

---

## Pre-Implementation Codebase Checks

```bash
grep -n "savedFreelancersTable" lib/db/src/schema/savedFreelancers.ts
grep -n "savedFreelancers" artifacts/api-server/src/routes/savedFreelancers.ts | head -5
grep -n "isTeamMember\|useListSavedFreelancers" artifacts/talentlock/src/pages/FreelancersList.tsx | head -10
grep -n "WATCHLIST\|saved_freelancers" artifacts/api-server/src -r
```

Confirmed: table exists, routes exist, enterprise UI already prefers team shortlist, no watchlist notification type yet.

---

## Resolved Decisions

### D1 — Schema additions

**File:** `lib/db/src/schema/savedFreelancers.ts`

```ts
notes: text("notes"),
lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
```

No migration backfill required — both nullable.

---

### D2 — Watchlist list query (N+1 fix)

**File:** `artifacts/api-server/src/routes/savedFreelancers.ts`

Replace per-ID `Promise.all` with a single JOIN:

```ts
import { eq, desc, inArray } from "drizzle-orm";

const rows = await db
  .select({
    savedId: savedFreelancersTable.id,
    savedAt: savedFreelancersTable.createdAt,
    notes: savedFreelancersTable.notes,
    freelancer: freelancerProfilesTable,
  })
  .from(savedFreelancersTable)
  .innerJoin(
    freelancerProfilesTable,
    eq(savedFreelancersTable.freelancerId, freelancerProfilesTable.id),
  )
  .where(eq(savedFreelancersTable.employerUserId, user.id))
  .orderBy(desc(savedFreelancersTable.createdAt));
```

Map each row to `WatchlistItem` (see D3). Apply the same Vault card field transforms as `GET /api/freelancers` (rate parsing, `expiringCredential` if already computed — optional for list; include `nextAvailableDate`, `averageRating`, `reviewCount`, `verificationLevel`, `isVerified`, `isAvailable`, `completenessScore`).

---

### D3 — OpenAPI types

**File:** `lib/api-spec/openapi.yaml`

```yaml
WatchlistItem:
  type: object
  required: [id, freelancerId, savedAt, freelancer]
  properties:
    id:
      type: integer
      description: saved_freelancers.id
    freelancerId:
      type: integer
    savedAt:
      type: string
      format: date-time
    notes:
      type: string
      nullable: true
    freelancer:
      $ref: "#/components/schemas/FreelancerProfile"

PatchWatchlistNotesBody:
  type: object
  required: [notes]
  properties:
    notes:
      type: string
      nullable: true
      maxLength: 500

PatchWatchlistNotesResponse:
  type: object
  required: [notes]
  properties:
    notes:
      type: string
      nullable: true
```

Update `GET /freelancers/saved` response to `WatchlistItem[]`.

Add path:

```yaml
/freelancers/{id}/watchlist:
  patch:
    operationId: patchWatchlistNotes
    tags: [freelancers]
    summary: Update private notes for a watchlisted freelancer (employer only)
```

---

### D4 — Enterprise team-member guard

**File:** `artifacts/api-server/src/lib/teamMembership.ts` (create if not exists, or add to existing team util)

```ts
export async function isActiveTeamMember(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: teamMembersTable.id })
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.userId, userId), eq(teamMembersTable.status, "active")))
    .limit(1);
  return !!row;
}
```

Apply in `savedFreelancers.ts`:

- `GET /freelancers/saved` → return `[]` if active team member
- `POST /freelancers/:id/save` → `403` if active team member
- `PATCH /freelancers/:id/watchlist` → `403` if active team member
- `GET /freelancers/:id/saved` → `{ saved: false }` if active team member (UI shows team heart instead)

---

### D5 — Plan limits

**File:** `artifacts/api-server/src/lib/watchlistLimits.ts` (create)

```ts
export const WATCHLIST_LIMITS: Record<string, number> = {
  employer_starter: 25,
  employer_growth: 100,
};

export function watchlistLimitForPlan(planId: string): number | null {
  return WATCHLIST_LIMITS[planId] ?? null; // null = unlimited (should not apply to enterprise personal)
}

export async function countWatchlist(employerUserId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(savedFreelancersTable)
    .where(eq(savedFreelancersTable.employerUserId, employerUserId));
  return row?.count ?? 0;
}
```

In `POST /api/freelancers/:id/save`, when **adding** (not removing):

```ts
const planId = await resolveEmployerPlanId(user.id); // reuse subscription helper
const limit = watchlistLimitForPlan(planId);
if (limit !== null) {
  const count = await countWatchlist(user.id);
  if (count >= limit) {
    res.status(402).json({
      error: "Watchlist limit reached",
      code: "PLAN_LIMIT",
      planNeeded: planId === "employer_starter" ? "employer_growth" : "employer_growth",
    });
    return;
  }
}
```

Frontend: on 402 `PLAN_LIMIT` from save toggle → redirect to `/pricing` (match `PostJob` / `JobDetail` pattern).

---

### D6 — Notes endpoint

**File:** `artifacts/api-server/src/routes/savedFreelancers.ts`

```ts
router.patch("/freelancers/:id/watchlist", async (req, res) => {
  // auth + employer role + not team member
  const freelancerId = parseInt(req.params.id);
  const parsed = patchWatchlistNotesBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [saved] = await db.select().from(savedFreelancersTable)
    .where(and(
      eq(savedFreelancersTable.employerUserId, user.id),
      eq(savedFreelancersTable.freelancerId, freelancerId),
    )).limit(1);

  if (!saved) { res.status(404).json({ error: "Freelancer not on watchlist" }); return; }

  const notes = parsed.data.notes === "" ? null : sanitiseText(parsed.data.notes ?? null);

  await db.update(savedFreelancersTable)
    .set({ notes })
    .where(eq(savedFreelancersTable.id, saved.id));

  res.json({ notes });
});
```

Use generated Zod schema from `@workspace/api-zod` after codegen.

---

### D7 — Change-detection utility

**File:** `artifacts/api-server/src/lib/watchlistAlerts.ts` (create)

```ts
const RATE_CHANGE_THRESHOLD = 0.05; // 5%
const ALERT_DEBOUNCE_MS = 24 * 60 * 60 * 1000;

export type FreelancerSnapshot = {
  isAvailable: boolean;
  hourlyRate: string | null;
  dailyRate: string | null;
  name: string;
};

export function shouldNotifyAvailability(before: FreelancerSnapshot, after: FreelancerSnapshot): boolean {
  return !before.isAvailable && after.isAvailable;
}

export function shouldNotifyRateChange(before: FreelancerSnapshot, after: FreelancerSnapshot): boolean {
  for (const field of ["hourlyRate", "dailyRate"] as const) {
    const oldVal = before[field] ? parseFloat(before[field]!) : null;
    const newVal = after[field] ? parseFloat(after[field]!) : null;
    if (oldVal === null && newVal !== null) return true;
    if (oldVal !== null && newVal !== null && oldVal > 0) {
      const delta = Math.abs(newVal - oldVal) / oldVal;
      if (delta >= RATE_CHANGE_THRESHOLD) return true;
    }
  }
  return false;
}

export async function notifyWatchlistSubscribers(
  freelancerProfileId: number,
  before: FreelancerSnapshot,
  after: FreelancerSnapshot,
  log: { warn: (obj: unknown, msg: string) => void },
): Promise<void> {
  const availability = shouldNotifyAvailability(before, after);
  const rate = shouldNotifyRateChange(before, after);
  if (!availability && !rate) return;

  const message = availability
    ? `${after.name} is now available for new engagements`
    : `${after.name} updated their rate`;

  const savers = await db.select({
    id: savedFreelancersTable.id,
    employerUserId: savedFreelancersTable.employerUserId,
    lastAlertAt: savedFreelancersTable.lastAlertAt,
  })
    .from(savedFreelancersTable)
    .where(eq(savedFreelancersTable.freelancerId, freelancerProfileId));

  const now = Date.now();
  for (const saver of savers) {
    if (saver.lastAlertAt && now - saver.lastAlertAt.getTime() < ALERT_DEBOUNCE_MS) continue;

    await createNotification(db, {
      userId: saver.employerUserId,
      type: NotificationType.WATCHLIST_UPDATE,
      entityType: "freelancer_profile",
      entityId: freelancerProfileId,
      message,
    });

    await db.update(savedFreelancersTable)
      .set({ lastAlertAt: new Date() })
      .where(eq(savedFreelancersTable.id, saver.id));
  }
}
```

**File:** `artifacts/api-server/src/lib/createNotification.ts` — add:

```ts
WATCHLIST_UPDATE: "watchlist_update",
```

**File:** `artifacts/api-server/src/routes/freelancers.ts` — in `PUT /freelancers/me`, capture `before` snapshot, then after successful update:

```ts
notifyWatchlistSubscribers(profile.id, beforeSnapshot, afterSnapshot, req.log)
  .catch((err) => req.log.warn({ err }, "watchlist alert failed"));
```

---

### D8 — UI naming (Q1)

| Context | Copy |
|---------|------|
| Personal Vault tab | `Watchlist ({N})` |
| Personal heart aria-label | `Add to watchlist` / `Remove from watchlist` |
| Enterprise tab | `Team Shortlist ({N})` (unchanged) |
| Dashboard card title | `Your Watchlist` |
| Notification type label (if rendered) | `Watchlist update` |
| Empty state title | `No one on your watchlist yet` |

Remove the legacy `Shortlist ({N})` filter chip from search mode.

---

### D9 — Vault view routing (Q7)

**File:** `artifacts/talentlock/src/pages/FreelancersList.tsx`

- `type VaultView = "search" | "watchlist" | "team-shortlist"`
- Read `?view=watchlist` from URL on mount to open the watchlist tab (dashboard CTA)
- Personal employers: show `[Search results] [Watchlist (N)]` toggle (always visible, not only when N > 0)
- `vaultHidden` badge on card when `completenessScore < 60`:

```tsx
{freelancer.completenessScore < 60 && (
  <Badge variant="outline" className="text-xs text-muted-foreground">
    No longer in Talent Vault
  </Badge>
)}
```

---

### D10 — Dashboard card (Q6)

**File:** `artifacts/talentlock/src/components/watchlist/WatchlistSummaryCard.tsx` (create)

- Props: none — fetches `useListSavedFreelancers` (employer) or `useListTeamShortlist` (enterprise team member)
- Renders null when count = 0
- Shows up to 3 names + "View watchlist" link to `/freelancers?view=watchlist` or `/freelancers?view=team-shortlist`

**File:** `artifacts/talentlock/src/pages/Dashboard.tsx` — render below stats row for employers only.

---

## Pre-Implementation Checklist

- [ ] `saved_freelancers` table confirmed in Neon
- [ ] `team_shortlist` behaviour unchanged for enterprise
- [ ] Route order: `/freelancers/saved` before `/freelancers/:id`
- [ ] `indexFiles: false` preserved after codegen

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Schema — `notes`, `lastAlertAt` | ⬜ Not started |
| 2 | Backend — limits, JOIN list, notes PATCH, alerts, OpenAPI, codegen | ⬜ Not started |
| 3 | Frontend — Watchlist tab, notes UI, dashboard card, copy rename | ⬜ Not started |
| 4 | Tests — unit + integration | ⬜ Not started |

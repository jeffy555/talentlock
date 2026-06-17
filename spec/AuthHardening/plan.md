# TalentLock — Implementation Plan: Auth Hardening

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, **this file wins**.

---

## Pre-Implementation Codebase Checks

Run all of these before writing any code and report every finding in a comment block at the top of `accessControl.ts`:

```bash
# 1. Confirm the existing correct pattern
grep -n "canAccessBooking\|resolveUser" artifacts/api-server/src/routes/milestones.ts

# 2. Confirm profile tables carry both clerkId and userId
grep -n "clerkId\|userId" lib/db/src/schema/freelancerProfiles.ts
grep -n "clerkId\|userId" lib/db/src/schema/employerProfiles.ts

# 3. Confirm conversation ownership column
grep -n "userId" lib/db/src/schema/conversations.ts

# 4. Confirm agreement → booking linkage
grep -n "bookingId" lib/db/src/schema/agreements.ts

# 5. Audit the download route for an existing participation check
sed -n '917,1010p' artifacts/api-server/src/routes/agreements.ts

# 6. Find any unauthenticated callers of the upload URL endpoint
grep -rn "uploads/request-url" artifacts/talentlock/src scripts/

# 7. Confirm getAuth import path used across routes
grep -rn "from \"@clerk/express\"" artifacts/api-server/src/routes/ | head
```

---

## Resolved Questions

### Q1 — Profile join key

**Decision: Resolve the `users` row from `clerkId` once, then join profiles on `users.id` (`userId`).** Mirror `milestones.ts` exactly.

```ts
// artifacts/api-server/src/lib/accessControl.ts
import { db as defaultDb } from "@workspace/db";
import {
  usersTable, bookingsTable, agreementsTable, conversations,
  meetingsTable, jobRequirementsTable,
  freelancerProfilesTable, employerProfilesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

type DB = typeof defaultDb;

export async function resolveUserByClerkId(clerkId: string, db: DB = defaultDb) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return u ?? null;
}

async function profileIdsForUser(userId: number, db: DB = defaultDb) {
  const [emp] = await db.select({ id: employerProfilesTable.id })
    .from(employerProfilesTable).where(eq(employerProfilesTable.userId, userId)).limit(1);
  const [fl] = await db.select({ id: freelancerProfilesTable.id })
    .from(freelancerProfilesTable).where(eq(freelancerProfilesTable.userId, userId)).limit(1);
  return { employerId: emp?.id ?? null, freelancerId: fl?.id ?? null };
}
```

### Q2 — `403` vs `404` policy

**Decision: Match `milestones.ts`.** Unknown ID → `404 { error: "<Resource> not found" }`. Real resource, caller not a participant → `403 { error: "Forbidden" }`. Not authenticated → `401 { error: "Unauthorized" }`.

The helpers return a small discriminated result so the route can pick the right status:

```ts
export type AccessResult =
  | { ok: true }
  | { ok: false; status: 403 | 404 };

export async function canAccessBooking(userId: number, bookingId: number, db: DB = defaultDb): Promise<AccessResult> {
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) return { ok: false, status: 404 };
  const { employerId, freelancerId } = await profileIdsForUser(userId, db);
  const isParticipant =
    (employerId !== null && employerId === booking.employerId) ||
    (freelancerId !== null && freelancerId === booking.freelancerId);
  return isParticipant ? { ok: true } : { ok: false, status: 403 };
}
```

`canAccessMeeting` and `canAccessJobRequirement` follow the identical shape (job requirement checks only `employerId`). `canAccessConversation` checks `conversation.userId === userId`. `canAccessAgreement` loads the agreement, then its booking, then reuses the booking participant test:

```ts
export async function canAccessAgreement(userId: number, agreementId: number, db: DB = defaultDb): Promise<AccessResult> {
  const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, agreementId)).limit(1);
  if (!agreement) return { ok: false, status: 404 };
  return canAccessBooking(userId, agreement.bookingId, db);
}
```

### Q3 — Signer role source of truth (highest severity)

**Decision: Derive the role from the caller's profile, never trust the request body.**

```ts
// Returns 'employer' | 'freelancer' | null for this user on this agreement's booking
export async function agreementRoleForUser(userId: number, agreementId: number, db: DB = defaultDb):
  Promise<"employer" | "freelancer" | null> {
  const [agreement] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, agreementId)).limit(1);
  if (!agreement) return null;
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, agreement.bookingId)).limit(1);
  if (!booking) return null;
  const { employerId, freelancerId } = await profileIdsForUser(userId, db);
  if (employerId !== null && employerId === booking.employerId) return "employer";
  if (freelancerId !== null && freelancerId === booking.freelancerId) return "freelancer";
  return null;
}
```

In the sign handler:
1. Require `getAuth(req).userId` → else `401`.
2. `resolveUserByClerkId` → else `401`.
3. `derivedRole = agreementRoleForUser(user.id, id)` → if `null`, `403`.
4. If the body still sends `role`, it must equal `derivedRole`; otherwise `403`. Prefer the **derived** role for the actual write.
5. Keep all existing signed-state guards ("Employer must sign first", "already signed") and the demo-freelancer auto-sign branch unchanged.

### Q4 — Download route

**Decision: Inspect `agreements.ts:917–1010`. If it only checks `getAuth` (authentication) without participation, add `canAccessAgreement()`.** The download is a one-time certified copy per party, so it must be participant-gated. Document the finding in `task.md` Task 2.3 acceptance notes.

### Q5 — Storage path namespacing vs legacy objects

**Decision:**
- New uploads: namespace as `uploads/{userId}/{filename}` when generating the presigned URL.
- `GET /storage/objects/*path`: keep the existing `documents/` admin gate. Add ownership enforcement **only** for the new `uploads/{userId}/` private prefix — compare the `{userId}` path segment against the authenticated caller. Non-namespaced legacy paths continue to be served as today (no retroactive lock-out, per Risk in `clarify.md`).
- `GET /storage/public-objects/*` is unchanged (intentionally public).

### Q6 — Demo/seed callers of upload URL

**Decision: Enforce Clerk auth on `POST /storage/uploads/request-url`.** The frontend already attaches a Clerk token via `setAuthTokenGetter`, so authenticated UI uploads are unaffected. If the pre-implementation grep (check 6) finds an unauthenticated seed/demo caller, update that caller to authenticate rather than weakening the route. Return `401 { error: "Unauthorized" }` when no session.

### Q7 — Helper signature

**Decision: Every helper accepts an optional `db: DB = defaultDb` final argument** so it can later run inside a Drizzle transaction, while staying a no-arg-change drop-in for now.

---

## New Files & Edits Summary

| File | Action |
|---|---|
| `artifacts/api-server/src/lib/accessControl.ts` | **Create** — all helpers above |
| `artifacts/api-server/src/routes/bookings.ts` | Edit — gate `GET`/`PATCH /bookings/:id` |
| `artifacts/api-server/src/routes/meetings.ts` | Edit — gate `GET`/`PATCH /meetings/:id` |
| `artifacts/api-server/src/routes/agreements.ts` | Edit — gate `GET /:id`, rewrite `POST /:id/sign` role logic, verify `GET /:id/download` |
| `artifacts/api-server/src/routes/openaiChat.ts` | Edit — gate `GET`/`DELETE /:id`, add ownership to `POST /:id/messages` |
| `artifacts/api-server/src/routes/jobRequirements.ts` | Edit — gate `PATCH`/`DELETE /:id` |
| `artifacts/api-server/src/routes/storage.ts` | Edit — auth on upload URL, namespace path, ownership on private objects |
| `artifacts/api-server/validate-auth-hardening.mjs` | **Create** — automated validation runner |

No schema change. No OpenAPI change. No codegen. No frontend change.

---

## Pre-Implementation Checklist (agent must verify before Phase 2)

- [ ] `accessControl.ts` created and compiles (`pnpm --filter @workspace/api-server run typecheck`)
- [ ] `employer_profiles.userId` and `freelancer_profiles.userId` confirmed to exist
- [ ] `conversations.userId` confirmed to exist
- [ ] `agreements.bookingId` confirmed to exist
- [ ] Download route (917–1010) audited; finding recorded
- [ ] Upload-URL callers grepped; any unauthenticated caller noted

---

## Phase Execution Sign-Off

| Phase | Description | Status | Date |
|---|---|---|---|
| 1 | Create `accessControl.ts` helpers + typecheck | ⬜ Not started | — |
| 2 | Apply guards to all 11 routes + storage | ⬜ Not started | — |
| 3 | Validation pass (`validate-auth-hardening.mjs` + manual) | ⬜ Not started | — |

> There is **no Phase 3 frontend / Phase 4 admin work** for this feature — see `UI.md`. "Phase 3" here is the validation pass.

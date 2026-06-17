# TalentLock — Task Breakdown: Auth Hardening

## Summary

Two implementation phases plus a validation phase. **All work is backend-only.** No database migration, no OpenAPI change, no codegen, no frontend change. Phase 1 builds the shared helper; Phase 2 applies it to every unprotected route; Phase 3 validates.

Read `@project.md` and `@plan.md` before starting. `plan.md` wins on any conflict.

---

## Phase 1 — Shared Access-Control Helper

### Task 1.1 — Create `accessControl.ts`

**File:** `artifacts/api-server/src/lib/accessControl.ts` (create new)

Implement exactly the helpers defined in `plan.md`:
- `resolveUserByClerkId(clerkId, db?)`
- `profileIdsForUser(userId, db?)` (internal)
- `canAccessBooking(userId, bookingId, db?) → AccessResult`
- `canAccessMeeting(userId, meetingId, db?) → AccessResult`
- `canAccessJobRequirement(userId, jobId, db?) → AccessResult` (employer-only match)
- `canAccessConversation(userId, conversationId, db?) → AccessResult`
- `canAccessAgreement(userId, agreementId, db?) → AccessResult`
- `agreementRoleForUser(userId, agreementId, db?) → "employer" | "freelancer" | null`

Add a top-of-file comment block recording the pre-implementation check findings from `plan.md`.

**Acceptance:**
- [ ] File compiles: `pnpm --filter @workspace/api-server run typecheck`
- [ ] Helpers accept an optional trailing `db` argument defaulting to the shared `db`
- [ ] `AccessResult` discriminates `404` (missing) from `403` (not participant)
- [ ] Returns `true` when the user matches **either** an employer or freelancer profile (dual-profile accounts)

---

## Phase 2 — Apply Guards to Routes

> Standard pattern for every gated handler:
> ```ts
> const { userId: clerkId } = getAuth(req);
> if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
> const user = await resolveUserByClerkId(clerkId);
> if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
> const access = await canAccessBooking(user.id, id);
> if (!access.ok) { res.status(access.status).json({ error: access.status === 404 ? "Booking not found" : "Forbidden" }); return; }
> ```

### Task 2.1 — Bookings

**File:** `artifacts/api-server/src/routes/bookings.ts`

- `GET /bookings/:id` (line ~168): add auth + `canAccessBooking` before the existing read.
- `PATCH /bookings/:id` (line ~196): add auth + `canAccessBooking` **before** the `db.update`. Reuse the resolved `user` for the existing notification block (which currently re-resolves via `getAuth` at ~242) to avoid a double lookup.

**Acceptance:**
- [ ] Non-participant `GET` → `403`; unknown id → `404`; participant → `200` with unchanged body
- [ ] Non-participant `PATCH` → `403`; the update does not execute on `403`
- [ ] Negotiation route `POST /bookings/:id/negotiate` left unchanged (already correct)

### Task 2.2 — Meetings

**File:** `artifacts/api-server/src/routes/meetings.ts`

- `GET /meetings/:id` (line ~136): add auth + `canAccessMeeting`.
- `PATCH /meetings/:id` (line ~149): add auth + `canAccessMeeting` before `db.update`; reuse resolved user for the notification block (~165).

**Acceptance:**
- [ ] Emails + Jitsi link no longer returned to non-participants (`403`)
- [ ] Participant still receives full enriched meeting (`200`, unchanged body)

### Task 2.3 — Agreements (highest severity)

**File:** `artifacts/api-server/src/routes/agreements.ts`

- `GET /agreements/:id` (line ~473): add auth + `canAccessAgreement`.
- `POST /agreements/:id/sign` (line ~769): require auth; compute `derivedRole = agreementRoleForUser(user.id, id)`; if `null` → `403`. If body `role` is present it must equal `derivedRole` (else `403`); use the **derived** role for the write. Preserve all existing signed-state guards and the demo-freelancer auto-sign branch.
- `GET /agreements/:id/download` (line ~917): audit per `plan.md` Q4; if it only checks authentication, add `canAccessAgreement`.

**Acceptance:**
- [ ] Unauthenticated `sign` → `401`; non-participant `sign` → `403`
- [ ] A participant can only sign as their own role; body cannot override role
- [ ] Employer-first ordering and demo auto-sign still work end-to-end
- [ ] `GET /agreements/:id` and `/download` return `403` to non-participants
- [ ] Download finding recorded here: ____________________

### Task 2.4 — AI Conversations

**File:** `artifacts/api-server/src/routes/openaiChat.ts`

- `GET /openai/conversations/:id` (~47): add auth + `canAccessConversation`.
- `DELETE /openai/conversations/:id` (~61): add auth + `canAccessConversation` before delete.
- `POST /openai/conversations/:id/messages` (~73): after resolving `user`, add `canAccessConversation(user.id, id)` before inserting the message / calling OpenAI.

**Acceptance:**
- [ ] Non-owner `GET`/`DELETE`/`POST messages` → `403`
- [ ] Owner flows unchanged (`200`/`204`); token-quota `402` path still works

### Task 2.5 — Job Requirements

**File:** `artifacts/api-server/src/routes/jobRequirements.ts`

- `PATCH /job-requirements/:id` (~94): add auth + `canAccessJobRequirement`.
- `DELETE /job-requirements/:id` (~115): add auth + `canAccessJobRequirement` before delete.
- Leave `GET /job-requirements` and `GET /job-requirements/:id` **public** (non-goal).

**Acceptance:**
- [ ] Non-owner employer `PATCH`/`DELETE` → `403`; owner → `200`/`204`
- [ ] Public `GET` list/detail still return `200` without auth

### Task 2.6 — Storage

**File:** `artifacts/api-server/src/routes/storage.ts`

- `POST /storage/uploads/request-url` (~77): require Clerk auth (`401` when absent). Namespace the generated object path as `uploads/{userId}/...`.
- `GET /storage/objects/*path` (~144): keep the `documents/` admin gate. For the `uploads/{userId}/` private prefix, require an authenticated caller whose id matches the `{userId}` segment (else `403`). Leave legacy non-namespaced paths and `public-objects` unchanged.

**Acceptance:**
- [ ] Unauthenticated upload-URL request → `401`
- [ ] Authenticated UI upload flow still succeeds (token attached by `setAuthTokenGetter`)
- [ ] A user cannot read another user's `uploads/{otherId}/...` object (`403`)
- [ ] `documents/` admin gate and public objects behave as before

### Task 2.7 — Typecheck Gate

```bash
pnpm --filter @workspace/api-server run typecheck
```

**Acceptance:**
- [ ] Zero type errors across the server package

---

## Phase 3 — Validation

### Task 3.1 — Automated runner

**File:** `artifacts/api-server/validate-auth-hardening.mjs` (create new)

Mirror the structure of `validate-security-hardening.mjs`. For each gated route, assert: (a) no session → `401`, (b) wrong user → `403`, (c) correct participant → success with an unchanged body shape. Use the demo Clerk IDs from `validation.md`.

**Acceptance:**
- [ ] Runner exits non-zero if any check fails
- [ ] All checks pass against a locally running server

### Task 3.2 — Run `validation.md`

Complete every check in `validation.md` and fill the sign-off table.

---

## Dependency Order

```
Task 1.1  (accessControl.ts)
   ↓
Task 2.1 … 2.6  (apply guards — independent of each other, all depend on 1.1)
   ↓
Task 2.7  (typecheck)
   ↓
Task 3.1 → 3.2  (validation)
```

---

## Full Acceptance Checklist

- [ ] `accessControl.ts` created, typed, compiles
- [ ] `GET /bookings/:id` participant-gated
- [ ] `PATCH /bookings/:id` participant-gated (update blocked on 403)
- [ ] `GET /meetings/:id` participant-gated
- [ ] `PATCH /meetings/:id` participant-gated
- [ ] `GET /agreements/:id` participant-gated
- [ ] `POST /agreements/:id/sign` auth + role derived server-side (body cannot override)
- [ ] `GET /agreements/:id/download` participant-gated
- [ ] `GET /openai/conversations/:id` owner-gated
- [ ] `DELETE /openai/conversations/:id` owner-gated
- [ ] `POST /openai/conversations/:id/messages` owner-gated
- [ ] `PATCH /job-requirements/:id` owner-gated
- [ ] `DELETE /job-requirements/:id` owner-gated
- [ ] `POST /storage/uploads/request-url` auth-gated + path namespaced
- [ ] `GET /storage/objects/*` private-prefix ownership enforced
- [ ] Server typecheck passes
- [ ] `validate-auth-hardening.mjs` passes
- [ ] `validation.md` sign-off table complete

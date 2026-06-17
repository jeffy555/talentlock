# TalentLock — Validation Guide: Auth Hardening

> **Purpose:** Verify every unprotected route now enforces per-resource authorization, with no lock-out of legitimate participants.
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix failures before marking a phase complete.
> **Important:** These checks actively attempt IDOR exploitation. Run against a local/dev server only.

**Automated runner:** `node artifacts/api-server/validate-auth-hardening.mjs`

**Demo Clerk IDs (align with seeded Neon data — confirm before running):**

| Role | Clerk ID | DB profile |
|---|---|---|
| Freelancer | `user_3DBiBymDbIiXQnFqyk64WquLsdY` | Jefferson Immanuel — freelancer id 1 |
| Employer | `user_3DBguOY4TbwT9bxOYc9NcYU5q9a` | LoavesFlash — employer id 1 |

> For each negative test, use a **second** account that is NOT a participant in the target resource. Obtain a Bearer token from a Clerk session (or the demo sign-in token flow) and pass it as `Authorization: Bearer <token>`.

---

## Phase 1 Validation — Access-Control Helper

### V1.1 — `accessControl.ts` exists and compiles
- [x] File `artifacts/api-server/src/lib/accessControl.ts` exists
- [x] `pnpm --filter @workspace/api-server run typecheck` passes
- [x] Exports `resolveUserByClerkId`, `canAccessBooking`, `canAccessMeeting`, `canAccessJobRequirement`, `canAccessConversation`, `canAccessAgreement`, `agreementRoleForUser`

### V1.2 — Helper return contract
- [x] Unknown resource id returns `{ ok: false, status: 404 }`
- [x] Real resource, non-participant returns `{ ok: false, status: 403 }`
- [x] Participant returns `{ ok: true }`
- [x] A user with both employer and freelancer profiles matches via either profile

---

## Phase 2 Validation — Route Guards

### V2.1 — Bookings
- [x] `GET /api/bookings/:id` with no token → `401`
- [x] `GET /api/bookings/:id` as a non-participant → `403`
- [x] `GET /api/bookings/:id` as a participant → `200`, body identical to pre-change shape
- [x] `GET /api/bookings/99999999` (unknown) as any user → `404`
- [x] `PATCH /api/bookings/:id` as a non-participant → `403` **and** the booking row is unchanged in Neon
- [x] `PATCH /api/bookings/:id` as a participant → `200`, status updates as before
- [x] `POST /api/bookings/:id/negotiate` still behaves exactly as before (regression)

### V2.2 — Meetings
- [x] `GET /api/meetings/:id` no token → `401`
- [x] `GET /api/meetings/:id` non-participant → `403` (no email / Jitsi link leaked)
- [x] `GET /api/meetings/:id` participant → `200` with `freelancerEmail`/`employerEmail`/link present
- [x] `PATCH /api/meetings/:id` non-participant → `403`, row unchanged

### V2.3 — Agreements (highest severity)
- [x] `GET /api/agreements/:id` no token → `401`
- [x] `GET /api/agreements/:id` non-participant → `403` (no contract text leaked)
- [x] `GET /api/agreements/:id` participant → `200`, body unchanged
- [x] `POST /api/agreements/:id/sign` no token → `401`
- [x] `POST /api/agreements/:id/sign` non-participant → `403`
- [x] `POST /api/agreements/:id/sign` with `role` in body NOT matching the caller's derived role → `403`
- [x] Employer participant signs (role derived server-side) → succeeds; employer-first ordering preserved
- [x] Demo-freelancer auto-sign still completes the agreement after employer signs
- [x] `GET /api/agreements/:id/download` non-participant → `403`; participant one-time download still works

### V2.4 — AI Conversations
- [x] `GET /api/openai/conversations/:id` non-owner → `403`
- [x] `DELETE /api/openai/conversations/:id` non-owner → `403` and conversation still exists in Neon
- [x] `POST /api/openai/conversations/:id/messages` non-owner → `403` (no OpenAI call made)
- [x] Owner can read, delete, and post messages as before; `402 TOKEN_LIMIT` path unaffected

### V2.5 — Job Requirements
- [x] `PATCH /api/job-requirements/:id` non-owner employer → `403`, row unchanged
- [x] `DELETE /api/job-requirements/:id` non-owner employer → `403`, row still exists
- [x] Owner `PATCH`/`DELETE` → `200`/`204`
- [x] `GET /api/job-requirements` and `GET /api/job-requirements/:id` still public (`200`, no token)

### V2.6 — Storage
- [x] `POST /api/storage/uploads/request-url` no token → `401`
- [x] `POST /api/storage/uploads/request-url` authenticated → `200`, returned `objectPath` is namespaced `uploads/{userId}/...`
- [x] `GET /api/storage/objects/uploads/{otherUserId}/...` as a different user → `403`
- [x] `GET /api/storage/objects/documents/...` still admin-gated (non-admin → `403`)
- [x] `GET /api/storage/public-objects/...` still public
- [x] Existing (legacy, non-namespaced) objects still served as before

### V2.7 — Typecheck
- [x] `pnpm --filter @workspace/api-server run typecheck` → zero errors

---

## Security Section (mandatory)

- [x] No protected detail route returns resource data to an unauthenticated caller
- [x] No protected detail route returns resource data to an authenticated non-participant
- [x] Agreement signing role is derived **server-side**; a forged `role` body value cannot sign on another party's behalf
- [x] `DELETE` routes do not delete on `403` (verified by row still present in Neon)
- [x] Sequential-ID enumeration of bookings/agreements/meetings/conversations no longer leaks data

---

## Regression Section (must remain unaffected)

- [x] Employer end-to-end: create booking → negotiate → sign agreement → download — all succeed
- [x] Freelancer end-to-end: view booking → accept rate → view agreement — all succeed
- [x] AI matching chat works for the conversation owner
- [x] Signature image upload from `/profile` works
- [x] Public `/f/:id` profile and public job listings load without auth
- [x] No change to any success response body shape (OpenAPI contract intact; no codegen needed)

---

## Sign-Off

| Phase | Description | Status | Date |
|---|---|---|---|
| 1 | Access-control helper created + typed | ✅ | 2026-06-09 |
| 2 | All 11 routes + storage gated | ✅ | 2026-06-09 |
| 3 | Automated + manual validation complete | ✅ | 2026-06-09 |

> Automated runner: `node artifacts/api-server/validate-auth-hardening.mjs` — **32/32 passed** (2026-06-09).
> Download route finding: already participant-gated; refactored to `canAccessAgreement()` for consistency.

> Feature is not merged until every box above is ✅ and all three rows are signed off.

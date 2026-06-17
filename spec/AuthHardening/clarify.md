# TalentLock — Clarification & Verification: Auth Hardening

This file audits `features.md` against the live codebase and `project.md` to surface gaps, risks, and decisions that must be resolved before `task.md` is executed. Every claim below was checked against the actual route source on 2026-06-09.

---

## ✅ Verified — Confirmed Against the Live Codebase

| Item | Verified Against |
|---|---|
| Clerk auth via `getAuth(req)` is the standard pattern | `bookings.ts`, `meetings.ts`, `jobRequirements.ts`, `openaiChat.ts` |
| A correct ownership pattern already exists | `milestones.ts` — `resolveUser()` + `canAccessBooking()` → `403` |
| A second correct example exists | `POST /bookings/:id/negotiate` checks `isFreelancer`/`isEmployer` → `403` (`bookings.ts:309–313`) |
| `freelancer_profiles` carries both `clerkId` and `userId` | `milestones.ts` uses `.userId`; `bookings.ts` uses `.clerkId` |
| `employer_profiles` carries both `clerkId` and `userId` | same as above |
| `GET /bookings/:id` has no auth | `bookings.ts:168` — no `getAuth`, no ownership check |
| `PATCH /bookings/:id` mutates before auth | `bookings.ts:196` — update at line 205, `getAuth` only at line 242 (notifications) |
| `GET /meetings/:id` has no auth | `meetings.ts:136` — exposes emails + Jitsi link via `enrichMeeting` |
| `PATCH /meetings/:id` mutates before auth | `meetings.ts:149` — update at line 158, `getAuth` only at line 165 |
| `GET /agreements/:id` has no auth | `agreements.ts:473` |
| `POST /agreements/:id/sign` has no auth; role from body | `agreements.ts:769` — role read from `parsed.data.role` |
| `GET /openai/conversations/:id` has no auth | `openaiChat.ts:47` |
| `DELETE /openai/conversations/:id` has no auth | `openaiChat.ts:61` |
| `POST /openai/conversations/:id/messages` lacks ownership check | `openaiChat.ts:73` — has `getAuth`, never compares `conv.userId` |
| `PATCH /job-requirements/:id` has no ownership check | `jobRequirements.ts:94` |
| `DELETE /job-requirements/:id` has no ownership check | `jobRequirements.ts:115` |
| `POST /storage/uploads/request-url` unauthenticated | `storage.ts:77` |
| `GET /storage/objects/*` ACL commented out (except `documents/`) | `storage.ts:144–185` — `documents/` admin-gated at 149 |
| Error style `res.status(4xx).json({ error })` is consistent | all route files |
| No OpenAPI/codegen change needed (response shapes unchanged) | confirmed — only status codes added on auth failure |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Which profile key should the helpers join on: `clerkId` or `userId`?

**Question:** `milestones.ts` resolves the internal `users` row first and joins profiles on `userId`; `bookings.ts` joins profiles directly on `clerkId`. Which convention should `accessControl.ts` use?

**Impact:** Inconsistent joins risk a helper silently returning `false` for a legitimate participant (lock-out) or, worse, a wrong match.

**Recommendation:** Resolve the `users` row from `clerkId` once (`resolveUserByClerkId`), then join profiles on `userId`, mirroring `milestones.ts`. Resolved in `plan.md` Q1.

---

### Q2 — `403` vs `404` for an authenticated non-participant?

**Question:** When an authenticated user requests a real resource they don't own, do we return `403` (reveals the ID exists) or `404` (hides existence)?

**Impact:** Affects information disclosure and must match the existing pattern so tests are consistent.

**Recommendation:** Match `milestones.ts`: real-but-unauthorised → `403`, unknown ID → `404`. Resolved in `plan.md` Q2.

---

### Q3 — How is the signer's true role derived on `POST /agreements/:id/sign`?

**Question:** Today the role comes from the request body. What is the source of truth for whether the caller is the employer or the freelancer on that agreement?

**Impact:** This is the highest-severity fix. If derived incorrectly, either signing breaks or the IDOR persists.

**Recommendation:** Resolve the caller's `users` row, load the agreement → its booking, then determine the role by matching the caller's employer/freelancer profile id against `booking.employerId` / `booking.freelancerId`. Reject (`403`) if the caller is neither. Ignore any `role` value in the body, or require it to equal the derived role. Resolved in `plan.md` Q3.

---

### Q4 — Does `GET /agreements/:id/download` already enforce participation?

**Question:** The download route reads `getAuth` (`agreements.ts:920`). Does it also verify the caller is a participant, or only that they are logged in?

**Impact:** If it only checks authentication, it is a second agreement IDOR (any logged-in user downloads any contract).

**Recommendation:** Inspect lines 917–1010 during implementation. If participation is not enforced, apply `canAccessAgreement()`. Resolved in `plan.md` Q4.

---

### Q5 — Storage path namespacing: does changing the upload path break existing reads?

**Question:** Module 7 namespaces uploads under `uploads/{userId}/`. Existing objects are not under that prefix. Will enforcing ownership-by-path break access to already-stored signatures/portfolio images?

**Impact:** A naive ACL that assumes every object path contains a user id would `403` all legacy objects.

**Recommendation:** Apply ownership enforcement only to the new namespaced private prefix; treat the existing `documents/` admin gate as-is; leave public prefixes (`/storage/public-objects/*`) unchanged. Existing non-namespaced objects continue to be served as today (no retroactive lock-out). Resolved in `plan.md` Q5.

---

### Q6 — Is storage upload auth allowed to break the current demo/seed flows?

**Question:** Adding Clerk auth to `POST /storage/uploads/request-url` will reject unauthenticated callers. Do any seed scripts or demo flows call it without a session?

**Recommendation:** Grep for callers of `request-url` in `scripts/` and the frontend before enforcing. The frontend already attaches a Clerk token via `setAuthTokenGetter`, so authenticated UI flows are unaffected. Resolved in `plan.md` Q6.

---

### Q7 — Should `canAccess*` helpers take `db` as a parameter or import it?

**Question:** `milestones.ts` uses the module-level `db` import directly. Should the new helpers accept a `db`/`tx` argument for transaction safety?

**Recommendation:** Accept an optional `db` argument defaulting to the shared `db` import, so the helpers can run inside a transaction later if needed but stay simple now. Resolved in `plan.md` Q7.

---

## ⚠️ Risks & Notes

### Risk 1 — Locking out legitimate users (the inverse failure)
The biggest implementation risk is an over-strict check that returns `403` to real participants. Mitigation: reuse the exact join convention from `milestones.ts`, and validation must include a **positive** test (participant gets `200`) for every route, not only the negative `403` test.

### Risk 2 — A user with BOTH an employer and a freelancer profile
Some accounts may have both profiles (the booking list query already handles this case). Helpers must return `true` if **either** profile matches the resource, not assume a single role.

### Risk 3 — Demo freelancer auto-sign must survive the agreement fix
`POST /agreements/:id/sign` auto-signs on behalf of demo freelancers (clerkId starting `demo_`). The role-derivation fix must not disable this branch — the employer still signs first, and the demo auto-sign continues to run.

### Risk 4 — PATCH handlers read `getAuth` late for notifications
In `bookings.ts` and `meetings.ts` the existing notification logic resolves the caller's profiles *after* the update. When we add the early auth gate, we resolve the user once up front and should reuse that result for the notification block rather than resolving twice.

### Risk 5 — No response-shape changes (protect the contract)
Adding authorization must only add `401`/`403` branches. Success responses must remain byte-for-byte identical so the OpenAPI contract and generated hooks stay valid (no codegen). Validation includes a regression check that authorised responses are unchanged.

### Risk 6 — Sequential integer IDs make IDOR trivial to exploit
All these resources use sequential integer primary keys, so guessing valid IDs is trivial. This raises severity but does not change the fix; switching to UUIDs is explicitly out of scope.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Profile join key (`clerkId` vs `userId`) | Task 1.1 (create `accessControl.ts`) |
| Q2 | `403` vs `404` policy | Task 1.1 (helper return contract) |
| Q3 | Signer role source of truth | Task 2.3 (agreement sign fix) |
| Q4 | Download route participation check | Task 2.3 (agreement routes) |
| Q5 | Storage path namespacing vs legacy objects | Task 2.5 (storage ACL) |
| Q6 | Demo/seed callers of upload URL | Task 2.5 (storage auth) |

Q7 is resolved in `plan.md` and does not block.

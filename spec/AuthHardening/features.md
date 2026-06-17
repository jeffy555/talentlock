# TalentLock — Features Specification: Auth Hardening (Access Control)

## Overview

TalentLock has been built feature-first. The product works — bookings, agreements, meetings, AI matching, analytics, and the engagement lifecycle are all live. But a full codebase review (June 2026) found that a set of resource routes return or mutate sensitive data **without verifying that the caller owns or participates in the resource**. These are classic IDOR (Insecure Direct Object Reference) gaps: any caller can read, change, sign, or delete another user's data simply by guessing a sequential integer ID.

This is distinct from the already-completed `SecurityHardening` spec, which covered request size limits, input sanitisation, admin CSRF, log redaction, audit logging, and GDPR deletion. **None of those items added per-resource authorization.** This spec closes that gap.

This is a **P0 production blocker.** It must be closed before TalentLock handles real users, real agreements, or real payments. No new database tables, no OpenAPI changes, and no user-facing UI are required — this is a pure backend authorization feature plus a regression-safe test pass.

The correct pattern **already exists in the codebase** — `artifacts/api-server/src/routes/milestones.ts` resolves the Clerk user, loads the resource, and calls a `canAccessBooking()` helper that returns `403` when the caller is not a participant. `POST /bookings/:id/negotiate` (in `bookings.ts`) does the same. This feature extracts that pattern into a shared helper and applies it to every unprotected route.

---

## Module 1 — Shared Access-Control Helpers

**Problem:** The ownership-check logic in `milestones.ts` is private to that file. Every other route either re-implements it inconsistently or skips it entirely.

**Fix:** Create a single shared module `artifacts/api-server/src/lib/accessControl.ts` exporting typed helpers that each resource route calls before reading or mutating:

- `resolveUserByClerkId(clerkId)` — Clerk ID → internal `users` row (or `null`)
- `canAccessBooking(userId, bookingId)` — true if caller is the booking's employer or freelancer
- `canAccessAgreement(userId, agreementId)` — resolves the agreement's booking, then checks participation
- `canAccessConversation(userId, conversationId)` — true if `conversations.userId === userId`
- `canAccessMeeting(userId, meetingId)` — true if caller is the meeting's employer or freelancer
- `canAccessJobRequirement(userId, jobId)` — true if caller is the job's owning employer

Each helper resolves the relevant `freelancer_profiles` / `employer_profiles` row (these tables carry both `clerkId` and `userId`) and compares against the resource's `employerId` / `freelancerId`. A missing resource returns a value that lets the route respond `404`; a present-but-unauthorised resource lets the route respond `403`.

---

## Module 2 — Booking Route Authorization

**Problem:**
- `GET /bookings/:id` — no auth at all. Exposes negotiated rates, review, and party names to anyone.
- `PATCH /bookings/:id` — the update runs **before** any authentication; `getAuth` is only read later for notifications. Anyone can change any booking's status (e.g. mark it `completed` or `cancelled`).

**Fix:** Both handlers require a Clerk session and a `canAccessBooking()` check before reading or mutating. Non-participants get `403`; unknown IDs get `404`.

---

## Module 3 — Meeting Route Authorization

**Problem:**
- `GET /meetings/:id` — no auth. `enrichMeeting()` exposes both parties' **email addresses** and the **Jitsi meeting link**.
- `PATCH /meetings/:id` — update runs before any auth check.

**Fix:** Both handlers require a Clerk session and a `canAccessMeeting()` check.

---

## Module 4 — Agreement Route Authorization (Highest Severity)

**Problem:**
- `GET /agreements/:id` — no auth. Full legal contract text exposed by ID.
- `POST /agreements/:id/sign` — **no authentication whatsoever, and the signing role (`employer` / `freelancer`) is read from the request body.** Anyone can sign any agreement as either party. This is the single most dangerous gap in the codebase.

**Fix:**
- `GET /agreements/:id` requires a Clerk session and `canAccessAgreement()`.
- `POST /agreements/:id/sign` requires a Clerk session, resolves the caller's actual role from their profile (not the request body), confirms the caller is the matching participant for the role they are signing as, and only then applies the signature. The existing demo-freelancer auto-sign behaviour is preserved.
- `GET /agreements/:id/download` is audited in this spec to confirm it already enforces participant access (it reads `getAuth` — verify it also checks participation, not just authentication).

---

## Module 5 — AI Conversation Route Authorization

**Problem:**
- `GET /openai/conversations/:id` — no auth or ownership check.
- `DELETE /openai/conversations/:id` — no auth or ownership check. Anyone can delete any user's conversation.
- `POST /openai/conversations/:id/messages` — authenticates the user but never checks `conversation.userId === user.id`, so an authenticated user can inject messages into anyone's conversation.

**Fix:** All three handlers require a Clerk session and a `canAccessConversation()` check.

---

## Module 6 — Job Requirement Mutation Authorization

**Problem:**
- `PATCH /job-requirements/:id` — no auth or employer-ownership check. Anyone can edit any job posting.
- `DELETE /job-requirements/:id` — no auth or employer-ownership check. Anyone can delete any job posting.

**Fix:** Both handlers require a Clerk session and a `canAccessJobRequirement()` check. `GET /job-requirements` and `GET /job-requirements/:id` remain public-readable by design (job postings are discoverable), so they are explicitly **not** gated — see Non-Goals.

---

## Module 7 — Storage Access Control

**Problem:**
- `POST /storage/uploads/request-url` — unauthenticated. Anyone can request a presigned upload URL.
- `GET /storage/objects/*path` — the ownership ACL is commented out. Only the `documents/` prefix is currently protected (admin-only). Signature images and portfolio assets are served without an ownership check.

**Fix:**
- Require a Clerk session on `POST /storage/uploads/request-url`.
- Namespace uploaded object paths by the caller's user ID (`uploads/{userId}/...`) so ownership can be derived from the path.
- Enforce ownership on `GET /storage/objects/*path` for private prefixes, keeping the existing `documents/` admin gate intact.

---

## Standard Error Contract

All authorization failures use a consistent shape, matching the existing codebase style:

- Not authenticated → `HTTP 401 { "error": "Unauthorized" }`
- Authenticated but not permitted → `HTTP 403 { "error": "Forbidden" }`
- Resource does not exist → `HTTP 404 { "error": "<Resource> not found" }`

To avoid leaking existence of resources to non-participants, an authenticated non-participant requesting a real ID receives `403` (consistent with the existing `milestones.ts` pattern). Unknown IDs receive `404`.

---

## Non-Goals

This phase does **not** cover:

- **Stripe / real billing** — separate future spec.
- **Automated test framework setup (Vitest/Supertest)** — this spec adds targeted integration checks via the existing `validate-*.mjs` script pattern, not a new test runner.
- **Rate limiting, CORS lockdown, trust-proxy, production boot guards** — these are P3 production-config items; track them in a separate `ProductionReadiness` spec.
- **Public read endpoints** — `GET /job-requirements`, `GET /job-requirements/:id`, `GET /freelancers`, `GET /freelancers/:id`, and the public profile route (`/f/:id`) remain intentionally public.
- **N+1 query optimisation** on list endpoints — performance item, tracked separately.
- **Re-architecting Clerk auth** — Clerk remains the auth provider; this spec only adds per-resource authorization on top of it.
- **Changing the OpenAPI contract** — no request/response shapes change, so no codegen is required.

# TalentLock — UI Specification: Auth Hardening

## Overview

**This feature has no frontend work.** It is a pure backend authorization hardening pass. No new pages, no new components, no new React Query hooks, no copy changes, and no codegen.

This file exists only to satisfy the six-file spec convention and to document the **expected frontend behaviour** after the backend guards are in place — so that a developer running `validation.md` knows what is normal versus a regression.

---

## Why There Is No UI Change

- All affected endpoints keep their existing **success** request/response shapes. The only new responses are `401` / `403` / `404`, which the frontend already handles generically.
- The React Query client is already configured to **not retry 4xx errors** (`App.tsx`), so a `403` surfaces immediately without retry storms.
- Authenticated UI flows already attach a Clerk token via `setAuthTokenGetter` (`App.tsx`), so adding auth to `POST /storage/uploads/request-url` does not change the happy path.

---

## Expected Behaviour After Hardening (no code changes required)

| Scenario | Before | After | Frontend impact |
|---|---|---|---|
| Logged-in participant opens their own booking / agreement / meeting | `200` | `200` (identical body) | None |
| Logged-in user opens someone else's resource by guessing an ID | `200` (leak) | `403` | Existing error UI shows (no leak) |
| Logged-out request to a protected detail route | `200` (leak) | `401` | Redirect/sign-in path already handled |
| Owner edits/deletes their job posting | `200` / `204` | `200` / `204` | None |
| Non-owner edits/deletes a job posting | `200` (leak) | `403` | Existing error UI shows |
| Signing an agreement as the correct party | success | success | None |
| Authenticated upload via the profile/signature flow | success | success | None |

---

## Regression Watch-List (for `validation.md`)

These existing user journeys must continue to work unchanged. If any returns `403` for a legitimate participant, that is a **lock-out regression** (see `clarify.md` Risk 1) and must be fixed before sign-off:

1. Employer opens a booking they created → booking detail loads.
2. Freelancer opens a booking they are part of → booking detail loads.
3. Employer signs an agreement, demo freelancer auto-signs → agreement completes.
4. Either party downloads their one-time certified agreement copy → succeeds once.
5. Employer edits/closes their own job posting → succeeds.
6. Employer sends a message in their own AI matching conversation → succeeds.
7. User uploads a signature image from `/profile` → succeeds.
8. Public visitor views `/f/:id` and the public job list → still public.

---

## Components

| Component | New / Modified | Task |
|---|---|---|
| _None_ | — | — |

No component file is created or modified by this feature.

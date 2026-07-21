# TalentLock — Features Specification: Freelancer Watchlist

## Overview

Employers browsing the Talent Vault often find promising freelancers before a role is ready to fill, a budget is approved, or a comparison set is complete. Today they can tap the heart icon to save a freelancer, but the experience is thin: no dedicated watchlist view for non-enterprise employers (only a filter chip that appears after the first save), no private notes, no alerts when a watched freelancer becomes available or changes their rate, and the backend list endpoint uses an N+1 query pattern.

**Freelancer Watchlist** formalises and completes the employer's personal talent pipeline. Employers save freelancers to a persistent watchlist, review them in a dedicated panel, attach private notes, and receive in-app notifications when key signals change. Enterprise team members continue to use the existing **Team Shortlist** (`team_shortlist` table) — this feature hardens and extends the personal `saved_freelancers` path only.

All employer plans. No token consumption. No AI involved.

---

## Feature Modules

### Module 1 — Personal Watchlist Persistence (Hardening)

Reuse the existing `saved_freelancers` table (`employerUserId`, `freelancerId`, `createdAt`). No table rename in this phase — "Watchlist" is the user-facing product name; the DB table stays `saved_freelancers`.

Enhancements:

| Addition | Purpose |
|----------|---------|
| `notes` (text, nullable, max 500 chars) | Private employer notes per watched freelancer |
| `lastAlertAt` (timestamptz, nullable) | Debounce watchlist change notifications (max one per employer–freelancer pair per 24 h) |

Existing endpoints are retained and hardened:

```
GET  /api/freelancers/saved          List watchlist (employer only)
GET  /api/freelancers/:id/saved      Check if freelancer is on watchlist
POST /api/freelancers/:id/save       Toggle save/unsave (employer only)
```

New endpoint:

```
PATCH /api/freelancers/:id/watchlist   Update private notes (employer only, must already be saved)
```

`GET /api/freelancers/saved` returns a typed `WatchlistItem[]` (not a bare `FreelancerProfile[]`): each item includes `savedAt`, `notes`, and a nested `freelancer` snapshot with the same card fields used in Talent Vault (name, rates, availability, verification, ratings, `expiringCredential`).

### Module 2 — Plan Limits

| Plan | Personal watchlist limit |
|------|--------------------------|
| `employer_starter` | 25 freelancers |
| `employer_growth` | 100 freelancers |
| `employer_enterprise` | Personal watchlist disabled — active team members use **Team Shortlist** instead |

When an employer at limit tries to add a new freelancer, `POST /api/freelancers/:id/save` returns HTTP 402:

```json
{ "error": "Watchlist limit reached", "code": "PLAN_LIMIT", "planNeeded": "employer_growth" }
```

Removing a freelancer from the watchlist is always allowed regardless of plan.

### Module 3 — Dedicated Watchlist View (Talent Vault)

Non-enterprise employers get a **Watchlist** tab on `/freelancers`, mirroring the enterprise **Team Shortlist** tab pattern:

```
[Search results]   [Watchlist (N)]
```

The Watchlist tab shows saved freelancers as cards (same `FreelancerCard` component), sorted by `savedAt` descending, with:

- Heart toggle to remove
- Inline notes editor (expand/collapse per card)
- Quick actions: View profile, Book, Message (when messaging is available)

The legacy "Shortlist filter chip" in search mode is removed — the tab replaces it.

Enterprise team members see **Team Shortlist** only (unchanged). Personal watchlist endpoints return `[]` / `403` for active team members to avoid two parallel lists.

### Module 4 — Dashboard Watchlist Summary

Employer dashboard (`/dashboard`) shows a **Your Watchlist** card when the employer has ≥ 1 saved freelancer (non-enterprise) or ≥ 1 team shortlist entry (enterprise):

- Count badge
- Up to 3 freelancer avatars/names (most recently added)
- CTA: "View watchlist" → `/freelancers` with the watchlist tab active (`?view=watchlist`)

Hidden when watchlist is empty. Freelancers never see this card.

### Module 5 — Change Alerts (In-App Only)

When a watched freelancer's profile changes in ways that matter to hiring decisions, employers who saved them receive an in-app notification (`WATCHLIST_UPDATE`).

**Triggers** (evaluated fire-and-forget after `PUT /api/freelancers/me` succeeds):

| Change | Notification copy |
|--------|-------------------|
| `isAvailable` flips `false → true` | `{name} is now available for new engagements` |
| `hourlyRate` or `dailyRate` changes by ≥ 5% | `{name} updated their rate` |

**Debounce:** Skip if `saved_freelancers.lastAlertAt` for that pair is within the last 24 hours. Update `lastAlertAt` when a notification is sent.

**Non-triggers:** Bio edits, skill list changes, photo updates, verification badge changes (employers can check the profile). No email in this phase — in-app notification only, respecting existing notification centre patterns.

Freelancers are **never** told they are on someone's watchlist (privacy).

### Module 6 — Regression Tests & API Contract

- Unit tests for watchlist limit helper and change-detection logic
- Integration tests for save/list/notes/limit/auth isolation
- OpenAPI schemas updated: `WatchlistItem`, `PatchWatchlistNotesBody`
- Fix N+1 in `GET /api/freelancers/saved` — single JOIN query

---

## Non-Goals

- Renaming the `saved_freelancers` database table (internal name unchanged)
- **Saved search / filter presets** with alerts on new Vault matches — separate roadmap item (`docs/TalentLock-Application-Review.md`)
- Email or push notifications for watchlist changes — in-app only in this phase
- Freelancer visibility into who saved them — privacy by design
- Replacing or merging **Team Shortlist** (`team_shortlist`) — enterprise shared list remains separate
- Watchlist sharing between employers (non-team)
- Job-to-watchlist linking ("save for Job X") — future enhancement
- Admin console changes
- Token/quota consumption for any watchlist action

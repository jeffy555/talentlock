# TalentLock — Features Specification: Product Gaps

## Overview

Six product gaps that users will notice in normal day-to-day usage of TalentLock. None require new database tables. Each is individually small but together they meaningfully close the gap between a "working platform" and a "polished product." They are grouped into one feature because they share no dependencies between each other, can be implemented in any order within the feature, and each touches the same existing surfaces (booking flow, Talent Vault, freelancer profile, list endpoints).

---

## Module 1 — Email Notifications

**The problem:** The Notifications Centre is in-app only. If a user is not currently logged in when a booking is confirmed, an agreement is ready to sign, or a milestone is approved, they have no way of knowing. Critical events go unnoticed for hours or days. This is the single most impactful UX gap on the platform.

**What it builds:** Transactional emails sent via **Resend** (or SendGrid as fallback) triggered by the same 15 events that trigger in-app notifications. The email contains the same message as the in-app notification plus a direct link to the relevant entity page.

Email templates (plain HTML, no external template service):
- Subject: derived from the notification `type` field
- Body: notification `message` + a CTA button linking to the entity page
- Footer: unsubscribe link (sets a preference on `users` table)

New column on `users`:
```ts
emailNotificationsEnabled: boolean, default true
```

New utility: `sendNotificationEmail(to, subject, message, ctaUrl)` in `artifacts/api-server/src/lib/emailService.ts`.

Called fire-and-forget (`.catch()`) from the same points where `createNotification()` is called. If email delivery fails, the in-app notification is already created — the email failure is logged but never bubbles up to the user.

**API routes:**
- `PATCH /api/users/me/notification-preferences` — toggle email notifications on/off

**Plan gating:** All plans. No token consumption.

---

## Module 2 — Talent Vault Keyword Search

**The problem:** Employers browsing the Talent Vault can filter by field, rate, and availability — but cannot search by keyword. An employer who wants "a developer with PostgreSQL experience and Docker knowledge" has no way to express this. They must browse all freelancers in the Development field and read each bio individually.

**What it builds:** A keyword search input on the `/freelancers` Talent Vault page. The query is sent as `?q=postgresql+docker` to `GET /api/freelancers`. The backend uses PostgreSQL full-text search (`tsvector` + `to_tsquery`) across `freelancer_profiles.bio` and `freelancer_profiles.skills`.

Implementation:
- Add a generated `tsvector` column to `freelancer_profiles` using `to_tsvector('english', coalesce(bio, '') || ' ' || coalesce(skills_text, ''))`
- Create a GIN index on the `tsvector` column for fast search
- When `?q=` is present in `GET /api/freelancers`, add a `WHERE tsvector_col @@ to_tsquery('english', $query)` clause
- Results are ranked by `ts_rank()` when a search query is present

No external search service. PostgreSQL handles it natively.

New column on `freelancer_profiles`:
```ts
searchVector: customType 'tsvector' — generated, not user-editable
```

**Plan gating:** All employer plans.

---

## Module 3 — Profile Completeness Gate

**The problem:** A freelancer can appear in the Talent Vault and accept bookings with an empty bio, no skills listed, no rate set, and no profile photo. This creates a poor employer experience — a "freelancer" with a blank profile who accepts bookings signals low quality to everyone else on the platform.

**What it builds:** A profile completeness score (0–100%) calculated server-side. Freelancers are gated from appearing in Talent Vault searches until they reach a minimum score of 60%.

Scoring criteria (weights):
| Field | Points |
|---|---|
| Profile photo uploaded | 15 |
| Bio (min 50 characters) | 20 |
| Skills (min 2 skills) | 20 |
| Rate set | 15 |
| Field of work set | 15 |
| Availability set (`isAvailable` + `availableFrom`) | 15 |
| **Total** | **100** |

New column on `freelancer_profiles`:
```ts
completenessScore: integer, default 0
```

Updated whenever any profile field changes (`PUT /api/freelancers/me`).

The Talent Vault endpoint (`GET /api/freelancers`) adds a filter:
```ts
.where(gte(freelancerProfiles.completenessScore, 60))
```

Freelancers below 60% see a completeness banner on their `/profile` page showing which fields are missing and their current score. The banner links to the relevant section.

No plan gate — applies to all freelancer plans.

---

## Module 4 — Booking Request Message

**The problem:** When an employer creates a booking, there is no way to include context. The freelancer receives a bare booking notification with no information about the project, the timeline, or why the employer chose them. This forces freelancers to either accept/decline blindly or send a meeting request just to get basic information.

**What it builds:** An optional `message` field on `POST /api/bookings`. Max 500 characters. Stored on the `bookings` table. Displayed on `/bookings/:id` for both parties. Included in the `booking_created` notification message sent to the freelancer.

New column on `bookings`:
```ts
message: text — nullable, max 500 chars validated server-side
```

Frontend: A textarea shown on the booking creation form (existing `/freelancers/:id` booking flow), below the rate field and above the submit button. Labelled "Message to freelancer (optional)".

**Plan gating:** All employer plans.

---

## Module 5 — List Pagination

**The problem:** `GET /api/bookings`, `GET /api/agreements`, and `GET /api/meetings` return all records for the authenticated user. For a power user with 50+ bookings, 30+ agreements, and 20+ meetings, this response is slow to compute and slow to render. The frontend lists all items with no pagination, which becomes unusable at scale.

**What it builds:** Consistent `?page=` and `?pageSize=` query params added to the three list endpoints. Default `pageSize: 20`, max `pageSize: 100`. Response shape updated to include pagination metadata:

```ts
{
  data: T[],
  total: number,
  page: number,
  pageSize: number,
  totalPages: number
}
```

Consistent with the reviews and notifications pagination already in place.

Frontend: Pagination controls (Prev / Page N of M / Next) added to the `/bookings`, `/agreements`, and `/meetings` list pages.

**No OpenAPI codegen change required** — the existing hooks already pass through query params. Only the response shape changes, which requires a codegen update.

**Plan gating:** All plans.

---

## Module 6 — Public Profile Preview

**The problem:** Freelancers edit their profile on `/profile` but cannot see what it looks like on their public `/f/:id` page before sharing the URL. They may not know their bio is too short, their portfolio images are broken, or their availability is showing incorrectly.

**What it builds:** A "Preview public profile" link added to the `/profile` page header, next to the "Edit" or "Save" button. Clicking it opens `/f/:id` in a new browser tab.

The freelancer's internal `id` is already available from `GET /api/freelancers/me` (or `GET /api/users/me`). The link is simply:

```tsx
<a href={`/f/${freelancerId}`} target="_blank" rel="noopener noreferrer">
  Preview public profile ↗
</a>
```

This is a one-line frontend addition. Zero backend changes. Zero new API routes.

**Plan gating:** All freelancer plans.

---

## Summary — What Each Module Touches

| Module | New DB Table | New DB Column | New API Routes | Codegen | Frontend Pages |
|---|---|---|---|---|---|
| 1 — Email Notifications | None | `users.emailNotificationsEnabled` | `PATCH /api/users/me/notification-preferences` | Yes | `/profile` (preferences) |
| 2 — Keyword Search | None | `freelancer_profiles.searchVector` (generated) | None (extends existing) | Yes (query param) | `/freelancers` |
| 3 — Profile Completeness | None | `freelancer_profiles.completenessScore` | None (extends existing) | No | `/profile`, `/freelancers` |
| 4 — Booking Message | None | `bookings.message` | None (extends existing) | Yes (field added) | `/freelancers/:id`, `/bookings/:id` |
| 5 — List Pagination | None | None | None (extends existing) | Yes (response shape) | `/bookings`, `/agreements`, `/meetings` |
| 6 — Profile Preview | None | None | None | No | `/profile` |

---

## Plan Gating Summary

| Module | Employer | Freelancer | Public |
|---|---|---|---|
| Email Notifications | ✅ All plans | ✅ All plans | N/A |
| Keyword Search | ✅ All plans | N/A | N/A |
| Profile Completeness | N/A | ✅ All plans | Read effect |
| Booking Message | ✅ All plans | Read only | N/A |
| List Pagination | ✅ All plans | ✅ All plans | N/A |
| Profile Preview | N/A | ✅ All plans | N/A |

---

## Non-Goals (Out of Scope for This Feature)

- Push notifications (mobile or browser)
- Email digest / summary emails (weekly/monthly)
- Custom email templates per employer (enterprise feature)
- Advanced search with boolean operators, fuzzy matching, or relevance tuning
- Profile completeness gamification (badges, leaderboards)
- Employer-submitted feedback for freelancer profile improvement
- Meeting list pagination (meetings are typically few — defer if usage grows)
- Infinite scroll on list pages (use page-based pagination for consistency)
- Filtering bookings/agreements by status on the list page (separate feature)

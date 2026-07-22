# TalentLock — Features Specification: Post-Engagement AI Debrief

## Overview

When a booking ends, both parties are left without structured closure. Employers wonder whether the engagement succeeded, whether they would hire again, and what to document internally. Freelancers wonder how they performed, what to highlight on their profile, and what to improve next time.

TalentLock already sends a status notification and unlocks the **public review** flow when a booking moves to `completed`. Reviews are short, employer-authored, and visible on the freelancer's profile. They do not give either party a **private, structured retrospective** of the engagement.

**Post-Engagement AI Debrief** closes that gap. When a booking's status changes to `completed`, TalentLock automatically generates a **role-specific AI debrief** for **both** the employer and the freelancer. Each party sees only their own version on `/bookings/:id`. The debrief is cached on the booking row (same pattern as `meetings.briefContent`) and delivered via in-app notification when ready.

This is the mirror of **AI Meeting Brief Generator** (pre-engagement, employer-only, meeting confirmed). Debrief = post-engagement, both parties, booking completed.

```
Meeting Brief (pre)  →  Booking (active)  →  Debrief (post)  →  Review (public)
     employer only         both parties         both private         employer → freelancer
```

---

## Feature Modules

### Module 1 — Debrief Generation Trigger

The debrief is generated automatically when a booking's status changes to `completed`.

**Trigger:** `PATCH /api/bookings/:id` — when `status` changes from any value other than `completed` → `completed`, debrief generation fires as a **fire-and-forget background task** after the database update and response are sent.

```ts
// In PATCH /api/bookings/:id handler — capture previousStatus BEFORE db.update():
if (updated.status === "completed" && before.status !== "completed") {
  generateBookingDebrief(db, updated.id, req.log).catch((err) =>
    req.log.warn({ err, bookingId: updated.id }, "booking debrief generation failed"),
  );
}
```

The debrief generation never blocks or delays the booking completion response.

**Also triggered manually:** `POST /api/bookings/:id/debrief` — either booking participant may request regeneration (202 Accepted). Debounced to once per booking per 24 hours.

**Not triggered for:** `cancelled`, `pending`, or `active` bookings (unless manually via POST after `completed`).

---

### Module 2 — Debrief Content (Role-Specific)

The AI generates **two separate debrief objects** stored together in `debriefContent`:

#### Employer debrief (5 sections)

1. **Engagement snapshot** — freelancer name, field, dates, agreed rate, payment type, milestone count (completed / total)
2. **Outcome summary** — what was delivered based on job description, milestones, and agreement scope
3. **Performance signals** — on-time completion indicators, negotiation history summary, review status (submitted or pending)
4. **Re-hire recommendation** — verdict: `strong_rehire` | `rehire_with_caveats` | `one_off` with 2–3 bullet reasons
5. **Internal notes template** — copyable paragraph for the employer's own records (finance/HR); never shown to freelancer

#### Freelancer debrief (5 sections)

1. **Engagement snapshot** — company name, role title, dates, rate, payment type
2. **What you delivered** — milestone completion summary aligned to job scope
3. **Strengths demonstrated** — skills used, alignment with profile and job requirements
4. **Growth areas** — constructive private feedback (not a public review)
5. **Profile suggestions** — 2–3 actionable tips (e.g. portfolio, skills, bio)

Both versions include a fixed disclaimer (always first in UI):

> *AI-generated summary based on platform data only. Not a performance review, legal record, or substitute for a formal evaluation.*

---

### Module 3 — Debrief Storage

Cached as `jsonb` on the `bookings` table:

```ts
debriefContent: jsonb     // { employer: EmployerDebrief, freelancer: FreelancerDebrief }
debriefGeneratedAt: timestamptz
debriefRegeneratedAt: timestamptz | null  // last manual regeneration timestamp (debounce)
```

On page load, `GET /api/bookings/:id/debrief` returns only the caller's role-specific slice. Full `debriefContent` is never returned in `GET /api/bookings/:id`.

```ts
interface BookingDebriefContent {
  employer: EmployerDebrief;
  freelancer: FreelancerDebrief;
  generatedAt: string; // ISO — duplicated for convenience
}

interface EmployerDebrief {
  engagementSnapshot: {
    freelancerName: string;
    field: string;
    startDate: string;
    endDate: string;
    rate: number;
    rateType: string;
    milestonesCompleted: number;
    milestonesTotal: number;
  };
  outcomeSummary: string;
  performanceSignals: string[];
  rehireRecommendation: {
    verdict: "strong_rehire" | "rehire_with_caveats" | "one_off";
    reasons: string[];
  };
  internalNotesTemplate: string;
}

interface FreelancerDebrief {
  engagementSnapshot: {
    companyName: string;
    jobTitle: string;
    startDate: string;
    endDate: string;
    rate: number;
    rateType: string;
  };
  whatYouDelivered: string;
  strengthsDemonstrated: string[];
  growthAreas: string[];
  profileSuggestions: string[];
}
```

Regeneration overwrites the cached debrief. No version history in Phase 1.

---

### Module 4 — AI Prompt & Data Inputs

**Token label:** `booking_debrief`  
**Approximate cost:** 900–1,200 tokens per debrief (both roles in one call)  
**Charged to:** Employer account (same as meeting brief)  
**Model:** `gpt-4o-mini`  
**Temperature:** `0.3`

**Read-only inputs at generation time:**

| Source | Used for |
|--------|----------|
| `bookings` | dates, rate, status, message, payment type |
| `job_requirements` | title, description, skills, profession category, rate type |
| `milestones` | titles, amounts, statuses, due dates |
| `agreements` | status, signed dates (not full contract text) |
| `reviews` | if already submitted when debrief runs |
| `conversations` + `messages` | human_direct thread scoped to `bookingId` — last 10 messages, content truncated to 500 chars each |
| `freelancer_profiles` / `employer_profiles` | names, skills, field, ratings |

Returns a JSON object matching `BookingDebriefContent`. Prompt instructs model to return ONLY valid JSON.

---

### Module 5 — Plan Gating

| Plan | Debrief access |
|------|----------------|
| `employer_starter` | ✅ Snapshot + outcome summary (sections 1–2). Sections 3–5 replaced with upgrade CTA in UI |
| `employer_growth` | ✅ Full employer debrief — all 5 sections |
| `employer_enterprise` | ✅ Full employer debrief — all 5 sections |
| `freelancer_free` / `freelancer_pro` | ✅ Full freelancer debrief — all 5 sections (no token charge to freelancer) |

**Server always generates the full debrief** regardless of plan. UI gates display for `employer_starter` only (same pattern as Meeting Brief).

Freelancer debrief is never plan-gated — freelancers do not consume employer token quota for viewing.

---

### Module 6 — Notifications & Email

When debrief generation completes:

- **Employer** receives `BOOKING_DEBRIEF_READY` in-app notification → `/bookings/:id`
- **Freelancer** receives `BOOKING_DEBRIEF_READY` in-app notification → `/bookings/:id`
- Optional email to both parties (respects `users.emailNotificationsEnabled`) with link to booking detail

Notification message copy:

- Employer: *"Your post-engagement debrief for [Freelancer Name] is ready."*
- Freelancer: *"Your post-engagement debrief for [Company Name] is ready."*

---

## New API Routes

```
GET  /api/bookings/:id/debrief     Role-filtered debrief for current participant (404 until ready)
POST /api/bookings/:id/debrief     Regenerate debrief (participant only; 202 Accepted)
```

`GET /api/bookings/:id` gains optional fields:

```ts
debriefGeneratedAt: string | null
hasDebrief: boolean  // computed: debriefGeneratedAt !== null
```

Full debrief JSON is **not** embedded in booking detail response.

---

## Schema Change

Two new nullable columns on `bookings`:

```ts
debriefContent: jsonb("debrief_content").$type<BookingDebriefContent>(),
debriefGeneratedAt: timestamp("debrief_generated_at", { withTimezone: true }),
debriefRegeneratedAt: timestamp("debrief_regenerated_at", { withTimezone: true }),
```

All nullable — bookings completed before deployment have `null` debrief and can be generated via `POST /api/bookings/:id/debrief`.

---

## Non-Goals

- No shared / cross-party debrief document visible to both sides
- No debrief for `cancelled` bookings (auto-trigger)
- No admin console review queue for debriefs
- No PDF export of debrief
- No employer editing or annotating debrief content in the database
- No debrief triggering booking status changes or review submission
- No changes to public freelancer profile pages (`/f/:id`)
- No Stripe or billing integration changes
- No storing full agreement contract text in the AI prompt (metadata only)
- No debrief version history table in Phase 1

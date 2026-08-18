# TalentLock — Features Specification: Discovery Meeting Outcome

## Overview

Discovery meetings are where employers decide the **next hiring step**. After a meeting is marked `completed`, the employer records **internal interview notes** and chooses a **binary round path**:

| Round path | What happens |
|---|---|
| **Next round** | Notes are stored; AI summarises them for the next interviewer; handoff goes to a **team member** when the employer has an enterprise team, otherwise to an **email** recipient. Book CTA stays closed. |
| **Final decision** | Notes are stored on the meeting **and** in the employer’s **candidate hiring file** for that freelancer. Then: **Proceed to booking** (unlock Book) or **Do not hire** (store only). |

**Hard rule:** Interview feedback is **never** shown to the candidate (freelancer). It is not posted to the meeting message thread, not emailed to the freelancer, and not included in freelancer-facing API responses.

**Product lock (2026-08-01):** Round model **A** (binary) · Recipient **C** (hybrid team/email) · AI **AI-1** (summary for next interviewer) · Final storage **F2** (employer candidate hiring file).

**Related (do not conflate):**
- `spec/aimeetingdebrief/` — **pre-meeting** AI brief (confirmed meetings)
- `spec/ReviewRatings/` — **post-booking** star reviews after engagement completion
- `spec/messaging-service/` — human DMs; **not** used to deliver interview feedback to candidates
- `spec/team-accounts-enterprise/` — team member roster used for next-round picker
- `spec/NotificationCenter/` — panel / employer notifications only (not candidate feedback dumps)

---

## Feature Modules

### Module 1 — Gate After Meeting Completion

**Trigger surface:** `/meetings/:id` when `meeting.status === 'completed'` and the viewer is the employer.

1. Employer marks meeting completed (`PATCH` status → `completed`).
2. Until outcome is submitted, show a **required** Hiring Decision form (Module 2). No Book CTA.
3. After submit, show disposition-specific UI (Modules 3–5).

Freelancers see status `completed` only — **no** interview feedback text, **no** disposition detail (Module 6).

---

### Module 2 — Employer Feedback Form (binary + final fork)

**Step framing (single card, progressive fields):**

1. **Round type** (required): `next_round` | `final`
2. **Internal notes** (required): `feedbackText` — min 20 / max 2000, `sanitiseText()`
3. If **Next round** → recipient (Module 3)
4. If **Final** → final disposition: `proceed_to_booking` | `rejected` (Module 4–5)

Persisted `disposition` enum remains: `next_round` | `proceed_to_booking` | `rejected`  
(`final` is UI-only; maps to one of the two final dispositions.)

**UI copy:** “Internal interview notes — not shared with the candidate.”

**Submit:** `POST /api/meetings/:id/feedback` (employer party only; meeting must be `completed`; one submission per meeting — 409 if already submitted).

Optional (deferred): structured scorecards, skill checkboxes, star rating.

---

### Module 3 — Next Round → Hybrid Recipient + AI Summary (AI-1)

When `disposition === 'next_round'`:

1. Persist full `feedbackText` on the meeting (Module 7).
2. **Recipient (hybrid C):**
   - If employer has an active enterprise team with eligible members → **required** pick of `nextRoundTeamMemberId` (active `team_members` excluding self when possible; show name + email).
   - Else → **required** `nextRoundPanelEmail` + optional `nextRoundPanelName` (external panelist).
3. **AI-1 summary** (token label e.g. `interview_handoff_summary`, charged to employer):
   - Input: `feedbackText` + candidate/role context.
   - Output: short confidential brief for the next interviewer (`feedbackSummary` stored on meeting).
   - Handoff delivers **summary primary**; full notes available to employer (and in-app panelist if ACL allows). Email handoff includes summary + link to meeting; optionally attach truncated full notes in email body (prefer summary + “full notes on TalentLock for authorised viewers”).
4. Notify recipient:
   - Team member → in-app `meeting_next_round_panel` + email to member’s account email.
   - Email-only → email handoff; in-app notify if a TalentLock user matches that email.
5. **Do not** notify the freelancer with feedback content.
6. Book CTA stays **closed**.

---

### Module 4 — Final → Proceed to Booking

When `disposition === 'proceed_to_booking'`:

1. Persist `feedbackText` on the meeting.
2. Upsert into employer **candidate hiring file** (Module 8) for `(employerUserId, freelancerId)`.
3. Unlock **Book [Freelancer Name]** on `/meetings/:id` → `/freelancers/:freelancerId?fromMeeting=:id`.
4. Do **not** auto-create a booking.
5. Do **not** send notes to the freelancer.

---

### Module 5 — Final → Do Not Hire

When `disposition === 'rejected'`:

1. Persist `feedbackText` on the meeting.
2. Upsert into employer **candidate hiring file** (Module 8).
3. No Book CTA on this meeting.
4. **Never** send feedback to the candidate from this feature.

---

### Module 6 — Freelancer Visibility (strict)

| State | Freelancer sees |
|---|---|
| Completed, no outcome yet | Status `completed` only |
| Any disposition after submit | Status `completed` only — **no** feedback card, **no** `feedbackText`, **no** panel/team fields |

Employer (and authorised next-round team viewers) see disposition + notes / summary as appropriate.

---

### Module 7 — Schema (additive)

```ts
// meetings
disposition: text,                 // null | 'next_round' | 'proceed_to_booking' | 'rejected'
feedbackText: text,                // full internal notes — never returned to freelancer
feedbackSummary: text,             // AI-1 handoff summary — set on next_round
feedbackSubmittedAt: timestamptz,
nextRoundPanelEmail: text,         // required when next_round AND no team member
nextRoundPanelName: text,          // optional
nextRoundTeamMemberId: integer,    // FK team_members.id — required when next_round AND employer on team with members
// Deprecated: interviewResult, feedbackMessageId — stop writing; backfill then drop later
```

**Candidate hiring file** (new table — employer-only):

```ts
// employer_candidate_notes (suggested name)
id, employerUserId, freelancerId,
latestMeetingId, disposition, feedbackText, feedbackSummary?,
updatedAt, createdAt
// UNIQUE (employerUserId, freelancerId) — upsert on each final outcome
// Optionally append history rows in phase 2; phase 1 = latest snapshot + link to meeting
```

One outcome submission per meeting (`feedbackSubmittedAt` set → 409 on resubmit).

---

### Module 8 — Employer Candidate Hiring File (F2)

**Surfaces (employer only):**
- Freelancer detail `/freelancers/:id` — “Hiring notes” section / drawer listing outcomes for this candidate (at least latest + link to meeting).
- Optional later: dedicated Hiring pipeline page.

**API:**
```
GET /api/employers/me/candidate-notes/:freelancerId
  → { notes, disposition, meetingId, updatedAt, … } or 404 if none
```

Never returned to freelancers. Never included in public profile.

---

### Module 9 — API

```
POST /api/meetings/:id/feedback
  Body: {
    disposition: 'next_round' | 'proceed_to_booking' | 'rejected',
    feedbackText: string,
    nextRoundTeamMemberId?: number,   // hybrid: preferred when on team
    nextRoundPanelEmail?: string,     // hybrid: required when no team member target
    nextRoundPanelName?: string
  }
  201: Meeting DTO (employer-shaped)
  400 if next_round without valid hybrid recipient
  402 TOKEN_LIMIT if AI-1 summary cannot run (inline error — do not redirect)
  403 / 404 / 409 / 422 — as before

GET /api/meetings/:id
  Employer: includes disposition, feedbackText, feedbackSummary, nextRound*, hasInterviewFeedback
  Freelancer: strip all internal outcome fields
```

`PATCH /api/meetings/:id` must **not** accept feedback fields.

---

## Plan Gating

All employer plans for form + storage.  
AI-1 summary consumes employer AI tokens (`interview_handoff_summary`). Show inline `TOKEN_LIMIT` on 402 — do not redirect to `/pricing`.

| Actor | Submit outcome | See feedback | Book after `proceed_to_booking` |
|---|---|---|---|
| Employer (meeting party) | ✅ | ✅ | ✅ |
| Next-round team member | ❌ submit | ✅ via notify + meeting ACL if implemented | ❌ |
| Email panelist | ❌ | ✅ via email handoff | ❌ |
| Freelancer | ❌ | ❌ | N/A |

---

## Non-Goals

- Sending interview feedback to the candidate (including optional DM)
- Auto-creating bookings or scheduling round-2 calendar invites
- Editing feedback after submit
- Full multi-round chain UI (Round 1→2→3 as separate entities) — binary Next/Final only; repeating Next round on a new meeting is enough
- Replacing Reviews & Ratings
- Changing AI Meeting Brief on `confirmed`

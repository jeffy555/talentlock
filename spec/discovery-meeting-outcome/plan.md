# TalentLock — Implementation Plan: Discovery Meeting Outcome

> Binding decisions. Wins over `task.md` on conflict.  
> **Product lock (2026-08-01):** A / Hybrid C / AI-1 / F2.

---

## Decisions

| ID | Question | Decision |
|----|----------|----------|
| D1 | Share feedback with candidate? | **Never** |
| D2 | Soft-notify freelancer? | **No** (phase 1) |
| D3 | Round model | **A — binary:** Next round vs Final (Final → proceed / reject) |
| D4 | Next-round recipient | **C — hybrid:** team member if enterprise team has members; else email (+ optional name) |
| D5 | AI on handoff | **AI-1:** summarise `feedbackText` → `feedbackSummary` for next interviewer |
| D6 | Final storage | **F2:** meeting row + upsert employer candidate hiring file |
| D7 | Booking API gate | UI unlock only for `proceed_to_booking` |
| D8 | Legacy rows | `selected`→`proceed_to_booking`, `not_selected`→`rejected` |
| D9 | feedbackText length | min 20, max 2000, `sanitiseText()` |

---

## D1 — Schema

**`lib/db/src/schema/meetings.ts`**

```ts
disposition: text("disposition"),
feedbackText: text("feedback_text"),
feedbackSummary: text("feedback_summary"),
feedbackSubmittedAt: timestamp("feedback_submitted_at", { withTimezone: true }),
nextRoundPanelEmail: text("next_round_panel_email"),
nextRoundPanelName: text("next_round_panel_name"),
nextRoundTeamMemberId: integer("next_round_team_member_id"), // nullable FK → team_members
```

**New:** `employer_candidate_notes` (or equivalent) UNIQUE `(employerUserId, freelancerId)` with latest disposition + text + `meetingId`.

Backfill:

```sql
UPDATE meetings
SET disposition = CASE interview_result
  WHEN 'selected' THEN 'proceed_to_booking'
  WHEN 'not_selected' THEN 'rejected'
  ELSE disposition
END
WHERE interview_result IS NOT NULL AND disposition IS NULL;
```

Push → verify Neon → then backend.

---

## D2 — Submit handler

`POST /meetings/:id/feedback`:

1. Employer party; `status === 'completed'`; 409 if already submitted.
2. Validate disposition + feedbackText.
3. If `next_round`:
   - Resolve hybrid recipient: prefer `nextRoundTeamMemberId` (must belong to employer’s team, active); else require valid `nextRoundPanelEmail`.
   - Run AI-1 summary (OpenAI); store `feedbackSummary`; charge `interview_handoff_summary` to employer; on 402 return TOKEN_LIMIT envelope.
4. Transaction: update meeting; if final disposition → upsert candidate hiring file.
5. **No** candidate DM / `sendHumanMessage` for feedback.
6. After commit: notify team member and/or email panel with summary + meeting link.
7. Return employer-shaped meeting DTO.

---

## D3 — Role-filtered serializer

Freelancer GET/list: strip `feedbackText`, `feedbackSummary`, `disposition`, `nextRound*`.  
Employer: full internal fields.  
Candidate hiring file endpoints: employer-only.

---

## D4 — OpenAPI

- `PostMeetingFeedbackBody`: disposition enum + hybrid recipient fields.
- Meeting schema: `feedbackSummary`, `nextRoundTeamMemberId`.
- `GET /employers/me/candidate-notes/{freelancerId}`.
- Deprecate `interviewResult` / `feedbackMessageId`.

Codegen + typecheck mandatory (`indexFiles: false`).

---

## D5 — Notifications

| Type | Recipient | When |
|------|-----------|------|
| `meeting_next_round_panel` | Team member / matched user | `next_round` |
| Email | Panel email or member email | Always on `next_round` |

Stop candidate-facing feedback notification types.

---

## D6 — Frontend

`MeetingOutcomeCard`:

1. Round radios: **Next round** / **Final decision**.
2. If Final → sub-radios: Proceed to booking / Do not hire.
3. Notes textarea + internal helper copy.
4. If Next round → team member select (when team) **or** email/name fields.
5. Submit → show AI pending/error inline for TOKEN_LIMIT.
6. After `proceed_to_booking` → Book CTA.
7. After `next_round` → “Summary sent to {name/email}”.
8. After `rejected` → stored confirmation; no Book.
9. Freelancer: never render outcome card.

`FreelancerDetail` (employer): Hiring notes section from candidate-notes API.

---

## D7 — GDPR

Nullify meeting outcome fields and delete/anonymise `employer_candidate_notes` for the employer on account deletion.

---

## Cursor notes (project.md)

- Binary UI → stored dispositions `next_round` | `proceed_to_booking` | `rejected`
- Hybrid recipient: team member XOR email
- AI-1 writes `feedbackSummary`; token `interview_handoff_summary`
- F2 hiring file on final dispositions only (proceed + reject)
- Never freelancer-readable; never candidate DM

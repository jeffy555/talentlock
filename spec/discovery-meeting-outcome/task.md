# TalentLock — Task Breakdown: Discovery Meeting Outcome

> Align implementation to `plan.md` (A / Hybrid C / AI-1 / F2).  
> If conflict: **plan.md wins**.

Execute in phase order.

---

## Phase 1 — Database

### Task 1.1 — Meeting columns

Add/confirm: `disposition`, `feedbackText`, `feedbackSummary`, `feedbackSubmittedAt`, `nextRoundPanelEmail`, `nextRoundPanelName`, `nextRoundTeamMemberId`.

### Task 1.2 — Candidate hiring file table

Create `employer_candidate_notes` (UNIQUE employerUserId + freelancerId).

### Task 1.3 — Push + backfill

```bash
pnpm --filter @workspace/db run push
```

Backfill `interview_result` → `disposition` per plan D1. Verify Neon.

---

## Phase 2 — Backend

### Task 2.1 — OpenAPI

Update feedback body + Meeting; add candidate-notes GET; document stripping.

### Task 2.2 — Codegen + typecheck

### Task 2.3 — Rewrite `POST /meetings/:id/feedback`

- Remove candidate DM path
- Hybrid recipient validation
- AI-1 summary + token charge
- Upsert hiring file on final dispositions
- Role-filter serializers

### Task 2.4 — `GET /employers/me/candidate-notes/:freelancerId`

### Task 2.5 — Notifications

Panel/team handoff email + in-app; no candidate feedback alerts.

---

## Phase 3 — Frontend

### Task 3.1 — `MeetingOutcomeCard`

Binary round → final fork; hybrid recipient UI; AI/token inline errors; Book only for proceed.

### Task 3.2 — MeetingDetail wire-up

### Task 3.3 — FreelancerDetail Hiring notes (employer)

---

## Phase 4 — Admin

None required for phase 1.

---

## Checklist

- [x] Schema + hiring file + backfill in Neon
- [x] No freelancer can read feedback via API
- [x] No candidate DMs from feedback submit
- [x] Next-round: team member OR email; AI summary stored
- [x] Final: hiring file upsert; Book only for `proceed_to_booking`
- [ ] `validation.md` green

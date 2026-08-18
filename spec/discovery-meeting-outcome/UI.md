# TalentLock — UI Specification: Discovery Meeting Outcome

## Surface

- `/meetings/:id` — employer outcome form + post-submit states
- `/freelancers/:id` — employer **Hiring notes** section (F2)
- Freelancers never see feedback UI

---

## Placement

Prominent card **above** the main meeting card when `status === 'completed'` (employer).

---

## Employer — State A: Feedback required

**When:** `completed` && !hasInterviewFeedback

```
┌─────────────────────────────────────────────────────────┐
│  Hiring decision                                        │
│  Internal interview notes — not shared with the         │
│  candidate. Required before booking from this meeting.  │
│                                                         │
│  Round                                                  │
│  ○ Next round                                           │
│  ○ Final decision                                       │
│                                                         │
│  Internal notes *                                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Strengths, concerns, topics for next interviewer… │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  (if Next round + has team)                             │
│  Next interviewer *  [ Team member ▾ ]                  │
│                                                         │
│  (if Next round + no team)                              │
│  Panel email *   [___________________________]          │
│  Panel name      [___________________________]          │
│                                                         │
│  (if Final decision)                                    │
│  ○ Proceed to booking                                   │
│  ○ Do not hire                                          │
│                                                         │
│  [ Submit decision ]                                    │
└─────────────────────────────────────────────────────────┘
```

On Next-round submit: show brief “Generating handoff summary…” then success or inline TOKEN_LIMIT.

Accent: amber / attention (existing pattern).

---

## Employer — State B: Proceed to booking

Success + read-only notes + **Book {name}** CTA.  
Hint: “Also saved to this candidate’s hiring notes.”

---

## Employer — State C: Next round

“Handoff summary sent to {teamMemberName or panel}. Candidate cannot see these notes.”  
Show summary (and optionally collapsible full notes). No Book CTA.

---

## Employer — State D: Do not hire

“Decision saved to hiring notes. Notes stay internal.” No Book CTA.

---

## Employer — Hiring notes on FreelancerDetail

Section title: **Hiring notes** (employer only).

```
Latest decision: Proceed to booking · from Meeting #123 · 2 Aug 2026
Notes preview…
[ View meeting ]
```

Empty: “No interview outcomes recorded yet.”

---

## Freelancer

No outcome card. Meeting shows `completed` status only. No hiring notes on profile.

---

## Copy strings

| Key | Copy |
|-----|------|
| `title` | Hiring decision |
| `helper` | Internal interview notes — not shared with the candidate. Required before booking from this meeting. |
| `round_next` | Next round |
| `round_final` | Final decision |
| `proceed_to_booking` | Proceed to booking |
| `rejected` | Do not hire |
| `feedback_label` | Internal notes |
| `feedback_placeholder` | Strengths, concerns, topics for the next interviewer… |
| `team_member` | Next interviewer |
| `panel_email` | Next-round panel email |
| `panel_name` | Panel name (optional) |
| `submit` | Submit decision |
| `ai_pending` | Generating handoff summary… |
| `book_cta` | Book {name} |
| `next_round_success` | Handoff summary sent to {panel}. The candidate cannot see these notes. |
| `rejected_success` | Decision saved to hiring notes. Not sent to the candidate. |
| `booking_success` | Decision saved to hiring notes. You can book {name} when ready. |
| `hiring_notes_title` | Hiring notes |

---

## Non-goals (UI)

- Showing feedback to the freelancer
- “Message candidate with this feedback”
- Multi-step wizard beyond progressive fields on one card
- Round 1/2/3 timeline UI (binary only)

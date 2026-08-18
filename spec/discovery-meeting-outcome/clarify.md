# TalentLock — Clarification: Discovery Meeting Outcome

> **Product lock (2026-08-01):** Round **A** · Recipient **Hybrid C** · AI **AI-1** · Final storage **F2**.  
> Feedback remains **internal-only** — never candidate-facing.

---

## Locked Decisions

| Topic | Choice | Meaning |
|-------|--------|---------|
| Round model | **A** | Binary: Next round vs Final decision (Final → Proceed to booking / Do not hire) |
| Recipient | **C Hybrid** | Prefer enterprise `team_members` picker; else email + optional name |
| AI | **AI-1** | Summarise notes → `feedbackSummary` for next interviewer; charge employer tokens |
| Final storage | **F2** | Upsert employer candidate hiring file + keep meeting row |

---

## Verified — Consistent with Existing Architecture

| Item | Verified Against |
|------|------------------|
| Meeting completion + legacy feedback columns | `meetings.ts`, Neon |
| Live code still uses `selected` / `not_selected` + candidate DM | Must be replaced |
| Team members for enterprise | `team_members` — used for hybrid picker |
| Booking create is separate | `POST /bookings` |
| Token 402 pattern | `{ error, code, planNeeded }` — TOKEN_LIMIT inline |

---

## Closed Questions (was open)

| Q | Resolution |
|---|------------|
| Soft-notify freelancer? | **No** phase 1 |
| Panel identity? | **Hybrid C** (team member XOR email) |
| Panelist in-app ACL? | Phase 1: email/in-app notify + summary; full ACL for non-party panelists can follow |
| Legacy mapping? | `selected`→`proceed_to_booking`, `not_selected`→`rejected` |
| List endpoints include feedbackText? | **Detail only** for employers; never freelancers |
| Min length | 20 / 2000 |

---

## Risks

| Risk | Mitigation |
|------|------------|
| Employer expects candidate to see rejection reasons | Copy: “Internal notes — not shared with the candidate” |
| Team vs email confusion | UI shows one recipient mode only based on team presence |
| AI token exhaustion blocks handoff | Allow saving notes + queue summary retry OR block submit with clear TOKEN_LIMIT — prefer **block with inline error** so handoff isn’t incomplete |
| Implementation lag | Feature stays 🔄 until phases complete |

---

## Blockers

None for spec. Implementation must: remove DM path, add hybrid recipient + AI-1 + hiring file, role-filter GET.

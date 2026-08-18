# TalentLock — Validation Guide: Discovery Meeting Outcome

> Validates **A / Hybrid C / AI-1 / F2**.

---

## Phase 1 — Schema

- [x] Meeting columns: disposition, feedback_text, feedback_summary, next_round_panel_*, next_round_team_member_id
- [x] `employer_candidate_notes` (or equivalent) exists with UNIQUE (employer, freelancer)
- [x] Legacy backfill applied

---

## Phase 2 — API

### V2.1 — Reject before completed → 422

### V2.2 — Proceed to booking

POST `{ disposition: "proceed_to_booking", feedbackText: "…" }` → 201; hiring file upserted; Book unlock for employer; **no** freelancer feedback leak

### V2.3 — Next round (email mode)

POST with `nextRoundPanelEmail` (no team) → 201; `feedbackSummary` set; panel email sent; **no** candidate DM

### V2.4 — Next round (team mode)

POST with `nextRoundTeamMemberId` → 201; member notified; invalid member → 400

### V2.5 — Rejected

POST `rejected` → 201; hiring file upserted; no Book; no candidate DM

### V2.6 — Freelancer GET strip

### V2.7 — Idempotency → 409

### V2.8 — next_round without recipient → 400

### V2.9 — TOKEN_LIMIT on AI-1 → 402 inline envelope; no candidate side effects

### V2.10 — Regression: no `sendHumanMessage` on feedback submit

### V2.11 — GET candidate-notes employer-only; freelancer → 403/404

---

## Phase 3 — UI

### V3.1 — Binary round + final fork; internal-notes helper

### V3.2 — Team picker XOR email fields

### V3.3 — Book only after proceed_to_booking

### V3.4 — Next round shows summary recipient confirmation

### V3.5 — Hiring notes on FreelancerDetail (employer)

### V3.6 — Freelancer never sees notes card

### V3.7 — Old Selected / Not selected / candidate-message copy gone

---

## Security

- [ ] IDOR: only employer party submits
- [ ] Freelancer cannot coax feedback via list/detail
- [ ] Team member id must belong to employer’s team
- [ ] Panel email validated / sanitised
- [ ] Hiring file never public / freelancer-readable

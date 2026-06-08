# TalentLock — Clarification & Verification: AI Proposal Generator

---

## ✅ Verified

| Item | Verified Against |
|---|---|
| `bookings` table with `freelancerId`, `jobRequirementId`, `message` | Confirmed |
| `job_requirements` table with `title`, `description` | Confirmed |
| `freelancer_profiles` with `bio`, `skills`, `fieldOfWork`, `rate` | Confirmed |
| `/bookings/:id` frontend route exists | Confirmed |
| `POST /api/ai/job-description` pattern (aiAssist.ts) | Confirmed — same file |
| `logTokenUsage()` + `checkTokenQuota()` utilities | Confirmed |
| shadcn/ui `<Sheet>`, `<Tabs>` available | Confirmed |
| Job Description Assistant drawer pattern established | Confirmed — reuse exact same pattern |

---

## ❓ Open Questions

### Q1 — Does Token Quota Apply to Freelancers?

**Question:** `checkTokenQuota()` is currently used only for employer AI features. Do freelancers have a monthly token quota? If not, the endpoint works but quota is not enforced.

**Recommendation:** Check `plans.ts` for freelancer token limits:
```bash
grep -A 5 "freelancer_free\|freelancer_pro" artifacts/api-server/src/lib/plans.ts
```

If no quota defined for freelancers: skip `checkTokenQuota()` for this endpoint. Log tokens for visibility but don't gate on them. Document this with a TODO comment.

---

### Q2 — Where Does the Accepted Proposal Go?

**Question:** When the freelancer clicks Accept, where should the proposal text go? Options:
- **(A)** A booking `response` or `freelancerMessage` field on the `bookings` table (doesn't exist yet)
- **(B)** A text area in the UI (copy to clipboard only — no DB persistence)
- **(C)** The existing meeting request message if a meeting is being requested
- **(D)** A new `bookingMessage` sent as a message in the existing `messages` table for the booking's conversation

**Recommendation:** Option B for this phase — copy to clipboard or display in a text area that the freelancer can manually copy and use however they like (acceptance note, email, meeting request context). This avoids any schema change for MVP.

---

### Q3 — Is `bookings.jobRequirementId` Always Set?

**Question:** The proposal generator reads the job description from the linked `jobRequirementId`. Is this always populated on a booking, or can bookings be created without a job requirement link?

**Recommendation:**
```bash
grep "jobRequirementId\|job_requirement_id" lib/db/src/schema/*.ts | head -5
```

If `jobRequirementId` can be null: generate a proposal using only the freelancer's profile + employer message. The prompt adapts gracefully.

---

### Q4 — Should the Drawer Be Available After Booking Is Accepted?

**Question:** Once a booking is confirmed/active, is a proposal still useful? Or should the button only show for `pending` or `negotiating` bookings?

**Recommendation:** Show for `pending` and `negotiating` only. Hide for `active`, `completed`, `cancelled`.

---

## ⚠️ Risks & Notes

### Risk 1 — State Isolation (Same as Job Description Assistant)
The `proposalOutput` state in the drawer must be completely separate from any booking form state. Accept is the only path to externalise the output.

### Risk 2 — No Freelancer Token Quota Currently
If freelancers have no token quota, `logTokenUsage()` still runs (for analytics) but `checkTokenQuota()` is skipped. This is intentional for MVP — document clearly.

### Risk 3 — Codegen Required
After adding `POST /api/ai/proposal` to OpenAPI spec, codegen must run before frontend work.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Freelancer token quota exists? | Task 2.1 (quota check decision) |
| Q2 | Where does accepted proposal go? | Task 3.2 (Accept handler) |
| Q3 | `jobRequirementId` always set? | Task 2.1 (prompt building) |

# TalentLock — Clarification & Verification: Smart Rate Suggestions

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `freelancer_profiles.rate` exists | Confirmed throughout specs |
| `freelancer_profiles.fieldOfWork` exists (confirmed from prior features) | Confirmed |
| `bookings.proposedRate` exists | Confirmed in `project.md` schema |
| `bookings.negotiationStatus` exists | Confirmed in `project.md` schema |
| `job_requirements` table exists with field/skills context | Confirmed |
| `POST /api/ai/job-description` pattern established | Confirmed — same route file (`aiAssist.ts`) |
| `checkTokenQuota()` + `logTokenUsage()` utilities exist | Confirmed — used across all AI features |
| `employer_growth` / `employer_enterprise` plan gating pattern | Confirmed |
| `402 PLAN_LIMIT` response pattern | Confirmed |
| `/freelancers/:id` booking creation form exists | Confirmed |
| `/bookings/:id` negotiation panel exists | Confirmed |
| OpenAI client available server-side | Confirmed |

---

## ❓ Open Questions

### Q1 — Where Is the Rate Input in the Booking Creation Form?

**Question:** The widget must appear below the rate input on `/freelancers/:id`. Where exactly is this form — is rate its own step or part of a larger booking form?

**Recommendation:**
```bash
grep -n "rate\|Rate\|proposedRate" artifacts/talentlock/src/pages/FreelancerDetail.tsx | head -20
```

---

### Q2 — Does `bookings.proposedRate` Store the Final Agreed Rate or Mid-Negotiation Value?

**Question:** When calculating the employer's historical average, should we use `proposedRate` from ALL bookings or only from bookings where `negotiationStatus = 'agreed'`?

**Impact:** Using all bookings may include rejected proposals. Using only agreed ones gives a more meaningful baseline.

**Recommendation:** Only `negotiationStatus = 'agreed'` bookings — the final agreed rate is the meaningful signal.

---

### Q3 — Minimum Data Threshold for Market Median?

**Question:** The market median requires at least 3 freelancers in the same `fieldOfWork`. Below this threshold, what should the widget show?

**Recommendation:** Return `marketMedian: null`. Widget shows `"Market data: Not enough data in this field"`. AI suggestion proceeds without market data (uses freelancer rate + employer history only).

---

### Q4 — Should the Widget Load Eagerly or on Demand?

**Question:** Should the rate suggestion be:
- **(A)** Loaded automatically when the booking form mounts
- **(B)** Loaded when the employer focuses the rate input
- **(C)** Loaded only when the employer clicks a "Get rate suggestion" button

**Impact:** Option A uses a token every time an employer opens a booking form, even if they don't need guidance. Option C is explicit and token-efficient.

**Recommendation:** Option C — explicit trigger button for Growth/Enterprise. Starter sees static context always (no token cost).

---

### Q5 — Should the AI Suggestion Consider the Job Requirement?

**Question:** The booking may be linked to a `jobRequirementId`. If so, the job description provides useful context for the rate suggestion ("senior developer with 8 years experience" vs "junior developer"). Should this be included in the prompt?

**Recommendation:** Yes — if `jobRequirementId` is present, fetch the job description and include the title + field in the AI prompt.

---

## ⚠️ Risks & Notes

### Risk 1 — Token Cost Per Rate Check

Each "Get suggestion" click costs ~300 tokens (prompt + completion). An employer doing 10 bookings/day could use 3,000 tokens per day on rate suggestions alone. The `checkTokenQuota()` guard handles this — returns `402` when quota is exhausted.

### Risk 2 — Rate Suggestion Must Never Auto-Submit

The "Use suggested rate" button only fills the rate input field — it never submits the form. This is enforced structurally: the button calls `setValue('rate', suggestedRate)` via the form's React state setter, and the submit button remains separate.

### Risk 3 — Market Median Privacy

The market median calculation aggregates rates from freelancer profiles. Confirm that individual freelancer rates are not exposed in the response — only the aggregated median.

### Risk 4 — Codegen Required

After adding `POST /api/ai/rate-suggestion` to OpenAPI spec, codegen must run before Phase 3 (frontend).

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Rate input location in booking form | Task 3.1 (widget placement) |
| Q2 | Which `proposedRate` values to average | Task 2.1 (historical avg query) |

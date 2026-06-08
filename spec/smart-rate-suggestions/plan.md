# TalentLock — Implementation Plan: Smart Rate Suggestions

> **Status: APPROVED — Ready for implementation**
> If this file and `task.md` conflict, this file wins.

---

## Pre-Implementation Codebase Checks

```bash
# 1. Find rate input in booking creation form
grep -n "rate\|Rate\|proposedRate" artifacts/talentlock/src/pages/FreelancerDetail.tsx | head -20

# 2. Confirm fieldOfWork column name
grep "fieldOfWork\|field_of_work" lib/db/src/schema/*.ts | head -5

# 3. Confirm proposedRate and negotiationStatus column names
grep -A 60 "bookings\s*=" lib/db/src/schema/*.ts | grep -i "proposed\|negotiation"

# 4. Check if rate_suggestion already in TokenFeature
grep "rate_suggestion" artifacts/api-server/src/lib/tokenLogger.ts

# 5. Check aiAssist.ts for existing route file
cat artifacts/api-server/src/routes/aiAssist.ts | head -20
```

---

## Resolved Questions

### Q1 — Rate Input Location
**Decision: Inspect first. Add widget immediately below the rate input field.**

### Q2 — Historical Average Calculation
**Decision: Only `negotiationStatus = 'agreed'` bookings.**

```ts
const historicalRates = await db.select({ rate: bookings.proposedRate })
  .from(bookings)
  .innerJoin(freelancerProfiles, eq(freelancerProfiles.id, bookings.freelancerId))
  .where(and(
    eq(bookings.employerId, internalUserId),
    eq(bookings.negotiationStatus, 'agreed'),
    eq(freelancerProfiles.fieldOfWork, targetField),
    isNotNull(bookings.proposedRate)
  ));

const historicalAvg = historicalRates.length >= 2
  ? Math.round(historicalRates.reduce((s, r) => s + Number(r.rate), 0) / historicalRates.length)
  : null; // null when insufficient data
```

### Q3 — Market Median Below Threshold
**Decision: Return `null`. Widget renders "Not enough market data."**

### Q4 — Widget Load Strategy
**Decision: Option C — explicit trigger button.**

- **Starter employers:** Static card always visible (freelancer rate + market median if available), no button, no token cost
- **Growth/Enterprise employers:** Static card always visible + "✦ Get AI suggestion" button — AI fires only on click

### Q5 — Job Requirement Context
**Decision: Include in prompt when available.**

```ts
const jobContext = jobRequirementId
  ? await db.query.jobRequirements.findFirst({ where: eq(jobRequirements.id, jobRequirementId) })
  : null;

const roleContext = jobContext
  ? `Role: ${jobContext.title}. ${jobContext.description?.slice(0, 300)}`
  : `Field: ${targetField}`;
```

---

## AI System Prompt (Use Verbatim)

```
You are a rate advisor for a freelance platform.
Given the following data, suggest an appropriate hourly rate and explain why.

Freelancer's listed rate: $${freelancerRate}/hr
${marketMedian ? `Market median for ${field}: $${marketMedian}/hr` : 'Market median: insufficient data'}
${historicalAvg ? `Employer's historical average for ${field}: $${historicalAvg}/hr` : ''}
${proposedRate ? `Employer's proposed rate: $${proposedRate}/hr` : ''}
${roleContext}

Return ONLY a JSON object — no preamble, no markdown:
{
  "suggestedRate": <integer>,
  "explanation": "<2-3 sentences plain English>",
  "confidence": "high" | "medium" | "low"
}

Confidence is "high" when market data is available, "medium" when only partial data,
"low" when minimal context.
```

---

## Resolved Risks

### Risk 1 — Token Cost
**Resolution:** `checkTokenQuota()` guard before every OpenAI call. `402 TOKEN_LIMIT` returned when exhausted — widget shows inline error, never crashes.

### Risk 2 — Never Auto-Submit
**Resolution:** "Use suggested rate" calls a React state setter only — never the form submit handler. Enforced structurally.

### Risk 3 — Market Median Privacy
**Resolution:** The endpoint returns only the aggregated `marketMedian` number — no individual freelancer rates, no IDs.

### Risk 4 — Codegen
**Resolution:** OpenAPI spec updated in Phase 2, codegen run before Phase 3.

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full
- [ ] All 6 spec files read
- [ ] Codebase inspection complete — Q1, Q2 column names confirmed
- [ ] `rate_suggestion` added to `TokenFeature` if missing

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | `rate_suggestion` TokenFeature + utility functions | ⬜ Not started |
| Phase 2 | Backend endpoint + OpenAPI + codegen | ⬜ Not started |
| Phase 3 | Frontend widget on booking form + negotiation panel | ⬜ Not started |

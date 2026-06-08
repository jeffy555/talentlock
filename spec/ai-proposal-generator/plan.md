# TalentLock — Implementation Plan: AI Proposal Generator

> **Status: APPROVED — Ready for implementation**
> If this file and `task.md` conflict, this file wins.

---

## Pre-Implementation Codebase Checks

```bash
# 1. Check freelancer token quota in plans.ts
grep -A 5 "freelancer_free\|freelancer_pro" artifacts/api-server/src/lib/plans.ts

# 2. Check bookings for jobRequirementId nullability
grep "jobRequirementId\|job_requirement_id" lib/db/src/schema/*.ts | head -5

# 3. Check booking statuses to confirm pending/negotiating values
grep -r "'pending'\|'negotiating'\|'active'" artifacts/api-server/src/routes/bookings.ts | head -10

# 4. Check ai_proposal in TokenFeature
grep "ai_proposal" artifacts/api-server/src/lib/tokenLogger.ts

# 5. Check existing aiAssist.ts for adding new endpoint
cat artifacts/api-server/src/routes/aiAssist.ts | tail -30
```

---

## Resolved Questions

### Q1 — Freelancer Token Quota
**Decision: Inspect plans.ts. If no freelancer quota: skip `checkTokenQuota()`, still log tokens.**

```ts
// In the proposal endpoint:
const hasQuota = userPlan === 'freelancer_pro' || userPlan === 'freelancer_free';
// Skip quota check for freelancers — no quota defined
// Still log for analytics
await logTokenUsage(db, internalUserId, 'ai_proposal', usage);
```

Add a TODO comment: `// TODO: Add freelancer token quota when billing is connected`

### Q2 — Where Accepted Proposal Goes
**Decision: Option B — display in a copyable textarea. No DB persistence in this phase.**

```tsx
// On Accept:
setProposalOutput(null); // clear drawer state
setAcceptedProposal(generatedProposal); // surface in a textarea below the button
// The textarea is read-only with a "Copy" button
```

A "Proposal ready — copy and use it" section appears below the booking details when `acceptedProposal` is set.

### Q3 — `jobRequirementId` Nullability
**Decision: Handle null gracefully in prompt. Generate proposal without job description when null.**

```ts
const jobContext = booking.jobRequirementId
  ? await db.query.jobRequirements.findFirst({
      where: eq(jobRequirements.id, booking.jobRequirementId)
    })
  : null;
```

### Q4 — Show Button for Pending/Negotiating Only
**Decision: Button hidden for active/completed/cancelled bookings.**

```tsx
{['pending', 'negotiating'].includes(booking.status) && userRole === 'freelancer' && (
  <ProposalGeneratorButton ... />
)}
```

---

## AI System Prompts (Use Verbatim)

### Professional Tone
```
You are writing a professional proposal response for a freelancer on a hiring platform.
Write a concise, confident proposal (150–200 words) that:
1. Briefly introduces the freelancer and their most relevant skills
2. Explains why they are a strong fit for this specific role
3. Mentions their availability and rate ($${rate}/hr)
4. Ends with a clear next step

Freelancer profile:
- Name: ${firstName}
- Field: ${fieldOfWork}
- Skills: ${skills}
- Bio: ${bio?.slice(0, 300)}

${jobContext ? `Job/role context:\n${jobContext}` : 'No specific job description provided — write a general but personalised proposal.'}
${employerMessage ? `Employer's message: "${employerMessage}"` : ''}

Write the proposal in first person. Do not use markdown. Return only the proposal text.
```

### Friendly Tone
Same as above but add: `Write in a warm, approachable, conversational tone.`

### Concise Tone
Same as above but: `Keep it to 80–100 words maximum. Be direct and punchy.`

---

## Pre-Implementation Checklist

- [x] `project.md` read in full
- [x] All 6 spec files read
- [x] Codebase inspection complete
- [x] `ai_proposal` added to `TokenFeature`

**Inspection notes (2026-06-08):** Freelancer plans have `monthlyTokenLimit: null` — skip quota check. Booking `status` uses `pending` (not `negotiating`; that lives on `negotiationStatus`). `jobRequirementId` nullable on bookings.

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | TokenFeature + inspect | ✅ Complete |
| Phase 2 | Backend endpoint + OpenAPI + codegen | ✅ Complete |
| Phase 3 | Frontend drawer + booking detail integration | ✅ Complete |
| Validation | `validation.md` sign-off | ✅ Complete 2026-06-08 |

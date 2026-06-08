# TalentLock — Features Specification: AI Proposal Generator

## Overview

When a freelancer receives a booking request, they currently face a blank response field with zero context about what to write. Many freelancers either decline without responding or send generic messages that fail to stand out. The employer created the booking with specific context (job description, company, project details) but the freelancer sees only a bare notification: "Employer X wants to book you."

This feature adds an AI proposal generator to the freelancer's view of `/bookings/:id` — a "✦ Write proposal" button that generates a personalised response message based on the job requirement linked to the booking, the freelancer's own profile (skills, bio, field of work), and the booking context. The freelancer edits and sends the proposal as their initial message or acceptance note.

This is the freelancer-side mirror of the Job Description Assistant — same drawer pattern, same Accept/Discard flow, same token consumption model.

No new database tables. One new AI endpoint. Available on all freelancer plans.

---

## Feature Modules

### Module 1 — Proposal Generator Drawer

On `/bookings/:id` (freelancer view, status = `pending` or `negotiating`), a "✦ Write proposal" button appears near the booking response area. Clicking it opens a slide-out Sheet from the right.

Inside the drawer:

- **Generate tab** — AI writes a full proposal based on job context + freelancer profile
- **Tone selector** — Professional / Friendly / Concise (radio group, default Professional)
- **AI output area** — with violet left border (same as Job Description Assistant)
- **Accept** — copies the proposal text into the booking response/message field
- **Discard** — clears output, closes drawer

---

### Module 2 — AI Proposal Generation

The backend reads:
- The booking's linked `jobRequirementId` → job title + description
- The freelancer's profile → bio, skills, field of work, rate
- The booking's `message` field (employer's intro message, if any)

System prompt generates a proposal covering:
- Brief self-introduction referencing relevant skills
- Why this particular role is a good fit
- Relevant experience or portfolio callout
- Availability and rate confirmation
- Clear next step (happy to discuss / available for a call)

Token label: `ai_proposal`
Plan gating: All freelancer plans.

---

### Module 3 — State Isolation

The drawer holds its own `proposalOutput` state. The booking's response/message field is never modified until the freelancer clicks Accept. The pattern is identical to the Job Description Assistant's state isolation.

---

## API Route

`POST /api/ai/proposal`

Request body:
```ts
{
  bookingId: string,
  tone: 'professional' | 'friendly' | 'concise'
}
```

Response:
```ts
{
  proposal: string
}
```

Guards: Requires Clerk auth + `userRole === 'freelancer'`. The booking must belong to this freelancer.

Token gating: `checkTokenQuota()` before OpenAI call. All freelancer plans have access (no plan gate — only token quota).

---

## Plan Gating

| Plan | Available | Token cost |
|---|---|---|
| `freelancer_free` | ✅ | ~400 tokens per proposal |
| `freelancer_pro` | ✅ | ~400 tokens per proposal |

Note: Freelancer token quotas are not currently tracked on TalentLock. If token tracking is only for employer plans, the `checkTokenQuota()` call can be skipped for freelancers in this phase — the endpoint still works but without quota enforcement. Document this decision in the plan.

---

## Non-Goals

- Proposal templates library (save and reuse)
- Employer-facing proposal viewing (proposals are personal messages)
- Automated proposal sending (always requires freelancer review and manual send)
- Multi-step interview-style proposals
- Proposal performance analytics (acceptance rate)

# TalentLock — Features Specification: AI Meeting Brief Generator

## Overview

Discovery meetings are the most important moment in the TalentLock hiring flow. They are where both parties decide whether to move forward to a booking. Yet employers currently go into these meetings cold — they re-read the freelancer's profile manually five minutes before the call, have no structured questions prepared, and have no context on whether the proposed rate is fair.

**AI Meeting Brief Generator** solves this. When a discovery meeting is confirmed between an employer and a freelancer, TalentLock automatically generates a structured one-page brief for the employer — delivered as an in-app card on the meeting detail page (`/meetings/:id`) and as an email notification. By the time the employer opens the meeting, the brief is already there.

The brief answers four questions the employer always has before a meeting:

1. **Who am I meeting?** — A crisp candidate summary: skills, rate, experience, verified credentials, reviews
2. **Why do they fit?** — Top 3 specific reasons this freelancer matches the job requirement
3. **What should I ask them?** — 5–8 tailored questions combining the role and the candidate's background
4. **Is their rate fair?** — Rate context against market median for their field and experience level

No preparation. No research. The employer shows up ready.

---

## Feature Modules

### Module 1 — Brief Generation Trigger

The brief is generated automatically when a meeting's status changes to `confirmed`.

**Trigger:** `PATCH /api/meetings/:id` — when `status` field changes to `'confirmed'` in the update payload, the brief generation fires as a **fire-and-forget background task** after the database update returns and the route response is sent.

```ts
// In PATCH /api/meetings/:id handler — AFTER db.update() and AFTER res.json():
if (updatedMeeting.status === 'confirmed' && previousStatus !== 'confirmed') {
  generateMeetingBrief(db, meeting.id, req.log)
    .catch(err => req.log.warn({ err, meetingId: meeting.id }, 'meeting brief generation failed'));
}
```

The brief generation never blocks or delays the meeting confirmation response.

**Also triggered manually:** A "Regenerate brief" button on the meeting detail page allows the employer to request a fresh brief at any time (e.g. if the job requirements changed after the meeting was confirmed). This calls `POST /api/meetings/:id/brief`.

---

### Module 2 — Brief Content

The AI generates a structured brief covering five sections:

**Section 1 — Candidate Snapshot**
```
Name:          Sarah Chen
Field:         Full Stack Development
Experience:    6 years
Rate:          $95/hr  (8% above market median for React — see Section 4)
Profile score: 94/100 completeness
Credentials:   ✅ Identity Verified   ✅ Degree Uploaded
Reviews:       4.9 ⭐ across 12 engagements
```

**Section 2 — Why They Match (Top 3 Reasons)**
```
1. Strong React + TypeScript alignment — both listed as required on the job post
2. Rate within the job's stated budget ($85–$105/hr)
3. Available from June 15 — matches the job's start date requirement
```

**Section 3 — Suggested Interview Questions (5–8 questions)**

These are AI-generated based on:
- The job requirement's description, required skills, and duration
- The freelancer's specific skills, bio, portfolio, and experience level
- Any profile gaps worth probing (see Section 5)

Example questions for a React developer role:
```
1. Walk me through your most complex React project — what were the hardest
   architectural decisions you made?
2. The role involves a 3-month engagement. How do you typically manage
   handover documentation at the end of a contract?
3. Your profile lists TypeScript but you do not have portfolio items
   specifically for TypeScript projects. Can you tell me about your
   TypeScript experience?
4. Our team uses Figma handoff for design. What's your experience working
   directly from Figma to React component?
5. What's your preferred way of handling state management in large React
   applications — and why?
```

**Section 4 — Rate Context**
```
Their proposed rate:  $95/hr
Job budget range:     $85–$105/hr   ✅ Within range
Market median:        $88/hr        (React developers on TalentLock)
Platform percentile:  67th          (above average for their field)
Employer avg paid:    $91/hr        (your historical average for similar roles)

Assessment: Their rate is competitive and within your typical range.
            Slight negotiation room exists — market median is $88/hr.
```

**Section 5 — Watch Points**
Profile gaps or concerns the employer should probe during the meeting:
```
⚠ Lists Next.js as a skill but has no Next.js portfolio items
⚠ Only 2 reviews — limited platform track record (see reviews for full context)
⚠ Last active booking ended 3 months ago — consider asking about availability
```

If no watch points exist: "No significant concerns — strong profile for this role."

---

### Module 3 — Brief Storage

The brief is cached as a `jsonb` column on the `meetings` table:

```ts
briefContent:     jsonb — structured brief (see Module 2)
briefGeneratedAt: timestamptz — when the brief was generated
```

On every subsequent load of `/meetings/:id`, the cached brief is returned immediately — no AI call on page load. The "Regenerate brief" action clears and regenerates.

The brief structure:
```ts
interface MeetingBrief {
  candidateSnapshot: {
    name: string;
    field: string;
    experience: string;
    rate: number;
    rateType: string;
    completenessScore: number;
    averageRating: number;
    reviewCount: number;
    verifiedCredentials: string[];
  };
  whyTheyMatch: string[];           // 3 specific reasons
  suggestedQuestions: string[];     // 5–8 questions
  rateContext: {
    proposedRate: number;
    jobBudgetMin: number | null;
    jobBudgetMax: number | null;
    marketMedian: number;
    platformPercentile: number;
    employerHistoricalAvg: number;
    assessment: string;
    withinBudget: boolean;
  };
  watchPoints: string[];            // may be empty
  generatedAt: string;              // ISO timestamp
}
```

---

### Module 4 — AI Prompt

**Token label:** `meeting_brief`
**Approximate cost:** 600–800 tokens per brief
**Charged to:** Employer's account
**Model:** `gpt-4o`
**Temperature:** `0.3` — factual, structured output, minimal variation

The prompt uses all available data at brief generation time:
- Freelancer profile: skills, bio, rate, field, experience, completeness score, average rating, review count, verified credential types
- Job requirement linked to the meeting: title, description, required skills, duration, budget range
- Employer's historical average rate for similar roles (from `rateSuggestionUtils.ts`)
- Market median rate for the freelancer's field (from `rateSuggestionUtils.ts`)
- Freelancer's portfolio items and tags

Returns a JSON object matching `MeetingBrief`. The prompt instructs the model to return ONLY valid JSON — no preamble, no markdown fences.

---

### Module 5 — Plan Gating

| Plan | Brief | Questions |
|---|---|---|
| `employer_starter` | ✅ Candidate snapshot + rate context only | ❌ No AI questions |
| `employer_growth` | ✅ Full brief — all 5 sections | ✅ 5–8 AI questions |
| `employer_enterprise` | ✅ Full brief — all 5 sections | ✅ 8–10 AI questions |

For `employer_starter`: the suggested questions section is replaced with a static prompt: "Upgrade to Growth to unlock AI-generated interview questions tailored to this candidate and role."

The candidate snapshot and rate context are always generated (these are largely data assembly, minimal AI cost). The AI-generated questions are the plan-gated portion.

---

### Module 6 — Email Notification

When the brief is generated, the employer receives an email notification:

**Subject:** "Your meeting brief is ready — [Freelancer Name] × [Job Title]"

**Body:** A plain-text summary linking to the meeting detail page:
"Your discovery meeting with [Freelancer Name] is confirmed for [date/time]. Your AI meeting brief is ready — including candidate summary, suggested questions, and rate context. View it here: [link to /meetings/:id]"

Email delivery uses the existing `sendNotificationEmail()` infrastructure.

---

## New API Routes

```
POST /api/meetings/:id/brief     Generate or regenerate meeting brief (employer only)
```

The brief is automatically generated on meeting confirmation (Module 1) — this route exists for manual regeneration only.

---

## Schema Change

Two new nullable columns on the `meetings` table:

```ts
briefContent:     jsonb('brief_content').$type<MeetingBrief>(),
briefGeneratedAt: timestamp('brief_generated_at', { withTimezone: true }),
```

Both nullable — meetings confirmed before this feature is deployed have `null` brief content and will generate their brief on first explicit request via `POST /api/meetings/:id/brief` or the "Regenerate brief" button.

---

## Non-Goals

- Brief generation for the freelancer side — the brief is employer-only (gives them meeting preparation context)
- Brief generation for meetings not yet confirmed — only confirmed meetings trigger generation
- Storing previous brief versions — one brief per meeting; regeneration overwrites the cached version
- Brief-based booking suggestion — the brief informs the employer but never triggers a booking automatically
- Brief for cancelled or completed meetings — only active confirmed meetings receive briefs
- Integration with external calendar or video call tools — brief is TalentLock-internal only

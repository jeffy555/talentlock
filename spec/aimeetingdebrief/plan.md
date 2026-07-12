# TalentLock — Implementation Plan: AI Meeting Brief Generator

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

```bash
# 1. Exact meetings table columns — status values, FKs to job/booking/freelancer/employer
grep -A 30 "meetings\s*=" lib/db/src/schema/*.ts | head -35

# 2. Confirm PATCH /api/meetings/:id handler — where status is written
grep -n "status.*confirmed\|confirmed\|status" artifacts/api-server/src/routes/meetings.ts | head -20

# 3. Confirm rateSuggestionUtils.ts function signatures
grep -n "export.*function\|export const" artifacts/api-server/src/lib/rateSuggestionUtils.ts | head -10

# 4. Confirm earningsUtils.ts exports (may be useful for market context)
grep -n "export.*function\|export const" artifacts/api-server/src/lib/earningsUtils.ts | head -10

# 5. Confirm documents table columns (for verified credential query)
grep -A 20 "documents\s*=" lib/db/src/schema/*.ts | head -25

# 6. Confirm meeting_brief token label does NOT already exist
grep "meeting_brief" artifacts/api-server/src/lib/tokenLogger.ts

# 7. Check if meetings has briefContent already
grep "briefContent\|brief_content" lib/db/src/schema/*.ts
```

---

## Resolved Questions

---

### Q1 — `meetings` Schema

**Decision: Inspect first. The brief generator is written to handle both join paths.**

After inspection, document the confirmed column names. The brief generator uses this standard interface:

```ts
interface MeetingContext {
  meetingId: string;
  employerId: string;
  freelancerId: string;
  status: string;
  scheduledAt: Date | null;
  jobRequirementId: string | null;  // may be null — handled in Q3
}
```

If `meetings` has a direct `jobRequirementId` FK, use it directly. If not, see Q3 resolution.

---

### Q2 — Who Triggers `confirmed`

**Decision: Status-based trigger — brief fires on any `status → confirmed` transition regardless of who made the change.**

```ts
// In PATCH /api/meetings/:id handler:
// Check status BEFORE update
const previousMeeting = await db.query.meetings.findFirst({
  where: eq(meetings.id, meetingId),
});
const previousStatus = previousMeeting?.status;

// Perform the update
const [updated] = await db.update(meetings)
  .set(sanitisedPayload)
  .where(eq(meetings.id, meetingId))
  .returning();

return res.json(updated); // Response sent first

// Fire brief generation AFTER response if status just became 'confirmed'
if (updated.status === 'confirmed' && previousStatus !== 'confirmed') {
  generateMeetingBrief(db, meetingId, req.log)
    .catch(err => req.log.warn({ err, meetingId }, 'meeting brief generation failed'));
}
```

---

### Q3 — Join Path from Meeting to Job Requirement

**Decision: Try direct FK first; fall back to latest booking between the two parties.**

```ts
async function resolveJobRequirement(db: DB, meeting: MeetingContext) {
  // Path A: meeting has direct jobRequirementId
  if (meeting.jobRequirementId) {
    return db.query.jobRequirements.findFirst({
      where: eq(jobRequirements.id, meeting.jobRequirementId),
    });
  }

  // Path B: find the most recent booking between employer and freelancer
  const booking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.employerId, meeting.employerId),
      eq(bookings.freelancerId, meeting.freelancerId),
    ),
    orderBy: [desc(bookings.createdAt)],
  });

  if (booking?.jobRequirementId) {
    return db.query.jobRequirements.findFirst({
      where: eq(jobRequirements.id, booking.jobRequirementId),
    });
  }

  // Path C: no job requirement found — return null (partial brief generated)
  return null;
}
```

If `null` is returned (no job requirement found):
- `whyTheyMatch` section → `["No job requirement linked to this meeting"]`
- `suggestedQuestions` section → generic questions about experience and working style (5 questions)
- `rateContext.jobBudgetMin` and `jobBudgetMax` → `null`

---

### Q4 — `rateSuggestionUtils.ts` Usage

**Decision: Call existing functions directly. Do not duplicate logic.**

After inspection, use the confirmed signatures. Expected usage:

```ts
import { getMarketMedian, getEmployerHistoricalAvg } from './rateSuggestionUtils';

const marketMedian = await getMarketMedian(db, freelancerProfile.fieldOfWork);
const employerAvg  = await getEmployerHistoricalAvg(db, meeting.employerId, freelancerProfile.fieldOfWork);
```

If these functions do not exist with these exact names, inspect the file and use the correct names. The goal is market median rate and employer historical average rate — whatever the existing functions return for those.

---

### Q5 — Brief Cache Location

**Decision: Option A — `jsonb` column on `meetings`. Single current brief per meeting, overwritten on regeneration.**

Two new columns on `meetings`:
```ts
briefContent:     jsonb('brief_content').$type<MeetingBrief>(),
briefGeneratedAt: timestamp('brief_generated_at', { withTimezone: true }),
```

No new table. No version history. Regeneration overwrites. This is the minimum viable implementation — version history can be added as a separate table in a future spec if needed.

---

### Q6 — Plan Gating

**Decision: Option A — always generate the full brief server-side. Plan gating is UI-only.**

The backend always generates all 5 sections regardless of plan. The frontend conditionally replaces the questions section with an upgrade prompt for `employer_starter`:

```tsx
{userPlan === 'employer_starter' ? (
  <UpgradePrompt
    feature="AI interview questions"
    description="Upgrade to Growth to unlock AI-generated interview questions tailored to this candidate and role."
    ctaHref="/pricing"
  />
) : (
  <QuestionsList questions={brief.suggestedQuestions} />
)}
```

This means `employer_starter` users still receive and store the full `briefContent` JSON including questions — they just cannot see the questions section in the UI. This simplifies the server and ensures the data is available if they upgrade mid-meeting-lifecycle.

---

### Q7 — Verified Credential Labels

**Decision: Map `documentType` to human-readable labels as specified in `clarify.md` Q7.**

```ts
const DOCUMENT_LABELS: Record<string, string> = {
  identity:             'Identity Verified',
  degree_certificate:   'Degree Certificate',
  teaching_licence:     'Teaching Licence Verified',
  dbs_check:            'DBS Checked',
  transcripts:          'Transcripts',
  professional_licence: 'Professional Licence',
};
```

Query:
```ts
const verifiedDocs = await db.query.documents.findMany({
  where: and(
    eq(documents.freelancerId, meeting.freelancerId),
    eq(documents.status, 'verified'),
  ),
});
const verifiedCredentials = verifiedDocs.map(d => DOCUMENT_LABELS[d.documentType] ?? d.documentType);
```

---

## AI Prompt — Use Verbatim

```
You are an AI assistant for a professional hiring marketplace, generating a pre-meeting brief for an employer.

EMPLOYER MEETING CONTEXT:
Meeting with: ${freelancerName}
Meeting date: ${scheduledAt ? formatDate(scheduledAt) : 'TBD'}
Job role:     ${jobTitle ?? 'Discovery meeting (no specific role)'}

FREELANCER PROFILE:
Name:              ${freelancerName}
Field:             ${fieldOfWork}
Profession type:   ${educationProfessionType ?? 'not specified'}
Skills:            ${skills.join(', ')}
Teaching subjects: ${teachingSubjects?.join(', ') ?? 'N/A'}
Experience bio:    ${bio?.slice(0, 400) ?? 'not provided'}
Rate:              ${rate} ${rateType}
Completeness:      ${completenessScore}/100
Average rating:    ${averageRating} stars (${reviewCount} reviews)
Verified:          ${verifiedCredentials.join(', ') || 'no verified documents'}

JOB REQUIREMENT (if linked):
Title:       ${jobTitle ?? 'N/A'}
Description: ${jobDescription?.slice(0, 500) ?? 'N/A'}
Skills:      ${jobSkills?.join(', ') ?? 'N/A'}
Budget:      ${jobBudgetMin ? '$' + jobBudgetMin : 'not specified'}${jobBudgetMax ? '–$' + jobBudgetMax + '/hr' : ''}
Duration:    ${jobDurationWeeks ? jobDurationWeeks + ' weeks' : 'not specified'}

MARKET RATE CONTEXT:
Market median for ${fieldOfWork}: $${marketMedian}/hr
Employer historical avg for this field: $${employerAvg}/hr
Freelancer's proposed rate: $${rate}/hr

Generate a pre-meeting brief. Return ONLY a JSON object — no preamble, no markdown fences:

{
  "whyTheyMatch": [
    "<specific reason 1 — reference actual skills/rate/availability>",
    "<specific reason 2>",
    "<specific reason 3>"
  ],
  "suggestedQuestions": [
    "<question 1 — based on job requirements + freelancer background>",
    "<question 2>",
    "<question 3>",
    "<question 4>",
    "<question 5>",
    "<question 6 — probe a specific skill listed on job but light in their portfolio (if any)>",
    "<question 7 — open-ended working style question>",
    "<question 8 — handover/end-of-contract question>"
  ],
  "rateAssessment": "<1 sentence: is their rate competitive, within budget, negotiable?>",
  "withinBudget": <true|false — is rate within job budget range?>,
  "watchPoints": [
    "<specific concern 1 — be factual, not speculative>",
    "<specific concern 2>"
  ]
}

Rules:
- whyTheyMatch: exactly 3 items. Reference actual data (skills, rate, availability). Not generic.
- suggestedQuestions: 5–8 items. At least 1 must probe a specific gap or skill mentioned in the job but not prominently in the portfolio.
- watchPoints: may be empty array [] if no genuine concerns exist. Do NOT fabricate concerns.
- rateAssessment: one sentence, factual, no fluff.
- All fields required. Return valid JSON only.
```

---

## `generateMeetingBrief()` Implementation

**File:** `artifacts/api-server/src/lib/meetingBriefGenerator.ts` (create new)

```ts
export async function generateMeetingBrief(db: DB, meetingId: string, log: Logger) {
  // 1. Fetch meeting with status check
  const meeting = await db.query.meetings.findFirst({
    where: eq(meetings.id, meetingId),
  });
  if (!meeting || meeting.status !== 'confirmed') return; // Status may have changed

  // 2. Load all context in parallel
  const [freelancerProfile, freelancerUser, jobRequirement, verifiedDocs] = await Promise.all([
    db.query.freelancerProfiles.findFirst({ where: eq(freelancerProfiles.id, meeting.freelancerId) }),
    db.query.users.findFirst({ where: eq(users.id, meeting.freelancerId) }),
    resolveJobRequirement(db, meeting),
    db.query.documents.findMany({
      where: and(eq(documents.freelancerId, meeting.freelancerId), eq(documents.status, 'verified')),
    }),
  ]);

  if (!freelancerProfile) return;

  // 3. Resolve rate context
  const [marketMedian, employerAvg] = await Promise.all([
    getMarketMedian(db, freelancerProfile.fieldOfWork),
    getEmployerHistoricalAvg(db, meeting.employerId, freelancerProfile.fieldOfWork),
  ]);

  // 4. Build prompt and call OpenAI
  const freelancerName = `${freelancerUser?.firstName ?? ''} ${freelancerUser?.lastName ?? ''}`.trim();
  const verifiedCredentials = verifiedDocs.map(d => DOCUMENT_LABELS[d.documentType] ?? d.documentType);

  const prompt = buildMeetingBriefPrompt({
    freelancerName, freelancerProfile, jobRequirement,
    marketMedian, employerAvg, verifiedCredentials, meeting,
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = response.choices[0]?.message?.content ?? '';
  const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  // 5. Log tokens (charged to employer)
  logTokenUsage(db, meeting.employerId, 'meeting_brief', {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  }).catch(err => log.warn({ err }, 'meeting brief token log failed'));

  // 6. Parse AI response
  let aiResult: { whyTheyMatch: string[], suggestedQuestions: string[], rateAssessment: string, withinBudget: boolean, watchPoints: string[] };
  try {
    const cleaned = responseText.replace(/```json|```/g, '').trim();
    aiResult = JSON.parse(cleaned);
  } catch {
    log.warn({ meetingId }, 'meeting brief AI response parse failed');
    return;
  }

  // 7. Assemble full brief
  const briefContent: MeetingBrief = {
    candidateSnapshot: {
      name: freelancerName,
      field: freelancerProfile.fieldOfWork,
      experience: freelancerProfile.bio?.slice(0, 100) ?? '',
      rate: freelancerProfile.rate,
      rateType: jobRequirement?.rateType ?? 'hourly',
      completenessScore: freelancerProfile.completenessScore,
      averageRating: freelancerProfile.averageRating ?? 0,
      reviewCount: freelancerProfile.reviewCount ?? 0,
      verifiedCredentials,
    },
    whyTheyMatch: aiResult.whyTheyMatch,
    suggestedQuestions: aiResult.suggestedQuestions,
    rateContext: {
      proposedRate: freelancerProfile.rate,
      jobBudgetMin: jobRequirement?.minRate ?? null,
      jobBudgetMax: jobRequirement?.maxRate ?? null,
      marketMedian,
      platformPercentile: calculatePercentile(freelancerProfile.rate, marketMedian),
      employerHistoricalAvg: employerAvg,
      assessment: aiResult.rateAssessment,
      withinBudget: aiResult.withinBudget,
    },
    watchPoints: aiResult.watchPoints,
    generatedAt: new Date().toISOString(),
  };

  // 8. Save to meetings table
  await db.update(meetings).set({
    briefContent,
    briefGeneratedAt: new Date(),
  }).where(eq(meetings.id, meetingId));

  // 9. Notify employer
  createNotification(db, {
    userId: meeting.employerId,
    type: 'meeting_brief_ready',
    title: `Your meeting brief is ready`,
    body: `Your AI brief for the meeting with ${freelancerName} is ready — candidate summary, suggested questions, and rate context.`,
    metadata: { meetingId, freelancerId: meeting.freelancerId },
  }).catch(err => log.warn({ err }, 'meeting brief notification failed'));

  // 10. Send email
  sendNotificationEmail(db, meeting.employerId, {
    subject: `Your meeting brief is ready — ${freelancerName}`,
    body: `Your discovery meeting with ${freelancerName} has a brief ready. View it at ${process.env.APP_URL}/meetings/${meetingId}`,
  }).catch(() => {});
}

// Helper: rough percentile based on market median
function calculatePercentile(rate: number, median: number): number {
  if (rate <= median * 0.8) return 25;
  if (rate <= median * 0.95) return 40;
  if (rate <= median) return 50;
  if (rate <= median * 1.1) return 67;
  if (rate <= median * 1.25) return 80;
  return 90;
}
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full
- [ ] All 6 spec files read
- [ ] Codebase inspection complete — Q1, Q2, Q3, Q4 findings documented
- [ ] `meetings` exact columns confirmed
- [ ] Join path to job requirement confirmed (direct FK or via bookings)
- [ ] `rateSuggestionUtils.ts` function signatures confirmed
- [ ] `meeting_brief` not yet in `TokenFeature` (confirmed in inspection)

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Schema — 2 new columns on `meetings` | ✅ Done (2026-07-06) — `brief_content` jsonb + `brief_generated_at` timestamptz pushed |
| Phase 2 | Backend — `meetingBriefGenerator.ts`, hook in meetings route, `POST /api/meetings/:id/brief`, OpenAPI + codegen | ✅ Done (2026-07-06) — `meeting_brief` token label, generator, PATCH trigger, 202 route, `generateMeetingBrief` operation; codegen + typecheck green |
| Phase 3 | Frontend — brief card on `/meetings/:id`, plan gating, regenerate button | ✅ Done (2026-07-06) — `MeetingBriefCard` (4 states, plan-gated questions, 3s polling ×10), employer+confirmed gated on `MeetingDetail`; full workspace typecheck green |

> Implementation notes (deviations from the assumed APIs in this plan, resolved against the real codebase):
> - `meetings` uses integer PKs and `db.select()` (not `db.query.*`); `employerId`/`freelancerId` are **profile** ids.
> - No `jobRequirementId` on `meetings` → job resolved via latest booking between the pair (Path B/C only).
> - `jobRequirements` has a single `budget` column (not min/max) → `jobBudgetMax = budget`, `jobBudgetMin = null`; `withinBudget` computed deterministically server-side.
> - Freelancer rate from `hourlyRate`/`dailyRate` per `paymentPreference`; `getMarketMedian`/`getEmployerHistoricalAvg` return `number | null`.
> - Tokens charged to the employer's **user** id via `userIdFromEmployerProfileId`; notification type `meeting_brief_ready` added; email via `sendNotificationEmailAsync`.
> - Generated hooks: `useGenerateMeetingBrief` (operationId `generateMeetingBrief`) and existing `useGetMeeting`.

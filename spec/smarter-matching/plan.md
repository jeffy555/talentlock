# TalentLock — Implementation Plan: Smarter Matching Explanation

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Before writing any code the agent must inspect these files and confirm:

```bash
# Check job_requirements schema
grep -A 40 "jobRequirements" lib/db/schema.ts

# Check conversations schema
grep -A 20 "conversations" lib/db/schema.ts

# Check freelancer_profiles schema
grep -A 40 "freelancerProfiles" lib/db/schema.ts

# Check TokenFeature type
grep -A 15 "TokenFeature" artifacts/api-server/src/lib/tokenLogger.ts

# Check conversationId column on token_usage
grep "conversationId" lib/db/schema.ts
```

Report findings before proceeding. If any blocker from clarify.md is not already resolved in the codebase, apply the schema change in Phase 1 before any backend work.

---

## Resolved Questions

---

### Q1 — `budgetMin` / `budgetMax` on `job_requirements`

**Decision: Inspect first. Add if missing.**

If `budgetMin` and `budgetMax` do not exist on `job_requirements`:

```ts
// Add to jobRequirements table in lib/db/schema.ts
budgetMin: numeric('budget_min', { precision: 10, scale: 2 }),
budgetMax: numeric('budget_max', { precision: 10, scale: 2 }),
// Both nullable — not all job posts have a defined budget range
```

If they exist under different names, use those names throughout — do not add duplicates. Document the actual column names found in a comment at the top of the endpoint file.

---

### Q2 — `requiredStartDate` on `job_requirements`

**Decision: Inspect first. Add if missing.**

If `requiredStartDate` does not exist:

```ts
// Add to jobRequirements table in lib/db/schema.ts
requiredStartDate: date('required_start_date'),
// Nullable — not all job posts specify a start date
```

If it exists under a different name (e.g. `startDate`), use that name. Document actual column name found.

---

### Q3 — `jobRequirementId` on `conversations`

**Decision: Inspect first. Add if missing.**

If `jobRequirementId` does not exist on `conversations`:

```ts
// Add to conversations table in lib/db/schema.ts
jobRequirementId: text('job_requirement_id').references(() => jobRequirements.id),
// Nullable — not all conversations are started from a specific job
```

Also update the conversation creation flow (wherever `POST /api/openai/conversations` or equivalent is handled) to accept and store `jobRequirementId` when provided. The frontend must pass it when starting a conversation from `/jobs/:id → Find Matches`.

---

### Q4 — How the Explanation Is Triggered

**Decision: Option A — frontend-triggered parallel call.**

After the AI chat responds with a message containing freelancer recommendations:
1. Frontend receives the chat response
2. Frontend parses `recommendations[]` from the structured response (see Q5)
3. For each recommended freelancer, frontend fires `POST /api/ai/match-explanation` in parallel
4. The chat message renders immediately
5. Each `<MatchExplanationCard />` renders below its freelancer card as its individual call resolves

The chat and explanation are fully decoupled. Chat UX is never blocked by explanation loading.

---

### Q5 — Freelancer IDs in Chat Response

**Decision: Update AI Match chat system prompt to return structured JSON.**

Update the system prompt for `POST /api/openai/conversations/:id/messages` to append:

```
When recommending freelancers, always return your response as a JSON object with this exact structure:
{
  "message": "Your conversational response here",
  "recommendations": [
    { "freelancerId": "<id>", "name": "<display name>" }
  ]
}
If you are not recommending any specific freelancers, return:
{
  "message": "Your conversational response here",
  "recommendations": []
}
Return ONLY the JSON object — no preamble, no markdown fences.
```

**Frontend parse logic — must handle both old and new format:**

```ts
function parseChatResponse(rawContent: string): {
  message: string;
  recommendations: { freelancerId: string; name: string }[];
} {
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed.message && Array.isArray(parsed.recommendations)) {
      return parsed;
    }
  } catch {
    // Legacy format or non-JSON response
  }
  // Fallback — treat entire response as plain text, no recommendations
  return { message: rawContent, recommendations: [] };
}
```

This handles both existing conversations (plain text fallback) and new conversations (structured JSON).

---

### Q6 — `freelancer_profiles` Primary Key

**Decision: Inspect schema and use the correct key.**

Most likely `freelancer_profiles.id` is a foreign key to `users.id`. Confirm with:

```bash
grep -A 5 "freelancerProfiles\s*=" lib/db/schema.ts | head -10
```

The endpoint query joins on whichever column links `freelancer_profiles` to the `freelancerId` passed in the request body. Document the actual join column in a comment at the top of the endpoint.

---

### Q7 — Skills Data Format

**Decision: Inspect and normalise before passing to AI.**

Check the actual column type:

```bash
grep "skills" lib/db/schema.ts
```

Normalise to a plain string array before constructing the prompt regardless of storage format:

```ts
function normaliseSkills(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
    // Comma-separated fallback
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}
```

Use `normaliseSkills()` for both `freelancerProfile.skills` and `jobRequirement.requiredSkills` (or equivalent column name).

---

### Q8 — Token Quota Failure in Explanation Card

**Decision: Option A — inline quota state in the card. No redirect.**

When `POST /api/ai/match-explanation` returns `402 TOKEN_LIMIT`:
- The `<MatchExplanationCard />` renders a specific quota-reached state (see UI.md)
- The chat continues normally — no page redirect
- The quota-reached card includes an "Upgrade Plan →" link to `/pricing`
- The `TOKEN_LIMIT` response from this endpoint does NOT trigger the global redirect handler used by other AI features

```ts
// In the mutation onError handler for match explanation only
if (error?.status === 402 && error?.body?.code === 'TOKEN_LIMIT') {
  setCardState('quota_reached'); // render inline state — do NOT navigate('/pricing')
  return;
}
```

---

## Resolved Risks

---

### Risk 1 — Chat Response Format Change Is Breaking

**Resolution: Parse with fallback — always safe.**

The `parseChatResponse()` function in Q5 handles both formats. Existing conversations that return plain text will render correctly as before. New conversations return structured JSON. The change is backwards-compatible — no existing conversation is broken.

Additionally: do NOT change the response format for non-recommendation messages (e.g. when the employer asks a general question). The system prompt only requires JSON when recommending freelancers. When `recommendations` is an empty array, the frontend renders `message` as plain text — identical to the current behaviour.

---

### Risk 2 — Multiple Parallel Explanation Calls

**Resolution: Cap at 3 explanation cards per chat message.**

If the AI recommends more than 3 freelancers in a single response, only render explanation cards for the first 3:

```ts
const visibleRecommendations = recommendations.slice(0, 3);
```

This limits the token cost to 3 explanation calls per chat turn maximum. Remaining recommended freelancers still appear as plain text links in the chat message — they just don't get an explanation card.

---

### Risk 3 — Legacy Conversations Without `jobRequirementId`

**Resolution: Already handled by Q3 decision — `jobRequirementId` is nullable.**

The endpoint query checks `if (jobRequirementId) { /* fetch budget + start date */ }`. When null, rate fit and availability fit are computed without job context — or marked `unknown` and omitted from the card. The overall summary is always generated.

---

### Risk 4 — Codegen Export Rules

**Resolution: Mandatory post-codegen checks after every spec update.**

After `pnpm --filter @workspace/api-spec run codegen`:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## System Prompt (Exact — Use Verbatim)

### Match Explanation System Prompt

```
You are a talent matching assistant for a freelance platform.
You will be given a freelancer profile and optionally a job requirement.
Analyse the fit and return ONLY a JSON object — no preamble, no markdown fences.

JSON structure:
{
  "skillsAlignment": {
    "matched": ["skill1", "skill2"],
    "gaps": ["skill3"]
  },
  "rateFit": {
    "freelancerRate": <number or null>,
    "budgetMin": <number or null>,
    "budgetMax": <number or null>,
    "assessment": "within_budget" | "above_budget" | "below_budget" | "unknown"
  },
  "availabilityFit": {
    "freelancerAvailableFrom": "<ISO date string or null>",
    "requiredStartDate": "<ISO date string or null>",
    "assessment": "available" | "unavailable" | "unknown"
  },
  "overallSummary": "<2-3 sentence plain English summary of match quality>"
}

Rules:
- If no job requirement is provided, set rateFit.assessment to "unknown" and availabilityFit.assessment to "unknown"
- skillsAlignment.gaps should only list skills explicitly required by the job that the freelancer does not have
- If no required skills are specified, set gaps to an empty array
- overallSummary must always be present and non-empty
- Do NOT include markdown, code fences, or any text outside the JSON object
```

### AI Match Chat System Prompt Addition

Append this to the existing system prompt for `POST /api/openai/conversations/:id/messages`:

```
When your response recommends specific freelancers, structure your entire response as JSON:
{
  "message": "<your conversational response>",
  "recommendations": [
    { "freelancerId": "<exact id from database>", "name": "<freelancer display name>" }
  ]
}
When not recommending specific freelancers, still return JSON:
{
  "message": "<your conversational response>",
  "recommendations": []
}
Always return valid JSON. Never use markdown fences around it.
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/smarter-matching/features.md` read
- [ ] `specs/smarter-matching/clarify.md` read
- [ ] This `plan.md` read — all 8 questions and 4 risks resolved
- [ ] `specs/smarter-matching/task.md` read — phase order understood
- [ ] `specs/smarter-matching/UI.md` read — all card states understood
- [ ] ai-enhancements Phase 1 confirmed complete (`conversationId` on `token_usage`, `ai_match_explanation` in `TokenFeature`)
- [ ] Token-consumption feature confirmed deployed (`logTokenUsage`, `checkTokenQuota` live)
- [ ] Schema inspection complete — Q1, Q2, Q3, Q6, Q7 confirmed from actual codebase

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Schema — missing columns only | ⬜ Not started |
| Phase 2 | Backend — endpoint + chat prompt update + OpenAPI + codegen | ⬜ Not started |
| Phase 3 | Frontend — `<MatchExplanationCard />` + page integrations | ⬜ Not started |

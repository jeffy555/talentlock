# TalentLock — Task Breakdown: Smarter Matching Explanation

## Summary

Add a structured match explanation card to the AI Talent Matching flow. Three phases: Schema (only if columns are missing) → Backend (endpoint + chat prompt + codegen) → Frontend (component + page integrations). No admin phase required for this feature.

---

## Phase 1 — Schema (Conditional)

> **Read plan.md first.** Run the inspection commands from the Pre-Implementation Codebase Checks section before doing anything in this phase. Only create migrations for columns that are actually missing.

### Task 1.1 — Inspect and Patch `job_requirements` Schema

**File:** `lib/db/schema.ts`

Run:
```bash
grep -A 40 "jobRequirements\s*=" lib/db/schema.ts
```

If `budgetMin`, `budgetMax` are missing — add:
```ts
budgetMin: numeric('budget_min', { precision: 10, scale: 2 }),
budgetMax: numeric('budget_max', { precision: 10, scale: 2 }),
```

If `requiredStartDate` is missing — add:
```ts
requiredStartDate: date('required_start_date'),
```

If all columns already exist under any name — skip this task, document the actual names.

### Task 1.2 — Inspect and Patch `conversations` Schema

**File:** `lib/db/schema.ts`

Run:
```bash
grep -A 20 "conversations\s*=" lib/db/schema.ts
```

If `jobRequirementId` is missing — add:
```ts
jobRequirementId: text('job_requirement_id').references(() => jobRequirements.id),
```

Also update the conversation creation handler (find where conversations are inserted) to accept and store `jobRequirementId` when the frontend passes it.

### Task 1.3 — Run Migration (only if Tasks 1.1 or 1.2 added columns)

```bash
pnpm --filter @workspace/db run push
```

Confirm new columns exist in Neon before proceeding to Phase 2.

---

## Phase 2 — Backend API

### Task 2.1 — Update AI Match Chat System Prompt

**File:** `artifacts/api-server/src/routes/openai.ts` (or wherever the chat system prompt is defined)

Locate the existing system prompt for `POST /api/openai/conversations/:id/messages`.

Append the chat system prompt addition from `plan.md` (the JSON wrapper instruction) to the existing prompt. Do NOT replace the existing prompt — append only.

Verify the updated prompt instructs the model to return:
```json
{
  "message": "...",
  "recommendations": [{ "freelancerId": "...", "name": "..." }]
}
```

### Task 2.2 — Create Match Explanation Endpoint

**File:** `artifacts/api-server/src/routes/aiMatch.ts` (create new file)

Add `POST /api/ai/match-explanation`

**Request body:**
```ts
{
  freelancerId: string,       // required
  jobRequirementId?: string,  // optional
  conversationId: string      // required — for token logging
}
```

**Implementation steps:**

1. Require Clerk auth + `userRole === 'employer'` — return 403 otherwise
2. Run `checkTokenQuota(db, internalUserId)` — return `402 TOKEN_LIMIT` on failure
3. Fetch freelancer profile from `freelancer_profiles` using `freelancerId`
   - If not found, return `404`
4. Fetch job requirement from `job_requirements` using `jobRequirementId` if provided
   - If `jobRequirementId` provided but not found, return `404`
5. Normalise skills using `normaliseSkills()` from plan.md Q7
6. Build user message with freelancer data + job requirement data (if available)
7. Call OpenAI using the exact system prompt from `plan.md`
8. Parse JSON response — on parse failure, log warning and return `needs_review` state:
   ```ts
   try {
     const parsed = JSON.parse(response.choices[0].message.content);
     // validate shape
   } catch {
     req.log.warn({ freelancerId, conversationId }, 'match explanation JSON parse failed');
     return res.status(200).json({ parseError: true, rawContent: response.choices[0].message.content });
   }
   ```
9. Log tokens:
   ```ts
   await logTokenUsage(db, internalUserId, 'ai_match_explanation', {
     promptTokens: response.usage.prompt_tokens,
     completionTokens: response.usage.completion_tokens,
     totalTokens: response.usage.total_tokens,
   }, conversationId);
   ```
10. Return parsed explanation object

**Response shape:**
```ts
{
  skillsAlignment: {
    matched: string[],
    gaps: string[]
  },
  rateFit: {
    freelancerRate: number | null,
    budgetMin: number | null,
    budgetMax: number | null,
    assessment: 'within_budget' | 'above_budget' | 'below_budget' | 'unknown'
  } | null,
  availabilityFit: {
    freelancerAvailableFrom: string | null,
    requiredStartDate: string | null,
    assessment: 'available' | 'unavailable' | 'unknown'
  },
  overallSummary: string,
  parseError?: boolean,
  rawContent?: string
}
```

`rateFit` is `null` when `jobRequirementId` is not provided or has no budget data.

### Task 2.3 — Add `normaliseSkills` Utility

**File:** `artifacts/api-server/src/lib/skillsUtils.ts` (create new file)

```ts
export function normaliseSkills(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {}
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}
```

### Task 2.4 — Register Route

**File:** `artifacts/api-server/src/index.ts`

Import and register `aiMatchRouter` from `./routes/aiMatch`.

### Task 2.5 — OpenAPI Spec Update

**File:** `lib/api-spec/openapi.yaml`

Add `POST /api/ai/match-explanation` with full request body and response schema.

Then run:
```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## Phase 3 — Frontend

### Task 3.1 — Verify Generated Hook

Confirm codegen produced `usePostAiMatchExplanation()` in `lib/api-client-react/`.
If missing, re-run codegen before continuing.

### Task 3.2 — Update Chat Response Parser

**File:** `artifacts/talentlock/src/pages/AiMatch.tsx` (or wherever chat messages are rendered)

Add the `parseChatResponse()` function from plan.md Q5:

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
  } catch {}
  return { message: rawContent, recommendations: [] };
}
```

Apply to every incoming AI message before rendering. Render `message` as the chat text. Pass `recommendations` to the explanation card logic below.

Cap at first 3 recommendations (plan.md Risk 2):
```ts
const visibleRecommendations = recommendations.slice(0, 3);
```

### Task 3.3 — Create `<MatchExplanationCard />`

**File:** `artifacts/talentlock/src/components/MatchExplanationCard.tsx`

See `UI.md` Component 1 for full spec including all states.

Props:
```ts
interface MatchExplanationCardProps {
  freelancerId: string;
  jobRequirementId?: string;
  conversationId: string;
}
```

Implement all 5 states:
1. **Loading** — skeleton card
2. **Loaded with job context** — skills + rate fit + availability + summary
3. **Loaded without job context** — skills + availability + summary only (no rate fit)
4. **Quota reached** — inline card state, no redirect (plan.md Q8)
5. **Error / parse error** — retry button

### Task 3.4 — Embed Cards in AI Match Chat

**File:** `artifacts/talentlock/src/pages/AiMatch.tsx`

After each AI chat message renders, if `visibleRecommendations.length > 0`, render one `<MatchExplanationCard />` per recommendation below the message bubble:

```tsx
{visibleRecommendations.map(rec => (
  <MatchExplanationCard
    key={rec.freelancerId}
    freelancerId={rec.freelancerId}
    jobRequirementId={activeConversation?.jobRequirementId ?? undefined}
    conversationId={conversationId}
  />
))}
```

Cards are rendered in the message list directly below their associated chat message — not in a separate panel.

### Task 3.5 — Embed Card on Freelancer Detail Page

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

Add `<MatchExplanationCard />` below the freelancer bio section.

Render only when `?jobId=` query param is present in the URL:
```ts
const { jobId } = useSearch(); // Wouter search params
const conversationId = /* get active conversation id from context or generate a temp id */;

{jobId && (
  <MatchExplanationCard
    freelancerId={freelancer.id}
    jobRequirementId={jobId}
    conversationId={conversationId ?? 'direct-view'}
  />
)}
```

When no `?jobId=` param — render nothing. No placeholder.

---

## Acceptance Criteria

- [ ] Schema inspection complete — Q1, Q2, Q3, Q6, Q7 answers documented
- [ ] Missing columns added and migrated (if any)
- [ ] `conversations.jobRequirementId` exists and is populated on creation when provided
- [ ] AI Match chat system prompt updated to return structured JSON recommendations
- [ ] `POST /api/ai/match-explanation` endpoint created and registered
- [ ] Endpoint returns `403` for non-employers
- [ ] Endpoint returns `402 TOKEN_LIMIT` when quota exceeded
- [ ] Endpoint returns `404` for unknown `freelancerId` or `jobRequirementId`
- [ ] `rateFit` is `null` when no job requirement context
- [ ] `ai_match_explanation` tokens logged with `conversationId` populated
- [ ] `normaliseSkills()` utility handles array, JSON string, and CSV formats
- [ ] `usePostAiMatchExplanation()` hook confirmed from codegen
- [ ] `parseChatResponse()` handles both old plain-text and new JSON formats
- [ ] Max 3 explanation cards rendered per chat message
- [ ] `<MatchExplanationCard />` implements all 5 states
- [ ] Quota-reached state shows inline — no redirect to `/pricing`
- [ ] Card renders in AI Match chat below each recommended freelancer
- [ ] Card renders on `/freelancers/:id` only when `?jobId=` param is present
- [ ] No explanation card shown on freelancer detail page without job context
- [ ] `pnpm typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 (inspect) → 1.3 (migrate only if needed)
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 (codegen + typecheck)
Task 3.1 (after 2.5 confirmed) → 3.2 → 3.3 → 3.4 → 3.5
```

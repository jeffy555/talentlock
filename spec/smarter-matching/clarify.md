# TalentLock — Clarification & Verification: Smarter Matching Explanation

This file audits `features.md` against `project.md`, the completed token-consumption feature, and the ai-enhancements parent spec to surface gaps, architectural risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `POST /api/openai/conversations/:id/messages` route exists | Confirmed in `project.md` API routes |
| `conversations` table exists with `id` column | Confirmed in `project.md` database schema |
| `freelancer_profiles` table exists with `skills`, `rate`, `isAvailable`, `availableFrom` | Confirmed in `project.md` |
| `job_requirements` table exists | Confirmed in `project.md` |
| `logTokenUsage()` utility exists with `conversationId?` param | Completed in ai-enhancements Phase 1, Task 1.3 |
| `token_usage.conversationId` column exists | Completed in ai-enhancements Phase 1, Task 1.1 |
| `ai_match_explanation` added to `TokenFeature` type | Completed in ai-enhancements Phase 1, Task 1.4 |
| `checkTokenQuota()` gates AI routes | Completed in token-consumption Phase 2, Task 2.3 |
| `402 TOKEN_LIMIT` redirect pattern on frontend | Completed in token-consumption Phase 3 |
| OpenAI client available server-side | `lib/integrations-openai-ai-server/` confirmed |
| shadcn/ui, React Query, Wouter routing | Confirmed tech stack |
| Orval codegen → React Query hooks pattern | Confirmed `lib/api-client-react/` |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Does `job_requirements` Have `budgetMin` / `budgetMax` Columns?

**Question:** The rate fit section compares the freelancer's rate against `job_requirements.budgetMin` and `budgetMax`. Do these columns currently exist on the `job_requirements` table, or do they need to be added?

**Impact:** If they don't exist, a schema migration is required before the endpoint can fetch budget data. If they exist under different column names (e.g. `minBudget`, `budget`), the endpoint query must use the correct names.

**Recommendation:** Inspect `lib/db/schema.ts` for `job_requirements` column names before writing any endpoint code. If missing, add `budgetMin` and `budgetMax` as nullable numeric columns.

---

### Q2 — Does `job_requirements` Have a `requiredStartDate` Column?

**Question:** Availability fit compares `freelancerAvailableFrom` against the job's required start date. Does `job_requirements` have a start date column?

**Impact:** Same as Q1 — if missing, a migration is needed. If named differently (e.g. `startDate`, `timeline`), the query must use the correct name.

**Recommendation:** Inspect schema alongside Q1. If missing, add `requiredStartDate` as a nullable date column.

---

### Q3 — Does `conversations` Table Have a `jobRequirementId` Column?

**Question:** The plan (Q5 in ai-enhancements `plan.md`) states: "When an employer starts an AI Match conversation from a specific job, the `jobRequirementId` is stored on the `conversations` record." Does this column currently exist on `conversations`, or does it need to be added?

**Impact:** The match explanation endpoint reads `jobRequirementId` from the conversation record to fetch budget and start date context. If the column doesn't exist, it must be added and the conversation creation flow must be updated to populate it.

---

### Q4 — How Is the Explanation Triggered in the Chat?

**Question:** The AI Match chat currently sends messages via `POST /api/openai/conversations/:id/messages`. When the AI response includes a freelancer recommendation, should the match explanation be:

- **(A)** Automatically fetched by the frontend immediately after a chat response that contains a freelancer recommendation — frontend detects a freelancer mention and calls `POST /api/ai/match-explanation`
- **(B)** Triggered server-side — the chat message handler calls the explanation endpoint internally and bundles it into the chat response
- **(C)** Triggered on demand — an "Explain this match" button per recommended freelancer that the employer clicks

**Impact:** Option A requires the frontend to parse the AI chat response to detect freelancer IDs. Option B keeps all AI calls server-side but complicates the chat route. Option C is the simplest but reduces discoverability.

**Recommendation:** Option A — the frontend detects freelancer IDs in the chat response and fires a parallel `POST /api/ai/match-explanation` call for each. The chat response and explanation are independent — chat renders immediately, explanation card fills in below once the second call resolves.

---

### Q5 — How Are Freelancer IDs Identified in a Chat Response?

**Question:** Following Option A from Q4 — the frontend must detect when an AI chat response mentions a freelancer. Currently the AI returns free text. How should freelancer IDs be embedded so the frontend can reliably extract them?

**Impact:** If the AI returns freelancer names as plain text, the frontend cannot reliably match them to `freelancerId` values. The chat response format must be structured enough to include IDs.

**Recommendation:** Update the AI Match chat system prompt to return a structured JSON wrapper when recommending freelancers:
```json
{
  "message": "Here are the top matches for your role...",
  "recommendations": [
    { "freelancerId": "abc123", "name": "Sarah Chen" },
    { "freelancerId": "def456", "name": "João Alves" }
  ]
}
```
The frontend renders the `message` as chat text and renders `<MatchExplanationCard />` for each entry in `recommendations`.

---

### Q6 — What Is the `freelancer_profiles` Primary Key?

**Question:** The match explanation endpoint needs to join `freelancer_profiles` on `freelancerId`. Is the primary key on `freelancer_profiles` the same as `users.id` (Clerk-linked), or is it a separate auto-generated ID?

**Impact:** The endpoint query must use the correct column to look up the freelancer profile. Getting this wrong returns empty data with no error.

**Recommendation:** Confirm in `lib/db/schema.ts` whether `freelancer_profiles.id` is a foreign key to `users.id` or an independent serial/uuid.

---

### Q7 — Skills Data Format on `freelancer_profiles`

**Question:** The skills alignment section compares job requirement skills against freelancer skills. What is the data type of the `skills` column on `freelancer_profiles`? Is it:
- **(A)** A text array: `text[]`
- **(B)** A JSON array stored as text: `'["React","TypeScript"]'`
- **(C)** A comma-separated string: `'React, TypeScript, Node.js'`

**Impact:** The AI prompt must pass skills in a consistent format. The parsing logic on the endpoint depends on the storage format.

---

### Q8 — What Happens When `checkTokenQuota` Fails for This Endpoint?

**Question:** The match explanation card is shown automatically (not on explicit user action). If `checkTokenQuota` returns `{ allowed: false }` mid-conversation, should the frontend:
- **(A)** Show the `TOKEN_LIMIT` card state inline in the explanation card (non-disruptive)
- **(B)** Redirect to `/pricing` (same as other AI features)
- **(C)** Silently hide the explanation card (no card shown at all)

**Impact:** Option B (redirect to `/pricing`) is jarring when it happens mid-chat. Option A is a better UX — the chat continues, but the explanation card shows a "quota reached" message with an upgrade link.

**Recommendation:** Option A — inline quota state in the card. The `402 TOKEN_LIMIT` response from the explanation endpoint renders a specific card state rather than a page redirect.

---

## ⚠️ Risks & Notes

### Risk 1 — Chat Response Format Change Is a Breaking Change

Changing the AI Match chat response from free text to a structured JSON wrapper (Q5) is a breaking change. The existing chat UI renders raw text from the AI. After this change, the frontend must parse the JSON and render `message` as text and `recommendations` as cards. Any existing conversations that return plain text must be handled gracefully — the frontend must try JSON parse and fall back to rendering the raw text if parsing fails.

### Risk 2 — Multiple Explanation Calls Per Chat Message

A single AI chat response may recommend 3–5 freelancers. Each triggers a separate `POST /api/ai/match-explanation` call. This means one chat message send could result in up to 5 parallel OpenAI calls. This is acceptable in terms of UX (all cards fill in within a few seconds) but the token cost is multiplied. A single chat turn that recommends 5 freelancers could consume 5× the token cost of the chat message itself.

### Risk 3 — `jobRequirementId` Not on Existing Conversations

Existing conversations created before this feature ships will not have a `jobRequirementId` on the `conversations` record (Q3). The endpoint must handle `jobRequirementId: null` gracefully — omit rate fit and use only skills + availability for the explanation. This is already handled in the plan (Q5 resolution).

### Risk 4 — Orval Codegen Export Rules

After adding `POST /api/ai/match-explanation` to the OpenAPI spec and running codegen:
1. Verify `lib/api-zod/orval.config.ts` still has `indexFiles: false`
2. Verify `lib/api-zod/src/index.ts` only exports `./generated/api`
3. Run `pnpm typecheck` before any frontend work

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | `budgetMin` / `budgetMax` column existence | Task 1.1 (schema check / migration) |
| Q2 | `requiredStartDate` column existence | Task 1.1 (schema check / migration) |
| Q3 | `conversations.jobRequirementId` column existence | Task 1.2 (schema check / migration) |
| Q5 | How freelancer IDs are embedded in chat response | Task 2.1 (chat system prompt update) |
| Q6 | `freelancer_profiles` primary key | Task 2.2 (endpoint query) |
| Q7 | Skills data format on `freelancer_profiles` | Task 2.2 (prompt construction) |

Questions Q4 and Q8 are design decisions resolved in `plan.md`.

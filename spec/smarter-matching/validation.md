# TalentLock — Validation Guide: Smarter Matching Explanation

> **Purpose:** Verify the Smarter Matching Explanation feature is correctly implemented before it is considered complete. Run after all phases of `task.md` are marked done.
>
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix failures before marking a phase complete.

---

## Phase 1 Validation — Schema

### V1.1 — Schema Inspection Was Completed

- [ ] Actual column names for budget and start date on `job_requirements` are documented in a comment at the top of `artifacts/api-server/src/routes/aiMatch.ts`
- [ ] Actual primary key and skills column format on `freelancer_profiles` are documented in the same comment
- [ ] `conversations.jobRequirementId` column existence confirmed

### V1.2 — Missing Columns Added (if applicable)

Only if columns were missing:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'job_requirements'
AND column_name IN ('budget_min', 'budget_max', 'required_start_date');
```

- [ ] `budget_min` and `budget_max` exist (or confirmed pre-existing under different names)
- [ ] `required_start_date` exists (or confirmed pre-existing)

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'conversations'
AND column_name = 'job_requirement_id';
```

- [ ] `job_requirement_id` exists on `conversations`

---

## Phase 2 Validation — Backend API

### V2.1 — Chat System Prompt Returns Structured JSON

Start a new AI Match conversation and send a message asking for freelancer recommendations (e.g. "Find me a React developer").

Inspect the raw API response in the Pino logs or network tab:

- [ ] AI response is valid JSON with `message` and `recommendations` fields
- [ ] `recommendations` is an array of `{ freelancerId, name }` objects
- [ ] `freelancerId` values match actual IDs in the `freelancer_profiles` table

### V2.2 — Chat System Prompt Fallback Works

Send a non-recommendation message (e.g. "What is TalentLock?"):

- [ ] Response is still valid JSON: `{ "message": "...", "recommendations": [] }`
- [ ] Frontend renders the message correctly as plain text

### V2.3 — Explanation Endpoint: Happy Path With Job Context

```bash
curl -X POST http://localhost:8080/api/ai/match-explanation \
  -H "Authorization: Bearer <employer_clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "freelancerId": "<valid_freelancer_id>",
    "jobRequirementId": "<valid_job_id>",
    "conversationId": "<valid_conversation_id>"
  }'
```

- [ ] Returns `HTTP 200`
- [ ] Response contains `skillsAlignment.matched` (array of strings)
- [ ] Response contains `skillsAlignment.gaps` (array of strings)
- [ ] Response contains `rateFit` with `assessment` value
- [ ] Response contains `availabilityFit` with `assessment` value
- [ ] Response contains `overallSummary` (non-empty string)
- [ ] `token_usage` table has a new row with `feature = 'ai_match_explanation'` and `conversation_id` populated

### V2.4 — Explanation Endpoint: Without Job Context

```bash
curl -X POST http://localhost:8080/api/ai/match-explanation \
  -H "Authorization: Bearer <employer_clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "freelancerId": "<valid_freelancer_id>",
    "conversationId": "<valid_conversation_id>"
  }'
```

- [ ] Returns `HTTP 200`
- [ ] `rateFit` is `null` in the response
- [ ] `availabilityFit.assessment` is `'unknown'` or based on freelancer availability only
- [ ] `overallSummary` is still present and non-empty

### V2.5 — Endpoint: Auth Guards

```bash
# No auth
curl -X POST http://localhost:8080/api/ai/match-explanation \
  -H "Content-Type: application/json" \
  -d '{"freelancerId":"x","conversationId":"y"}'
```
- [ ] Returns `HTTP 401`

```bash
# Freelancer token
curl -X POST http://localhost:8080/api/ai/match-explanation \
  -H "Authorization: Bearer <freelancer_clerk_token>" \
  -d '{"freelancerId":"x","conversationId":"y"}'
```
- [ ] Returns `HTTP 403`

### V2.6 — Endpoint: Unknown IDs

```bash
# Unknown freelancerId
curl -X POST http://localhost:8080/api/ai/match-explanation \
  -H "Authorization: Bearer <employer_clerk_token>" \
  -d '{"freelancerId":"does-not-exist","conversationId":"y"}'
```
- [ ] Returns `HTTP 404`

### V2.7 — Endpoint: Token Quota Exceeded

Manually exhaust the employer's token quota in the DB then call the endpoint:

```sql
UPDATE subscriptions SET monthly_token_limit = 1 WHERE user_id = '<employer_id>';
```

```bash
curl -X POST http://localhost:8080/api/ai/match-explanation \
  -H "Authorization: Bearer <employer_clerk_token>" \
  -d '{"freelancerId":"x","jobRequirementId":"y","conversationId":"z"}'
```

- [ ] Returns `HTTP 402`
- [ ] Response body: `{ "code": "TOKEN_LIMIT", "planNeeded": "..." }`

Reset the limit after this test.

### V2.8 — `normaliseSkills` Handles All Formats

Unit test or manual check in the Node REPL:

```ts
import { normaliseSkills } from './lib/skillsUtils';
normaliseSkills(['React', 'TypeScript']);        // → ['React', 'TypeScript']
normaliseSkills('["React","TypeScript"]');       // → ['React', 'TypeScript']
normaliseSkills('React, TypeScript, Node.js');   // → ['React', 'TypeScript', 'Node.js']
normaliseSkills(null);                           // → []
normaliseSkills(undefined);                      // → []
```

- [ ] All five cases return the correct array

### V2.9 — TypeCheck Passes

```bash
pnpm typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — Generated Hook Exists

```bash
grep -r "usePostAiMatchExplanation" lib/api-client-react/src/
```

- [ ] Hook exists and is exported

### V3.2 — `parseChatResponse` Handles Both Formats

In browser DevTools console or unit test:

```ts
// New format
parseChatResponse('{"message":"Here are matches","recommendations":[{"freelancerId":"abc","name":"Sarah"}]}')
// → { message: "Here are matches", recommendations: [{freelancerId: "abc", name: "Sarah"}] }

// Legacy plain text
parseChatResponse("Here are some great freelancers you should consider.")
// → { message: "Here are some freelancers...", recommendations: [] }

// Malformed JSON
parseChatResponse('{ broken json')
// → { message: "{ broken json", recommendations: [] }
```

- [ ] All three cases handled correctly

### V3.3 — AI Match Chat: Cards Appear Below Recommendations

Open `/ai-match` as an employer and ask for freelancer recommendations.

- [ ] `<MatchExplanationCard />` skeleton appears immediately below each recommended freelancer card while loading
- [ ] Card fills in with actual data within ~5 seconds
- [ ] Maximum 3 explanation cards rendered even if AI recommends more than 3 freelancers
- [ ] Chat message itself renders immediately — not blocked by explanation loading
- [ ] Non-recommendation messages (general questions) show NO explanation cards

### V3.4 — Card State: Full Context

With a conversation linked to a job requirement that has budget and start date:

- [ ] Skills Alignment section shows green chips for matched skills
- [ ] Skills Alignment section shows amber chips for gap skills
- [ ] Rate Fit section visible with `$X/hr · Budget: $Y – $Z/hr` and correct badge colour
  - Within budget → green badge
  - Above budget → red badge
  - Below budget → amber badge
- [ ] Availability section visible with dates and correct badge colour
- [ ] Overall summary paragraph visible in italic text
- [ ] Entire card has violet left border

### V3.5 — Card State: No Job Context

With a conversation NOT linked to a job requirement:

- [ ] Rate Fit section is completely absent — no label, no empty row
- [ ] Availability section shows `"Availability unknown"` slate badge
- [ ] Skills and summary still present
- [ ] No placeholder or "not available" text where Rate Fit would be

### V3.6 — Card State: Quota Reached

With an exhausted token quota:

- [ ] Amber card renders with `"⚡ Monthly AI token limit reached"` heading
- [ ] Reset date shown in body text
- [ ] `"Upgrade Plan →"` link navigates to `/pricing`
- [ ] Chat conversation is NOT interrupted — employer can still send messages
- [ ] Page does NOT redirect to `/pricing` automatically

### V3.7 — Card State: Error

Simulate an API error (e.g. temporarily break the route):

- [ ] Slate card renders with `"Could not load match explanation."` text
- [ ] `[Retry]` button re-fires the API call
- [ ] Retrying successfully loads the card when the route is restored

### V3.8 — Freelancer Detail Page: With `?jobId=`

Navigate to `/freelancers/:id?jobId=<valid_job_id>` as an employer.

- [ ] `<MatchExplanationCard />` appears below the freelancer bio
- [ ] Card loads with the correct job context (rate fit section visible if job has budget)
- [ ] Card does not appear for freelancer-role users on the same URL

### V3.9 — Freelancer Detail Page: Without `?jobId=`

Navigate to `/freelancers/:id` (no query param) as an employer.

- [ ] NO explanation card rendered
- [ ] No empty space or placeholder where the card would be

### V3.10 — No Regression on Existing Chat

Open an existing conversation created before this feature shipped.

- [ ] Old messages (plain text format) render correctly
- [ ] No broken JSON displayed to the user
- [ ] No explanation cards appear for old messages (no `recommendations` to parse)

---

## Security Validation

### S1 — Freelancer Cannot Request Explanations

```bash
curl -X POST http://localhost:8080/api/ai/match-explanation \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"freelancerId":"x","conversationId":"y"}'
```

- [ ] Returns `HTTP 403`

### S2 — Explanation Does Not Expose Private Freelancer Data

Inspect the API response for `POST /api/ai/match-explanation`:

- [ ] Response does NOT contain raw document file URLs
- [ ] Response does NOT contain `users.clerkId`
- [ ] Response does NOT contain any fields beyond the defined response shape
- [ ] Skills, rate, and availability data are aggregated — not the raw DB row

### S3 — Token Logging Uses Correct User ID

Check `token_usage` table after a successful explanation call:

```sql
SELECT user_id, feature, conversation_id
FROM token_usage
WHERE feature = 'ai_match_explanation'
ORDER BY created_at DESC LIMIT 1;
```

- [ ] `user_id` is the employer's internal DB ID (not `'system'`, not a Clerk ID string)
- [ ] `feature = 'ai_match_explanation'`
- [ ] `conversation_id` is populated with the actual conversation ID

---

## Regression Validation

### R1 — Existing AI Match Chat Still Works

Send a message in an existing conversation:

- [ ] Chat still responds correctly
- [ ] Existing plain-text messages still render
- [ ] Token usage still logged for `ai_match` feature label

### R2 — Freelancer Detail Page Unchanged Without Query Param

Navigate to `/freelancers/:id` without `?jobId=`:

- [ ] All existing sections (bio, skills, portfolio, reviews) intact
- [ ] Booking button still works
- [ ] No new empty sections added

### R3 — Token Quota Still Works for Other AI Features

Trigger the AI agreement generation as an employer:

- [ ] Token quota check still fires correctly
- [ ] `agreement_generation` tokens still logged correctly
- [ ] No interference from new `ai_match_explanation` feature label

### R4 — TypeCheck and Build Pass

```bash
pnpm typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero TypeScript errors
- [ ] Frontend build completes without errors
- [ ] Backend build completes without errors

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Schema | ⬜ | | |
| Phase 2 — Backend API | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| Security Checks | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

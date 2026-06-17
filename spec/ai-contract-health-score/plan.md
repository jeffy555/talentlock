# TalentLock — Implementation Plan: AI Contract Health Score

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Run all of these before writing any code. Report every finding.

```bash
# 1. Check agreements schema for existing health score columns
grep -A 50 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "health\|score\|scored"

# 2. Check agreements schema for employer/freelancer columns
grep -A 50 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "employer\|freelancer\|booking"

# 3. Check how accept-redline handler is structured
grep -n "accept-redline\|acceptRedline" artifacts/api-server/src/routes/agreements.ts | head -10
cat artifacts/api-server/src/routes/agreements.ts | grep -A 30 "accept-redline"

# 4. Check contract_health_score in TokenFeature
grep "contract_health_score" artifacts/api-server/src/lib/tokenLogger.ts

# 5. Check agreements content column name
grep -A 50 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "content\|text\|body"

# 6. Check how agreement parties are verified in existing routes
grep -n "employerId\|freelancerId\|booking" artifacts/api-server/src/routes/agreements.ts | head -20
```

Document all findings in a comment block at the top of the new endpoint.

---

## Resolved Questions

---

### Q1 — Health Score Columns

**Decision: Inspect first. Add if missing.**

After inspection, if columns do not exist:
```ts
// Add to agreements table in lib/db/src/schema/
healthScore:       integer('health_score'),          // nullable, 0–100
healthScoreDetail: jsonb('health_score_detail'),     // nullable, full breakdown JSON
healthScoredAt:    timestamp('health_scored_at', { withTimezone: true }), // nullable
```

If columns already exist under different names — use those names throughout and document in a comment.

---

### Q2 — Party Verification on Agreements

**Decision: Inspect first. Use the pattern found in existing agreement routes.**

After inspecting `agreements.ts`:

**If `agreements` has direct `employerId` and `freelancerId` columns:**
```ts
if (agreement.employerId !== internalUserId && agreement.freelancerId !== internalUserId) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

**If `agreements` links through `bookings` (via `bookingId`):**
```ts
const booking = await db.query.bookings.findFirst({
  where: eq(bookings.id, agreement.bookingId)
});
if (booking.employerId !== internalUserId && booking.freelancerId !== internalUserId) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

Use whichever pattern is confirmed from inspection. Document with a comment.

---

### Q3 — Cache Invalidation on Redline Accept

**Decision: Option A — modify existing `accept-redline` handler.**

In `PATCH /api/agreements/:id/accept-redline`, after the Drizzle transaction commits, add:

```ts
// Invalidate health score cache — content has changed
await db.update(agreements)
  .set({
    healthScore: null,
    healthScoreDetail: null,
    healthScoredAt: null,
  })
  .where(eq(agreements.id, agreementId));
```

This runs AFTER the atomic transaction (content update + signature reset) — not inside it. The cache invalidation is not critical-path; if it fails it just means the stale score shows until the user re-scores.

---

### Q4 — Score Available at Any Status

**Decision: Option A — available at all statuses.**

No status guard on `POST /api/agreements/:id/health-score`. The score is purely informational and never blocks any action.

---

### Q5 — `fieldOfWork` for Industry Fit

**Decision: Use all available context. Join through booking → freelancer profile.**

```ts
// After fetching the agreement, resolve field context
let fieldOfWork = 'general';
let jobTitle = '';

try {
  // Get booking linked to this agreement (inspect column name from schema)
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, agreement.bookingId) // adjust column name if needed
  });
  if (booking?.freelancerId) {
    const freelancerProfile = await db.query.freelancerProfiles.findFirst({
      where: eq(freelancerProfiles.id, booking.freelancerId)
    });
    if (freelancerProfile?.fieldOfWork) fieldOfWork = freelancerProfile.fieldOfWork;
  }
  if (booking?.jobRequirementId) {
    const jobReq = await db.query.jobRequirements.findFirst({
      where: eq(jobRequirements.id, booking.jobRequirementId)
    });
    if (jobReq?.title) jobTitle = jobReq.title;
  }
} catch {
  // Context resolution is best-effort — score proceeds without it
}
```

---

### Q6 — JSON Parse Failure

**Decision: Option C — return `{ parseError: true, score: null }`. No default score.**

```ts
try {
  const parsed = JSON.parse(responseText);
  // validate structure
  return res.json({ parseError: false, ...parsed });
} catch {
  req.log.warn({ agreementId }, 'health score JSON parse failed');
  return res.json({ parseError: true, score: null, dimensions: null });
}
```

Frontend shows: "Could not score this contract. Please try again."

---

### Q7 — Health Score in List Response

**Decision: Yes — include `healthScore: number | null` in `GET /api/agreements` paginated response.**

The list query already fetches agreement rows. Adding `healthScore` is a single field addition to the SELECT. No extra JOIN needed.

Frontend: compact grade badge (`A` / `B` / `C` / `D` / `F`) next to each agreement title. No badge when `healthScore === null`.

---

### Q8 — Token Quota for Freelancers

**Decision: Skip `checkTokenQuota()` for freelancer plans. Always log tokens.**

```ts
const isFreelancer = userRole === 'freelancer';

// Only enforce quota for employer plans
if (!isFreelancer) {
  await checkTokenQuota(db, internalUserId);
  // Returns 402 TOKEN_LIMIT if exceeded
}

// Call OpenAI...

// Always log regardless of plan
await logTokenUsage(db, internalUserId, 'contract_health_score', {
  promptTokens: response.usage.prompt_tokens,
  completionTokens: response.usage.completion_tokens,
  totalTokens: response.usage.total_tokens,
});
// TODO: Add freelancer token quota when billing is connected
```

---

## AI System Prompt (Use Verbatim)

```
You are a contract quality analyst for a freelance platform.
Score the following contract on exactly five dimensions, each 0–20 points.

Dimensions:
1. Clarity — Language is unambiguous; no undefined terms; no contradictions.
2. Fairness — Terms are not unreasonably one-sided; balanced obligations.
3. Completeness — All standard sections present: deliverables, payment terms, IP ownership, termination clause, dispute resolution.
4. Enforceability — Terms are specific and actionable; no vague phrases like "reasonable time" without definition.
5. Industry Fit — Terms are appropriate for the field of work: ${fieldOfWork}${jobTitle ? ` (${jobTitle})` : ''}.

Return ONLY a JSON object — no preamble, no markdown, no explanation outside the JSON:
{
  "totalScore": <integer 0-100>,
  "dimensions": {
    "clarity": { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "fairness": { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "completeness": { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "enforceability": { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "industryFit": { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" }
  },
  "summary": "<2-3 sentence overall assessment>"
}

totalScore must equal the sum of all five dimension scores.
Be honest and critical — do not inflate scores.
This is AI guidance only, not legal advice.

Contract to evaluate:
---
${agreementContent}
---
```

Use `temperature: 0` for deterministic scoring.

---

## Cache Validation Logic

When `POST /api/agreements/:id/health-score` is called:

```ts
// Check cache first
if (
  agreement.healthScore !== null &&
  agreement.healthScoreDetail !== null &&
  agreement.healthScoredAt !== null
) {
  // Return cached score — no OpenAI call, no token consumption
  return res.json({
    parseError: false,
    cached: true,
    totalScore: agreement.healthScore,
    ...agreement.healthScoreDetail,
    healthScoredAt: agreement.healthScoredAt.toISOString(),
  });
}

// No cache — proceed with OpenAI call
```

---

## Score → Grade Mapping

```ts
export function getHealthGrade(score: number): {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
  colour: string; // Tailwind text colour class
} {
  if (score >= 90) return { grade: 'A', label: 'Excellent',     colour: 'text-emerald-600' };
  if (score >= 75) return { grade: 'B', label: 'Good',          colour: 'text-blue-600' };
  if (score >= 60) return { grade: 'C', label: 'Acceptable',    colour: 'text-amber-600' };
  if (score >= 45) return { grade: 'D', label: 'Needs Review',  colour: 'text-orange-600' };
  return              { grade: 'F', label: 'Weak',          colour: 'text-red-600' };
}
```

Store in `artifacts/talentlock/src/lib/contractHealthUtils.ts`.

---

## Resolved Risks

---

### Risk 1 — Long Agreement Content

**Resolution:** No truncation — send full agreement content. A 6,000-character agreement is ~1,500 tokens. With system prompt overhead (~300 tokens) and completion (~400 tokens), total is ~2,200 tokens maximum. Well within the Starter plan's 50k/month quota (22 calls/month on the absolute maximum-length agreement). Acceptable.

If content exceeds 8,000 characters: truncate to 8,000 characters and add a note to the prompt: `"Note: Contract was truncated to 8,000 characters for analysis."` Return `truncated: true` in the response.

---

### Risk 2 — Score Subjectivity

**Resolution:** `temperature: 0` for determinism. Cache the score. Disclaimer in UI.

---

### Risk 3 — Column Migration Safety

**Resolution:** Three nullable columns — safe additive migration. No backfill needed. All existing agreements default to null (not yet scored).

---

### Risk 4 — Redline Route Modification

**Resolution:** Cache invalidation is OUTSIDE the existing atomic transaction, runs after it. Adding 3 lines after a committed transaction cannot break the transaction itself.

```ts
// Existing transaction (unchanged):
await db.transaction(async (tx) => {
  await tx.update(agreements).set({ content: newContent, ... });
  await tx.update(agreements).set({ freelancerSignedAt: null, ... });
});

// NEW — outside transaction, after commit:
await db.update(agreements)
  .set({ healthScore: null, healthScoreDetail: null, healthScoredAt: null })
  .where(eq(agreements.id, agreementId));
```

---

### Risk 5 — Codegen

**Resolution:** OpenAPI spec updated in Phase 2. Codegen run before Phase 3. Standard post-codegen checks apply.

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/ai-contract-health-score/features.md` read
- [ ] `specs/ai-contract-health-score/clarify.md` read
- [ ] This `plan.md` read — all 8 questions and 5 risks resolved
- [ ] `specs/ai-contract-health-score/task.md` read
- [ ] `specs/ai-contract-health-score/UI.md` read
- [ ] Codebase inspection complete — Q1, Q2 confirmed from actual schema
- [ ] `contract_health_score` added to `TokenFeature` if missing

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Database — 3 new columns on `agreements` | ⬜ Not started |
| Phase 2 | Backend — endpoint + cache invalidation in redline route + OpenAPI + codegen | ⬜ Not started |
| Phase 3 | Frontend — score card on `/agreements/:id`, grade badge on list, `contractHealthUtils.ts` | ⬜ Not started |

# TalentLock — Task Breakdown: AI Contract Health Score

## Summary

Three phases: Database (3 new columns) → Backend (endpoint + cache invalidation + codegen) → Frontend (score card, grade badge, utility). No new routes file — the endpoint lives in the existing `agreements.ts`. No new table.

---

## Phase 1 — Database

### Task 1.1 — Codebase Inspection

Run all inspection commands from `plan.md` before touching any schema file. Document:
- Whether `healthScore`, `healthScoreDetail`, `healthScoredAt` already exist on `agreements`
- Exact column names for `employerId` / `freelancerId` / `bookingId` on `agreements` (or join path through `bookings`)
- How the `accept-redline` handler is structured (transaction scope, file location)
- Confirmed `content` column name on `agreements`

Add a comment block at the top of the endpoint summarising all findings.

### Task 1.2 — Add Health Score Columns to `agreements`

**File:** `lib/db/src/schema/` — same file as the `agreements` table

Add only columns that do not already exist (from Task 1.1 inspection):

```ts
healthScore:       integer('health_score'),
healthScoreDetail: jsonb('health_score_detail'),
healthScoredAt:    timestamp('health_scored_at', { withTimezone: true }),
```

All three are nullable. No default. No backfill required — existing agreements default to null (not yet scored).

### Task 1.3 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify in Neon:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agreements'
AND column_name IN ('health_score', 'health_score_detail', 'health_scored_at');
```

- [ ] All three columns present and nullable

---

## Phase 2 — Backend

### Task 2.1 — Add `contract_health_score` to TokenFeature

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

```ts
export type TokenFeature =
  | /* existing values */
  | 'contract_health_score'  // ← add if not present
```

### Task 2.2 — Create `contractHealthUtils.ts` (Server-Side)

**File:** `artifacts/api-server/src/lib/contractHealthUtils.ts` (create new)

```ts
export function buildHealthScorePrompt(
  agreementContent: string,
  fieldOfWork: string,
  jobTitle: string,
  truncated: boolean
): string {
  const content = truncated
    ? agreementContent.slice(0, 8000)
    : agreementContent;

  return `You are a contract quality analyst for a freelance platform.
Score the following contract on exactly five dimensions, each 0–20 points.

Dimensions:
1. Clarity — Language is unambiguous; no undefined terms; no contradictions.
2. Fairness — Terms are not unreasonably one-sided; balanced obligations.
3. Completeness — All standard sections present: deliverables, payment terms, IP ownership, termination clause, dispute resolution.
4. Enforceability — Terms are specific and actionable; no vague phrases like "reasonable time" without definition.
5. Industry Fit — Terms are appropriate for the field of work: ${fieldOfWork}${jobTitle ? ` (${jobTitle})` : ''}.

Return ONLY a JSON object — no preamble, no markdown:
{
  "totalScore": <integer 0-100>,
  "dimensions": {
    "clarity":        { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "fairness":       { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "completeness":   { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "enforceability": { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" },
    "industryFit":    { "score": <0-20>, "verdict": "<Strong|Acceptable|Needs attention|Weak>", "explanation": "<1-2 sentences>" }
  },
  "summary": "<2-3 sentence overall assessment>"
}

totalScore must equal the sum of all five dimension scores.
Be honest and critical — do not inflate scores.
This is AI guidance only, not legal advice.
${truncated ? '\nNote: Contract was truncated to 8,000 characters for analysis.' : ''}

Contract to evaluate:
---
${content}
---`;
}

export function validateHealthScoreResponse(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as Record<string, unknown>;
  if (typeof p.totalScore !== 'number') return false;
  if (!p.dimensions || typeof p.dimensions !== 'object') return false;
  const dims = p.dimensions as Record<string, unknown>;
  for (const dim of ['clarity', 'fairness', 'completeness', 'enforceability', 'industryFit']) {
    const d = dims[dim] as Record<string, unknown>;
    if (!d || typeof d.score !== 'number' || typeof d.verdict !== 'string') return false;
  }
  return true;
}
```

### Task 2.3 — Add `POST /api/agreements/:id/health-score` Endpoint

**File:** `artifacts/api-server/src/routes/agreements.ts` (modify existing)

Add the new route handler. Insert it in a logical position near the other AI-related agreement routes (`/redline`, `/accept-redline`).

```ts
// POST /api/agreements/:id/health-score
router.post('/:id/health-score', requireAuth, async (req, res) => {
  const { id: agreementId } = req.params;
  const { internalUserId, userRole, userPlan } = req.auth; // adjust to actual auth pattern

  // 1. Fetch agreement
  const agreement = await db.query.agreements.findFirst({
    where: eq(agreements.id, agreementId),
  });
  if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

  // 2. Verify party access (use pattern confirmed from inspection — Q2)
  const isParty = /* check employer/freelancer link — see plan.md Q2 */;
  if (!isParty) return res.status(403).json({ error: 'Forbidden' });

  // 3. Return cached score if available
  if (
    agreement.healthScore !== null &&
    agreement.healthScoreDetail !== null &&
    agreement.healthScoredAt !== null
  ) {
    return res.json({
      parseError: false,
      cached: true,
      truncated: false,
      totalScore: agreement.healthScore,
      ...(agreement.healthScoreDetail as object),
      healthScoredAt: agreement.healthScoredAt.toISOString(),
    });
  }

  // 4. Token quota check (employer plans only — freelancer plans have no quota)
  const isFreelancer = userRole === 'freelancer';
  if (!isFreelancer) {
    const quotaOk = await checkTokenQuota(db, internalUserId);
    if (!quotaOk) return res.status(402).json({ code: 'TOKEN_LIMIT' });
  }

  // 5. Resolve field context (best-effort — see plan.md Q5)
  let fieldOfWork = 'general';
  let jobTitle = '';
  try {
    // Join through booking → freelancer_profiles / job_requirements
    // Adjust join path based on schema inspection (Task 1.1)
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, agreement.bookingId),
    });
    if (booking?.freelancerId) {
      const fp = await db.query.freelancerProfiles.findFirst({
        where: eq(freelancerProfiles.id, booking.freelancerId),
      });
      if (fp?.fieldOfWork) fieldOfWork = fp.fieldOfWork;
    }
    if (booking?.jobRequirementId) {
      const jr = await db.query.jobRequirements.findFirst({
        where: eq(jobRequirements.id, booking.jobRequirementId),
      });
      if (jr?.title) jobTitle = jr.title;
    }
  } catch {
    // Context resolution is best-effort — proceed without field data
    req.log.warn({ agreementId }, 'health score field context resolution failed');
  }

  // 6. Build prompt
  const content = agreement.content ?? '';
  const truncated = content.length > 8000;
  const prompt = buildHealthScorePrompt(content, fieldOfWork, jobTitle, truncated);

  // 7. Call OpenAI
  let responseText = '';
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });
    responseText = response.choices[0]?.message?.content ?? '';
    usage = response.usage ?? usage;
  } catch (err) {
    req.log.error({ err, agreementId }, 'health score OpenAI call failed');
    return res.status(500).json({ error: 'AI service unavailable. Please try again.' });
  }

  // 8. Parse response
  let parsed: unknown;
  try {
    const cleaned = responseText.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
    if (!validateHealthScoreResponse(parsed)) throw new Error('invalid shape');
  } catch {
    req.log.warn({ agreementId }, 'health score JSON parse failed');
    return res.json({ parseError: true, score: null, dimensions: null });
  }

  // 9. Log tokens (always — even for freelancers)
  logTokenUsage(db, internalUserId, 'contract_health_score', {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  }).catch(err => req.log.warn({ err }, 'token usage log failed'));
  // TODO: Add freelancer token quota when billing is connected

  // 10. Cache the result
  const detail = parsed as Record<string, unknown>;
  await db.update(agreements)
    .set({
      healthScore:       (parsed as { totalScore: number }).totalScore,
      healthScoreDetail: detail,
      healthScoredAt:    new Date(),
    })
    .where(eq(agreements.id, agreementId));

  // 11. Return response
  return res.json({
    parseError: false,
    cached: false,
    truncated,
    ...detail,
    healthScoredAt: new Date().toISOString(),
  });
});
```

### Task 2.4 — Invalidate Cache in `accept-redline` Handler

**File:** `artifacts/api-server/src/routes/agreements.ts`

Find the `PATCH /:id/accept-redline` handler. After the existing atomic transaction commits (outside the transaction scope), add:

```ts
// Invalidate health score cache — content changed by redline acceptance
await db.update(agreements)
  .set({
    healthScore:       null,
    healthScoreDetail: null,
    healthScoredAt:    null,
  })
  .where(eq(agreements.id, agreementId));
```

This runs unconditionally after the transaction. It is not inside the transaction.

### Task 2.5 — Add `healthScore` to Agreement List Response

**File:** `artifacts/api-server/src/routes/agreements.ts`

In `GET /api/agreements` (the paginated list handler), add `healthScore` to the SELECT fields:

```ts
// Include in the select statement
healthScore: agreements.healthScore,
```

Include in the paginated response data shape so it flows through to the frontend list.

### Task 2.6 — OpenAPI Spec + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add `POST /api/agreements/{id}/health-score`:

```yaml
/api/agreements/{id}/health-score:
  post:
    summary: Score contract health with AI
    tags: [agreements]
    security:
      - clerkAuth: []
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    responses:
      '200':
        description: Health score result (or parse error)
        content:
          application/json:
            schema:
              oneOf:
                - $ref: '#/components/schemas/HealthScoreResult'
                - $ref: '#/components/schemas/HealthScoreParseError'
      '402':
        description: Token quota exceeded
      '403':
        description: Not a party to this agreement
      '404':
        description: Agreement not found
```

Also update `GET /api/agreements` response schema to include `healthScore: integer | null` per agreement item.

Run codegen:
```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm run typecheck` — fix all errors before Phase 3

---

## Phase 3 — Frontend

### Task 3.1 — Verify Generated Hooks

```bash
grep -r "usePostAgreementsIdHealthScore\|healthScore" lib/api-client-react/src/ | head -10
```

- [ ] Hook `usePostAgreementsIdHealthScore()` exists
- [ ] Agreement list item type includes `healthScore: number | null`

If missing, re-run codegen before continuing.

### Task 3.2 — Create `contractHealthUtils.ts` (Frontend)

**File:** `artifacts/talentlock/src/lib/contractHealthUtils.ts` (create new)

```ts
export function getHealthGrade(score: number): {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
  colour: string;         // Tailwind text colour class
  bg: string;             // Tailwind bg colour class
  border: string;         // Tailwind border colour class
} {
  if (score >= 90) return { grade: 'A', label: 'Excellent',    colour: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-300' };
  if (score >= 75) return { grade: 'B', label: 'Good',         colour: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-300' };
  if (score >= 60) return { grade: 'C', label: 'Acceptable',   colour: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-300' };
  if (score >= 45) return { grade: 'D', label: 'Needs Review', colour: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-300' };
  return              { grade: 'F', label: 'Weak',         colour: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-300' };
}

export type DimensionVerdict = 'Strong' | 'Acceptable' | 'Needs attention' | 'Weak';

export function verdictColour(verdict: DimensionVerdict): string {
  switch (verdict) {
    case 'Strong':          return 'text-emerald-600';
    case 'Acceptable':      return 'text-blue-600';
    case 'Needs attention': return 'text-amber-600';
    case 'Weak':            return 'text-red-600';
  }
}

export const DIMENSION_LABELS: Record<string, string> = {
  clarity:        'Clarity',
  fairness:       'Fairness',
  completeness:   'Completeness',
  enforceability: 'Enforceability',
  industryFit:    'Industry Fit',
};
```

### Task 3.3 — Create `<ContractHealthScoreCard />`

**File:** `artifacts/talentlock/src/components/ContractHealthScoreCard.tsx` (create new)

Props:
```ts
interface ContractHealthScoreCardProps {
  agreementId: string;
  userRole: 'employer' | 'freelancer';
  userPlan: string;
  initialScore?: number | null;        // from list response cache
  onScoreLoaded?: (score: number) => void;
}
```

Internal state:
```ts
const [scoreData, setScoreData] = useState<HealthScoreData | null>(null);
const [hasRequested, setHasRequested] = useState(false);
```

Uses `usePostAgreementsIdHealthScore()` mutation.

See `UI.md` for all states.

### Task 3.4 — Integrate Into `/agreements/:id`

**File:** `artifacts/talentlock/src/pages/AgreementDetail.tsx`

Add `<ContractHealthScoreCard />` below the agreement content and above the signing section:

```tsx
{/* Contract Health Score — shown to both parties */}
<ContractHealthScoreCard
  agreementId={agreement.id}
  userRole={userRole}
  userPlan={userPlan}
  initialScore={agreement.healthScore}
/>
```

DOM order:
```
[Agreement header — title, status, parties]
[Agreement content / redline suggestions]    ← existing
────────────────────────────────────────────
<ContractHealthScoreCard />                  ← NEW
────────────────────────────────────────────
[Signing section]                            ← existing
```

### Task 3.5 — Add Grade Badge to Agreement List

**File:** `artifacts/talentlock/src/pages/Agreements.tsx` (or equivalent list page)

For each agreement item in the list where `healthScore !== null`:

```tsx
{agreement.healthScore !== null && (
  <GradeBadge score={agreement.healthScore} />
)}
```

Create inline `<GradeBadge />` component or add to `contractHealthUtils.ts`:

```tsx
function GradeBadge({ score }: { score: number }) {
  const { grade, colour, bg, border } = getHealthGrade(score);
  return (
    <span className={`inline-flex items-center justify-center
      w-6 h-6 rounded text-xs font-bold border
      ${colour} ${bg} ${border}`}>
      {grade}
    </span>
  );
}
```

---

## Acceptance Criteria

- [ ] `healthScore`, `healthScoreDetail`, `healthScoredAt` columns exist on `agreements` (nullable)
- [ ] `contract_health_score` in `TokenFeature` union
- [ ] `POST /api/agreements/:id/health-score` returns 404 when agreement not found
- [ ] Returns 403 when requesting user is not a party to the agreement
- [ ] Returns cached score immediately (no OpenAI call) when cache is valid
- [ ] `cached: true` in response when serving from cache
- [ ] Returns 402 `TOKEN_LIMIT` when employer quota is exceeded
- [ ] Freelancers are NOT blocked by quota check
- [ ] Tokens logged for both employer and freelancer requests
- [ ] `temperature: 0` used for all health score calls
- [ ] Parse failure returns `{ parseError: true, score: null }` — not a 500
- [ ] Long agreements (>8,000 chars) truncated with `truncated: true` in response
- [ ] `PATCH /api/agreements/:id/accept-redline` nullifies health score cache after commit
- [ ] `GET /api/agreements` response includes `healthScore: number | null` per item
- [ ] Codegen hook `usePostAgreementsIdHealthScore()` confirmed
- [ ] `contractHealthUtils.ts` created on both frontend and backend
- [ ] `<ContractHealthScoreCard />` renders on `/agreements/:id` for both parties
- [ ] "Score this contract" button fires API call
- [ ] Loading spinner shown during API call
- [ ] Score card shows grade, total score, all 5 dimension bars
- [ ] Redline nudge shown when score < 75 and user is Growth+
- [ ] Parse error state renders "Could not score" message with retry
- [ ] Cached indicator shown when serving from cache
- [ ] Grade badge (`A`/`B`/`C`/`D`/`F`) shown on agreement list for scored agreements
- [ ] Disclaimer "AI-generated assessment — not legal advice" visible
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 (migration verify)
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 (codegen + typecheck)
Task 3.1 (verify hook) → 3.2 → 3.3 → 3.4 → 3.5
```

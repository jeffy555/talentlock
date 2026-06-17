# TalentLock — Task Breakdown: Agreement AI Summary

## Summary

Three phases: Database (2 new columns) → Backend (endpoint + utils + cache invalidation + codegen) → Frontend (summary panel + list badge). No new route file — endpoint lives in existing `agreements.ts`. No new table.

---

## Phase 1 — Database

### Task 1.1 — Codebase Inspection

Run all inspection commands from `plan.md`. Document and confirm:
- Whether `freelancerSummary` / `freelancerSummaryScoredAt` columns already exist on `agreements`
- Exact content column name on `agreements`
- Party verification join path (confirm from AI Contract Health Score implementation notes)
- Exact location and structure of the `accept-redline` cache invalidation block (added by AI Contract Health Score)
- Whether `agreement_summary` is already in `TokenFeature`

Add a comment block at the top of the new endpoint summarising all findings.

### Task 1.2 — Add Summary Cache Columns to `agreements`

**File:** `lib/db/src/schema/` — same file as the `agreements` table

Add only if not already present (from Task 1.1 inspection):

```ts
freelancerSummary:          jsonb('freelancer_summary'),
freelancerSummaryScoredAt:  timestamp('freelancer_summary_scored_at', { withTimezone: true }),
```

Both nullable. No default. No backfill required.

### Task 1.3 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify in Neon:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agreements'
AND column_name IN ('freelancer_summary', 'freelancer_summary_scored_at');
```

- [ ] Both columns present and nullable

---

## Phase 2 — Backend

### Task 2.1 — Add `agreement_summary` to TokenFeature

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

```ts
export type TokenFeature =
  | /* existing values */
  | 'agreement_summary'  // ← add if not present
```

### Task 2.2 — Create `agreementSummaryUtils.ts`

**File:** `artifacts/api-server/src/lib/agreementSummaryUtils.ts` (create new)

Implement:
1. `buildSummaryPrompt(content: string, truncated: boolean): string` — exact system prompt from `plan.md`
2. `validateSummaryResponse(parsed: unknown): boolean` — exact implementation from `plan.md`
3. `AGREEMENT_SUMMARY_DISCLAIMER` — the constant disclaimer string

```ts
export const AGREEMENT_SUMMARY_DISCLAIMER =
  'This is an AI-generated summary for your convenience. It is not legal advice. Always read the full agreement before signing.';

export function buildSummaryPrompt(content: string, truncated: boolean): string {
  return `You are helping a freelancer understand a contract they have been asked to sign.
Your job is to summarise the key points in plain, clear English — no jargon.
Write as if you are explaining this to a smart friend who is not a lawyer.

Return ONLY a JSON object — no preamble, no markdown, no explanation outside the JSON:
{
  "sections": {
    "whatYouDo": { "title": "What you are being hired to do", "content": "<2-4 sentences>" },
    "howYouGetPaid": { "title": "How and when you get paid", "content": "<2-4 sentences>" },
    "whoOwnsTheWork": { "title": "Who owns the work", "content": "<2-4 sentences>" },
    "howItCanEnd": { "title": "How this contract can end", "content": "<2-4 sentences>" },
    "restrictions": { "title": "Important restrictions on you", "content": "<2-4 sentences or 'Not mentioned in this contract.'>" },
    "keyDates": { "title": "Key dates and deadlines", "content": "<2-4 sentences or 'No specific dates mentioned.'>" }
  },
  "attentionFlags": {
    "exists": <true|false>,
    "items": [{ "heading": "<up to 8 words from the contract>", "detail": "<1-2 sentences why this matters>" }]
  }
}

Rules:
- If a section topic is NOT in the contract, write exactly: "Not mentioned in this contract."
- Do NOT invent content not in the contract.
- attentionFlags.items: up to 3 items. Empty array if no unusual terms.
- Write for a freelancer — frame from their perspective.
${truncated ? '- Note: The contract was truncated to 8,000 characters. Summary may be incomplete.' : ''}

Contract to summarise:
---
${content}
---`;
}

export function validateSummaryResponse(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as Record<string, unknown>;
  if (!p.sections || typeof p.sections !== 'object') return false;
  const s = p.sections as Record<string, unknown>;
  const required = ['whatYouDo', 'howYouGetPaid', 'whoOwnsTheWork', 'howItCanEnd', 'restrictions', 'keyDates'];
  for (const key of required) {
    const section = s[key] as Record<string, unknown>;
    if (!section || typeof section.title !== 'string' || typeof section.content !== 'string') return false;
  }
  if (!p.attentionFlags || typeof p.attentionFlags !== 'object') return false;
  const af = p.attentionFlags as Record<string, unknown>;
  if (typeof af.exists !== 'boolean' || !Array.isArray(af.items)) return false;
  return true;
}
```

### Task 2.3 — Add `POST /api/agreements/:id/summarise` Endpoint

**File:** `artifacts/api-server/src/routes/agreements.ts` (modify existing)

Add the route handler after the health score handler. Use the same party verification pattern confirmed from inspection.

```ts
// POST /api/agreements/:id/summarise
router.post('/:id/summarise', requireAuth, async (req, res) => {
  const { id: agreementId } = req.params;
  const { internalUserId, userRole } = req.auth; // adjust to actual auth pattern

  // 1. Freelancer-only guard (checked BEFORE fetching agreement)
  if (userRole !== 'freelancer') {
    return res.status(403).json({ error: 'This feature is for freelancers only' });
  }

  // 2. Fetch agreement
  const agreement = await db.query.agreements.findFirst({
    where: eq(agreements.id, agreementId),
  });
  if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

  // 3. Verify party access (use pattern confirmed from inspection — same as health score)
  const isParty = /* check freelancer party — see plan.md Q2 */;
  if (!isParty) return res.status(403).json({ error: 'Forbidden' });

  // 4. Return cached summary if available
  if (agreement.freelancerSummary !== null && agreement.freelancerSummaryScoredAt !== null) {
    return res.json({
      parseError: false,
      cached: true,
      truncated: false,
      freelancerSummaryScoredAt: agreement.freelancerSummaryScoredAt.toISOString(),
      ...(agreement.freelancerSummary as object),
      disclaimer: AGREEMENT_SUMMARY_DISCLAIMER,
    });
  }

  // 5. No quota check for freelancers (monthlyTokenLimit: null)
  // TODO: Add freelancer token quota when billing is connected

  // 6. Build prompt
  const content = agreement[CONTENT_COL] ?? ''; // use confirmed column name
  const truncated = content.length > 8000;
  const trimmedContent = truncated ? content.slice(0, 8000) : content;
  const prompt = buildSummaryPrompt(trimmedContent, truncated);

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
    req.log.error({ err, agreementId }, 'agreement summary OpenAI call failed');
    return res.status(500).json({ error: 'AI service unavailable. Please try again.' });
  }

  // 8. Parse and validate
  let parsed: unknown;
  try {
    const cleaned = responseText.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
    if (!validateSummaryResponse(parsed)) throw new Error('invalid shape');
  } catch {
    req.log.warn({ agreementId }, 'agreement summary JSON parse failed');
    return res.json({ parseError: true, summary: null });
  }

  // 9. Log tokens (always — even for freelancers)
  logTokenUsage(db, internalUserId, 'agreement_summary', {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  }).catch(err => req.log.warn({ err }, 'token usage log failed'));

  // 10. Cache the result
  const summaryData = parsed as Record<string, unknown>;
  await db.update(agreements)
    .set({
      freelancerSummary: summaryData,
      freelancerSummaryScoredAt: new Date(),
    })
    .where(eq(agreements.id, agreementId));

  // 11. Return response
  return res.json({
    parseError: false,
    cached: false,
    truncated,
    freelancerSummaryScoredAt: new Date().toISOString(),
    ...summaryData,
    disclaimer: AGREEMENT_SUMMARY_DISCLAIMER,
  });
});
```

### Task 2.4 — Add Cache Invalidation to `accept-redline` Handler

**File:** `artifacts/api-server/src/routes/agreements.ts`

Find the post-transaction cache invalidation update added by AI Contract Health Score. Extend it to also null out the freelancer summary:

```ts
// Existing block (from AI Contract Health Score Task 2.4):
await db.update(agreements)
  .set({
    healthScore: null,
    healthScoreDetail: null,
    healthScoredAt: null,
    // ADD THESE TWO:
    freelancerSummary: null,
    freelancerSummaryScoredAt: null,
  })
  .where(eq(agreements.id, agreementId));
```

This is a two-line addition to an existing update call.

### Task 2.5 — Add `freelancerSummary` to `GET /api/agreements` List Response

**File:** `artifacts/api-server/src/routes/agreements.ts`

In the paginated list handler, add `freelancerSummary: true/false` (just a boolean flag, not the full JSON) to the response per agreement item:

```ts
// In the SELECT or response mapping:
hasSummary: agreement.freelancerSummary !== null,
```

This is used by the frontend to show the "Summarised" badge on the list page without sending the full summary JSON in every list response.

### Task 2.6 — Update `GET /api/agreements/:id` Detail Response

**File:** `artifacts/api-server/src/routes/agreements.ts`

Include `freelancerSummary` and `freelancerSummaryScoredAt` in the agreement detail response. The frontend uses this to pre-populate the summary panel on mount without a separate API call:

```ts
// In GET /api/agreements/:id response:
freelancerSummary: agreement.freelancerSummary ?? null,
freelancerSummaryScoredAt: agreement.freelancerSummaryScoredAt?.toISOString() ?? null,
```

### Task 2.7 — OpenAPI Spec + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add `POST /api/agreements/{id}/summarise`:

```yaml
/api/agreements/{id}/summarise:
  post:
    summary: AI plain-English summary of agreement for freelancer
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
        description: Summary result or parse error
      '403':
        description: Not a freelancer or not a party to this agreement
      '404':
        description: Agreement not found
```

Update `GET /api/agreements` response schema to include `hasSummary: boolean` per item.
Update `GET /api/agreements/:id` response schema to include `freelancerSummary` and `freelancerSummaryScoredAt`.

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
grep -r "usePostAgreementsIdSummarise\|hasSummary\|freelancerSummary" lib/api-client-react/src/ | head -10
```

- [ ] Hook `usePostAgreementsIdSummarise()` exists
- [ ] Agreement detail type includes `freelancerSummary` and `freelancerSummaryScoredAt`
- [ ] Agreement list item type includes `hasSummary: boolean`

If missing, re-run codegen before continuing.

### Task 3.2 — Create `agreementSummaryUtils.ts` (Frontend)

**File:** `artifacts/talentlock/src/lib/agreementSummaryUtils.ts` (create new)

```ts
export const SECTION_ORDER = [
  'whatYouDo',
  'howYouGetPaid',
  'whoOwnsTheWork',
  'howItCanEnd',
  'restrictions',
  'keyDates',
] as const;

export type SectionKey = typeof SECTION_ORDER[number];

export const SECTION_ICONS: Record<SectionKey, string> = {
  whatYouDo:      '📋',
  howYouGetPaid:  '💰',
  whoOwnsTheWork: '©',
  howItCanEnd:    '🚪',
  restrictions:   '🔒',
  keyDates:       '📅',
};

export const AGREEMENT_SUMMARY_DISCLAIMER =
  'This is an AI-generated summary for your convenience. It is not legal advice. Always read the full agreement before signing.';
```

### Task 3.3 — Create `<AgreementSummaryPanel />`

**File:** `artifacts/talentlock/src/components/AgreementSummaryPanel.tsx` (create new)

Props:
```ts
interface AgreementSummaryPanelProps {
  agreementId: string;
  cachedSummary: Record<string, unknown> | null;
  cachedAt: string | null;
}
```

Internal state machine:
```ts
type PanelState = 'idle' | 'loading' | 'loaded' | 'error' | 'parse_error';
```

On mount: if `cachedSummary !== null` → set state to `'loaded'` with cached data.
If `cachedSummary === null` → set state to `'idle'`.

Uses `usePostAgreementsIdSummarise()` mutation.

See `UI.md` for all states, copy, and component layout.

### Task 3.4 — Integrate Into `/agreements/:id`

**File:** `artifacts/talentlock/src/pages/AgreementDetail.tsx`

Add `<AgreementSummaryPanel />` in the correct DOM position:

```tsx
{/* Freelancer Summary — freelancer-only */}
{userRole === 'freelancer' && (
  <AgreementSummaryPanel
    agreementId={agreement.id}
    cachedSummary={agreement.freelancerSummary}
    cachedAt={agreement.freelancerSummaryScoredAt}
  />
)}
```

**DOM order (enforced):**

```
[Agreement header]
[Agreement content / clauses]
[Redline suggestions panel]    ← employer-only — existing
[Health Score Card]            ← both parties — existing
[AgreementSummaryPanel]        ← freelancer-only — NEW
[Signing section]              ← existing
```

### Task 3.5 — Add "Summarised" Badge to Agreement List

**File:** `artifacts/talentlock/src/pages/Agreements.tsx` (or equivalent list page)

For freelancers only — when `agreement.hasSummary === true`:

```tsx
{userRole === 'freelancer' && agreement.hasSummary && (
  <span className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5">
    <Sparkles className="h-3 w-3" />
    Summarised
  </span>
)}
```

---

## Acceptance Criteria

- [ ] `freelancer_summary` and `freelancer_summary_scored_at` columns exist on `agreements` (nullable)
- [ ] `agreement_summary` in `TokenFeature` union
- [ ] `POST /api/agreements/:id/summarise` returns `403` for employers
- [ ] Returns `403` when freelancer is not a party to the agreement
- [ ] Returns `404` when agreement not found
- [ ] Returns cached summary immediately when cache is valid (`cached: true`, no OpenAI call)
- [ ] No `checkTokenQuota()` call for freelancers
- [ ] Tokens logged as `agreement_summary` for all successful calls
- [ ] `temperature: 0` used for all summary calls
- [ ] Parse failure returns `{ parseError: true, summary: null }` — not a 500
- [ ] Long agreements (> 8,000 chars) return `truncated: true`
- [ ] Disclaimer string included in every successful response
- [ ] `PATCH /api/agreements/:id/accept-redline` nullifies both health score AND freelancer summary cache
- [ ] `GET /api/agreements` response includes `hasSummary: boolean` per item
- [ ] `GET /api/agreements/:id` response includes `freelancerSummary` and `freelancerSummaryScoredAt`
- [ ] Codegen hook `usePostAgreementsIdSummarise()` confirmed
- [ ] `AgreementSummaryPanel` renders all 6 sections with icons
- [ ] Disclaimer shown prominently as FIRST element in the loaded panel
- [ ] All 6 sections render in correct order (whatYouDo → keyDates)
- [ ] Attention flags section renders when `attentionFlags.exists === true`
- [ ] "No unusual terms" message when `attentionFlags.exists === false`
- [ ] Cached indicator shown when serving from cache
- [ ] "Regenerate" button visible on cached summary
- [ ] Regenerate clears cache (calls API with `force: true` or just re-calls — discuss in Task 3.3)
- [ ] Panel NOT visible for employers on same agreement
- [ ] DOM order: Health Score → Freelancer Summary → Signing section
- [ ] "Summarised" badge on list page (freelancer view only, when `hasSummary === true`)
- [ ] Parse error state renders "Could not summarise" with retry
- [ ] Idle state shows "✦ Summarise for me" button
- [ ] Loading state shows spinner
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 (migration verify)
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 (codegen + typecheck)
Task 3.1 (verify hook) → 3.2 → 3.3 → 3.4 → 3.5
```

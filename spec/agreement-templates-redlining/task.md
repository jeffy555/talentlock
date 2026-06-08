# TalentLock — Task Breakdown: Agreement Templates + Redlining

## Summary

Extend AI Agreement Generation with industry templates and enterprise custom clauses, add a `status` column to `agreements`, and build contract redlining. Three phases: Database → Backend → Frontend. No admin phase required.

---

## Phase 1 — Database

### Task 1.1 — Inspect `agreements` Schema

**File:** `lib/db/schema.ts`

Run first:
```bash
grep -A 40 "agreements\s*=" lib/db/schema.ts
```

Document findings in a comment at the top of the route file before proceeding.

### Task 1.2 — Add `status` Column to `agreements`

**File:** `lib/db/schema.ts`

Add only if `status` does not already exist:

```ts
status: text('status').notNull().default('draft'),
// Values: 'draft' | 'redlined' | 'partially_signed' | 'fully_signed'
```

### Task 1.3 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

### Task 1.4 — Backfill Existing Agreements

**Critical — do not skip.** Run immediately after migration:

```sql
UPDATE agreements
SET status = 'fully_signed'
WHERE freelancer_signed_at IS NOT NULL
AND employer_signed_at IS NOT NULL;

UPDATE agreements
SET status = 'partially_signed'
WHERE (freelancer_signed_at IS NOT NULL OR employer_signed_at IS NOT NULL)
AND NOT (freelancer_signed_at IS NOT NULL AND employer_signed_at IS NOT NULL);
```

Run via `pnpm --filter @workspace/db` with a one-time script or directly via the Neon SQL editor. Confirm row counts updated before proceeding.

### Task 1.5 — Add `contract_redlining` to `TokenFeature`

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

```ts
export type TokenFeature =
  | 'ai_match'
  | 'agreement_generation'
  | 'ai_match_explanation'
  | 'contract_redlining'       // ← add if not present
  | 'job_description_assistant'
  | 'interview_questions'
  | 'document_verification'
```

Only add if not already present from ai-enhancements Phase 1.

---

## Phase 2 — Backend API

### Task 2.1 — Create `industryTemplates.ts`

**File:** `artifacts/api-server/src/lib/industryTemplates.ts` (create new)

Use the exact `INDUSTRY_TEMPLATES` record from `plan.md` Q4. Export it as a named export.

Also export the helper functions:

```ts
export function buildIndustrySection(industry: string): string {
  const clauses = INDUSTRY_TEMPLATES[industry] ?? [];
  if (clauses.length === 0) return '';
  return `\n\nIndustry-specific requirements:\n${clauses.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
}

export function buildCustomClausesSection(clauses: string[]): string {
  if (clauses.length === 0) return '';
  return `\n\nEmployer-specified custom clauses to incorporate:\n${clauses.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
}

export function sanitiseClause(clause: string): string {
  return clause.replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, 500);
}
```

### Task 2.2 — Modify Agreement Generation Endpoint

**File:** `artifacts/api-server/src/routes/agreements.ts`

Locate the existing `POST /api/agreements` handler.

Add to request body validation (additive — all new fields are optional):
```ts
industry?: 'general' | 'software_development' | 'design_creative' |
           'marketing_content' | 'consulting_strategy' | 'data_analytics'
customClauses?: string[]
```

Add server-side validation:
```ts
// Custom clauses: enterprise only
if (customClauses && customClauses.length > 0) {
  if (userPlan !== 'employer_enterprise') {
    return res.status(403).json({ error: 'Custom clauses require Enterprise plan', code: 'PLAN_LIMIT', planNeeded: 'employer_enterprise' });
  }
  if (customClauses.length > 5) {
    return res.status(400).json({ error: 'Maximum 5 custom clauses allowed' });
  }
  for (const clause of customClauses) {
    if (clause.trim().length < 20) return res.status(400).json({ error: 'Clause must be at least 20 characters', code: 'CLAUSE_TOO_SHORT' });
    if (clause.length > 500) return res.status(400).json({ error: 'Clause must be 500 characters or fewer', code: 'CLAUSE_TOO_LONG' });
  }
}
```

Inject into existing system prompt:
```ts
const resolvedIndustry = industry ?? 'general';
const sanitised = (customClauses ?? []).map(sanitiseClause);
const industrySection = buildIndustrySection(resolvedIndustry);
const customSection = buildCustomClausesSection(sanitised);
// Append both to the existing system prompt string
systemPrompt += industrySection + customSection;
```

### Task 2.3 — Add `estimatedRedlineTokens` to Agreement GET

**File:** `artifacts/api-server/src/routes/agreements.ts`

In the `GET /api/agreements/:id` handler, add to the response:

```ts
estimatedRedlineTokens: Math.ceil((agreement.content?.length ?? 0) / 4) + 500
```

### Task 2.4 — Add Contract Redlining Endpoint

**File:** `artifacts/api-server/src/routes/agreements.ts`

Add `POST /api/agreements/:id/redline`

Guards (execute in order — fail fast):
1. Require Clerk auth + `userRole === 'employer'` → 403
2. Fetch agreement by id — 404 if not found
3. Check `agreement.freelancerSignedAt === null && agreement.employerSignedAt === null` → 409 `AGREEMENT_SIGNED`
4. Check plan: `['employer_growth', 'employer_enterprise'].includes(userPlan)` → 402 `PLAN_LIMIT` `planNeeded: 'employer_growth'`
5. `checkTokenQuota(db, internalUserId)` → 402 `TOKEN_LIMIT`

Call OpenAI with the redlining system prompt from `plan.md` (verbatim).

Log tokens:
```ts
await logTokenUsage(db, internalUserId, 'contract_redlining', {
  promptTokens: response.usage.prompt_tokens,
  completionTokens: response.usage.completion_tokens,
  totalTokens: response.usage.total_tokens,
});
```

Parse JSON response — on parse failure return:
```ts
res.status(200).json({ suggestions: [], parseError: true });
```

Response: `{ suggestions: RedlineSuggestion[] }`

```ts
type RedlineSuggestion = {
  clauseNumber: string;
  originalText: string;
  suggestedText: string;
  reason: string;
}
```

### Task 2.5 — Add Accept-Redline Endpoint

**File:** `artifacts/api-server/src/routes/agreements.ts`

Add `PATCH /api/agreements/:id/accept-redline`

Request body: `{ newContent: string }`

Guards:
1. Require Clerk auth + `userRole === 'employer'` → 403
2. Fetch agreement — 404 if not found
3. Check no signatures → 409 `AGREEMENT_SIGNED`

Single Drizzle transaction from `plan.md` Risk 3 (use exactly):
```ts
await db.transaction(async (tx) => {
  await tx.update(agreements)
    .set({ content: newContent, updatedAt: new Date() })
    .where(eq(agreements.id, agreementId));
  await tx.update(agreements)
    .set({ freelancerSignedAt: null, employerSignedAt: null, status: 'redlined', updatedAt: new Date() })
    .where(eq(agreements.id, agreementId));
});
```

Response: `{ success: true, status: 'redlined' }`

### Task 2.6 — Update Vault Download Guard

**File:** `artifacts/api-server/src/routes/agreements.ts`

In `GET /api/agreements/:id/download`, add check from `plan.md` Q3:

```ts
if (agreement.status !== 'fully_signed') {
  return res.status(403).json({ error: 'Agreement not fully signed' });
}
```

Add AFTER the existing timestamp check — both must pass.

### Task 2.7 — Update `signing` to Set `status`

**File:** `artifacts/api-server/src/routes/agreements.ts`

In `POST /api/agreements/:id/sign`, after updating the signed timestamp, also update `status`:

```ts
// After saving the signature:
const updated = await db.query.agreements.findFirst({ where: eq(agreements.id, id) });
const newStatus = updated.freelancerSignedAt && updated.employerSignedAt
  ? 'fully_signed'
  : 'partially_signed';
await db.update(agreements).set({ status: newStatus }).where(eq(agreements.id, id));
```

### Task 2.8 — OpenAPI Spec Update + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add/update:
- `POST /api/agreements` — add `industry` and `customClauses` to request body schema
- `GET /api/agreements/:id` — add `estimatedRedlineTokens` and `status` to response schema
- `POST /api/agreements/:id/redline` — new endpoint
- `PATCH /api/agreements/:id/accept-redline` — new endpoint

Register any new route files in `artifacts/api-server/src/index.ts` if needed.

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## Phase 3 — Frontend

### Task 3.1 — Verify Generated Hooks

Confirm codegen produced:
- `usePostAgreementsIdRedline()`
- `usePatchAgreementsIdAcceptRedline()`

If missing, re-run codegen before continuing.

### Task 3.2 — Industry Selector on Agreement Generation

**File:** `artifacts/talentlock/src/pages/Agreement.tsx`

Add `<Select>` above the "Generate Agreement" button. See `UI.md` Component 1 for full spec.

State: `const [industry, setIndustry] = useState<string>('general')`

Pass `industry` to the generation mutation call.

### Task 3.3 — Enterprise Custom Clauses Panel

**File:** `artifacts/talentlock/src/pages/Agreement.tsx`

Render only when `userPlan === 'employer_enterprise'`. See `UI.md` Component 1 for full spec.

State:
```ts
const [customClauses, setCustomClauses] = useState<string[]>([]);
```

Validation state per clause:
```ts
const clauseErrors = customClauses.map(c =>
  c.trim().length < 20 ? 'Clause must be at least 20 characters'
  : c.length > 500 ? 'Clause must be 500 characters or fewer'
  : null
);
const hasErrors = clauseErrors.some(e => e !== null);
```

Disable "Generate Agreement" button when `hasErrors` is true.

Pass `customClauses` to the generation mutation (only when `userPlan === 'employer_enterprise'`).

### Task 3.4 — Redlining Section (Employer View)

**File:** `artifacts/talentlock/src/pages/Agreement.tsx`

Add redlining section below agreement content, above signature section. See `UI.md` Component 2.

Render conditions:
- `userRole === 'employer'` — always render this section for employers
- If `userPlan === 'employer_starter'` → render locked state
- If `freelancerSignedAt || employerSignedAt` → render nothing (hidden state)
- Otherwise → render available state with Request Redlining button

Suggestion cards — local state:
```ts
const [suggestions, setSuggestions] = useState<RedlineSuggestion[]>([]);
const [dismissed, setDismissed] = useState<Set<number>>(new Set());
```

On Skip: `setDismissed(prev => new Set(prev).add(index))` — no API call.
On Accept: call `usePatchAgreementsIdAcceptRedline()`, on success show toast + invalidate agreement query.

### Task 3.5 — Signature Reset Warning Banner

**File:** `artifacts/talentlock/src/pages/Agreement.tsx`

When `agreement.status === 'redlined'` and no signatures yet, show warning banner above signature section for ALL users (employer and freelancer):

```tsx
{agreement.status === 'redlined' && !agreement.freelancerSignedAt && !agreement.employerSignedAt && (
  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
    ⚠ This agreement was revised. Both parties must sign again.
  </div>
)}
```

### Task 3.6 — Freelancer Redlined Notice

**File:** `artifacts/talentlock/src/pages/Agreement.tsx`

When `userRole === 'freelancer'` and `agreement.status === 'redlined'`, show read-only notice from `plan.md` Q8:

```tsx
{userRole === 'freelancer' && agreement.status === 'redlined' && (
  <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-700">
    ℹ This agreement was revised with AI assistance before signing.
  </div>
)}
```

---

## Acceptance Criteria

- [ ] Schema inspection complete — `agreements.status` column confirmed or added
- [ ] Migration run and backfill SQL executed — existing agreements have correct status
- [ ] `contract_redlining` in `TokenFeature` type
- [ ] `industryTemplates.ts` created with all 6 industry entries
- [ ] Agreement generation accepts `industry` and `customClauses` params
- [ ] `customClauses` rejected for non-enterprise plans with `403`
- [ ] Clause validation: < 20 chars → 400, > 500 chars → 400, > 5 clauses → 400
- [ ] `sanitiseClause()` applied to all custom clauses before prompt injection
- [ ] `estimatedRedlineTokens` returned on `GET /api/agreements/:id`
- [ ] `POST /api/agreements/:id/redline` returns 403 for freelancers
- [ ] Redline endpoint returns 409 when any signature exists
- [ ] Redline endpoint returns 402 `PLAN_LIMIT` for Starter employers
- [ ] Redline endpoint returns 402 `TOKEN_LIMIT` when quota exhausted
- [ ] `contract_redlining` tokens logged correctly
- [ ] Accept-redline uses single Drizzle transaction (content + signature reset atomic)
- [ ] `status = 'redlined'` set on accept
- [ ] `POST /api/agreements/:id/sign` updates `status` to `partially_signed` or `fully_signed`
- [ ] Vault download guard checks `status === 'fully_signed'`
- [ ] Codegen hooks `usePostAgreementsIdRedline` and `usePatchAgreementsIdAcceptRedline` exist
- [ ] Industry selector visible on agreement generation for all plans
- [ ] Custom clauses panel visible only for enterprise plan employers
- [ ] Redlining section hidden after any signature
- [ ] Redlining locked state shown for Starter employers
- [ ] Accept toast: "Agreement updated — both signatures have been reset. Both parties must re-sign."
- [ ] Signature reset warning banner shown when `status === 'redlined'` and unsigned
- [ ] Freelancer sees read-only AI revision notice when `status === 'redlined'`
- [ ] `pnpm typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 → 1.4 (backfill) → 1.5
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8 (codegen + typecheck)
Task 3.1 (after 2.8 confirmed) → 3.2 → 3.3 → 3.4 → 3.5 → 3.6
```

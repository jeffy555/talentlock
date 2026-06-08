# TalentLock — Implementation Plan: Agreement Templates + Redlining

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Before writing any code the agent must run these inspections and report findings:

```bash
# 1. Check agreements table schema
grep -A 40 "agreements\s*=" lib/db/schema.ts

# 2. Check existing agreement generation endpoint
cat artifacts/api-server/src/routes/agreements.ts

# 3. Confirm TokenFeature includes contract_redlining
grep -A 15 "TokenFeature" artifacts/api-server/src/lib/tokenLogger.ts

# 4. Check existing Vault download guard logic
grep -n "download\|sign\|vault\|status" artifacts/api-server/src/routes/agreements.ts
```

Report what exists before touching anything.

---

## Resolved Questions

---

### Q1 — `agreements.status` Column

**Decision: Inspect first. Add if missing. Always backfill.**

If `status` does not exist on `agreements`:

```ts
// Add to agreements table in lib/db/schema.ts
status: text('status').notNull().default('draft'),
// Allowed values: 'draft' | 'redlined' | 'partially_signed' | 'fully_signed'
```

Immediately after migration, run backfill (via Drizzle or raw SQL in a seed/migration script):

```sql
-- Backfill fully signed agreements
UPDATE agreements
SET status = 'fully_signed'
WHERE freelancer_signed_at IS NOT NULL
AND employer_signed_at IS NOT NULL;

-- Backfill partially signed agreements
UPDATE agreements
SET status = 'partially_signed'
WHERE (freelancer_signed_at IS NOT NULL OR employer_signed_at IS NOT NULL)
AND NOT (freelancer_signed_at IS NOT NULL AND employer_signed_at IS NOT NULL);

-- Remaining rows keep default 'draft'
```

**If `status` already exists:** confirm allowed values match `'draft' | 'redlined' | 'partially_signed' | 'fully_signed'`. If values differ, document the conflict and do not proceed until resolved.

---

### Q2 — Existing Agreement Generation Endpoint

**Decision: Inspect first. Add `industry` and `customClauses` as new optional params.**

After reading `artifacts/api-server/src/routes/agreements.ts`:
- Add `industry` as an optional field on the generation request body
- Add `customClauses` as an optional field (enterprise only)
- Both are purely additive — if omitted, behaviour is identical to current

```ts
// New optional fields on POST /api/agreements request body
industry?: 'general' | 'software_development' | 'design_creative' |
           'marketing_content' | 'consulting_strategy' | 'data_analytics'
customClauses?: string[]  // enterprise only, max 5, 20–500 chars each
```

Default `industry` to `'general'` when not provided — preserves existing behaviour exactly.

---

### Q3 — Vault Download Guard Update

**Decision: Update to check BOTH timestamps AND `status === 'fully_signed'`.**

In `GET /api/agreements/:id/download`, the existing guard checks that both signed timestamps are set. After this migration, add an additional check:

```ts
// Existing check (keep)
if (!agreement.freelancerSignedAt || !agreement.employerSignedAt) {
  return res.status(403).json({ error: 'Agreement not fully signed' });
}
// New check (add)
if (agreement.status !== 'fully_signed') {
  return res.status(403).json({ error: 'Agreement not fully signed' });
}
```

Belt-and-suspenders — both must pass. This protects against edge cases where timestamps were set but status was not updated correctly.

---

### Q4 — Industry Clause Map Structure

**Decision: Option A — instruction-style snippets injected into the OpenAI system prompt.**

Create `artifacts/api-server/src/lib/industryTemplates.ts`:

```ts
export const INDUSTRY_TEMPLATES: Record<string, string[]> = {
  general: [],  // No additional clauses — base prompt only
  software_development: [
    "Include a clause specifying that all source code, documentation, and related intellectual property created during the engagement transfers to the employer upon receipt of full payment.",
    "Include a clause defining the number of revision rounds included (recommend 2 rounds) and the process for requesting changes.",
    "Include a clause covering the freelancer's obligation to deliver working, tested code and to fix defects discovered within 30 days of delivery.",
  ],
  design_creative: [
    "Include a clause specifying that final design files (in editable source format) are delivered upon full payment, and that usage rights transfer to the employer.",
    "Include a clause defining the number of revision rounds (recommend 3 rounds) and what constitutes a revision vs a new scope item.",
    "Include a clause covering file format requirements and delivery method.",
  ],
  marketing_content: [
    "Include a clause specifying that all content created is original, does not infringe third-party rights, and ownership transfers to the employer upon full payment.",
    "Include a clause covering exclusivity — whether the freelancer may create similar content for direct competitors during and after the engagement.",
    "Include a clause defining approval timelines and what happens if the employer does not respond within the approval window.",
  ],
  consulting_strategy: [
    "Include a strong mutual confidentiality clause covering all proprietary business information shared during the engagement, surviving termination for 2 years.",
    "Include a clause defining deliverables precisely — what documents, presentations, or recommendations constitute completion.",
    "Include a clause specifying that the consultant's advice is professional opinion only and does not constitute legal, financial, or regulatory advice.",
  ],
  data_analytics: [
    "Include a clause specifying that all data provided by the employer remains the employer's property and must be deleted by the freelancer upon project completion.",
    "Include a clause covering data privacy obligations — the freelancer must comply with applicable data protection regulations.",
    "Include a clause specifying ownership of any models, algorithms, or analytical frameworks developed during the engagement.",
  ],
};
```

Inject into the system prompt as:
```ts
const industryInstructions = INDUSTRY_TEMPLATES[industry] ?? [];
const industrySection = industryInstructions.length > 0
  ? `\n\nIndustry-specific requirements:\n${industryInstructions.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
  : '';
```

---

### Q5 — Repeated Redlining Allowed

**Decision: Yes — multiple redline passes are allowed.**

The guard only blocks redlining when either signature timestamp is not null:
```ts
if (agreement.freelancerSignedAt || agreement.employerSignedAt) {
  return res.status(409).json({
    error: 'Cannot redline a partially or fully signed agreement',
    code: 'AGREEMENT_SIGNED'
  });
}
```

An agreement with `status = 'redlined'` and no signatures CAN be redlined again. Each new redline pass generates fresh suggestions based on the current (already-modified) agreement content.

---

### Q6 — Backfill Existing Agreements

**Decision: Run backfill immediately after migration. Covered in Q1 above.**

This is mandatory. Do not run `pnpm --filter @workspace/db run push` without also running the backfill SQL. Failing to backfill will break the Vault for all existing fully-signed agreements.

---

### Q7 — Token Estimate Display

**Decision: Display as `~{N}` to communicate approximation. Accept the rough formula.**

```ts
// On GET /api/agreements/:id — add to response
estimatedRedlineTokens: Math.ceil((agreement.content?.length ?? 0) / 4) + 500
```

Frontend display:
```tsx
<span className="text-sm text-muted-foreground">
  ~{estimatedRedlineTokens.toLocaleString()} tokens will be used
</span>
```

No change to the formula in this phase. The `~` prefix is mandatory — never display it as an exact number.

---

### Q8 — Freelancer View When Status Is `redlined`

**Decision: Option B — show a read-only notice to freelancers.**

On the freelancer's view of `/agreements/:id`, when `status === 'redlined'`:

```tsx
{userRole === 'freelancer' && agreement.status === 'redlined' && (
  <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-700">
    ℹ This agreement was revised with AI assistance before signing.
  </div>
)}
```

This notice appears above the signature section. It is read-only — freelancers see no suggestion cards, no accept/skip buttons, and no redlining controls.

---

## Resolved Risks

---

### Risk 1 — Signature Reset Is Irreversible

**Resolution: Clear toast message + UI notice.**

Toast on accept-redline success:
```
"Agreement updated — both signatures have been reset. Both parties must re-sign."
```

The toast uses a longer duration (`duration: 6000`) so it's not missed.

Additionally, a yellow warning banner appears above the signature section after `status = 'redlined'` is detected:
```
⚠ This agreement was revised. Both parties must sign again.
```
`className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"`

---

### Risk 2 — High Token Cost of Redlining

**Resolution: Display `estimatedRedlineTokens` before the call. Already handled in Q7.**

Additionally, if `tokensUsed + estimatedRedlineTokens > monthlyTokenLimit`, show an inline warning next to the estimate:
```
~2,400 tokens will be used  ⚠ This may exhaust your remaining quota ({N} tokens left)
```
`text-amber-600 text-sm` for the warning suffix. Only shown when within 20% of limit.

---

### Risk 3 — Redline Accept Must Be Atomic

**Resolution: Single Drizzle transaction. Use this exact pattern:**

```ts
await db.transaction(async (tx) => {
  // Step 1: Update agreement content
  await tx.update(agreements)
    .set({ content: newContent, updatedAt: new Date() })
    .where(eq(agreements.id, agreementId));

  // Step 2: Reset signatures and set status
  await tx.update(agreements)
    .set({
      freelancerSignedAt: null,
      employerSignedAt: null,
      status: 'redlined',
      updatedAt: new Date()
    })
    .where(eq(agreements.id, agreementId));
});
// If either update throws, the entire transaction rolls back
```

Never split these into two separate `await db.update()` calls.

---

### Risk 4 — Custom Clause Prompt Injection

**Resolution: Sanitise custom clauses before injecting into prompt.**

```ts
function sanitiseClause(clause: string): string {
  // Remove control characters
  return clause
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .trim()
    .slice(0, 500); // enforce max length as a safety net
}

const sanitisedClauses = customClauses.map(sanitiseClause);
```

Apply to every custom clause before building the prompt string. Sanitisation is server-side only — client-side validation is UX, not security.

---

### Risk 5 — Codegen Export Rules

**Resolution: Mandatory post-codegen checks after every spec update.**

After `pnpm --filter @workspace/api-spec run codegen`:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## System Prompts (Exact — Use Verbatim)

### Agreement Generation System Prompt Addition

Append to the existing agreement generation system prompt:

```
{industrySection}
{customClausesSection}
```

Where:
```ts
const customClausesSection = sanitisedClauses.length > 0
  ? `\n\nEmployer-specified custom clauses to incorporate:\n${sanitisedClauses.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
  : '';
```

### Redlining System Prompt (Use Verbatim)

```
You are a legal contract reviewer for a freelance platform.
Review the following contract and identify up to 10 improvements.
Focus on: ambiguous language, missing specificity, unusually one-sided terms, and unclear obligations.

Return ONLY a JSON array — no preamble, no markdown fences:
[
  {
    "clauseNumber": "clause identifier or section number",
    "originalText": "exact quote from the contract",
    "suggestedText": "your proposed replacement",
    "reason": "plain English explanation, max 2 sentences"
  }
]

If fewer than 10 improvements are needed, return only the genuine ones — do not pad.
If no improvements are needed, return an empty array: []
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/agreement-templates-redlining/features.md` read
- [ ] `specs/agreement-templates-redlining/clarify.md` read
- [ ] This `plan.md` read — all 8 questions and 5 risks resolved
- [ ] `specs/agreement-templates-redlining/task.md` read — phase order understood
- [ ] `specs/agreement-templates-redlining/UI.md` read — all states understood
- [ ] Token-consumption feature confirmed deployed (`logTokenUsage`, `checkTokenQuota` live)
- [ ] Codebase inspection complete — Q1 and Q2 confirmed from actual schema and route files
- [ ] Backfill plan understood — will not run migration without also running backfill SQL

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Database — `agreements.status` column + backfill | ⬜ Not started |
| Phase 2 | Backend — templates, redlining endpoints, Vault guard, OpenAPI, codegen | ⬜ Not started |
| Phase 3 | Frontend — industry selector, custom clauses, redlining UI, freelancer notice | ⬜ Not started |

# TalentLock — Implementation Plan: Agreement AI Summary

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Run all of these before writing any code. Report every finding.

```bash
# 1. Check agreements schema for existing summary columns
grep -A 60 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "summary\|summarise\|freelancer_sum"

# 2. Confirm agreement content column name
grep -A 60 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "content\|text\|body\|clause"

# 3. Confirm party verification pattern (reuse from AI Contract Health Score)
grep -n "canAccessAgreement\|employerId\|freelancerId\|bookingId" \
  artifacts/api-server/src/routes/agreements.ts | head -20

# 4. Check the accept-redline handler for existing cache invalidation (health score)
grep -n "healthScore\|health_score" artifacts/api-server/src/routes/agreements.ts | head -10

# 5. Check TokenFeature for agreement_summary
grep "agreement_summary" artifacts/api-server/src/lib/tokenLogger.ts

# 6. Check contractHealthUtils.ts to understand the pattern to follow
head -50 artifacts/api-server/src/lib/contractHealthUtils.ts
```

Document all findings in a comment block at the top of the new endpoint, alongside the existing health score comment block.

---

## Resolved Questions

---

### Q1 — `freelancerSummary` and `freelancerSummaryScoredAt` Columns

**Decision: Inspect first. Add if missing.**

After inspection, if columns do not exist, add:
```ts
// Add to agreements table in lib/db/src/schema/
freelancerSummary:          jsonb('freelancer_summary'),           // nullable
freelancerSummaryScoredAt:  timestamp('freelancer_summary_scored_at', { withTimezone: true }), // nullable
```

Both nullable. No default. No backfill. All existing agreements default to null (not yet summarised).

---

### Q2 — Party Verification Pattern

**Decision: Reuse the exact pattern confirmed during AI Contract Health Score implementation.**

From AI Contract Health Score `plan.md` Q2 (use the resolution confirmed from inspection):

```ts
// Option A — if agreements has direct freelancerId column:
if (agreement.freelancerId !== internalUserId) {
  return res.status(403).json({ error: 'Forbidden' });
}

// Option B — if joining through bookings:
const booking = await db.query.bookings.findFirst({
  where: eq(bookings.id, agreement.bookingId)
});
if (booking?.freelancerId !== internalUserId) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

The summary endpoint additionally checks that the requesting user is a **freelancer** (not just a party). Apply the role check before the party check:

```ts
if (userRole !== 'freelancer') {
  return res.status(403).json({ error: 'This feature is for freelancers only' });
}
```

---

### Q3 — Endpoint Location

**Decision: Option A — `agreements.ts`.**

`POST /api/agreements/:id/summarise` lives in `agreements.ts` alongside:
- `POST /api/agreements/:id/redline`
- `PATCH /api/agreements/:id/accept-redline`
- `POST /api/agreements/:id/health-score`

All AI features that act on a specific agreement resource are in `agreements.ts`. Consistent.

---

### Q4 — Summary Panel Behaviour

**Decision: Option C — persistent panel, transitions between states.**

```tsx
// The panel is always rendered for freelancers — no conditional show/hide
// Internal state machine:
// 'idle'    — not yet summarised, shows button
// 'loading' — API call in flight, shows spinner
// 'loaded'  — shows full summary
// 'error'   — shows error + retry

// On mount: check if agreement.freelancerSummary !== null
// If yes → setState('loaded', cached data)
// If no  → setState('idle')
```

No tab switching. No layout shift. The panel is a fixed-position section on the page.

---

### Q5 — Role-Based Rendering

**Decision: Panel conditionally rendered for freelancer only.**

```tsx
// In AgreementDetail.tsx
{userRole === 'freelancer' && (
  <AgreementSummaryPanel
    agreementId={agreement.id}
    cachedSummary={agreement.freelancerSummary}
  />
)}
```

Employers see zero trace of this component. It is not hidden — it is not rendered.

---

### Q6 — Content Column Name

**Decision: Inspect first. Use confirmed column name.**

After inspection, document the column name in a comment. Use it in the prompt builder:
```ts
const content = agreement.content ?? agreement.body ?? agreement.text ?? '';
// ^ replace with actual confirmed column name
```

---

### Q7 — Cache Invalidation on Redline Accept

**Decision: Invalidate alongside health score in the same post-transaction update.**

In `PATCH /api/agreements/:id/accept-redline`, after the existing health score nullification:

```ts
// Existing (from AI Contract Health Score):
await db.update(agreements).set({
  healthScore: null,
  healthScoreDetail: null,
  healthScoredAt: null,
  // ADD THESE TWO:
  freelancerSummary: null,
  freelancerSummaryScoredAt: null,
}).where(eq(agreements.id, agreementId));
```

One update call for both caches. Cleaner than two separate updates.

---

### Q8 — Truncation Threshold

**Decision: 8,000 characters — same as AI Contract Health Score.**

```ts
const content = agreement[CONTENT_COL] ?? '';
const truncated = content.length > 8000;
const trimmedContent = truncated ? content.slice(0, 8000) : content;
```

Return `truncated: true` in the response. The disclaimer already covers incomplete summaries.

---

## AI System Prompt (Use Verbatim)

```
You are helping a freelancer understand a contract they have been asked to sign.
Your job is to summarise the key points in plain, clear English — no jargon.
Write as if you are explaining this to a smart friend who is not a lawyer.

Return ONLY a JSON object — no preamble, no markdown, no explanation outside the JSON:
{
  "sections": {
    "whatYouDo": {
      "title": "What you are being hired to do",
      "content": "<2-4 sentences describing the deliverables and scope of work in plain language>"
    },
    "howYouGetPaid": {
      "title": "How and when you get paid",
      "content": "<2-4 sentences covering amount, payment timing, milestones, invoicing>"
    },
    "whoOwnsTheWork": {
      "title": "Who owns the work",
      "content": "<2-4 sentences on IP ownership, work-for-hire, what you keep vs what you assign>"
    },
    "howItCanEnd": {
      "title": "How this contract can end",
      "content": "<2-4 sentences on termination clauses, notice periods, kill fee if any>"
    },
    "restrictions": {
      "title": "Important restrictions on you",
      "content": "<2-4 sentences on non-compete, non-solicitation, confidentiality, exclusivity — or 'Not mentioned in this contract.'>"
    },
    "keyDates": {
      "title": "Key dates and deadlines",
      "content": "<2-4 sentences on start date, end date, milestone dates, notice periods — or 'No specific dates mentioned.'>"
    }
  },
  "attentionFlags": {
    "exists": <true|false>,
    "items": [
      {
        "heading": "<quote up to 8 words from the contract that the freelancer should find>",
        "detail": "<1-2 sentences explaining why this clause deserves attention before signing>"
      }
    ]
  }
}

Rules:
- If a section topic is NOT present in the contract, write exactly: "Not mentioned in this contract."
- Do NOT invent content that is not in the contract.
- attentionFlags.items should contain up to 3 items maximum. Leave it as an empty array if no unusual terms exist.
- If attentionFlags.items is empty, set attentionFlags.exists to false.
- Write for a freelancer — frame everything from their perspective.
- This is a reading aid, not legal advice.
${truncated ? '\nNote: The contract was truncated to 8,000 characters. The summary may be incomplete.' : ''}

Contract to summarise:
---
${trimmedContent}
---
```

Use `temperature: 0` for deterministic output.

---

## Validated Response Shape

```ts
interface AgreementSummarySection {
  title: string;
  content: string;
}

interface AgreementSummaryResponse {
  cached: boolean;
  truncated: boolean;
  freelancerSummaryScoredAt: string;
  sections: {
    whatYouDo:      AgreementSummarySection;
    howYouGetPaid:  AgreementSummarySection;
    whoOwnsTheWork: AgreementSummarySection;
    howItCanEnd:    AgreementSummarySection;
    restrictions:   AgreementSummarySection;
    keyDates:       AgreementSummarySection;
  };
  attentionFlags: {
    exists: boolean;
    items: { heading: string; detail: string }[];
  };
  disclaimer: string;
}
```

---

## Response Validation Function

```ts
// In artifacts/api-server/src/lib/agreementSummaryUtils.ts

export function validateSummaryResponse(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as Record<string, unknown>;
  if (!p.sections || typeof p.sections !== 'object') return false;
  const s = p.sections as Record<string, unknown>;
  const requiredSections = ['whatYouDo', 'howYouGetPaid', 'whoOwnsTheWork', 'howItCanEnd', 'restrictions', 'keyDates'];
  for (const key of requiredSections) {
    const section = s[key] as Record<string, unknown>;
    if (!section || typeof section.title !== 'string' || typeof section.content !== 'string') return false;
  }
  if (!p.attentionFlags || typeof p.attentionFlags !== 'object') return false;
  const af = p.attentionFlags as Record<string, unknown>;
  if (typeof af.exists !== 'boolean' || !Array.isArray(af.items)) return false;
  return true;
}

export const AGREEMENT_SUMMARY_DISCLAIMER =
  'This is an AI-generated summary for your convenience. It is not legal advice. Always read the full agreement before signing.';
```

---

## Parse Failure Handling

If JSON parsing or validation fails:

```ts
try {
  const cleaned = responseText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!validateSummaryResponse(parsed)) throw new Error('invalid shape');
  // proceed with caching and response
} catch {
  req.log.warn({ agreementId }, 'agreement summary JSON parse failed');
  return res.json({ parseError: true, summary: null });
}
```

Frontend shows: "Could not summarise this agreement. Please try again."

---

## Resolved Risks

---

### Risk 1 — Disclaimer Position

**Resolution: Disclaimer rendered as the first visible element in the summary panel — above all section content.**

```tsx
<div className="rounded border-l-4 border-amber-400 bg-amber-50 px-4 py-3 mb-4">
  <p className="text-xs text-amber-800">
    <span className="font-semibold">Note: </span>
    {AGREEMENT_SUMMARY_DISCLAIMER}
  </p>
</div>
```

It is never below the fold. It is the first thing the freelancer reads.

---

### Risk 2 — AI Inventing Missing Content

**Resolution: Enforced via system prompt. Validated by checking `content` does not contain the word "Not provided" or "unknown" when we can cross-check.**

The system prompt explicitly states: "If a section topic is NOT present in the contract, write exactly: 'Not mentioned in this contract.'" Validation test V2.6 uses a minimal agreement without a restrictions section and verifies the restrictions content is exactly "Not mentioned in this contract."

---

### Risk 3 — Structured Output Parsing

**Resolution: `temperature: 0`, strict JSON-only instruction, `validateSummaryResponse()` check before caching.**

No default fallback content — only parse error return.

---

### Risk 4 — Two More Columns on `agreements`

**Resolution: Nullable columns, additive migration, no backfill. Safe.**

---

### Risk 5 — DOM Order

**Resolution: Enforced in `AgreementDetail.tsx` DOM order. Specified explicitly in `task.md` Task 3.3 with the exact section order.**

---

### Risk 6 — Codegen

**Resolution: OpenAPI spec updated in Phase 2. Codegen run before Phase 3. Standard post-codegen checks.**

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/agreement-ai-summary/features.md` read
- [ ] `specs/agreement-ai-summary/clarify.md` read
- [ ] This `plan.md` read — all 8 questions and 6 risks resolved
- [ ] `specs/agreement-ai-summary/task.md` read
- [ ] `specs/agreement-ai-summary/UI.md` read
- [ ] Codebase inspection complete — Q1, Q2, Q6 confirmed from actual schema
- [ ] `agreement_summary` added to `TokenFeature` if missing
- [ ] `specs/ai-contract-health-score/plan.md` Q2 resolution read — party verification pattern confirmed

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Database — 2 new columns on `agreements` | ⬜ Not started |
| Phase 2 | Backend — endpoint + utils + cache invalidation + OpenAPI + codegen | ⬜ Not started |
| Phase 3 | Frontend — summary panel + list badge + `AgreementDetail` integration | ⬜ Not started |

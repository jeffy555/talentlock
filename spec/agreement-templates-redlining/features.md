# TalentLock — Features Specification: Agreement Templates + Redlining

## Overview

TalentLock's AI Agreement Generation produces a single generic contract from booking details. Employers have no control over the type of agreement generated, and neither party has any way to review or improve the contract before signing it. This feature extends the agreement flow in two distinct directions: (1) Agreement Templates give employers control over the agreement style before generation — choosing an industry-appropriate template and optionally adding custom clauses (enterprise only); (2) Contract Redlining gives employers an AI-powered review pass after generation — surfacing ambiguous clauses and suggesting improvements before either party signs. Together these two capabilities make TalentLock agreements more legally sound, more industry-appropriate, and safer for both parties.

Both sub-features operate on the existing `/agreements/:id` page and build directly on the existing AI Agreement Generation endpoint in `artifacts/api-server/src/routes/agreements.ts`.

---

## Feature Modules

### Module 1 — Industry Template Selector (All Plans)

Before clicking "Generate Agreement", employers choose an industry template from a dropdown:

- `general` — existing default, no changes to current prompt
- `software_development` — adds clauses for IP ownership, source code delivery, revision rounds
- `design_creative` — adds clauses for deliverable formats, usage rights, revision limits
- `marketing_content` — adds clauses for exclusivity, content ownership, performance metrics
- `consulting_strategy` — adds clauses for confidentiality scope, deliverable definitions, retainer terms
- `data_analytics` — adds clauses for data ownership, privacy obligations, model licensing

The selected industry injects 2–3 pre-written standard clause snippets into the OpenAI generation prompt. The AI incorporates them into the agreement while maintaining overall coherence.

Default is always `general` — existing generation behaviour is fully preserved unless the employer changes the selection.

Token logging: `agreement_generation` (existing label — no new label needed).

---

### Module 2 — Enterprise Custom Clauses (Enterprise Plan Only)

Employers on the `employer_enterprise` plan see a "Custom Clauses" panel below the industry selector. They can add up to 5 free-text clauses to be incorporated into the generated agreement.

Validation rules:
- Minimum 20 characters per clause
- Maximum 500 characters per clause
- Maximum 5 clauses total

Custom clauses are passed to the OpenAI prompt alongside the industry template. The AI places them in appropriate sections while maintaining legal coherence.

Non-enterprise employers do not see this panel. The backend rejects any request with `customClauses` from a non-enterprise plan with `HTTP 403`.

---

### Module 3 — `agreements.status` Column

A new `status` column on the `agreements` table tracks the agreement lifecycle:

- `draft` — generated, no signatures yet
- `redlined` — at least one redline suggestion accepted, signatures reset
- `partially_signed` — one party has signed
- `fully_signed` — both parties signed, Vault unlocked

The existing Vault download feature is updated to also check `status === 'fully_signed'` in addition to the existing timestamp checks.

---

### Module 4 — Contract Redlining (Growth + Enterprise Plans)

After an agreement is generated but before either party signs, employers on Growth or Enterprise plans can request an AI review. The AI reads the full contract and returns up to 10 structured suggestions, each containing:

- `clauseNumber` — which clause is affected
- `originalText` — the current wording
- `suggestedText` — the proposed replacement
- `reason` — plain English explanation of why the change improves the agreement

Employers can Accept or Skip each suggestion individually:
- **Accept** — updates the agreement content and resets both signatures atomically in a single Drizzle transaction. Sets `status = 'redlined'`. Shows a toast confirming signatures were reset.
- **Skip** — removes the card from the UI locally. No API call. Agreement unchanged.

Once all suggestions are handled, an "All suggestions reviewed" empty state is shown.

Starter plan employers see a locked state with an upgrade prompt instead of the redlining panel.

Token logging: `contract_redlining` (new label).

---

### Module 5 — Estimated Token Cost Display

Before requesting redlining, employers see an estimated token cost near the button:

```
~2,400 tokens will be used
```

Calculated server-side as `Math.ceil(agreementContent.length / 4) + 500` and returned on `GET /api/agreements/:id` as `estimatedRedlineTokens`. This helps employers make an informed decision, especially those approaching their monthly quota.

---

## Plan Gating

| Module | Starter | Growth | Enterprise |
|---|---|---|---|
| Industry Template Selector | ✅ | ✅ | ✅ |
| Enterprise Custom Clauses | ❌ | ❌ | ✅ only |
| Contract Redlining | ❌ | ✅ | ✅ |
| Estimated Token Cost | ✅ | ✅ | ✅ |

---

## Non-Goals (Out of Scope for This Feature)

- Freelancer-initiated redlining or AI suggestions
- Saving custom clause libraries for reuse across multiple agreements
- More than 5 custom clauses per generation
- Redlining after any signature has been applied
- Clause categorisation dropdown for custom clauses
- Multi-language agreement generation
- Real-time collaborative editing of agreements
- Email notification when redlining is complete
- Side-by-side original vs redlined document view

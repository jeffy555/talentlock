# TalentLock — Clarification & Verification: Agreement Templates + Redlining

This file audits `features.md` against `project.md` and the completed token-consumption feature to surface gaps, architectural risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `agreements` table exists | Confirmed in `project.md` database schema |
| `POST /api/agreements` generates agreement via AI | Confirmed in `project.md` API routes |
| `POST /api/agreements/:id/sign` exists | Confirmed in `project.md` |
| `GET /api/agreements/:id/download` (Vault) exists | Confirmed in `project.md` |
| `freelancerSignatureImageUrl` + `employerSignatureImageUrl` on `agreements` | Confirmed in `project.md` schema |
| `logTokenUsage()` utility exists | Completed in token-consumption Phase 2 |
| `checkTokenQuota()` gates AI routes | Completed in token-consumption Phase 2 |
| `402 TOKEN_LIMIT` + `402 PLAN_LIMIT` response patterns | Both confirmed in existing codebase |
| OpenAI client available server-side | `lib/integrations-openai-ai-server/` confirmed |
| `employer_enterprise` plan exists in `plans.ts` | Confirmed in `project.md` subscription plans |
| shadcn/ui `<Select>`, `<Sheet>`, `<Toast>` available | Confirmed tech stack |
| Orval codegen → React Query hooks pattern | Confirmed `lib/api-client-react/` |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Does `agreements` Table Already Have a `status` Column?

**Question:** Module 3 in `features.md` requires a `status` column on `agreements`. Does this column already exist from any previous work, or does it need to be added?

**Impact:** If it exists but with different allowed values, the migration must be carefully written to not break existing data. If it doesn't exist, a new migration is needed.

**Recommendation:** Inspect `lib/db/schema.ts` before writing any migration. Run:
```bash
grep -A 30 "agreements\s*=" lib/db/schema.ts
```

---

### Q2 — What Does the Existing Agreement Generation Endpoint Accept?

**Question:** `POST /api/agreements` currently generates an agreement. What does its request body currently contain? Does it already accept any `industry` or template-related fields, or is it purely booking-data driven?

**Impact:** If the endpoint already has partial template support, adding the `industry` field may conflict with existing params. If it's purely booking-driven, the new params are purely additive.

**Recommendation:** Read `artifacts/api-server/src/routes/agreements.ts` before modifying it.

---

### Q3 — Does the Existing Vault Download Check Only Timestamps or Also Status?

**Question:** The `GET /api/agreements/:id/download` endpoint (Agreement Safe Locker) currently gates download on both parties having signed. After adding `agreements.status`, does the existing check need updating to also verify `status === 'fully_signed'`?

**Impact:** Without this update, a redlined agreement (status = `redlined`, signatures reset) could theoretically still be downloaded if there's a timing edge case. The Vault guard must be belt-and-suspenders.

---

### Q4 — How Is the Industry Clause Map Structured?

**Question:** `features.md` specifies that each industry injects "2–3 standard clause snippets" into the OpenAI prompt. Should these clauses be:
- **(A)** Short text snippets injected verbatim into the system prompt (e.g. "Include a clause stating IP ownership transfers to the employer upon full payment")
- **(B)** Full clause text that the AI must incorporate as-is
- **(C)** Instruction directives that tell the AI what topics to cover

**Impact:** Option A gives the AI flexibility to write natural-sounding clauses. Option B risks awkward integration. Option C is the most flexible but least predictable.

**Recommendation:** Option A — instruction-style snippets. The AI writes the actual clause text; the industry template tells it what to include. This produces the most coherent output.

---

### Q5 — Can the Same Agreement Be Redlined Multiple Times?

**Question:** After an employer accepts a redline suggestion (status = `redlined`), can they request redlining again on the updated agreement?

**Impact:** If yes, the endpoint must allow repeated redlining on `status = 'redlined'` agreements. If no, the guard must reject requests when `status === 'redlined'`.

**Recommendation:** Yes — allow repeated redlining. The guard only blocks redlining after a signature (`freelancerSignedAt` or `employerSignedAt` is not null). `status = 'redlined'` with no signatures is valid for a second redline pass. This matches the plan.md Risk 6 decision.

---

### Q6 — What Happens to Existing Agreements After `status` Migration?

**Question:** After adding the `status` column with `default('draft')`, existing agreements that are already fully signed will have `status = 'draft'` which is incorrect. How should these be backfilled?

**Impact:** The Vault guard update (Q3) checks `status === 'fully_signed'`. Without backfill, all existing fully-signed agreements would fail this check and the Vault would break for them.

**Recommendation:** Run a one-time backfill in the same migration:
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

---

### Q7 — How Long Is a Typical Agreement? (Token Cost Estimate Accuracy)

**Question:** The estimated token cost formula is `Math.ceil(agreementContent.length / 4) + 500`. Is this a reasonable estimate given the typical length of AI-generated TalentLock agreements?

**Impact:** If agreements are typically 3,000–8,000 characters, the estimate will be 1,250–2,500 tokens. This is meaningful to display but rough. If agreements are much longer (e.g. enterprise agreements with custom clauses), the estimate could be significantly off.

**Recommendation:** Accept the rough estimate for this phase. Display it as `~{N}` (with tilde) to communicate it is approximate. Revisit with actual data in Phase 2.

---

### Q8 — Should Freelancers See the Redlining Section at All?

**Question:** The redlining panel is employer-only for initiating a review. But after an employer has accepted redlines (status = `redlined`), should freelancers see:
- **(A)** No redlining section at all — completely hidden from freelancers
- **(B)** A read-only notice: "This agreement was revised by AI before signing"
- **(C)** The full suggestion history (read-only)

**Impact:** Option B adds transparency for freelancers — they know the agreement was AI-modified before they sign. Option A is simpler.

**Recommendation:** Option B — show a simple read-only notice on freelancer view when `status === 'redlined'`. This builds trust without exposing the full redlining interface.

---

## ⚠️ Risks & Notes

### Risk 1 — Signature Reset Is Irreversible

Accepting a redline suggestion resets both `freelancerSignedAt` and `employerSignedAt` to null. If the freelancer had already signed, they will need to re-sign after the employer accepts a redline. This must be clearly communicated in the toast and in the UI — "Signatures have been reset. Both parties must re-sign."

### Risk 2 — Token Cost of Redlining Is High

Sending a full agreement text to OpenAI for redlining is the highest single-call token cost in the system. A 5,000-character agreement + system prompt overhead ≈ 1,750 tokens in, plus completion ≈ 800–1,200 tokens out. Total ~2,500–3,000 tokens per redline call. Starter plan employers (50,000/month) could exhaust their quota in ~17 redline calls if they had access. Growth (250,000/month) could handle ~83 calls. This is acceptable but the estimated cost display is important.

### Risk 3 — Redline Accept Must Be Atomic

If the transaction that updates agreement content AND resets signatures fails midway, the agreement text could be updated without signatures being reset (or vice versa). The Drizzle transaction from plan.md Risk 1 must be used exactly — both updates inside one `db.transaction()` call.

### Risk 4 — Industry Template Prompt Injection

The industry clause map content is developer-defined (not user-provided), so injection risk is low. However, if enterprise custom clauses contain characters that could corrupt the JSON structure of the prompt, the server must sanitise or escape them before injection. Strip control characters and limit to printable ASCII + common Unicode.

### Risk 5 — Codegen Export Rules

After adding new endpoints to `lib/api-spec/openapi.yaml` and running codegen:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | `agreements.status` column existence | Task 1.1 (schema inspection) |
| Q2 | Existing agreement generation endpoint request body | Task 2.1 (endpoint modification) |
| Q3 | Vault download guard update needed | Task 2.3 (Vault guard) |
| Q6 | Backfill existing fully-signed agreements | Task 1.1 (migration) |

Questions Q4, Q5, Q7, Q8 are resolved in `plan.md`.

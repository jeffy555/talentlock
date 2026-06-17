# TalentLock — Clarification & Verification: Agreement AI Summary

This file audits `features.md` against `project.md` to surface gaps, risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `agreements` table exists with `content`, `status` columns | Confirmed in `project.md` |
| `agreements` already has `healthScore`, `healthScoreDetail`, `healthScoredAt` (added by AI Contract Health Score) | Confirmed in `project.md` schema table |
| `PATCH /api/agreements/:id/accept-redline` exists — cache invalidation pattern already established | Confirmed — used by AI Contract Health Score |
| `POST /api/agreements/:id/health-score` pattern established in `agreements.ts` | Confirmed — exact same file, same party-verification pattern to reuse |
| `logTokenUsage()` + `checkTokenQuota()` utilities exist | Confirmed throughout AI features |
| Freelancer plans have `monthlyTokenLimit: null` — skip `checkTokenQuota()`, still log | Confirmed — AI Proposal Generator and AI Contract Health Score both follow this |
| `token_usage` table + `TokenFeature` union type in `tokenLogger.ts` | Confirmed |
| `aiAssist.ts` exists for AI routes | Confirmed |
| `/agreements/:id` frontend route exists | Confirmed |
| `/agreements` list page exists with paginated response | Confirmed — Product Gaps feature added pagination |
| shadcn/ui `<Tabs>`, `<Badge>`, `<Collapsible>` available | Confirmed |
| Orval codegen pattern | Confirmed |
| `buildHealthScorePrompt()`, `validateHealthScoreResponse()` in `contractHealthUtils.ts` — reuse pattern | Confirmed — AI Contract Health Score created these |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Do `freelancerSummary` and `freelancerSummaryScoredAt` Columns Already Exist on `agreements`?

**Question:** The caching strategy adds two new columns to `agreements`. Do any variation of these columns already exist from any prior work?

**Impact:** If they exist with different names, the migration must adapt. If absent, two new nullable columns are needed.

**Recommendation:**
```bash
grep -A 50 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "summary\|summarised\|freelancer_summary"
```

---

### Q2 — How Is Freelancer Party Membership Verified on Agreements?

**Question:** The endpoint must verify the requesting freelancer is a party to the agreement. Is this done via direct `freelancerId` column on `agreements`, or by joining through `bookings`?

**Impact:** Same question as AI Contract Health Score Q2 — the answer from that feature's inspection should be reused directly.

**Recommendation:** Check the implementation notes from `specs/ai-contract-health-score/plan.md` Q2 resolution for the confirmed join path. Do not re-inspect — reuse the exact same pattern.

---

### Q3 — Where Should the Summary Endpoint Live — `agreements.ts` or `aiAssist.ts`?

**Question:** The AI Contract Health Score endpoint (`POST /api/agreements/:id/health-score`) lives in `agreements.ts` (resource-scoped). The AI Proposal Generator (`POST /api/ai/proposal`) lives in `aiAssist.ts`. Which file is correct for the summary?

**Options:**
- **(A)** `agreements.ts` — resource-scoped like health score and redlining
- **(B)** `aiAssist.ts` — AI feature collection

**Recommendation:** Option A — `agreements.ts`. All AI features that act on a specific agreement resource (redline, accept-redline, health-score) are in `agreements.ts`. This endpoint acts on a specific agreement. Consistent.

---

### Q4 — Should the Summary Show Automatically if Cached, or Always Require the Button?

**Question:** `features.md` says: if a cached summary exists, show it immediately on mount without a button. If no cache, show the "Summarise for me" button. Is this the correct UX?

**Options:**
- **(A)** Always show the button first, even if cached — consistent interaction model
- **(B)** If cached: show summary automatically in a "Summary" tab. If not cached: show the button — features.md approach
- **(C)** Always show the summary panel (empty state = button, loaded state = content)

**Recommendation:** Option C — a persistent panel that starts in the "not yet summarised" state and transitions to the loaded state. Cleaner than conditional tab rendering. The panel always occupies the same DOM position. No layout shift.

---

### Q5 — Should Both Parties See the Summary or Only the Freelancer?

**Question:** `features.md` says freelancer-only. But what if an employer views the same agreement — should they see the freelancer summary panel at all? Or just not see it?

**Recommendation:** Employer view: no summary panel at all. The panel is conditionally rendered only when `userRole === 'freelancer'`. The employer sees redlining suggestions and health score instead. These are two completely separate surfaces on the same page, conditioned on role.

---

### Q6 — What Is the Agreement Content Column Name?

**Question:** The prompt must include the full agreement text. What is the exact column name — `content`, `text`, `body`, or something else?

**Recommendation:** This was confirmed during AI Contract Health Score implementation. Reuse the confirmed column name. If not yet confirmed:
```bash
grep -A 50 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "content\|text\|body\|clause"
```

---

### Q7 — Should the Summary Cache Be Invalidated When Agreement Content Changes?

**Question:** If the employer edits the agreement via `PATCH /api/agreements/:id/accept-redline` (which changes `content`), the cached freelancer summary is now stale — it describes the old version of the contract.

**Recommendation:** Yes — invalidate alongside the health score cache. The existing `accept-redline` handler already nullifies `healthScore`, `healthScoreDetail`, `healthScoredAt`. Add `freelancerSummary: null`, `freelancerSummaryScoredAt: null` to the same post-transaction update. Same pattern, two extra lines.

---

### Q8 — How Long Is a Typical Agreement? Truncation Threshold?

**Question:** AI Contract Health Score uses an 8,000-character truncation threshold. Should the summary use the same threshold?

**Recommendation:** Same threshold — 8,000 characters. The summary prompt is similar in length to the health score prompt. If content exceeds 8,000 characters, truncate and set `truncated: true` in the response. The summary may be less complete on very long agreements — the disclaimer already covers this.

---

## ⚠️ Risks & Notes

### Risk 1 — Freelancer Must Not See Summary Before Understanding It Is Not Legal Advice

The disclaimer must be rendered prominently — not as fine print at the bottom. It appears at the top of the summary panel, before the first section. The copy is fixed (defined in `features.md`) and cannot be shortened or moved by the implementation.

### Risk 2 — AI May Invent Section Content

If a section is not in the contract, the AI must explicitly state "Not mentioned in this contract" rather than guessing. This is enforced in the system prompt. Validation check V2.5 specifically tests this by using a minimal agreement that lacks a restrictions section.

### Risk 3 — Structured Output Parsing

The summary must return a structured JSON object with exactly six section keys. If OpenAI returns malformed JSON or a response with wrong keys, the frontend cannot render the sections. Use `temperature: 0` and strict JSON instruction. Validate the parsed object shape before caching.

### Risk 4 — Two New Columns on `agreements` (Already Busy Table)

The `agreements` table now has `healthScore`, `healthScoreDetail`, `healthScoredAt` (from AI Contract Health Score) plus the two new columns. All are nullable. Additive migration is safe. No backfill needed.

### Risk 5 — Summary Must Appear Below Health Score, Not Above

The DOM order on `/agreements/:id` matters. The health score is for both parties. The freelancer summary is freelancer-only. The correct order:

```
[Agreement content]
[Redline suggestions]      ← employer-only
[Health Score Card]        ← both parties
[Freelancer Summary Panel] ← freelancer-only
[Signing section]
```

This prevents the freelancer from seeing an empty "employer-only" section before the content that matters to them.

### Risk 6 — Codegen Required

After adding `POST /api/agreements/:id/summarise` to OpenAPI spec, codegen must run before Phase 3 (frontend).

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | `freelancerSummary` columns already exist? | Task 1.1 (schema migration) |
| Q2 | Party verification join path | Task 2.1 (auth guard) |
| Q6 | Agreement content column name | Task 2.1 (prompt building) |

Questions Q3, Q4, Q5, Q7, Q8 are resolved in `plan.md`.

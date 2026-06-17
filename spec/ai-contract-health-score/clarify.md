# TalentLock — Clarification & Verification: AI Contract Health Score

This file audits `features.md` against `project.md` to surface gaps, risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `agreements` table exists with `content`, `status` columns | Confirmed in `project.md` |
| `agreements.status` lifecycle (`draft` → `redlined` → `partially_signed` → `fully_signed`) | Confirmed — added in agreement-templates-redlining feature |
| `POST /api/agreements/:id/redline` exists (Growth+) | Confirmed in `project.md` |
| `PATCH /api/agreements/:id/accept-redline` exists | Confirmed in `project.md` |
| `logTokenUsage()` + `checkTokenQuota()` utilities exist | Confirmed — used across all AI features |
| `aiAssist.ts` route file exists for AI endpoints | Confirmed — `POST /api/ai/proposal`, `/ai/job-description` etc. live here |
| Agreement route file `agreements.ts` exists | Confirmed — signing, download, redline all there |
| `402 TOKEN_LIMIT` + `402 PLAN_LIMIT` response patterns | Confirmed |
| OpenAI client available server-side | Confirmed |
| Both employer and freelancer access `/agreements/:id` | Confirmed — both parties can view and sign |
| shadcn/ui progress/badge components available | Confirmed |
| Orval codegen pattern | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Do `healthScore`, `healthScoreDetail`, `healthScoredAt` Columns Already Exist on `agreements`?

**Question:** The caching strategy requires three new columns on `agreements`. Do any of these exist already from prior partial work?

**Impact:** If they exist with different names or types, the migration must adapt. If absent, three new columns are needed.

**Recommendation:**
```bash
grep -A 40 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "health\|score\|scored"
```

---

### Q2 — Who Can Call the Health Score Endpoint?

**Question:** `features.md` says "either party on this agreement." How do we verify this? The agreement has an `employerId` and a `freelancerId` — but do these exist as direct columns on the `agreements` table, or must we join through `bookings`?

**Impact:** The auth guard must verify the requesting user is either the employer or freelancer on this specific agreement before allowing the score request.

**Recommendation:**
```bash
grep -A 40 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "employer\|freelancer\|booking"
```

---

### Q3 — How Should Cache Invalidation Work When Redline Is Accepted?

**Question:** `features.md` says the cached score is invalidated when `PATCH /api/agreements/:id/accept-redline` changes the content. The redline acceptance route already exists. Should we:
- **(A)** Modify the existing `accept-redline` handler to set `healthScore = null`, `healthScoredAt = null` after the update
- **(B)** Add a database trigger that nullifies the cache on content update
- **(C)** Invalidate the cache inline in the health score endpoint by comparing `healthScoredAt` to the agreement's `updatedAt`

**Impact:** Option A is the cleanest — explicit, no triggers, no extra comparison overhead.

**Recommendation:** Option A — add three lines to the existing `accept-redline` handler to null out the health score cache.

---

### Q4 — Should the Score Be Available After Signing?

**Question:** Can either party request a health score on a `fully_signed` or `partially_signed` agreement? Or is it only available pre-signing?

**Options:**
- **(A)** Available at any `status` — useful for post-signing reference
- **(B)** Only available for `draft` and `redlined` status — pre-signing only

**Impact:** Option A is simpler (no status guard) and more useful — a signed agreement's score is interesting historical data.

**Recommendation:** Option A — available at any status. The score is informational and never blocks anything.

---

### Q5 — What Is the `fieldOfWork` for the Industry Fit Dimension?

**Question:** The "Industry Fit" dimension needs to know the field of work to evaluate whether clauses are appropriate. Where does this come from? Options:
- From the freelancer's `freelancer_profiles.fieldOfWork`
- From the linked `bookings` → `job_requirements.title` / `description`
- Inferred by the AI from the agreement content itself

**Impact:** The system prompt must include field context for the Industry Fit dimension to be meaningful.

**Recommendation:** Use all available context: freelancer's `fieldOfWork` (from joining through booking → freelancer profile) + job requirement title if available. If none is available, the AI infers from content.

---

### Q6 — What Happens When OpenAI Returns Malformed JSON?

**Question:** The health score endpoint requires structured JSON from OpenAI (scores per dimension, explanations). If parsing fails, what should happen?

**Options:**
- **(A)** Return `HTTP 500` — caller retries
- **(B)** Return `HTTP 200` with `parseError: true` and a default 50/100 score
- **(C)** Return `HTTP 200` with `parseError: true` and no score (frontend shows "could not score")

**Recommendation:** Option C — return `{ parseError: true, score: null }`. The frontend shows a "Could not score this contract — try again" error state. No misleading default score.

---

### Q7 — Should the Score Be Shown in the Agreement List (`GET /api/agreements`)?

**Question:** The agreement list page (`/agreements`) could show a small health score badge per agreement. Should the `healthScore` field be included in the list response?

**Recommendation:** Yes — add `healthScore: number | null` to the paginated list response. The frontend renders a compact badge (e.g. `A`, `B`, `C`) when `healthScore` is not null. When null, no badge shown (not yet scored).

---

### Q8 — Token Quota for Freelancers

**Question:** Freelancer plans have `monthlyTokenLimit: null` (confirmed in AI Proposal Generator). Should `checkTokenQuota()` be called for freelancer requests?

**Recommendation:** Same decision as AI Proposal Generator — skip `checkTokenQuota()` for freelancer plans, still log tokens via `logTokenUsage()`. Add a TODO comment. Consistent with established pattern.

---

## ⚠️ Risks & Notes

### Risk 1 — Agreement Content Can Be Long

A typical TalentLock agreement is 2,000–6,000 characters. Sending the full content to OpenAI for health scoring will consume ~600–1,500 prompt tokens. The completion (scores + explanations) adds ~300–500 tokens. Total: ~900–2,000 tokens per score request. For employers with a 50k/month Starter quota, this is 25–55 scoring calls per month. Acceptable.

### Risk 2 — Score Subjectivity

AI health scores are inherently subjective. The same agreement may score differently across API calls due to temperature variation. Solutions:
- Use `temperature: 0` to maximise determinism
- Cache the score — same agreement content always returns the same cached score
- Add a disclaimer in the UI: "AI-generated assessment — not legal advice"

### Risk 3 — Column Migration on `agreements` Table

Adding three nullable columns to `agreements` is safe and additive. The backfill is trivial — all existing agreements default to `null` for all three new columns (not yet scored). No backfill SQL required.

### Risk 4 — Redline Route Modification

Modifying the existing `PATCH /api/agreements/:id/accept-redline` handler to null out the health score cache must be done carefully — this is a live production route. The addition is minimal (3 lines) but must not break the existing atomic transaction.

### Risk 5 — Codegen Required

After adding `POST /api/agreements/:id/health-score` to the OpenAPI spec, codegen must run before Phase 3 (frontend).

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Health score columns already exist? | Task 1.1 (schema migration) |
| Q2 | Party verification pattern on agreements | Task 2.1 (auth guard) |
| Q5 | `fieldOfWork` sourcing for Industry Fit | Task 2.1 (prompt building) |

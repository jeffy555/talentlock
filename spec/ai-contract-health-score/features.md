# TalentLock — Features Specification: AI Contract Health Score

## Overview

TalentLock generates legal agreements using GPT-4. The redlining feature (Growth+) then lets the AI suggest improvements to specific clauses. But neither feature gives either party a holistic assessment of the overall agreement quality before signing. An employer cannot tell if the generated contract is appropriately protective. A freelancer cannot tell if it is one-sided against them. Both parties are signing blind on the aggregate quality of the document.

This feature adds an AI Contract Health Score — a 0–100 composite score that evaluates the generated agreement across five dimensions before either party signs. It surfaces as a score card on `/agreements/:id`, visible to both parties, calculated on demand. The score is the most direct differentiator TalentLock has over any other freelance platform — no competitor scores contracts before signing.

This feature is deliberately separate from redlining. Redlining finds specific clause problems and suggests fixes. The health score gives a gestalt quality signal: "this is a 74/100 contract — strong on clarity and completeness, but weak on enforceability." Both features complement each other and can be used together.

---

## Feature Modules

### Module 1 — Five Scoring Dimensions

The AI evaluates the agreement on exactly five dimensions, each scored 0–20:

| Dimension | What it evaluates | Max score |
|---|---|---|
| **Clarity** | Language is unambiguous, no undefined terms, no contradictions | 20 |
| **Fairness** | Terms are not unreasonably one-sided; balanced obligations and protections | 20 |
| **Completeness** | All standard sections present: deliverables, payment, IP, termination, dispute resolution | 20 |
| **Enforceability** | Terms are specific enough to be actionable; no vague language like "reasonable time" without definition | 20 |
| **Industry Fit** | Terms match the field of work (e.g. IP clauses appropriate for software vs creative work) | 20 |

**Total: 0–100**

Each dimension also produces:
- A one-sentence verdict: `"Strong"` / `"Acceptable"` / `"Needs attention"` / `"Weak"`
- A 1–2 sentence plain-English explanation of why it scored that way

---

### Module 2 — Overall Health Grade

The total score maps to a letter grade displayed prominently:

| Score | Grade | Colour | Label |
|---|---|---|---|
| 90–100 | A | Emerald | Excellent |
| 75–89 | B | Blue | Good |
| 60–74 | C | Amber | Acceptable |
| 45–59 | D | Orange | Needs Review |
| 0–44 | F | Red | Weak |

---

### Module 3 — Role-Aware Framing

The health score is visible to both employer and freelancer. However the framing differs:

- **Employer view**: "Your contract health score" — neutral framing
- **Freelancer view**: "Contract health score" — same data, slightly different emphasis on fairness dimension ("this contract is balanced for you as a freelancer")

Neither party sees the other's framing. The underlying score is identical.

---

### Module 4 — Score Caching

The health score is expensive to compute (~800–1200 tokens). It must not be recomputed on every page load.

**Caching strategy:**
- New columns on `agreements`: `healthScore` (integer, nullable), `healthScoreDetail` (jsonb, nullable), `healthScoredAt` (timestamptz, nullable)
- The score is computed on demand when the employer or freelancer clicks "Score this contract"
- The cached score is invalidated (set to null) whenever the agreement `content` changes — i.e. when a redline is accepted (`PATCH /api/agreements/:id/accept-redline`)
- On the frontend, if a cached score exists it is shown immediately without a new API call

---

### Module 5 — API Endpoint

`POST /api/agreements/:id/health-score`

- Requires auth — either party (employer or freelancer on this agreement)
- If a cached score exists and the agreement has not changed since scoring: returns the cached score immediately (no OpenAI call, no token consumption)
- If no cache or cache is stale: calls OpenAI, caches result, returns score
- Returns the full score breakdown including per-dimension scores and explanations

Token label: `contract_health_score`
Plan gating: All plans for both employers and freelancers. No plan gate. Token quota applies.

---

### Module 6 — Integration With Redlining

When redlining is available (Growth+ employer) and the health score is below 75, a contextual prompt appears below the score:

```
This contract scored below 75. Consider running AI redlining to
improve specific clauses before signing.  [Run Redlining ✦]
```

This is a UI nudge only — no automatic redlining.

---

## Plan Gating

| Plan | Health Score | Token cost |
|---|---|---|
| `employer_starter` | ✅ | ~900 tokens |
| `employer_growth` | ✅ | ~900 tokens |
| `employer_enterprise` | ✅ | ~900 tokens |
| `freelancer_free` | ✅ | ~900 tokens |
| `freelancer_pro` | ✅ | ~900 tokens |

All plans. No plan gate. Token quota applies to employer plans. Freelancer plans have no quota (consistent with AI Proposal Generator).

---

## Non-Goals

- Automatic scoring on every agreement generation (on-demand only)
- Score comparison across multiple agreements
- Score history / trend over time
- Legal advice or liability assessment (clearly labelled as AI guidance only)
- Score visible on the public `/f/:id` profile page
- Admin-level score dashboard across all platform agreements
- Score influencing search ranking in Talent Vault

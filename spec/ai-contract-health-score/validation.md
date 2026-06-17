# TalentLock — Validation Guide: AI Contract Health Score

> **Purpose:** Verify the AI Contract Health Score feature is correctly implemented before it is considered complete.
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix all failures before marking a phase complete.

---

## Phase 1 Validation — Database

### V1.1 — New Columns Exist on `agreements`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agreements'
AND column_name IN ('health_score', 'health_score_detail', 'health_scored_at')
ORDER BY column_name;
```

- [ ] `health_score` exists — type `integer`, nullable
- [ ] `health_score_detail` exists — type `jsonb`, nullable
- [ ] `health_scored_at` exists — type `timestamptz`, nullable

### V1.2 — Existing Agreements Unaffected

```sql
SELECT COUNT(*) as total,
       COUNT(health_score) as scored
FROM agreements;
```

- [ ] `scored` = 0 (all existing agreements default to null — not yet scored)
- [ ] `total` matches the known agreement count

---

## Phase 2 Validation — Backend

### V2.1 — `TokenFeature` Updated

```bash
grep "contract_health_score" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] `'contract_health_score'` present in the `TokenFeature` union

### V2.2 — Unauthenticated Request Blocked

```bash
curl -X POST http://localhost:8080/api/agreements/<valid_id>/health-score
```

- [ ] Returns `HTTP 401`

### V2.3 — Non-Party Blocked (403)

As an employer who is NOT a party to the agreement:

```bash
curl -X POST http://localhost:8080/api/agreements/<other_employer_agreement_id>/health-score \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 403`

### V2.4 — Unknown Agreement (404)

```bash
curl -X POST http://localhost:8080/api/agreements/nonexistent-id/health-score \
  -H "Authorization: Bearer <valid_token>"
```

- [ ] Returns `HTTP 404`

### V2.5 — Happy Path: Score Returned for Employer

```bash
curl -X POST http://localhost:8080/api/agreements/<valid_agreement_id>/health-score \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 200`
- [ ] Response has `totalScore` (integer 0–100)
- [ ] Response has `dimensions` with `clarity`, `fairness`, `completeness`, `enforceability`, `industryFit`
- [ ] Each dimension has `score` (0–20), `verdict` (one of four strings), `explanation`
- [ ] Response has `summary` (non-empty string)
- [ ] `parseError: false`
- [ ] `cached: false` (first call)

Verify token usage logged:
```sql
SELECT feature, total_tokens, created_at
FROM token_usage
WHERE user_id = '<employer_id>'
AND feature = 'contract_health_score'
ORDER BY created_at DESC LIMIT 1;
```

- [ ] Row exists with `feature = 'contract_health_score'`
- [ ] `total_tokens` is between 500 and 2500

Verify score cached in DB:
```sql
SELECT health_score, health_score_detail, health_scored_at
FROM agreements WHERE id = '<agreement_id>';
```

- [ ] `health_score` is populated (not null)
- [ ] `health_score_detail` is a valid JSON object
- [ ] `health_scored_at` is populated

### V2.6 — Cache Returned on Second Call

Call the same endpoint again immediately:

```bash
curl -X POST http://localhost:8080/api/agreements/<same_agreement_id>/health-score \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 200` with `cached: true`
- [ ] `totalScore` matches the first call
- [ ] No new row created in `token_usage` (no additional API call made)

```sql
SELECT COUNT(*) FROM token_usage
WHERE user_id = '<employer_id>'
AND feature = 'contract_health_score';
```

- [ ] Still only 1 row (second call used cache)

### V2.7 — Freelancer Can Score (No Quota Check)

```bash
curl -X POST http://localhost:8080/api/agreements/<agreement_id>/health-score \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns `HTTP 200` with score data
- [ ] Does NOT return `HTTP 402` even if freelancer has no token quota defined

Token usage logged:
```sql
SELECT * FROM token_usage
WHERE user_id = '<freelancer_id>'
AND feature = 'contract_health_score'
ORDER BY created_at DESC LIMIT 1;
```

- [ ] Row exists (tokens still logged for freelancers)

### V2.8 — Employer Quota Enforcement (402)

Set up a test employer with an exhausted token quota. Call the endpoint:

```bash
curl -X POST http://localhost:8080/api/agreements/<agreement_id>/health-score \
  -H "Authorization: Bearer <quota_exhausted_employer_token>"
```

- [ ] Returns `HTTP 402`, `code: "TOKEN_LIMIT"`
- [ ] No OpenAI call made
- [ ] No `token_usage` row added

### V2.9 — Cache Invalidated After Redline Acceptance

Score an agreement to populate cache. Then accept a redline suggestion:

```bash
# First, score the agreement
curl -X POST http://localhost:8080/api/agreements/<id>/health-score \
  -H "Authorization: Bearer <employer_token>"

# Verify cache is set
# Then accept a redline
curl -X PATCH http://localhost:8080/api/agreements/<id>/accept-redline \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"suggestionId": "<suggestion_id>"}'
```

Check DB after redline acceptance:
```sql
SELECT health_score, health_score_detail, health_scored_at
FROM agreements WHERE id = '<id>';
```

- [ ] `health_score` is null (cache cleared)
- [ ] `health_score_detail` is null
- [ ] `health_scored_at` is null

Verify redline acceptance itself still works:
- [ ] `PATCH /api/agreements/:id/accept-redline` still returns `HTTP 200`
- [ ] The content update (primary purpose) completed successfully

### V2.10 — `GET /api/agreements` Includes `healthScore`

```bash
curl http://localhost:8080/api/agreements \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Response shape: `{ data: [...], total, page, pageSize, totalPages }`
- [ ] Each item in `data` includes `healthScore: number | null`
- [ ] Scored agreements have an integer `healthScore`
- [ ] Unscored agreements have `healthScore: null`

### V2.11 — Truncation for Long Agreements

Create or use an agreement with content > 8,000 characters. Score it:

```bash
curl -X POST http://localhost:8080/api/agreements/<long_agreement_id>/health-score \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 200` with `truncated: true`
- [ ] Score is still returned (truncation does not block scoring)

### V2.12 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — Generated Hook Exists

```bash
grep -r "usePostAgreementsIdHealthScore" lib/api-client-react/src/ | head -5
```

- [ ] Hook exists in generated code

### V3.2 — `contractHealthUtils.ts` Exists and Exports Correctly

```bash
node -e "
const { getHealthGrade, DIMENSION_LABELS, verdictColour } = require('./artifacts/talentlock/src/lib/contractHealthUtils');
console.log(getHealthGrade(92));  // { grade: 'A', label: 'Excellent', ... }
console.log(getHealthGrade(78));  // { grade: 'B', label: 'Good', ... }
console.log(getHealthGrade(55));  // { grade: 'D', label: 'Needs Review', ... }
console.log(getHealthGrade(30));  // { grade: 'F', label: 'Weak', ... }
console.log(DIMENSION_LABELS.industryFit);  // 'Industry Fit'
console.log(verdictColour('Strong'));       // 'text-emerald-600'
console.log(verdictColour('Weak'));         // 'text-red-600'
"
```

- [ ] All grade mappings correct
- [ ] `DIMENSION_LABELS` contains all 5 dimension keys
- [ ] `verdictColour` maps all four verdicts

### V3.3 — Score Card on `/agreements/:id` (Employer View)

Log in as employer, navigate to `/agreements/:id`:

- [ ] "Contract Health Score" card visible below contract content
- [ ] "✦ Score this contract" button visible

Click the button:
- [ ] Spinner shown with "Analysing contract..." text
- [ ] Score card renders with grade badge, total score, summary
- [ ] All 5 dimension rows visible with bars and verdicts
- [ ] Progress bars proportional to scores
- [ ] Dimension tooltips show explanation on hover
- [ ] "✓ Cached result" indicator shown on second load
- [ ] "Rescore" button visible after first score

### V3.4 — Score Card on `/agreements/:id` (Freelancer View)

Log in as freelancer, navigate to the same agreement:

- [ ] "Contract Health Score" card visible
- [ ] Card description uses freelancer framing: "Understand how balanced and complete..."
- [ ] Score button works and returns the same score as employer view
- [ ] Redline nudge NOT shown (freelancer cannot redline)

### V3.5 — Grade Correct Per Score Range

Use agreements or mock data covering different score ranges:

- [ ] Score 92 → grade badge shows `A` in emerald
- [ ] Score 78 → grade badge shows `B` in blue
- [ ] Score 65 → grade badge shows `C` in amber
- [ ] Score 50 → grade badge shows `D` in orange
- [ ] Score 35 → grade badge shows `F` in red

### V3.6 — Redline Nudge (Growth+ Employer, Score < 75)

Log in as Growth+ employer. Score an agreement that returns < 75:

- [ ] Amber nudge box visible below dimensions
- [ ] "⚠ This contract scored below 75..." text present
- [ ] "Run Redlining ✦" button visible
- [ ] Clicking it triggers the redline API call

Repeat for Starter employer with same low score:

- [ ] Nudge NOT shown for Starter plan

### V3.7 — Token Quota Error State

Mock a 402 response (or use a quota-exhausted account):

- [ ] "⚡ Token limit reached for this month." message shown
- [ ] "Upgrade plan →" link navigates to `/pricing`
- [ ] Score button is replaced by the error state (not stacked)

### V3.8 — Parse Error State

Mock `{ parseError: true, score: null }` response:

- [ ] "Could not score this contract." message shown
- [ ] "Try again" button visible and re-fires the mutation

### V3.9 — Grade Badges on Agreement List

Navigate to `/agreements`:

- [ ] Scored agreements show compact grade badge (`A`/`B`/`C`/`D`/`F`) beside title
- [ ] Unscored agreements show no badge
- [ ] Badge colour matches the grade

### V3.10 — Cache Invalidation Reflected in UI

Score an agreement (cache populated). Accept a redline. Reload `/agreements/:id`:

- [ ] Score card returns to "not yet scored" state (no cached score shown)
- [ ] "✦ Score this contract" button visible again

### V3.11 — Disclaimer Visible

On any scored agreement:

- [ ] "AI-generated assessment — not legal advice" text visible at bottom of score card

### V3.12 — Build Passes

```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero TypeScript errors
- [ ] Both builds complete without errors

---

## Security Validation

### S1 — User Cannot Score Another Party's Agreement

```bash
# Third party (not employer or freelancer on this agreement) tries to score it
curl -X POST http://localhost:8080/api/agreements/<agreement_id>/health-score \
  -H "Authorization: Bearer <unrelated_employer_token>"
```

- [ ] Returns `HTTP 403`

### S2 — Score Detail Not Exposed to Non-Parties

Fetch the agreement list as a different employer:

```bash
curl http://localhost:8080/api/agreements \
  -H "Authorization: Bearer <different_employer_token>"
```

- [ ] Other employer's agreements do NOT appear in results
- [ ] `healthScore` values are only visible for the requesting user's own agreements

### S3 — Cache Invalidation Does Not Break Accept-Redline

The addition of cache invalidation to `accept-redline` must not introduce any regression. Confirm:

- [ ] V2.9 above passes
- [ ] `PATCH /api/agreements/:id/accept-redline` behaviour is unchanged for the primary action

---

## Regression Validation

### R1 — Existing Agreement Signing Unaffected

Sign an agreement (one that has NOT been scored):

```bash
curl -X POST http://localhost:8080/api/agreements/<id>/sign \
  -H "Authorization: Bearer <user_token>" \
  -d '{"signatureType":"typed","typedName":"Test User"}'
```

- [ ] Returns `HTTP 200`
- [ ] No error related to new columns

### R2 — Existing Redlining Unaffected

Run redline on an agreement:

```bash
curl -X POST http://localhost:8080/api/agreements/<id>/redline \
  -H "Authorization: Bearer <growth_employer_token>"
```

- [ ] Returns `HTTP 200` with redline suggestions
- [ ] Feature unaffected by health score additions

### R3 — Agreement List Pagination Still Works

```bash
curl "http://localhost:8080/api/agreements?page=1&pageSize=5" \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `{ data, total, page, pageSize, totalPages }` shape
- [ ] `healthScore` is included per item
- [ ] Pagination metadata is correct

### R4 — TypeCheck and Build Pass

Already covered in V3.12. Both builds must pass with zero errors.

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Database | ⬜ | | |
| Phase 2 — Backend | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| Security Checks | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

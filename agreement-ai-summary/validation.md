# TalentLock — Validation Guide: Agreement AI Summary

> **Purpose:** Verify the Agreement AI Summary feature is correctly implemented before it is considered complete.
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix failures before marking a phase complete.

---

## Phase 1 Validation — Database

### V1.1 — New Columns Exist on `agreements`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agreements'
AND column_name IN ('freelancer_summary', 'freelancer_summary_scored_at')
ORDER BY column_name;
```

- [ ] `freelancer_summary` exists — type `jsonb`, nullable
- [ ] `freelancer_summary_scored_at` exists — type `timestamptz`, nullable

### V1.2 — Existing Agreements Unaffected

```sql
SELECT COUNT(*) as total,
       COUNT(freelancer_summary) as summarised
FROM agreements;
```

- [ ] `summarised` = 0 (all existing agreements default to null)

---

## Phase 2 Validation — Backend

### V2.1 — TokenFeature Updated

```bash
grep "agreement_summary" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] `'agreement_summary'` present in the `TokenFeature` union

### V2.2 — Employer Cannot Access

```bash
curl -X POST http://localhost:8080/api/agreements/<valid_id>/summarise \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 403`
- [ ] Error message: "This feature is for freelancers only"

### V2.3 — Wrong Freelancer Cannot Access

```bash
# Freelancer B tries to summarise Freelancer A's agreement
curl -X POST http://localhost:8080/api/agreements/<freelancer_A_agreement_id>/summarise \
  -H "Authorization: Bearer <freelancer_B_token>"
```

- [ ] Returns `HTTP 403`

### V2.4 — Unknown Agreement Returns 404

```bash
curl -X POST http://localhost:8080/api/agreements/nonexistent-id/summarise \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns `HTTP 404`

### V2.5 — Happy Path: Full Summary Returned

```bash
curl -X POST http://localhost:8080/api/agreements/<valid_agreement_id>/summarise \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns `HTTP 200`
- [ ] Response has `sections` with all 6 keys: `whatYouDo`, `howYouGetPaid`, `whoOwnsTheWork`, `howItCanEnd`, `restrictions`, `keyDates`
- [ ] Each section has `title` (string) and `content` (string)
- [ ] Response has `attentionFlags` with `exists` (boolean) and `items` (array, 0–3)
- [ ] Response has `disclaimer` (non-empty string containing "not legal advice")
- [ ] `parseError: false`
- [ ] `cached: false` (first call)
- [ ] `truncated: false` (normal-length agreement)

Token usage logged:
```sql
SELECT feature, total_tokens, created_at
FROM token_usage
WHERE user_id = '<freelancer_id>'
AND feature = 'agreement_summary'
ORDER BY created_at DESC LIMIT 1;
```

- [ ] Row exists with `feature = 'agreement_summary'`
- [ ] `total_tokens` between 500 and 2,500

Summary cached in DB:
```sql
SELECT freelancer_summary, freelancer_summary_scored_at
FROM agreements WHERE id = '<agreement_id>';
```

- [ ] `freelancer_summary` is a valid JSON object (not null)
- [ ] `freelancer_summary_scored_at` is populated

### V2.6 — Missing Sections Handled Gracefully

Use an agreement with minimal content that clearly has no restrictions or non-compete clause. Score it:

- [ ] `restrictions.content` equals exactly `"Not mentioned in this contract."`
- [ ] No hallucinated restrictions content

### V2.7 — Cache Returned on Second Call

Call the same endpoint immediately after V2.5:

```bash
curl -X POST http://localhost:8080/api/agreements/<same_id>/summarise \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns `HTTP 200` with `cached: true`
- [ ] Sections match the first call
- [ ] No new `token_usage` row created (no additional OpenAI call)

```sql
SELECT COUNT(*) FROM token_usage
WHERE user_id = '<freelancer_id>'
AND feature = 'agreement_summary';
```

- [ ] Still only 1 row (second call used cache)

### V2.8 — No Token Quota Check for Freelancers

Set up a test freelancer with a manually exhausted token quota (if possible). Call summarise:

- [ ] Does NOT return `HTTP 402` — quota check is not applied to freelancers
- [ ] Summary is returned successfully

### V2.9 — Cache Invalidated After Redline Acceptance

Score an agreement summary to populate cache. Then accept a redline suggestion on the same agreement:

```bash
# Accept a redline
curl -X PATCH http://localhost:8080/api/agreements/<id>/accept-redline \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"suggestionId":"<suggestion_id>"}'
```

Check DB after:
```sql
SELECT freelancer_summary, freelancer_summary_scored_at,
       health_score, health_scored_at
FROM agreements WHERE id = '<id>';
```

- [ ] `freelancer_summary` is null (cache cleared)
- [ ] `freelancer_summary_scored_at` is null
- [ ] `health_score` is null (existing behaviour preserved)
- [ ] `accept-redline` itself still returns `HTTP 200` — primary action unaffected

### V2.10 — `GET /api/agreements` Includes `hasSummary`

```bash
curl http://localhost:8080/api/agreements \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Response shape: `{ data: [...], total, page, pageSize, totalPages }`
- [ ] Each item in `data` includes `hasSummary: boolean`
- [ ] Summarised agreements have `hasSummary: true`
- [ ] Unsummarised agreements have `hasSummary: false`

### V2.11 — `GET /api/agreements/:id` Includes Summary Data

```bash
curl http://localhost:8080/api/agreements/<summarised_id> \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Response includes `freelancerSummary` (object or null)
- [ ] Response includes `freelancerSummaryScoredAt` (timestamp string or null)

### V2.12 — Truncation for Long Agreements

Use or create an agreement with content > 8,000 characters. Summarise it:

- [ ] Returns `HTTP 200` with `truncated: true`
- [ ] Summary still returned (truncation does not block summary)

### V2.13 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — Generated Hook Exists

```bash
grep -r "usePostAgreementsIdSummarise" lib/api-client-react/src/ | head -5
```

- [ ] Hook exists

### V3.2 — Panel NOT Rendered for Employers

Log in as employer, navigate to `/agreements/:id`:

- [ ] No "AI Agreement Summary" panel visible anywhere on the page
- [ ] Health Score Card still visible (both parties)
- [ ] No JavaScript errors

### V3.3 — Panel Renders for Freelancer — Idle State

Log in as freelancer, navigate to `/agreements/:id` (unsummarised agreement):

- [ ] "AI Agreement Summary" panel visible
- [ ] Violet header strip with sparkle icon
- [ ] "Freelancer" role badge visible in header
- [ ] Description text visible
- [ ] "✦ Summarise for me" button visible
- [ ] No sections rendered yet

### V3.4 — Loading State

Click "✦ Summarise for me":

- [ ] Spinner and "Reading and summarising..." text shown
- [ ] Button not visible during loading

### V3.5 — Loaded State — All 6 Sections

After loading:

- [ ] Amber disclaimer box visible as FIRST element (above all sections)
- [ ] Disclaimer contains "not legal advice"
- [ ] All 6 section headings visible with icons
- [ ] Sections in correct order: whatYouDo → howYouGetPaid → whoOwnsTheWork → howItCanEnd → restrictions → keyDates
- [ ] Each section has paragraph text below the heading
- [ ] Attention flags section visible at bottom (either red flag cards or green all-clear)

### V3.6 — Attention Flags Rendering

For an agreement with unusual terms (IP assignment, non-compete):

- [ ] Red "Read before signing (N items)" box visible
- [ ] Each flag shows the quoted clause heading in bold
- [ ] Each flag shows the detail explanation below

For an agreement with no unusual terms:

- [ ] Green "No unusual terms found" box visible
- [ ] No red flag cards

### V3.7 — Cached State on Page Reload

Navigate away from the agreement and back:

- [ ] Summary renders immediately on mount (no button, no loading spinner)
- [ ] "✓ Cached" indicator visible in header
- [ ] "Regenerate" button visible

### V3.8 — Regenerate Flow

Click "Regenerate":

- [ ] Panel transitions back to loading state
- [ ] New summary loads
- [ ] "Cached" indicator shows again after load (server caches the new result)

### V3.9 — DOM Order on `/agreements/:id`

Inspect the page DOM for a freelancer viewing an agreement:

- [ ] Health Score Card appears BEFORE the AI Summary panel
- [ ] AI Summary panel appears BEFORE the signing section
- [ ] Redline suggestions (if any) appear ABOVE both Health Score and Summary

### V3.10 — Parse Error State

Mock `{ parseError: true, summary: null }` response (temporarily break the endpoint or intercept):

- [ ] "Could not summarise this agreement." heading shown
- [ ] "Try again" button visible and re-fires the mutation

### V3.11 — "Summarised" Badge on List Page

Navigate to `/agreements` as freelancer:

- [ ] Summarised agreements show violet "✦ Summarised" badge next to title
- [ ] Unsummarised agreements show no badge
- [ ] Employer view: no badges visible at all (even for their own summarised agreements)

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

### S1 — Freelancer Cannot Summarise Another Party's Agreement

```bash
curl -X POST http://localhost:8080/api/agreements/<unrelated_agreement_id>/summarise \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns `HTTP 403`

### S2 — Summary Data Only Visible to the Correct Freelancer

Fetch the agreement detail as Freelancer A (party) and Freelancer B (non-party):

- [ ] Freelancer A's `GET /api/agreements/:id` response includes `freelancerSummary`
- [ ] Freelancer B's request returns `HTTP 403` — they cannot access the agreement at all

### S3 — Employer Cannot Access Summary Via Agreement Detail

```bash
curl http://localhost:8080/api/agreements/<id> \
  -H "Authorization: Bearer <employer_token>"
```

Verify response:
- [ ] Even if `freelancerSummary` is in the DB, confirm the employer's detail response either excludes it or they cannot access the endpoint
- Note: If the auth hardening spec (IDOR fix) is in place, employer access to a different employer's agreement would already be blocked. Verify the summary field is not inadvertently returned.

### S4 — Disclaimer Always Present in API Response

For every successful summary response:
- [ ] `disclaimer` field is present and non-empty
- [ ] Disclaimer contains the exact phrase "not legal advice"

---

## Regression Validation

### R1 — Existing Agreement Redlining Unaffected

```bash
curl -X POST http://localhost:8080/api/agreements/<id>/redline \
  -H "Authorization: Bearer <growth_employer_token>"
```

- [ ] Returns `HTTP 200` with redline suggestions
- [ ] Feature unaffected by summary additions

### R2 — Health Score Unaffected

```bash
curl -X POST http://localhost:8080/api/agreements/<id>/health-score \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 200` with score data
- [ ] Cache invalidation in `accept-redline` still nullifies health score

### R3 — Agreement Signing Unaffected

```bash
curl -X POST http://localhost:8080/api/agreements/<id>/sign \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"signatureType":"typed","typedName":"Test Name"}'
```

- [ ] Returns `HTTP 200`
- [ ] New columns on `agreements` do not interfere with signing flow

### R4 — Agreement List Pagination Still Works

```bash
curl "http://localhost:8080/api/agreements?page=1&pageSize=5" \
  -H "Authorization: Bearer <user_token>"
```

- [ ] Returns `{ data, total, page, pageSize, totalPages }` shape
- [ ] `hasSummary` included per item
- [ ] Pagination metadata correct

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

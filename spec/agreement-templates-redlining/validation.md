# TalentLock — Validation Guide: Agreement Templates + Redlining

> **Purpose:** Verify the Agreement Templates + Redlining feature is correctly implemented before it is considered complete. Run after all phases of `task.md` are marked done.
>
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail with a note. Fix failures before marking a phase complete.

---

## Phase 1 Validation — Database

### V1.1 — `agreements.status` Column Exists

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'agreements'
AND column_name = 'status';
```

- [ ] Column exists, type `text`, not nullable, default `'draft'`

### V1.2 — Backfill Completed Correctly

```sql
-- Fully signed agreements should have status = 'fully_signed'
SELECT COUNT(*) FROM agreements
WHERE freelancer_signed_at IS NOT NULL
AND employer_signed_at IS NOT NULL
AND status != 'fully_signed';
```

- [ ] Count is `0` — all fully signed agreements have correct status

```sql
-- Partially signed agreements should have status = 'partially_signed'
SELECT COUNT(*) FROM agreements
WHERE (freelancer_signed_at IS NOT NULL OR employer_signed_at IS NOT NULL)
AND NOT (freelancer_signed_at IS NOT NULL AND employer_signed_at IS NOT NULL)
AND status != 'partially_signed';
```

- [ ] Count is `0` — all partially signed agreements have correct status

```sql
-- Unsigned agreements should have status = 'draft'
SELECT COUNT(*) FROM agreements
WHERE freelancer_signed_at IS NULL
AND employer_signed_at IS NULL
AND status != 'draft';
```

- [ ] Count is `0` — all unsigned agreements have `draft` status

### V1.3 — `contract_redlining` in `TokenFeature`

```bash
grep "contract_redlining" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] `'contract_redlining'` is present in the `TokenFeature` union type

### V1.4 — `industryTemplates.ts` Created

```bash
cat artifacts/api-server/src/lib/industryTemplates.ts
```

- [ ] File exists with all 6 industry keys: `general`, `software_development`, `design_creative`, `marketing_content`, `consulting_strategy`, `data_analytics`
- [ ] `general` maps to an empty array
- [ ] All other industries have 3 clause entries each
- [ ] `buildIndustrySection`, `buildCustomClausesSection`, `sanitiseClause` are exported

---

## Phase 2 Validation — Backend API

### V2.1 — Agreement Generation: Industry Param (Happy Path)

```bash
curl -X POST http://localhost:8080/api/agreements \
  -H "Authorization: Bearer <employer_clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"<valid_id>","industry":"software_development"}'
```

- [ ] Returns `HTTP 201` — agreement generated successfully
- [ ] Agreement content contains IP/source code related language (AI incorporated the template)

### V2.2 — Agreement Generation: Default Industry (No Param)

```bash
curl -X POST http://localhost:8080/api/agreements \
  -H "Authorization: Bearer <employer_clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"<valid_id>"}'
```

- [ ] Returns `HTTP 201` — existing behaviour preserved unchanged
- [ ] No industry-specific clauses injected

### V2.3 — Agreement Generation: Custom Clauses (Enterprise)

```bash
# As enterprise employer
curl -X POST http://localhost:8080/api/agreements \
  -H "Authorization: Bearer <enterprise_employer_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId":"<valid_id>",
    "industry":"consulting_strategy",
    "customClauses":["Payment will be made within 7 days of milestone approval via bank transfer.","All deliverables must be reviewed and approved within 5 business days of submission."]
  }'
```

- [ ] Returns `HTTP 201`
- [ ] Generated agreement contains language reflecting the custom clauses

### V2.4 — Agreement Generation: Custom Clauses Blocked for Non-Enterprise

```bash
# As growth employer (not enterprise)
curl -X POST http://localhost:8080/api/agreements \
  -H "Authorization: Bearer <growth_employer_token>" \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"<valid_id>","customClauses":["Some clause here with enough characters to pass length validation."]}'
```

- [ ] Returns `HTTP 403`
- [ ] Response: `{ "code": "PLAN_LIMIT", "planNeeded": "employer_enterprise" }`

### V2.5 — Agreement Generation: Clause Validation

```bash
# Clause too short (< 20 chars)
curl -X POST http://localhost:8080/api/agreements \
  -H "Authorization: Bearer <enterprise_employer_token>" \
  -d '{"bookingId":"<id>","customClauses":["Too short"]}'
```
- [ ] Returns `HTTP 400`, `code: "CLAUSE_TOO_SHORT"`

```bash
# More than 5 clauses
curl -X POST http://localhost:8080/api/agreements \
  -H "Authorization: Bearer <enterprise_employer_token>" \
  -d '{"bookingId":"<id>","customClauses":["clause 1 with enough chars","clause 2 with enough chars","clause 3 with enough chars","clause 4 with enough chars","clause 5 with enough chars","clause 6 with enough chars"]}'
```
- [ ] Returns `HTTP 400`

### V2.6 — `estimatedRedlineTokens` on GET Agreement

```bash
curl http://localhost:8080/api/agreements/<id> \
  -H "Authorization: Bearer <employer_clerk_token>"
```

- [ ] Response includes `estimatedRedlineTokens` (integer > 0)
- [ ] Response includes `status` field with one of the 4 allowed values

### V2.7 — Redline Endpoint: Auth Guards

```bash
# No auth
curl -X POST http://localhost:8080/api/agreements/<id>/redline
```
- [ ] Returns `HTTP 401`

```bash
# Freelancer token
curl -X POST http://localhost:8080/api/agreements/<id>/redline \
  -H "Authorization: Bearer <freelancer_clerk_token>"
```
- [ ] Returns `HTTP 403`

### V2.8 — Redline Endpoint: Plan Guard

```bash
# Starter employer
curl -X POST http://localhost:8080/api/agreements/<id>/redline \
  -H "Authorization: Bearer <starter_employer_token>"
```
- [ ] Returns `HTTP 402`
- [ ] Response: `{ "code": "PLAN_LIMIT", "planNeeded": "employer_growth" }`

### V2.9 — Redline Endpoint: Signature Guard

Set an agreement to have at least one signature, then try to redline:

```sql
UPDATE agreements SET freelancer_signed_at = NOW() WHERE id = '<test_id>';
```

```bash
curl -X POST http://localhost:8080/api/agreements/<test_id>/redline \
  -H "Authorization: Bearer <growth_employer_token>"
```
- [ ] Returns `HTTP 409`
- [ ] Response: `{ "code": "AGREEMENT_SIGNED" }`

Reset: `UPDATE agreements SET freelancer_signed_at = NULL WHERE id = '<test_id>';`

### V2.10 — Redline Endpoint: Happy Path

With an unsigned agreement, Growth/Enterprise employer:

```bash
curl -X POST http://localhost:8080/api/agreements/<id>/redline \
  -H "Authorization: Bearer <growth_employer_token>"
```

- [ ] Returns `HTTP 200`
- [ ] Response: `{ "suggestions": [...] }` — array of 0–10 items
- [ ] Each suggestion has `clauseNumber`, `originalText`, `suggestedText`, `reason`
- [ ] `token_usage` table has new row with `feature = 'contract_redlining'`

### V2.11 — Accept-Redline: Atomic Transaction

```bash
curl -X PATCH http://localhost:8080/api/agreements/<id>/accept-redline \
  -H "Authorization: Bearer <growth_employer_token>" \
  -H "Content-Type: application/json" \
  -d '{"newContent":"<updated agreement text>"}'
```

- [ ] Returns `HTTP 200 { "success": true, "status": "redlined" }`
- [ ] `agreements.content` updated to new content
- [ ] `agreements.freelancerSignedAt` is null
- [ ] `agreements.employerSignedAt` is null
- [ ] `agreements.status` = `'redlined'`

Verify atomicity: simulate a DB error mid-transaction (or inspect the transaction in logs) and confirm NEITHER update was committed on failure.

### V2.12 — Signing Updates Status Correctly

Sign as freelancer:

```bash
curl -X POST http://localhost:8080/api/agreements/<id>/sign \
  -H "Authorization: Bearer <freelancer_clerk_token>" \
  -d '{"signatureType":"typed","typedName":"Test Freelancer"}'
```

```sql
SELECT status FROM agreements WHERE id = '<id>';
```
- [ ] Status = `'partially_signed'`

Sign as employer:
- [ ] Status = `'fully_signed'`

### V2.13 — Vault Download Guard Blocks Non-`fully_signed`

Manually set a fully-signed agreement back to `redlined`:
```sql
UPDATE agreements SET status = 'redlined' WHERE id = '<id>';
```

```bash
curl http://localhost:8080/api/agreements/<id>/download \
  -H "Authorization: Bearer <employer_clerk_token>"
```
- [ ] Returns `HTTP 403`

Reset: `UPDATE agreements SET status = 'fully_signed' WHERE id = '<id>';`
- [ ] Download now returns `HTTP 200`

### V2.14 — TypeCheck Passes

```bash
pnpm typecheck
```
- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — Industry Selector Visible on Agreement Generation

Navigate to an agreement in draft state as an employer.

- [ ] "Agreement Template" label and `<Select>` visible above the Generate button
- [ ] Default value is `General`
- [ ] All 6 options present in dropdown
- [ ] Helper text visible below selector

### V3.2 — Custom Clauses Panel: Enterprise Only

As a Growth employer:
- [ ] Custom Clauses panel is NOT rendered — no section, no placeholder

As an Enterprise employer:
- [ ] Custom Clauses panel is visible below the industry selector
- [ ] "+ Add Custom Clause" button present

### V3.3 — Custom Clauses Panel: Full Interaction

As Enterprise employer, add clauses:

- [ ] Click "+ Add Custom Clause" → new textarea appears
- [ ] Character counter shows `0/500`
- [ ] Typing less than 20 chars → error `"Clause must be at least 20 characters"` shown
- [ ] Counter turns red when within 20 chars of 500 limit
- [ ] `[×]` removes the clause
- [ ] Adding 5 clauses disables the "+ Add Custom Clause" button
- [ ] Count badge shows `(N of 5)` correctly
- [ ] Generate Agreement button disabled when any clause has an error
- [ ] Tooltip on disabled button: `"Fix clause errors before generating"`

### V3.4 — Industry + Clauses Passed to API

With industry = "Software Development" and 1 custom clause, click Generate:

- [ ] API call to `POST /api/agreements` includes `industry: "software_development"` in request body
- [ ] API call includes `customClauses: [...]` (enterprise only)
- [ ] Without custom clauses, `customClauses` is omitted from the request body

### V3.5 — Redlining Section: Available State

On a draft agreement (no signatures) as a Growth employer:

- [ ] Redlining section visible below agreement content
- [ ] `"🔍 AI Contract Review"` heading present
- [ ] `"Get AI suggestions before signing."` subtitle present
- [ ] Token estimate shown: `"~{N} tokens will be used"`
- [ ] `"Request Redlining ✦"` button present

### V3.6 — Redlining Section: Loading State

Click "Request Redlining":

- [ ] Button shows spinner + `"Analysing contract..."`
- [ ] Button is disabled during loading
- [ ] Chat/page remains usable while loading

### V3.7 — Redlining Section: Suggestions Rendered

After API returns suggestions:

- [ ] `"AI Contract Review · {N} suggestions found"` heading shown
- [ ] Each suggestion card shows: clause number, original text, suggested text (violet border), reason
- [ ] Counter `[N/total]` shown top-right of each card
- [ ] Suggested text box has `border-l-4 border-violet-400 bg-violet-50`

### V3.8 — Skip a Suggestion

Click `[Skip]` on a suggestion:

- [ ] Card fades out and is removed from the list
- [ ] No API call made (network tab shows no new request)
- [ ] Counter updates to remaining count

### V3.9 — Accept a Suggestion

Click `[Accept Change ✓]` on a suggestion:

- [ ] Button shows spinner while request is in flight
- [ ] Card fades out on success
- [ ] Toast appears: `"Agreement updated — both signatures have been reset. Both parties must re-sign."` with 6 second duration
- [ ] Agreement content in the preview updates to new content
- [ ] `status` in the agreement data is now `'redlined'`
- [ ] Signature Reset Warning Banner appears above signature section

### V3.10 — All Suggestions Reviewed

Skip or accept all suggestions:

- [ ] Empty state shows: `"✓ All suggestions reviewed."` + `"The agreement is ready for signing."`
- [ ] CheckCircle icon present in emerald colour

### V3.11 — Redlining Section: Locked State (Starter)

As a Starter employer:

- [ ] Locked state shown: `"🔒 AI Contract Review — Growth plan feature"`
- [ ] `"Upgrade to Growth →"` link navigates to `/pricing`
- [ ] No "Request Redlining" button present

### V3.12 — Redlining Section: Hidden After Signature

Sign the agreement as one party, then reload the page:

- [ ] Redlining section is completely absent from the DOM
- [ ] No empty div or placeholder where it would be

### V3.13 — Signature Reset Warning Banner

After accepting a redline suggestion (status = `redlined`, no signatures):

- [ ] Amber banner visible above signature section: `"⚠ This agreement was revised. Both parties must sign again."`
- [ ] Visible to BOTH employer and freelancer views
- [ ] Banner disappears once both parties have re-signed (`status = 'fully_signed'`)

### V3.14 — Freelancer AI Revision Notice

Log in as the freelancer on a `redlined` agreement:

- [ ] Violet notice shown: `"ℹ This agreement was revised with AI assistance before signing."`
- [ ] NO redlining section, suggestion cards, or Request button visible
- [ ] Freelancer can still sign normally

---

## Security Validation

### S1 — Freelancer Cannot Trigger Redlining

```bash
curl -X POST http://localhost:8080/api/agreements/<id>/redline \
  -H "Authorization: Bearer <freelancer_token>"
```
- [ ] Returns `HTTP 403`

### S2 — Freelancer Cannot Accept Redlines

```bash
curl -X PATCH http://localhost:8080/api/agreements/<id>/accept-redline \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"newContent":"malicious content"}'
```
- [ ] Returns `HTTP 403`

### S3 — Custom Clauses Cannot Override Plan Gate Server-Side

Even if the frontend is modified to send `customClauses` from a non-enterprise account:

```bash
curl -X POST http://localhost:8080/api/agreements \
  -H "Authorization: Bearer <starter_employer_token>" \
  -d '{"bookingId":"<id>","customClauses":["A valid length clause that passes frontend validation checks yes."]}'
```
- [ ] Returns `HTTP 403` regardless of what the frontend sends

### S4 — Vault Inaccessible for Non-`fully_signed` Agreements

Verify the Vault is blocked for `redlined` and `partially_signed` status:

```sql
UPDATE agreements SET status = 'redlined',
freelancer_signed_at = NULL, employer_signed_at = NULL
WHERE id = '<test_id>';
```

```bash
curl http://localhost:8080/api/agreements/<test_id>/download \
  -H "Authorization: Bearer <employer_token>"
```
- [ ] Returns `HTTP 403`

---

## Regression Validation

### R1 — Existing Agreement Generation Unchanged

Generate an agreement without any new params:

- [ ] `POST /api/agreements` with only `bookingId` still works
- [ ] Generated content is identical in quality to pre-feature behaviour
- [ ] No `industry` or `customClauses` fields required

### R2 — Existing Signing Flow Unchanged

Sign an agreement as both parties:

- [ ] `POST /api/agreements/:id/sign` still works for both freelancer and employer
- [ ] Signatures are saved correctly
- [ ] `status` transitions correctly: `draft → partially_signed → fully_signed`

### R3 — Vault Still Works for Fully Signed Agreements

On an agreement where both parties have signed (`status = 'fully_signed'`):

- [ ] `GET /api/agreements/:id/download` returns the download correctly
- [ ] Vault card on the frontend unlocks and shows the download button

### R4 — TypeCheck and Build Pass

```bash
pnpm typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```
- [ ] Zero TypeScript errors
- [ ] Both builds complete without errors

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Database | ⬜ | | |
| Phase 2 — Backend API | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| Security Checks | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

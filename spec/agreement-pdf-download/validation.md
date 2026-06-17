# TalentLock — Validation Guide: Agreement PDF Download

> Run each check in order. Mark ✅ pass or ❌ fail. Fix all failures before marking a phase complete.

---

## Phase 1 Validation — Dependencies & Schema

### V1.1 — `@react-pdf/renderer` Installed

```bash
grep "@react-pdf/renderer" artifacts/api-server/package.json
node -e "require('@react-pdf/renderer'); console.log('ok')" \
  --require tsconfig-paths/register 2>/dev/null || \
  cd artifacts/api-server && node -e "require('@react-pdf/renderer'); console.log('ok')"
```

- [ ] Package present in `package.json`
- [ ] Module resolves without error

### V1.2 — Dancing Script Font Present

```bash
ls -la artifacts/api-server/src/lib/fonts/DancingScript-Regular.ttf
```

- [ ] File exists
- [ ] File size > 0 bytes (not a failed download)

### V1.3 — Signing Timestamp Columns Exist on `agreements`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agreements'
AND column_name IN ('employer_signed_at', 'freelancer_signed_at');
```

- [ ] Both columns exist (or confirmed they existed prior to this feature)
- [ ] Both are nullable timestamptz

### V1.4 — Signing Timestamps Set on Sign Action

Sign an agreement as employer. Check the DB:

```sql
SELECT employer_signed_at, freelancer_signed_at
FROM agreements WHERE id = '<agreement_id>';
```

- [ ] `employer_signed_at` populated after employer signs
- [ ] `freelancer_signed_at` populated after freelancer signs

---

## Phase 2 Validation — Backend

### V2.1 — Unauthenticated Request Blocked

```bash
curl http://localhost:8080/api/agreements/<valid_id>/download
```

- [ ] Returns `HTTP 401`

### V2.2 — Non-Party Blocked

```bash
# A user who is NOT the employer or freelancer on this agreement
curl http://localhost:8080/api/agreements/<agreement_id>/download \
  -H "Authorization: Bearer <unrelated_user_token>"
```

- [ ] Returns `HTTP 403`

### V2.3 — Draft Agreement Blocked

```bash
# Agreement with status = 'draft'
curl http://localhost:8080/api/agreements/<draft_agreement_id>/download \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 403`
- [ ] Body contains `"code": "NOT_FULLY_SIGNED"`

### V2.4 — Partially Signed Agreement Blocked

```bash
# Agreement with one party signed but not the other
curl http://localhost:8080/api/agreements/<partial_id>/download \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 403`, `code: "NOT_FULLY_SIGNED"`

### V2.5 — Happy Path: PDF Downloaded by Employer

```bash
curl -o /tmp/test-agreement.pdf \
  http://localhost:8080/api/agreements/<fully_signed_id>/download \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns `HTTP 200`
- [ ] `Content-Type: application/pdf`
- [ ] `Content-Disposition: attachment; filename="TalentLock-Agreement-{id}-Signed.pdf"`
- [ ] File at `/tmp/test-agreement.pdf` is a valid PDF (not empty, opens in a PDF viewer)
- [ ] PDF is > 5KB (non-trivial content)

### V2.6 — Happy Path: PDF Downloaded by Freelancer

```bash
curl -o /tmp/test-agreement-fl.pdf \
  http://localhost:8080/api/agreements/<fully_signed_id>/download \
  -H "Authorization: Bearer <freelancer_token>"
```

- [ ] Returns `HTTP 200` — both parties can download

### V2.7 — PDF Content Correct

Open the downloaded PDF and verify visually:

- [ ] "TalentLock" wordmark at top of first page
- [ ] "FREELANCE ENGAGEMENT AGREEMENT" title
- [ ] Agreement ID matches the requested ID
- [ ] Generated date shows today's date
- [ ] Employer name and company visible
- [ ] Freelancer name visible
- [ ] Full agreement content rendered across pages
- [ ] No raw markdown symbols visible (`**`, `##`, `*` etc.)
- [ ] Signatures page at the end
- [ ] Both signature images embedded (or cursive names if no image)
- [ ] Signing timestamps present for both parties
- [ ] Page numbers in footer (e.g. "1 / 3")
- [ ] "TalentLock — Agreement {id}" in footer

### V2.8 — GCS Cache: Second Download Does Not Re-Generate

First download generates and caches. Second download:

```bash
# Second request to the same endpoint
curl -o /tmp/test-agreement-2.pdf \
  http://localhost:8080/api/agreements/<fully_signed_id>/download \
  -H "Authorization: Bearer <employer_token>"
```

- [ ] Returns at approximately the same speed as the first (or faster)
- [ ] PDF content identical to first download
- [ ] Server logs show cache hit (no `renderToBuffer` call on second request)

Check GCS:
```bash
gsutil ls gs://<bucket>/agreements/<agreement_id>/signed-agreement.pdf
```

- [ ] Cached PDF exists in GCS

### V2.9 — GCS Upload Failure Does Not Block Download

Temporarily disable GCS write permission (or mock a failure). Download should still succeed:

- [ ] PDF is still returned to the client even if GCS upload fails
- [ ] Server logs show warning: "PDF GCS cache upload failed"
- [ ] HTTP 200 response

### V2.10 — GDPR Deletion Removes Cached PDFs

Complete the GDPR deletion flow for a user who is party to a signed agreement:

```bash
# Trigger deletion
curl -X POST http://localhost:8080/api/account/delete-request \
  -H "Authorization: Bearer <user_token>"

# After deletion processing completes, check GCS
gsutil ls gs://<bucket>/agreements/<agreement_id>/signed-agreement.pdf
```

- [ ] GCS object no longer exists after deletion

### V2.11 — TypeCheck Passes

```bash
pnpm run typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — Download Button Hidden for Non-Fully-Signed

Navigate to `/agreements/:id` for a draft agreement:

- [ ] No "Download Signed Agreement" button visible

Navigate for a partially signed agreement:

- [ ] No download button visible

### V3.2 — Download Button Visible for Fully Signed

Navigate to `/agreements/:id` for a fully signed agreement:

- [ ] Green "↓ Download Signed Agreement" button visible below the agreement header
- [ ] "Signed PDF · TalentLock certified document" label beside the button

### V3.3 — First Download — Loading State

Click the download button on a fully signed agreement with no cached PDF:

- [ ] Button immediately changes to "⟳ Generating PDF..." state
- [ ] Button is disabled (cannot click again)
- [ ] After 1–5 seconds, browser file download dialog appears
- [ ] Downloaded filename: `TalentLock-Agreement-{id}-Signed.pdf`
- [ ] Button returns to ready state after download completes

### V3.4 — Second Download — Near-Instant

Click download again:

- [ ] Loading spinner shows briefly (~200ms)
- [ ] Download begins almost immediately (cache hit)
- [ ] Same file content as first download

### V3.5 — Download Error Handling

Mock a server error (404 or 500) for the download endpoint:

- [ ] Error toast appears: "Download failed. Please try again."
- [ ] Button returns to ready state (not stuck in loading)

### V3.6 — Download Icon on Agreement List

Navigate to `/agreements`:

- [ ] Fully signed agreements show a small download icon (↓) to the right of status badge
- [ ] Draft and partially signed agreements do NOT show the icon
- [ ] Clicking the icon triggers a download without navigating away from the list page
- [ ] The icon shows a spinner while the download is in progress
- [ ] Clicking a second agreement's icon while one is downloading: both work independently

### V3.7 — Both Roles Can Download

Log in as employer on a fully signed agreement:

- [ ] Download button visible and functional

Log in as freelancer on the same agreement:

- [ ] Download button visible and functional
- [ ] Same PDF content (both parties receive identical document)

### V3.8 — Build Passes

```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero errors

---

## PDF Quality Checklist (Visual Inspection)

Run this on the downloaded PDF:

| Check | Expected |
|---|---|
| File opens without error | ✅ |
| Page count | 2+ pages (cover + content + signatures) |
| TalentLock wordmark | Present, top-left, navy colour |
| Agreement title | "FREELANCE ENGAGEMENT AGREEMENT" in bold |
| Agreement ID | Matches the URL ID |
| Employer name | Correct full name from profile |
| Company name | Correct if set |
| Freelancer name | Correct full name |
| Agreement content | All text present, no truncation |
| No raw markdown | No `**`, `##`, `*`, `_` visible in text |
| Signatures page | Last page of document |
| Employer signature | Image or cursive name rendered |
| Freelancer signature | Image or cursive name rendered |
| Signature line | Horizontal rule under each signature |
| Signing dates | Both timestamps present and correct |
| Legal footer text | Present above footer line |
| Footer — every page | "TalentLock — Agreement {id}" + page numbers |
| File size | 50KB–2MB (reasonable for a PDF with images) |

---

## Security Validation

### S1 — Cross-Party Access Blocked

A freelancer from a different agreement cannot download this agreement:

```bash
curl http://localhost:8080/api/agreements/<agreement_id>/download \
  -H "Authorization: Bearer <different_freelancer_token>"
```

- [ ] Returns `HTTP 403`

### S2 — Cached PDF Not Accessible Via Public Storage Endpoint

```bash
# Try to access the cached PDF via the public storage endpoint
curl http://localhost:8080/api/storage/objects/agreements/<agreement_id>/signed-agreement.pdf
```

- [ ] Returns `HTTP 403` or `HTTP 404` — not publicly accessible

### S3 — Content-Disposition Forces Download

Confirm the `Content-Disposition: attachment` header is set:

```bash
curl -I http://localhost:8080/api/agreements/<id>/download \
  -H "Authorization: Bearer <valid_token>"
```

- [ ] `content-disposition: attachment; filename="TalentLock-Agreement-{id}-Signed.pdf"`

---

## Regression Validation

### R1 — Signing Still Works

Sign an agreement through the normal flow:

- [ ] `POST /api/agreements/:id/sign` still returns `HTTP 200`
- [ ] Signatures saved correctly

### R2 — Health Score and Summary Unaffected

```bash
curl -X POST http://localhost:8080/api/agreements/<id>/health-score \
  -H "Authorization: Bearer <token>"
```

- [ ] Returns `HTTP 200` — unaffected by download changes

### R3 — Agreement List Pagination Unaffected

```bash
curl "http://localhost:8080/api/agreements?page=1&pageSize=5" \
  -H "Authorization: Bearer <token>"
```

- [ ] `{ data, total, page, pageSize, totalPages }` shape unchanged

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Dependencies | ⬜ | | |
| Phase 2 — Backend | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| PDF Quality | ⬜ | | |
| Security | ⬜ | | |
| Regression | ⬜ | | |
| **Feature Complete** | ⬜ | | |

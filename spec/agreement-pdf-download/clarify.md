# TalentLock — Clarification & Verification: Agreement PDF Download

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `GET /api/agreements/:id/download` route already exists in `agreements.ts` | Confirmed in `project.md` |
| Route is already access-controlled by `AuthHardening` (party verification) | Confirmed — listed in gated routes |
| `agreements.status` has `fully_signed` as a final state | Confirmed — signing feature exists |
| `agreements.freelancerSignatureImageUrl` column exists | Confirmed in `project.md` schema |
| `agreements.employerSignatureImageUrl` column exists | Confirmed in `project.md` schema |
| `agreements.content` column exists (confirmed during AI Contract Health Score) | Confirmed |
| GCS object storage already in use for documents and signature images | Confirmed — `POST /api/storage/uploads/request-url` and `GET /api/storage/objects/*path` |
| `POST /api/storage/uploads/request-url` is auth-gated with namespaced paths | Confirmed — AuthHardening |
| Both employer and freelancer profile data available for metadata block | Confirmed |
| `canAccessAgreement()` already exists in `accessControl.ts` | Confirmed — reuse directly |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — What Does the Current `GET /api/agreements/:id/download` Actually Return?

**Question:** The route exists. Does it currently return:
- **(A)** Raw text/plain content
- **(B)** A redirect to the GCS stored agreement file
- **(C)** A JSON response with the agreement content
- **(D)** A 501 Not Implemented stub

**Impact:** If (A) or (C), we are replacing the response. If (D), we are implementing from scratch. If (B), we need to understand the GCS path structure.

**Recommendation:**
```bash
grep -A 30 "download" artifacts/api-server/src/routes/agreements.ts | head -40
```

---

### Q2 — PDF Library Choice: `puppeteer` vs `@react-pdf/renderer` vs `pdfkit`

**Question:** Three realistic options for server-side PDF generation:

| Library | Pros | Cons |
|---|---|---|
| `puppeteer` | Full HTML/CSS rendering, pixel-perfect layout, easy signature image embedding | 300MB+ Chromium download, slow cold start, memory intensive |
| `@react-pdf/renderer` | React-based, lightweight, good for structured documents | Limited CSS support, no HTML input (must use React components) |
| `pdfkit` | Lightweight, pure Node.js, fast | Manual layout (x,y coordinates), verbose code |

**Impact:** The choice affects install size, cold start time, and how the agreement content (which is stored as raw text/markdown) is rendered.

**Recommendation:** `@react-pdf/renderer` (also known as `react-pdf`). Reasons:
- Lightweight compared to puppeteer (no Chromium)
- Works well with structured documents like legal agreements
- Good image embedding support for signature images
- The agreement content is text-based — no complex HTML needed
- Already in a React monorepo — consistent tooling

Reject `puppeteer` for serverless/production: 300MB Chromium binary is too heavy for a server that also runs Express, OpenAI calls, and database queries.

---

### Q3 — Where Are Signing Timestamps Stored?

**Question:** The PDF must show when each party signed. Are `employerSignedAt` and `freelancerSignedAt` columns on the `agreements` table, or is this derived from audit logs?

**Impact:** If timestamps exist as columns, straightforward to include. If not, they must be added as part of this feature.

**Recommendation:**
```bash
grep -A 60 "agreements\s*=" lib/db/src/schema/*.ts | grep -i "signed\|sign_at\|signed_at"
```

If columns are missing, add `employerSignedAt` and `freelancerSignedAt` (nullable timestamptz) to `agreements`. Set them when `POST /api/agreements/:id/sign` runs.

---

### Q4 — Where Are Employer Name and Freelancer Name Stored?

**Question:** The PDF metadata block needs "Employer: Acme Corp (John Smith)" and "Freelancer: Sarah Chen". Where does this come from?

**Options:**
- **(A)** `employer_profiles.companyName` + `users.firstName + users.lastName`
- **(B)** Stored directly on `agreements` at generation time (snapshot)
- **(C)** Derived at download time by joining through `bookings` → `employer_profiles` / `freelancer_profiles`

**Recommendation:** Option C — derive at download time by joining through the booking. The names may change over time but for the PDF we want the current profile name. If the employer changed their company name after signing, the PDF should reflect what they are called now (not a historical snapshot). The agreement content itself captures the historical terms.

---

### Q5 — GCS Path Structure for Cached PDFs

**Question:** The feature proposes storing cached PDFs at `agreements/{agreementId}/signed-agreement.pdf`. Is this consistent with the existing GCS path structure?

**Current paths (from AuthHardening):** `uploads/{userId}/...` for user-uploaded files.

**Recommendation:** Use `agreements/{agreementId}/signed-agreement.pdf` as a separate namespace from user uploads. This path is not user-accessible via the public storage endpoints — it is generated server-side and served only via the download endpoint. The path does not need to be namespaced by userId because the access control is at the route level, not the GCS object level.

---

### Q6 — What Happens If a Signature Image URL Is Invalid or the Image Has Been Deleted?

**Question:** `agreements.freelancerSignatureImageUrl` stores a GCS path. If the image was deleted from GCS (e.g. after a GDPR deletion request), the PDF generation would fail when trying to embed the image.

**Recommendation:** Graceful fallback: if the signature image fails to load (404 or network error), render a placeholder showing the typed name in cursive font + "Signature on file at time of signing" note. Never fail the PDF generation due to a missing signature image.

---

### Q7 — Does the Existing Download Route Handle the `Content-Disposition` Header?

**Question:** For a browser to trigger a file download (not open the PDF in a new tab), the response must include `Content-Disposition: attachment`. Does the current handler set this?

**Recommendation:** Inspect the current handler (from Q1 inspection). If not set, add it as part of this implementation. Always set:
```ts
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition', `attachment; filename="TalentLock-Agreement-${agreementId}-Signed.pdf"`);
res.setHeader('Cache-Control', 'private, max-age=86400');
```

---

## ⚠️ Risks & Notes

### Risk 1 — First-Download Latency

PDF generation for a long agreement (2,000 words + 2 signature images) may take 2–5 seconds on first request. This is acceptable for a one-time generation but must be communicated in the UI (loading spinner, not just a dead button click).

### Risk 2 — `@react-pdf/renderer` Content Formatting

`agreements.content` is stored as raw text (likely with newlines and possibly some markdown-style formatting). `@react-pdf/renderer` renders JSX components, not HTML. The content must be split into paragraphs and mapped to `<Text>` components. Long words without spaces may overflow the PDF column. Test with a real agreement before finalising.

### Risk 3 — GCS Write Permission for Server

The server currently reads from GCS and generates presigned URLs for client uploads. Writing a server-generated file to GCS requires the service account to have `storage.objects.create` permission. Confirm GCS credentials include this permission before Phase 2.

```bash
# Test write permission
gsutil cp /tmp/test.txt gs://your-bucket/test/test.txt
```

### Risk 4 — GDPR Deletion and Cached PDFs

After a GDPR account deletion, the user's data should be anonymised. But a cached PDF at `agreements/{agreementId}/signed-agreement.pdf` may contain the deleted user's name, company, and signature image. 

**Decision:** When `POST /api/account/delete-request` processes a deletion, also delete any cached PDFs for agreements where this user was a party. Add to `accountDeletion.ts`: delete all `agreements/{agreementId}/signed-agreement.pdf` objects for agreements where the deleted user was employer or freelancer.

### Risk 5 — Agreement Content Is Plain Text, Not Structured

If `agreements.content` contains any markdown symbols (`**bold**`, `# Heading`, etc.) from the AI generation, the PDF must strip them or render them appropriately. `@react-pdf/renderer` does not render markdown — a lightweight markdown-to-plain-text strip is needed before passing to the PDF renderer.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | What does the current download handler return? | Task 2.1 (decide whether to replace or extend) |
| Q2 | PDF library choice | Task 1.1 (install dependency) |
| Q3 | Signing timestamps exist on agreements? | Task 1.2 (schema migration if missing) |
| Q5 | GCS write permission for server | Task 2.2 (PDF upload to GCS) |

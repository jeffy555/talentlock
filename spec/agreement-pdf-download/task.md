# TalentLock — Task Breakdown: Agreement PDF Download

## Summary

Three phases: Dependencies + optional schema (signing timestamps) → Backend (PDF utils, download handler replacement, GDPR update) → Frontend (download button and list icon). No new route — the existing `GET /api/agreements/:id/download` is replaced with a full PDF implementation.

---

## Phase 1 — Dependencies & Schema

### Task 1.1 — Codebase Inspection

Run all inspection commands from `plan.md`. Document and confirm:
- What the current download handler returns (stub, text, redirect, or 501)
- Whether `employerSignedAt` / `freelancerSignedAt` columns exist on `agreements`
- Exact column names for `employerSignatureImageUrl`, `freelancerSignatureImageUrl`
- Whether `typedName` is stored on `agreements` per party (or just the signature URL)
- GCS client availability and write permission in the api-server package
- Whether `@react-pdf/renderer` is already installed

### Task 1.2 — Install `@react-pdf/renderer`

**File:** `artifacts/api-server/package.json`

```bash
pnpm --filter @workspace/api-server add @react-pdf/renderer
pnpm --filter @workspace/api-server add react react-dom  # if not already present
pnpm --filter @workspace/api-server add -D @types/react @types/react-dom
```

Verify the package installed:
```bash
grep "@react-pdf" artifacts/api-server/package.json
```

### Task 1.3 — Download Dancing Script Font

```bash
mkdir -p artifacts/api-server/src/lib/fonts
curl -o artifacts/api-server/src/lib/fonts/DancingScript-Regular.ttf \
  "https://fonts.gstatic.com/s/dancingscript/v25/If2cXTr6YS-zF4S-kcSWSVi_sxjsohD9F50Ruu7BMSo3Sup9.ttf"
```

Verify file exists and is non-zero:
```bash
ls -la artifacts/api-server/src/lib/fonts/DancingScript-Regular.ttf
```

### Task 1.4 — Add Signing Timestamp Columns (If Missing)

**File:** `lib/db/src/schema/` — agreements table

Only if Task 1.1 inspection confirms these columns do not exist:

```ts
employerSignedAt:   timestamp('employer_signed_at',   { withTimezone: true }),
freelancerSignedAt: timestamp('freelancer_signed_at',  { withTimezone: true }),
```

**File:** `artifacts/api-server/src/routes/agreements.ts` — `POST /:id/sign` handler

Add timestamp update alongside the existing signature URL update:
```ts
// When setting employer signature:
employerSignedAt: new Date(),

// When setting freelancer signature:
freelancerSignedAt: new Date(),
```

### Task 1.5 — Run Migration (if Task 1.4 ran)

```bash
pnpm --filter @workspace/db run push
```

Verify:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'agreements'
AND column_name IN ('employer_signed_at', 'freelancer_signed_at');
```

---

## Phase 2 — Backend

### Task 2.1 — Create `agreementPdfUtils.ts`

**File:** `artifacts/api-server/src/lib/agreementPdfUtils.ts` (create new)

Implement the complete utility file:

1. `preprocessAgreementContent(content: string): string[]` — strips markdown, splits to paragraphs (exact implementation from `plan.md`)
2. `formatSignedAt(date: Date | null): string` — formats as "June 10, 2026 at 14:32 UTC"
3. `AgreementPdfData` interface (exact from `plan.md`)
4. Font registration for Dancing Script
5. PDF styles object
6. `AgreementPdf` React component (exact from `plan.md`)
7. `generateAgreementPdf(data: AgreementPdfData): Promise<Buffer>` — calls `renderToBuffer`

```ts
export async function generateAgreementPdf(data: AgreementPdfData): Promise<Buffer> {
  const React = await import('react');
  const { renderToBuffer } = await import('@react-pdf/renderer');
  return renderToBuffer(React.createElement(AgreementPdf, { data }));
}
```

### Task 2.2 — Replace `GET /:id/download` Handler

**File:** `artifacts/api-server/src/routes/agreements.ts`

Replace the existing handler entirely. The new handler:

```ts
router.get('/:id/download', requireAuth, async (req, res) => {
  const { id: agreementId } = req.params;
  const { internalUserId } = req.auth;

  // 1. Fetch agreement
  const agreement = await db.query.agreements.findFirst({
    where: eq(agreements.id, agreementId),
  });
  if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

  // 2. Party verification (reuse canAccessAgreement from accessControl.ts)
  const hasAccess = await canAccessAgreement(internalUserId, agreementId, db);
  if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });

  // 3. Must be fully signed
  if (agreement.status !== 'fully_signed') {
    return res.status(403).json({
      error: 'Agreement must be fully signed before downloading',
      code: 'NOT_FULLY_SIGNED',
    });
  }

  // 4. Check GCS cache
  const gcsPath = `agreements/${agreementId}/signed-agreement.pdf`;
  const gcsFile = gcsClient.bucket(process.env.GCS_BUCKET_NAME).file(gcsPath);

  let pdfBuffer: Buffer;

  const [exists] = await gcsFile.exists();
  if (exists) {
    // Serve from cache
    const [cachedBuffer] = await gcsFile.download();
    pdfBuffer = cachedBuffer;
  } else {
    // Build PDF data
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, agreement.bookingId),
    });
    // Resolve party data (see plan.md Q4)
    const [employerUser, freelancerUser] = await Promise.all([
      db.query.users.findFirst({ where: eq(users.id, booking.employerId) }),
      db.query.users.findFirst({ where: eq(users.id, booking.freelancerId) }),
    ]);
    const [employerProfile, freelancerProfile] = await Promise.all([
      db.query.employerProfiles.findFirst({ where: eq(employerProfiles.userId, booking.employerId) }),
      db.query.freelancerProfiles.findFirst({ where: eq(freelancerProfiles.userId, booking.freelancerId) }),
    ]);

    const pdfData: AgreementPdfData = {
      agreementId,
      generatedAt: new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
      employerDisplayName: `${employerUser?.firstName ?? ''} ${employerUser?.lastName ?? ''}`.trim(),
      employerCompany: employerProfile?.companyName ?? '',
      employerSignatureUrl: agreement.employerSignatureImageUrl ?? null,
      employerTypedName: null, // adjust if typedName stored separately
      employerSignedAt: formatSignedAt(agreement.employerSignedAt),
      freelancerDisplayName: `${freelancerUser?.firstName ?? ''} ${freelancerUser?.lastName ?? ''}`.trim(),
      freelancerField: freelancerProfile?.fieldOfWork ?? '',
      freelancerSignatureUrl: agreement.freelancerSignatureImageUrl ?? null,
      freelancerTypedName: null,
      freelancerSignedAt: formatSignedAt(agreement.freelancerSignedAt),
      contentParagraphs: preprocessAgreementContent(agreement.content ?? ''),
    };

    pdfBuffer = await generateAgreementPdf(pdfData);

    // Upload to GCS (best-effort — don't fail if upload fails)
    gcsFile.save(pdfBuffer, { contentType: 'application/pdf' })
      .catch(err => req.log.warn({ err, agreementId }, 'PDF GCS cache upload failed'));
  }

  // 5. Stream to client
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="TalentLock-Agreement-${agreementId}-Signed.pdf"`);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Content-Length', pdfBuffer.length);
  res.end(pdfBuffer);
});
```

### Task 2.3 — Update `accountDeletion.ts` for GDPR

**File:** `artifacts/api-server/src/lib/accountDeletion.ts`

After anonymising the user's data (inside the existing GDPR deletion flow), add cached PDF deletion:

```ts
// After the Drizzle anonymisation transaction and Clerk deletion:
// Find all agreements where this user was a party
const userAgreements = await db.query.agreements.findMany({
  // Join condition depends on schema — find agreements via bookings
  // where booking.employerId === userId or booking.freelancerId === userId
});

// Delete cached PDFs
await Promise.allSettled(
  userAgreements.map(agr => {
    const gcsPath = `agreements/${agr.id}/signed-agreement.pdf`;
    return gcsClient.bucket(process.env.GCS_BUCKET_NAME).file(gcsPath)
      .delete({ ignoreNotFound: true });
  })
);
```

### Task 2.4 — TypeCheck

```bash
pnpm run typecheck
```

Fix all TypeScript errors before Phase 3.

---

## Phase 3 — Frontend

### Task 3.1 — Download Button on `/agreements/:id`

**File:** `artifacts/talentlock/src/pages/AgreementDetail.tsx`

Add the download button. It appears only when `agreement.status === 'fully_signed'`.

```tsx
// State
const [isDownloading, setIsDownloading] = useState(false);

const handleDownload = async () => {
  setIsDownloading(true);
  try {
    const response = await fetch(`/api/agreements/${agreement.id}/download`, {
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TalentLock-Agreement-${agreement.id}-Signed.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    toast.error('Download failed. Please try again.');
  } finally {
    setIsDownloading(false);
  }
};
```

**DOM placement** (enforced order):
```
[Agreement header — title, parties, status badge]
[Download button]                                    ← NEW, only when fully_signed
[Agreement content]
[Redline suggestions]
[Health Score Card]
[Agreement Summary Panel]
[Signing section]                                    ← hidden after fully_signed
```

Button:
```tsx
{agreement.status === 'fully_signed' && (
  <Button
    onClick={handleDownload}
    disabled={isDownloading}
    variant="outline"
    size="sm"
    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
  >
    {isDownloading ? (
      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating PDF...</>
    ) : (
      <><Download className="h-4 w-4 mr-1.5" />Download Signed Agreement</>
    )}
  </Button>
)}
```

### Task 3.2 — Download Icon on `/agreements` List

**File:** `artifacts/talentlock/src/pages/Agreements.tsx`

For each `fully_signed` agreement in the list, add a small download icon button:

```tsx
{agreement.status === 'fully_signed' && (
  <button
    title="Download signed PDF"
    onClick={() => handleListDownload(agreement.id)}
    className="text-slate-400 hover:text-emerald-600 transition-colors"
  >
    <Download className="h-4 w-4" />
  </button>
)}
```

`handleListDownload` uses the same download logic as the detail page (extracted into a shared `downloadAgreementPdf(id, getToken)` utility in `src/lib/downloadUtils.ts`).

---

## Acceptance Criteria

- [ ] `@react-pdf/renderer` installed in api-server package
- [ ] Dancing Script font file present at `artifacts/api-server/src/lib/fonts/DancingScript-Regular.ttf`
- [ ] `preprocessAgreementContent()` strips markdown symbols and returns paragraph array
- [ ] `agreementPdfUtils.ts` exports `generateAgreementPdf()`, `preprocessAgreementContent()`, `formatSignedAt()`
- [ ] `GET /api/agreements/:id/download` returns `403` when `status !== 'fully_signed'` with `code: 'NOT_FULLY_SIGNED'`
- [ ] Returns `403` when requesting user is not a party
- [ ] Returns `404` when agreement not found
- [ ] Response has `Content-Type: application/pdf`
- [ ] Response has `Content-Disposition: attachment; filename="TalentLock-Agreement-{id}-Signed.pdf"`
- [ ] PDF contains agreement content rendered as paragraphs
- [ ] PDF contains metadata block (agreement ID, generated date, employer, freelancer)
- [ ] PDF signatures page renders employer signature image OR cursive typed name
- [ ] PDF signatures page renders freelancer signature image OR cursive typed name
- [ ] PDF signatures page shows signing timestamps for both parties
- [ ] PDF footer shows "TalentLock — Agreement {id}" and page numbers on every page
- [ ] Missing signature image falls back to typed name without crashing
- [ ] GCS cache checked before regenerating — second download does not re-generate
- [ ] GCS upload failure does not fail the download (best-effort)
- [ ] GDPR deletion deletes cached PDFs for all agreements of the deleted user
- [ ] Download button visible on `/agreements/:id` only when `fully_signed`
- [ ] Loading state shows "Generating PDF..." on first download
- [ ] Triggers browser file download (not navigation to new tab)
- [ ] Download icon on agreements list for `fully_signed` agreements
- [ ] Signing timestamp columns exist on `agreements` table (added or confirmed)
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 (install) → 1.3 (font) → 1.4+1.5 (schema, if needed)
Task 2.1 (utils) → 2.2 (handler) → 2.3 (GDPR) → 2.4 (typecheck)
Task 3.1 (detail page) → 3.2 (list page)
```

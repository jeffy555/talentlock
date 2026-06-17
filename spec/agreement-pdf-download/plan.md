# TalentLock — Implementation Plan: Agreement PDF Download

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Run all of these before writing any code. Document every finding.

```bash
# 1. What does the current download handler return?
grep -A 40 "'/:id/download'\|\"/:id/download\"\|download" \
  artifacts/api-server/src/routes/agreements.ts | head -50

# 2. Check agreements schema for signing timestamp columns
grep -A 80 "agreements\s*=" lib/db/src/schema/*.ts | \
  grep -i "signed\|sign_at\|signed_at\|employer_sign\|freelancer_sign"

# 3. Check agreements schema for employer/freelancer party columns
grep -A 80 "agreements\s*=" lib/db/src/schema/*.ts | \
  grep -i "employer\|freelancer\|booking"

# 4. Check exact column names for signature URLs
grep -A 80 "agreements\s*=" lib/db/src/schema/*.ts | \
  grep -i "signature\|sign_img\|signatureUrl"

# 5. Check GCS client usage in the codebase
grep -rn "Storage\|@google-cloud/storage\|gcs\|GCS" \
  artifacts/api-server/src/ | head -10

# 6. Check if @react-pdf/renderer is already installed
grep "react-pdf\|@react-pdf" package.json artifacts/api-server/package.json 2>/dev/null

# 7. Check what typedName looks like on agreements
grep -A 80 "agreements\s*=" lib/db/src/schema/*.ts | \
  grep -i "typed\|name\|employer_name\|freelancer_name"
```

---

## Resolved Questions

---

### Q1 — Current Download Handler

**Decision: Inspect first. Replace whatever is there with the full PDF implementation.**

After inspection, document what the current handler returns (stub, text, redirect). The new implementation completely replaces it with proper PDF generation. The route signature `GET /api/agreements/:id/download` stays the same — no API contract change needed.

---

### Q2 — PDF Library Choice

**Decision: `@react-pdf/renderer` (package: `@react-pdf/renderer`).**

Install server-side:
```bash
pnpm --filter @workspace/api-server add @react-pdf/renderer
```

Also install `react` and `react-dom` as peer deps if not already present in the api-server package.

For the cursive font (typed name rendering), download and bundle **Dancing Script** from Google Fonts:
```bash
# Download to artifacts/api-server/src/lib/fonts/
curl -o artifacts/api-server/src/lib/fonts/DancingScript-Regular.ttf \
  "https://fonts.gstatic.com/s/dancingscript/v25/If2cXTr6YS-zF4S-kcSWSVi_sxjsohD9F50Ruu7BMSo3Sup9.ttf"
```

Register the font in the PDF utils file:
```ts
import { Font } from '@react-pdf/renderer';
Font.register({
  family: 'DancingScript',
  src: path.join(__dirname, 'fonts/DancingScript-Regular.ttf'),
});
```

---

### Q3 — Signing Timestamps

**Decision: Inspect first. Add columns if missing.**

If `employerSignedAt` and `freelancerSignedAt` do NOT exist on `agreements`:

```ts
// Add to agreements table in lib/db/src/schema/
employerSignedAt:    timestamp('employer_signed_at',    { withTimezone: true }),
freelancerSignedAt:  timestamp('freelancer_signed_at',  { withTimezone: true }),
```

Both nullable. When `POST /api/agreements/:id/sign` sets the signature, also set the corresponding timestamp:
```ts
// In the sign handler — add alongside the signature URL update
employerSignedAt: userRole === 'employer' ? new Date() : undefined,
freelancerSignedAt: userRole === 'freelancer' ? new Date() : undefined,
```

If timestamps already exist under different names, use those names.

---

### Q4 — Party Names

**Decision: Option C — derive at download time by joining through booking.**

```ts
// In the download handler, after fetching the agreement:
const booking = await db.query.bookings.findFirst({
  where: eq(bookings.id, agreement.bookingId),
});

const [employerUser, freelancerUser] = await Promise.all([
  db.query.users.findFirst({ where: eq(users.id, booking.employerId) }),
  db.query.users.findFirst({ where: eq(users.id, booking.freelancerId) }),
]);

const employerProfile = await db.query.employerProfiles.findFirst({
  where: eq(employerProfiles.userId, booking.employerId),
});
const freelancerProfile = await db.query.freelancerProfiles.findFirst({
  where: eq(freelancerProfiles.userId, booking.freelancerId),
});

const employerDisplayName = `${employerUser?.firstName ?? ''} ${employerUser?.lastName ?? ''}`.trim();
const employerCompany = employerProfile?.companyName ?? '';
const freelancerDisplayName = `${freelancerUser?.firstName ?? ''} ${freelancerUser?.lastName ?? ''}`.trim();
const freelancerField = freelancerProfile?.fieldOfWork ?? '';
```

Adjust column names to match the actual schema from inspection.

---

### Q5 — GCS Path for Cached PDFs

**Decision: `agreements/{agreementId}/signed-agreement.pdf`**

This path is separate from user upload paths (`uploads/{userId}/...`). It is not accessible via the public storage endpoint. Only served through `GET /api/agreements/:id/download` after party verification.

---

### Q6 — Missing Signature Image Fallback

**Decision: Graceful fallback — never fail PDF generation.**

```ts
// In the PDF component
function SignatureBlock({ imageUrl, typedName, displayName, role, signedAt }) {
  const [imageLoaded, setImageLoaded] = useState(true);

  // If imageUrl is present, try to render it
  // If typed name only, render in DancingScript font
  // If image fails to load, fall back to typed name
  return (
    <View style={styles.signatureBlock}>
      {imageUrl && imageLoaded ? (
        <Image src={imageUrl} style={styles.signatureImage}
          onError={() => setImageLoaded(false)} />
      ) : (
        <Text style={styles.signatureCursive}>{typedName || displayName}</Text>
      )}
      <Text style={styles.signatureLine}>_______________________</Text>
      <Text style={styles.signatureName}>{displayName}</Text>
      {role === 'employer' && <Text style={styles.signatureRole}>{companyName}</Text>}
      {role === 'freelancer' && <Text style={styles.signatureRole}>{fieldOfWork}</Text>}
      <Text style={styles.signatureDate}>Signed: {formatSignedAt(signedAt)}</Text>
    </View>
  );
}
```

---

### Q7 — Content-Disposition Header

**Decision: Always set all three headers.**

```ts
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition',
  `attachment; filename="TalentLock-Agreement-${agreementId}-Signed.pdf"`);
res.setHeader('Cache-Control', 'private, max-age=86400');
```

---

## Content Preprocessing

Agreement content stored in the database may contain markdown-style formatting from the AI generator. Strip before passing to the PDF renderer:

```ts
// In artifacts/api-server/src/lib/agreementPdfUtils.ts

export function preprocessAgreementContent(content: string): string[] {
  return content
    .replace(/^#{1,6}\s+/gm, '')          // Remove heading markers
    .replace(/\*\*(.+?)\*\*/g, '$1')      // Remove bold markers
    .replace(/\*(.+?)\*/g, '$1')          // Remove italic markers
    .replace(/^[-*+]\s+/gm, '• ')        // Convert list markers to bullets
    .replace(/\r\n/g, '\n')               // Normalise line endings
    .split('\n\n')                         // Split into paragraphs
    .map(p => p.trim())
    .filter(p => p.length > 0);           // Remove empty paragraphs
}
```

---

## PDF React Component (Complete Structure)

```tsx
// artifacts/api-server/src/lib/agreementPdfTemplate.tsx

import React from 'react';
import {
  Document, Page, Text, View, Image, StyleSheet, Font
} from '@react-pdf/renderer';
import path from 'path';

Font.register({
  family: 'DancingScript',
  src: path.join(__dirname, 'fonts/DancingScript-Regular.ttf'),
});

const styles = StyleSheet.create({
  page: { padding: 60, fontFamily: 'Helvetica', fontSize: 10, color: '#1F2937' },
  header: { marginBottom: 24, borderBottom: '2pt solid #1E3A5F', paddingBottom: 16 },
  logoText: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#1E3A5F', marginBottom: 4 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  metaSection: { marginBottom: 8 },
  metaLabel: { fontSize: 9, color: '#6B7280', fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  metaValue: { fontSize: 10, marginBottom: 4 },
  divider: { borderBottom: '1pt solid #E5E7EB', marginVertical: 16 },
  contentSection: { marginBottom: 8 },
  paragraph: { fontSize: 10, lineHeight: 1.6, marginBottom: 8, color: '#374151' },
  signaturePage: { padding: 60 },
  signaturesHeading: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 24, color: '#1E3A5F' },
  signaturesRow: { flexDirection: 'row', justifyContent: 'space-between' },
  signatureBlock: { width: '45%' },
  signatureRoleLabel: { fontSize: 9, color: '#6B7280', fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  signatureImage: { width: 160, height: 60, objectFit: 'contain', marginBottom: 4 },
  signatureCursive: { fontFamily: 'DancingScript', fontSize: 22, marginBottom: 4, color: '#1F2937' },
  signatureLine: { borderBottom: '1pt solid #9CA3AF', marginBottom: 6 },
  signatureName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  signatureRole: { fontSize: 9, color: '#6B7280', marginBottom: 2 },
  signatureDate: { fontSize: 9, color: '#6B7280' },
  footer: { position: 'absolute', bottom: 30, left: 60, right: 60,
            borderTop: '1pt solid #E5E7EB', paddingTop: 8,
            flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#9CA3AF' },
  pageNumber: { fontSize: 8, color: '#9CA3AF' },
});

export interface AgreementPdfData {
  agreementId: string;
  generatedAt: string;
  employerDisplayName: string;
  employerCompany: string;
  employerSignatureUrl: string | null;
  employerTypedName: string | null;
  employerSignedAt: string;
  freelancerDisplayName: string;
  freelancerField: string;
  freelancerSignatureUrl: string | null;
  freelancerTypedName: string | null;
  freelancerSignedAt: string;
  contentParagraphs: string[];
}

export function AgreementPdf({ data }: { data: AgreementPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logoText}>TalentLock</Text>
          <Text style={styles.title}>FREELANCE ENGAGEMENT AGREEMENT</Text>
        </View>

        {/* Metadata */}
        <View style={styles.metaSection}>
          <Text style={styles.metaLabel}>AGREEMENT ID</Text>
          <Text style={styles.metaValue}>{data.agreementId}</Text>
        </View>
        <View style={styles.metaSection}>
          <Text style={styles.metaLabel}>GENERATED</Text>
          <Text style={styles.metaValue}>{data.generatedAt}</Text>
        </View>
        <View style={styles.metaSection}>
          <Text style={styles.metaLabel}>EMPLOYER</Text>
          <Text style={styles.metaValue}>
            {data.employerDisplayName}{data.employerCompany ? ` — ${data.employerCompany}` : ''}
          </Text>
        </View>
        <View style={styles.metaSection}>
          <Text style={styles.metaLabel}>FREELANCER</Text>
          <Text style={styles.metaValue}>{data.freelancerDisplayName}</Text>
        </View>
        <View style={styles.divider} />

        {/* Agreement Content */}
        {data.contentParagraphs.map((para, i) => (
          <Text key={i} style={styles.paragraph}>{para}</Text>
        ))}

        {/* Page Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            TalentLock — Agreement {data.agreementId}
          </Text>
          <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          } />
        </View>
      </Page>

      {/* Signatures Page */}
      <Page size="A4" style={styles.signaturePage}>
        <Text style={styles.signaturesHeading}>SIGNATURES</Text>
        <View style={styles.signaturesRow}>
          {/* Employer Signature */}
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureRoleLabel}>EMPLOYER</Text>
            {data.employerSignatureUrl ? (
              <Image src={data.employerSignatureUrl} style={styles.signatureImage} />
            ) : (
              <Text style={styles.signatureCursive}>
                {data.employerTypedName || data.employerDisplayName}
              </Text>
            )}
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>{data.employerDisplayName}</Text>
            {data.employerCompany ? (
              <Text style={styles.signatureRole}>{data.employerCompany}</Text>
            ) : null}
            <Text style={styles.signatureDate}>Signed: {data.employerSignedAt}</Text>
          </View>

          {/* Freelancer Signature */}
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureRoleLabel}>FREELANCER</Text>
            {data.freelancerSignatureUrl ? (
              <Image src={data.freelancerSignatureUrl} style={styles.signatureImage} />
            ) : (
              <Text style={styles.signatureCursive}>
                {data.freelancerTypedName || data.freelancerDisplayName}
              </Text>
            )}
            <View style={styles.signatureLine} />
            <Text style={styles.signatureName}>{data.freelancerDisplayName}</Text>
            {data.freelancerField ? (
              <Text style={styles.signatureRole}>{data.freelancerField}</Text>
            ) : null}
            <Text style={styles.signatureDate}>Signed: {data.freelancerSignedAt}</Text>
          </View>
        </View>

        {/* Legal Footer */}
        <View style={[styles.divider, { marginTop: 48 }]} />
        <Text style={[styles.footerText, { fontSize: 9, color: '#6B7280' }]}>
          This document was generated by TalentLock and constitutes a legally binding agreement
          between the parties named above. Agreement ID: {data.agreementId}
        </Text>
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            TalentLock — Agreement {data.agreementId}
          </Text>
          <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          } />
        </View>
      </Page>
    </Document>
  );
}
```

---

## PDF Generation and GCS Upload

```ts
// In the download handler

import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';

// Generate PDF buffer
const pdfBuffer = await renderToBuffer(
  React.createElement(AgreementPdf, { data: pdfData })
);

// Upload to GCS
const gcsPath = `agreements/${agreementId}/signed-agreement.pdf`;
await gcsClient.bucket(process.env.GCS_BUCKET_NAME).file(gcsPath).save(pdfBuffer, {
  contentType: 'application/pdf',
  metadata: { cacheControl: 'private, max-age=86400' },
});

// Stream to client
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition',
  `attachment; filename="TalentLock-Agreement-${agreementId}-Signed.pdf"`);
res.setHeader('Cache-Control', 'private, max-age=86400');
res.end(pdfBuffer);
```

---

## Resolved Risks

### Risk 1 — First Download Latency
**Resolution:** Show a loading spinner on the download button during generation. Typical generation time for a 2,000-word agreement: 1–3 seconds with `@react-pdf/renderer`. Acceptable for a one-time operation. Cached on all subsequent downloads.

### Risk 2 — Content Formatting
**Resolution:** `preprocessAgreementContent()` strips markdown symbols and splits into paragraphs before passing to the PDF template. Test with a real agreement that includes bold text and headers.

### Risk 3 — GCS Write Permission
**Resolution:** Confirm write permission during codebase inspection (Task 1.1). If not available, the `pdfBuffer` is streamed directly to the client without GCS caching as a fallback (re-generated on every request). Add a TODO to enable caching once write permission is confirmed.

### Risk 4 — GDPR Deletion and Cached PDFs
**Resolution:** Add to `accountDeletion.ts` — after anonymising the user's data, delete all cached PDFs for agreements where this user was a party. Use the GCS `deleteFiles` method with a prefix filter: `agreements/{agreementId}/signed-agreement.pdf` for all agreements linked to this user.

### Risk 5 — Markdown in Content
**Resolution:** `preprocessAgreementContent()` strips common markdown patterns. This is a defensive measure — some AI-generated agreements may have no markdown at all.

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full
- [ ] All 6 spec files read
- [ ] Codebase inspection complete — Q1, Q3, Q5 findings documented
- [ ] GCS write permission confirmed
- [ ] `@react-pdf/renderer` installed in api-server package
- [ ] Dancing Script font downloaded to `artifacts/api-server/src/lib/fonts/`

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Dependencies + optional schema migration (signing timestamps) | ⬜ Not started |
| Phase 2 | Backend — PDF utils + updated download handler + GDPR deletion update | ⬜ Not started |
| Phase 3 | Frontend — download button on detail page + list icon | ⬜ Not started |

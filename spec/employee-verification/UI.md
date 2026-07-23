# TalentLock — UI Specification: Employer Verification

## Overview

Three UI surfaces: an Employer Verification Section on the employer profile page, a Verified Employer Badge shown to freelancers across job posts/bookings/meetings, and an Employer Documents tab in the admin console. The existing freelancer document UI is completely unchanged.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter.
**Employer profile section:** visible only when `userRole === 'employer'`.
**Badge:** visible to all authenticated users on job/booking/meeting pages.
**Admin tab:** visible to admin session only.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Unverified status | `text-slate-500 bg-slate-100` | No documents verified |
| Partially verified | `text-amber-700 bg-amber-50 border-amber-200` | Rep ID verified only |
| Fully verified | `text-emerald-700 bg-emerald-50 border-emerald-200` | All required docs verified |
| Document — not uploaded | `text-slate-400` | Empty state row |
| Document — pending | `text-amber-600 bg-amber-50` | Under review |
| Document — needs review | `text-amber-700 bg-amber-50 border-amber-300` | Needs human review |
| Document — verified | `text-emerald-700 bg-emerald-50 border-emerald-200` | Verified |
| Document — rejected | `text-red-700 bg-red-50 border-red-200` | Action required |
| Disclaimer banner | `bg-amber-50 border-amber-200 text-amber-800` | AI review disclaimer |
| Badge — fully verified | `bg-emerald-50 text-emerald-700 border-emerald-200` | "✓ Verified Employer" |
| Badge — partially | `bg-amber-50 text-amber-700 border-amber-200` | "◐ ID Verified" |

---

## Surface 1 — Employer Verification Section (`/profile`)

**File:** `artifacts/talentlock/src/components/employer/EmployerVerificationSection.tsx`

Rendered on the employer profile page, visible only when `userRole === 'employer'`.

### Full Layout

```
Business Verification
──────────────────────────────────────────────────────────────────

⚠ AI document review is for platform trust purposes only.
  It does not constitute legal identity or KYC verification.
  Documents are reviewed by our team and never shared publicly.

Overall status:   ◐ Partially Verified
                  Upload your company registration and tax certificate
                  to become Fully Verified.

──────────────────────────────────────────────────────────────────

REQUIRED

✅ Representative ID                               Verified
   Government-issued photo ID of company director
   Verified Jun 18, 2026

⏳ Company Registration Certificate               Under review
   Official company registration document          Uploaded today
   "We'll complete the review shortly."
   [View uploaded document ↗]

❌ Tax / VAT Certificate                          Action required
   VAT registration or tax certificate
   "The document was unclear. Please upload a cleaner
   photo or scan."
   [Re-upload →]

OPTIONAL

○  Business Licence                               Not uploaded
   Trading licence or sector-specific permit
                                                  [Upload →]

○  Proof of Business Address                      Not uploaded
   Utility bill or bank statement (< 3 months old)
                                                  [Upload →]
```

---

### Overall Status Pill

```tsx
function VerificationStatusPill({ level }: { level: VerificationLevel }) {
  if (level === 'fully_verified') return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium
      bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Fully Verified
    </span>
  );
  if (level === 'partially_verified') return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium
      bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1">
      <CircleHalf className="h-3.5 w-3.5" />
      Partially Verified
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium
      bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-3 py-1">
      <Circle className="h-3.5 w-3.5" />
      Unverified
    </span>
  );
}
```

---

### Disclaimer Banner

Always shown at the top of the section:

```tsx
<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6 flex gap-3">
  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
  <div className="text-sm text-amber-800">
    <span className="font-semibold">AI document review is for platform trust purposes only.</span>
    {' '}It does not constitute legal identity or KYC verification.
    Documents are reviewed by our team and are never shared with freelancers.
  </div>
</div>
```

---

### Document Row Component

```tsx
interface DocumentRowProps {
  documentType: EmployerDocumentType;
  label: string;
  description: string;
  required: boolean;
  status: EmployerDocumentStatus | 'not_uploaded';
  employerNotes: string | null;
  onUpload: (documentType: EmployerDocumentType, file: File) => void;
  isUploading: boolean;
}

function DocumentRow({ documentType, label, description, required, status,
  employerNotes, onUpload, isUploading }: DocumentRowProps) {

  const badge = {
    not_uploaded: null,
    pending:      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Under review</span>,
    needs_review: <span className="text-xs bg-amber-50 text-amber-700 border border-amber-300 rounded px-2 py-0.5">Needs review</span>,
    verified:     <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-2 py-0.5 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Verified</span>,
    rejected:     <span className="text-xs bg-red-50 text-red-700 border border-red-200 rounded px-2 py-0.5 flex items-center gap-1"><XCircle className="h-3 w-3" />Action required</span>,
  }[status];

  return (
    <div className="flex items-start gap-4 py-4 border-b border-slate-100 last:border-0">
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        {status === 'verified' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        {status === 'rejected' && <XCircle className="h-5 w-5 text-red-500" />}
        {status === 'pending' && <Clock className="h-5 w-5 text-amber-500" />}
        {status === 'needs_review' && <AlertCircle className="h-5 w-5 text-amber-500" />}
        {status === 'not_uploaded' && <Circle className="h-5 w-5 text-slate-300" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-slate-800">{label}</span>
          {required && <span className="text-[10px] text-slate-400 uppercase tracking-wider">Required</span>}
          {badge}
        </div>
        <p className="text-xs text-slate-500 mb-2">{description}</p>
        {employerNotes && (status === 'rejected' || status === 'needs_review') && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200
            rounded px-2 py-1.5 mb-2">
            {employerNotes}
          </p>
        )}
        {employerNotes && status === 'verified' && (
          <p className="text-xs text-slate-400">{employerNotes}</p>
        )}
      </div>

      {/* Action */}
      <div className="flex-shrink-0 flex flex-col gap-1 items-end">
        {(status === 'not_uploaded' || status === 'rejected') && (
          <label className={cn(
            "cursor-pointer text-xs font-medium px-3 py-1.5 rounded border transition-colors",
            status === 'rejected'
              ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              : "bg-slate-800 text-white border-slate-800 hover:bg-slate-700"
          )}>
            {isUploading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Uploading...
              </span>
            ) : status === 'rejected' ? 'Re-upload →' : 'Upload →'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={isUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(documentType, file);
              }}
            />
          </label>
        )}
        {status === 'pending' && (
          <span className="text-xs text-slate-400">Review in progress</span>
        )}
      </div>
    </div>
  );
}
```

---

### Upload Flow

When the employer selects a file:

```ts
async function handleUpload(documentType: EmployerDocumentType, file: File) {
  setUploadingType(documentType);
  try {
    // 1. Get presigned upload URL
    const { uploadUrl, fileUrl } = await uploadUrlMutation.mutateAsync({
      documentType,
      filename: file.name,
      mimeType: file.type,
    });

    // 2. Upload directly to GCS
    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });

    // 3. Confirm upload and trigger AI review
    await confirmMutation.mutateAsync({ documentType, fileUrl });

    // 4. Refresh document status
    await refetch();

    toast({ title: 'Document uploaded', description: 'We will review it shortly.' });
  } catch (err) {
    toast({ title: 'Upload failed', description: 'Please try again.', variant: 'destructive' });
  } finally {
    setUploadingType(null);
  }
}
```

---

### "Next Steps" Prompt (When Not Fully Verified)

Below the document list, when `verificationLevel !== 'fully_verified'`:

```tsx
{verificationLevel === 'unverified' && (
  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
    <strong>Start with your Representative ID.</strong> Upload a photo of a government-issued
    ID to become Partially Verified. Freelancers will see an "ID Verified" badge on your job
    postings.
  </div>
)}
{verificationLevel === 'partially_verified' && (
  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
    <strong>Almost there.</strong> Upload your Company Registration Certificate and Tax / VAT
    Certificate to become Fully Verified and show a "Verified Employer" badge to freelancers.
  </div>
)}
```

---

## Surface 2 — Verified Employer Badge

**File:** `artifacts/talentlock/src/components/employer/VerifiedEmployerBadge.tsx`

```tsx
export function VerifiedEmployerBadge({
  verificationLevel,
  size = 'sm',
}: {
  verificationLevel: VerificationLevel;
  size?: 'sm' | 'md';
}) {
  if (verificationLevel === 'fully_verified') return (
    <span className={cn(
      "inline-flex items-center gap-1 font-medium rounded-full border",
      "bg-emerald-50 text-emerald-700 border-emerald-200",
      size === 'sm' ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"
    )}>
      <CheckCircle2 className={size === 'sm' ? "h-2.5 w-2.5" : "h-3 w-3"} />
      Verified Employer
    </span>
  );

  if (verificationLevel === 'partially_verified') return (
    <span className={cn(
      "inline-flex items-center gap-1 font-medium rounded-full border",
      "bg-amber-50 text-amber-700 border-amber-200",
      size === 'sm' ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"
    )}>
      <ShieldCheck className={size === 'sm' ? "h-2.5 w-2.5" : "h-3 w-3"} />
      ID Verified
    </span>
  );

  return null; // unverified — render nothing
}
```

### Badge Placement on Job Posts

```tsx
// In job card and job detail page
<div className="flex items-center gap-2">
  <span className="text-sm text-slate-600">{job.employerCompanyName}</span>
  <VerifiedEmployerBadge verificationLevel={job.employerVerificationLevel} size="sm" />
</div>
```

### Badge Placement on Booking Detail

```tsx
// In booking header
<div className="flex items-center gap-2">
  <Building2 className="h-4 w-4 text-slate-400" />
  <span className="text-sm font-medium">{booking.employerCompanyName}</span>
  <VerifiedEmployerBadge verificationLevel={booking.employerVerificationLevel} />
</div>
```

### Badge Placement on Meeting Detail

```tsx
// In meeting header below employer name
<VerifiedEmployerBadge verificationLevel={meeting.employerVerificationLevel} />
```

---

## Surface 3 — Admin Employer Documents Tab

**File:** Admin console (existing admin page, new tab)

### Tab Header

```
[Freelancer Documents]  [Employer Documents (3)]
```

The employer tab badge shows the count of **pending** documents only (`pending` + `needs_review`).

### Sub-sections (Employer Documents tab)

```
[ Pending (3) ]  [ Approved (12) ]  [ Rejected (2) ]
```

| Section | Content |
|---------|---------|
| **Pending** | Action queue — Approve / Reject with admin notes |
| **Approved** | Read-only history of `status=verified` documents |
| **Rejected** | Read-only history of `status=rejected` documents with admin notes |

After admin approves or rejects a document, it disappears from Pending and appears in the matching history section.

### Pending queue card

```
┌──────────────────────────────────────────────────────────────────┐
│  Jefferson Academy Ltd                        Confidence: 82%    │
│  Company Registration Certificate        [View document ↗]       │
│  Uploaded Jun 18, 2026                                           │
│                                                                   │
│  AI Assessment:                                                   │
│  "Company name 'Jefferson Academy Ltd' clearly visible.          │
│   Registration number CH12345678 present and legible.            │
│   Document format consistent with UK Companies House cert.       │
│   No tampering detected."                                         │
│                                                                   │
│  Admin notes: [___________________________]                       │
│                                                                   │
│  [✅ Approve]                           [❌ Reject]                │
└──────────────────────────────────────────────────────────────────┘
```

### Approved / Rejected history card (read-only)

```
┌──────────────────────────────────────────────────────────────────┐
│  Jefferson Academy Ltd              [Approved]                   │
│  Company Registration Certificate        [View document ↗]       │
│  Uploaded Jun 18, 2026 · Reviewed Jun 19, 2026                   │
│                                                                   │
│  Admin notes: Verified manually — clean document                 │
└──────────────────────────────────────────────────────────────────┘
```

Rejected cards use a red status badge and show rejection admin notes. No Approve/Reject buttons on history cards.

```tsx
function AdminEmployerDocCard({ doc }: { doc: AdminEmployerDocRow }) {
  const [adminNotes, setAdminNotes] = useState('');
  const verifyMutation = usePostAdminEmployerDocumentsIdVerify();
  const rejectMutation = usePostAdminEmployerDocumentsIdReject();

  return (
    <div className="border border-slate-200 rounded-lg p-4 mb-3">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800">{doc.employerName}</p>
          <p className="text-sm text-slate-500">{DOCUMENT_TYPE_LABELS[doc.documentType]}</p>
          <p className="text-xs text-slate-400 mt-0.5">Uploaded {formatDate(doc.createdAt)}</p>
        </div>
        <div className="text-right">
          <span className="text-sm font-medium text-slate-700">
            Confidence: {doc.confidence ?? '—'}%
          </span>
          <a href={doc.signedFileUrl} target="_blank" rel="noopener noreferrer"
            className="block text-xs text-blue-600 hover:underline mt-1">
            View document ↗
          </a>
        </div>
      </div>

      {doc.aiNotes && (
        <div className="bg-slate-50 border border-slate-200 rounded p-3 mb-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700 mb-1">AI Assessment:</p>
          <p>{doc.aiNotes}</p>
        </div>
      )}

      <Textarea
        placeholder="Admin notes (required for rejection)"
        value={adminNotes}
        onChange={(e) => setAdminNotes(e.target.value)}
        className="mb-3 text-sm"
        rows={2}
      />

      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => verifyMutation.mutate({ id: doc.id, adminNotes })}
          disabled={verifyMutation.isPending}
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          Verify
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-red-600 border-red-200 hover:bg-red-50"
          onClick={() => {
            if (!adminNotes.trim()) {
              toast({ title: 'Admin notes required for rejection', variant: 'destructive' });
              return;
            }
            rejectMutation.mutate({ id: doc.id, adminNotes });
          }}
          disabled={rejectMutation.isPending}
        >
          <XCircle className="h-3.5 w-3.5 mr-1.5" />
          Reject
        </Button>
      </div>
    </div>
  );
}
```

---

## Copy Reference

| Location | String |
|---|---|
| Section heading | `Business Verification` |
| Disclaimer | `AI document review is for platform trust purposes only. It does not constitute legal identity or KYC verification. Documents are reviewed by our team and are never shared with freelancers.` |
| Status — unverified | `Unverified` |
| Status — partially | `Partially Verified` |
| Status — fully | `Fully Verified` |
| Doc — company registration | `Company Registration Certificate` |
| Doc — company reg desc | `Official company registration document` |
| Doc — tax vat | `Tax / VAT Certificate` |
| Doc — tax vat desc | `VAT registration or equivalent tax document` |
| Doc — business licence | `Business Licence` |
| Doc — licence desc | `Trading licence or sector-specific permit` |
| Doc — rep id | `Representative ID` |
| Doc — rep id desc | `Government-issued photo ID of company director or authorised representative` |
| Doc — address | `Proof of Business Address` |
| Doc — address desc | `Utility bill or bank statement (less than 3 months old)` |
| Badge — fully verified | `✓ Verified Employer` |
| Badge — partially | `◐ ID Verified` |
| Upload button | `Upload →` |
| Re-upload button | `Re-upload →` |
| Status — pending | `Under review` |
| Status — needs review | `Needs review` |
| Status — verified | `Verified` |
| Status — rejected | `Action required` |
| Upload accepted types | `Upload as a JPEG, PNG, or WebP image (photograph or scan of your document)` |
| Upload success toast | `Document uploaded — We will review it shortly.` |
| Upload error toast | `Upload failed — Please try again.` |
| Prompt — unverified | `Start with your Representative ID. Upload a photo of a government-issued ID to become Partially Verified.` |
| Prompt — partial | `Almost there. Upload your Company Registration Certificate and Tax / VAT Certificate to become Fully Verified.` |
| Admin — reject notes required | `Admin notes required for rejection` |

---

## Loading & Error States Summary

| Surface | State | Behaviour |
|---|---|---|
| Verification section | Loading | Skeleton rows for each document type |
| Verification section | Error | "Could not load verification status. Try again." |
| Document upload | Uploading | Button shows spinner + "Uploading...", file input disabled |
| Document upload | GCS failure | Toast error: "Upload failed. Please try again." |
| Document upload | Confirm failure | Toast error: "Could not start review. Try again." |
| Admin queue | Loading | Skeleton cards |
| Admin pending | Empty | "No documents pending review." |
| Admin approved | Empty | "No approved employer documents yet." |
| Admin rejected | Empty | "No rejected employer documents yet." |
| Admin approve | Success | Card removed from Pending, appears in Approved section |
| Admin reject | No notes | Inline error: "Admin notes required for rejection" |
| Admin reject | Success | Card removed from Pending, appears in Rejected section |
| Badge | Unverified | Nothing rendered — no empty badge |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/employer/EmployerVerificationSection.tsx` | New | 3.2 |
| `src/components/employer/VerifiedEmployerBadge.tsx` | New | 3.4 |
| `src/pages/Profile.tsx` | Modified (employer section) | 3.3 |
| `src/pages/Jobs.tsx` | Modified (badge on job card) | 3.5 |
| `src/pages/JobDetail.tsx` | Modified (badge) | 3.5 |
| `src/pages/BookingDetail.tsx` | Modified (badge) | 3.6 |
| `src/pages/MeetingDetail.tsx` | Modified (badge) | 3.7 |
| Admin console component | Modified (Employer Docs tab) | 3.8 |
| `src/components/onboarding/EmployerDocumentOnboardingStep.tsx` | New | 3.9 |
| `src/pages/Onboarding.tsx` | Modified (employer step 4) | 3.9 |

---

## Onboarding Integration — Employer Document Step (Step 4)

**File:** `artifacts/talentlock/src/components/onboarding/EmployerDocumentOnboardingStep.tsx`

**When shown:** `Onboarding.tsx` step `employer-documents` (after company profile saved).

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Verify your business                                       │
│  Upload one document so freelancers can trust who they      │
│  are working with.                                          │
│                                                             │
│  ⚠ One document is required to finish registration.         │
│    Additional business documents can be added later         │
│    from your profile.                                       │
│                                                             │
│  ○ Representative ID          Required    [ Upload ]          │
│    Government-issued photo ID of a director or              │
│    authorised representative.                               │
│                                                             │
│  JPEG, PNG, or WebP image.                                  │
│                                                             │
│  [ Back ]                        [ Finish registration → ]  │
└─────────────────────────────────────────────────────────────┘
```

### Behaviour

| Rule | Detail |
|------|--------|
| Required doc | `representative_id` only |
| Finish enabled | When GET `/employer-documents/me` shows a row for `representative_id` (any status except not uploaded) |
| Finish action | `PUT /users/me` with `role: employer` → redirect `/dashboard` |
| Back | Returns to company profile step; form pre-filled via `GET /employers/me` |
| Upload flow | Same as `EmployerVerificationSection` (presigned URL → GCS PUT → confirm) |

### Copy

| Key | Copy |
|-----|------|
| onboarding.verify.title | Verify your business |
| onboarding.verify.subtitle | Upload one document so freelancers can trust who they are working with. |
| onboarding.verify.required_banner | One document is required to finish registration. Additional business documents can be added later from your profile. |
| onboarding.verify.finish | Finish registration → |
| onboarding.verify.uploaded_badge | Uploaded |

# TalentLock — UI Specification: Credential Expiry Tracking

Three surfaces: Talent Vault card badge, `/profile` verification section + banners, document upload expiry input.

**Design tokens:** amber (`amber-*`) for 30-day/7-day-not-yet-critical warnings (reusing existing amber pattern from `CompletenessBanner`), red/`destructive` (`red-*`) for 7-day urgent + expired states, matching existing `VerificationBadge`/`DocumentRow` colour conventions.

---

## Surface 1 — Talent Vault "Expiring Soon" Badge

**File:** `artifacts/talentlock/src/pages/FreelancersList.tsx`

**Placement:** Inline next to `VerificationBadge` on the freelancer card (same row, after the verification badge).

```tsx
{freelancer.expiringCredential && (
  <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">
    <Clock className="h-3 w-3" />
    Expiring Soon
  </span>
)}
```

**Visibility:** Only when `freelancer.expiringCredential !== null` (credential within 7 days of expiry). No tooltip needed for Sprint 1 — badge text is self-explanatory.

---

## Surface 2 — Document Row: Expired State

**File:** `artifacts/talentlock/src/components/VerificationSection.tsx`

New `status === "expired"` branch in `DocumentRow`:

```tsx
} else if (status === "expired") {
  icon = <ShieldX className="h-5 w-5 text-red-600" />;
  statusBadge = (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium text-red-700 bg-red-100 border border-red-200">
      Expired
    </span>
  );
  detail = "This credential has expired — upload a renewed document to restore your verified status.";
  action = (
    <DocumentUploader documentType={documentType} onSuccess={onRefresh} label="Renew ↑" />
  );
}
```

**Countdown line** (verified documents with `expiryDate` set, not yet expired):

```tsx
{status === "verified" && doc?.daysUntilExpiry != null && doc.daysUntilExpiry <= 30 && (
  <p className={`text-xs mt-1 font-medium ${doc.daysUntilExpiry <= 7 ? "text-red-600" : "text-amber-600"}`}>
    Expires in {doc.daysUntilExpiry} day{doc.daysUntilExpiry === 1 ? "" : "s"}
  </p>
)}
```

---

## Surface 3 — Profile Expiry Banners

**File:** New component `artifacts/talentlock/src/components/CredentialExpiryBanner.tsx`, rendered at the top of `Profile.tsx`'s freelancer verification section (above `VerificationSection`).

**Props:**

```ts
interface CredentialExpiryBannerProps {
  documents: DocumentMeItem[];       // from GET /documents/me
  teachingLicenceExpiry?: string | null;
  teachingLicenceDaysRemaining?: number | null;
}
```

**Logic:** Compute the minimum `daysUntilExpiry` across all verified documents (with `expiryDate` set) and, if present, `teachingLicenceDaysRemaining`. Render nothing if the minimum is `null` or `> 30`.

### States

| Days remaining | Rendering |
|---|---|
| `null` or `> 30` | Nothing rendered |
| `8`–`30` | Amber banner |
| `1`–`7` | Red urgent banner |
| `<= 0` | Red urgent banner, "expired" copy |

```tsx
// Amber (8–30 days)
<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
  <div>
    <p className="text-sm font-medium text-amber-900">
      A credential expires in {days} days
    </p>
    <p className="text-xs text-amber-800 mt-0.5">
      Renew it before it expires to keep your verified status.
    </p>
  </div>
</div>

// Red (1–7 days or expired)
<div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
  <div>
    <p className="text-sm font-semibold text-red-900">
      {isExpired ? "A credential has expired" : `Urgent: a credential expires in ${days} day${days === 1 ? "" : "s"}`}
    </p>
    <p className="text-xs text-red-800 mt-0.5">
      {isExpired
        ? "Renew it now to restore your verified status and Talent Vault visibility."
        : "Renew it now to avoid losing your verified status and Talent Vault visibility."}
    </p>
  </div>
</div>
```

---

## Surface 4 — Expiry Date Input on Upload

**File:** `artifacts/talentlock/src/components/DocumentUploader.tsx`

**Placement:** Only rendered when `documentType === "professional_credential"`, shown before the file picker button as an optional date field.

```tsx
{documentType === "professional_credential" && (
  <div className="space-y-1 mb-2">
    <Label htmlFor={`expiry-${documentType}`} className="text-xs text-muted-foreground">
      Expiry date (optional)
    </Label>
    <Input
      id={`expiry-${documentType}`}
      type="date"
      value={expiryDate}
      onChange={(e) => setExpiryDate(e.target.value)}
      className="h-8 text-sm w-40"
    />
  </div>
)}
```

Passed through to `usePostDocumentsConfirm` as `expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null`.

---

## Copy Reference

| Key | Copy |
|-----|------|
| vault.badge.expiringSoon | Expiring Soon |
| document.status.expired | Expired |
| document.expired.detail | This credential has expired — upload a renewed document to restore your verified status. |
| document.expired.action | Renew ↑ |
| document.countdown | Expires in {n} day(s) |
| banner.amber.title | A credential expires in {n} days |
| banner.amber.body | Renew it before it expires to keep your verified status. |
| banner.red.title.expiring | Urgent: a credential expires in {n} day(s) |
| banner.red.title.expired | A credential has expired |
| banner.red.body.expiring | Renew it now to avoid losing your verified status and Talent Vault visibility. |
| banner.red.body.expired | Renew it now to restore your verified status and Talent Vault visibility. |
| upload.expiryLabel | Expiry date (optional) |

---

## Component Summary

| File | Action | Task |
|------|--------|------|
| `pages/FreelancersList.tsx` | Modified | 3.1 |
| `components/VerificationSection.tsx` | Modified | 3.2 |
| `components/CredentialExpiryBanner.tsx` | Create | 3.3 |
| `pages/Profile.tsx` | Modified | 3.3 |
| `components/DocumentUploader.tsx` | Modified | 3.4 |

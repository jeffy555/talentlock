# TalentLock — Task Breakdown: Document Verification Feature

## Summary

Build end-to-end document verification: freelancers upload identity/credential documents, OpenAI vision reviews them, verified badges surface to employers, and admins can manually review flagged documents. Execution order: Database → Backend → Frontend → Admin.

---

## Phase 1 — Database

### Task 1.1 — Create `documents` Table

**File:** `lib/db/schema.ts`

```ts
export const documents = pgTable('documents', {
  id:           serial('id').primaryKey(),
  freelancerId: text('freelancer_id').notNull().references(() => freelancerProfiles.id),
  documentType: text('document_type').notNull(),
  // Values: 'government_id' | 'professional_credential' | 'portfolio_proof'
  fileUrl:      text('file_url').notNull(),
  // GCS object key only — NOT a public URL
  // e.g. documents/user_2abc/government_id/uuid.jpg
  status:       text('status').notNull().default('pending'),
  // Values: 'pending' | 'verified' | 'rejected' | 'needs_review'
  confidence:   integer('confidence'),
  // AI confidence score 0–100, null if not yet reviewed
  aiNotes:      text('ai_notes'),
  // AI-generated explanation, shown to freelancer and admin
  adminNotes:   text('admin_notes'),
  // Admin override note, shown to freelancer
  reviewedBy:   text('reviewed_by'),
  // 'ai' | 'admin' — who set the current status
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: unique().on(t.freelancerId, t.documentType),
}));
```

### Task 1.2 — Add `verificationLevel` to `freelancer_profiles`

**File:** `lib/db/schema.ts`

Add a computed-cache column to avoid recalculating on every query:

```ts
// Add to freelancerProfiles table
verificationLevel: text('verification_level').notNull().default('unverified'),
// Values: 'unverified' | 'partially_verified' | 'fully_verified'
// Updated by server after every document status change
```

### Task 1.3 — Add `document_verification` to `TokenFeature` Type

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

```ts
export type TokenFeature =
  | 'ai_match'
  | 'agreement_generation'
  | 'ai_match_explanation'
  | 'contract_redlining'
  | 'job_description_assistant'
  | 'interview_questions'
  | 'document_verification'  // ← add
```

### Task 1.4 — Add `SYSTEM_USER_ID` Constant

**File:** `artifacts/api-server/src/lib/constants.ts` (create if not exists)

```ts
export const SYSTEM_USER_ID = 'system' as const;
```

Update `checkTokenQuota()` in `artifacts/api-server/src/lib/subscriptionGating.ts`:

```ts
export async function checkTokenQuota(db: DB, userId: string) {
  if (userId === 'system') return { allowed: true }; // ← add guard at top
  // ... existing logic
}
```

### Task 1.5 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify both new columns/table exist in Neon before proceeding to Phase 2.

---

## Phase 2 — Backend API

### Task 2.1 — Presigned Upload URL for Documents

**File:** `artifacts/api-server/src/routes/documents.ts` (create new file)

Add `POST /api/documents/upload-url`

Request body:
```ts
{ documentType: 'government_id' | 'professional_credential' | 'portfolio_proof', mimeType: string, fileSize: number }
```

Validation (return 400 on failure):
- `documentType` must be one of the 3 allowed values
- `mimeType` must be one of `['image/jpeg', 'image/png', 'image/webp']` — else `{ error: "Only JPEG, PNG, and WebP images are accepted. PDF support coming soon.", code: "INVALID_FILE_TYPE" }`
- `fileSize` must be `<= 10485760` (10MB) — else `{ error: "File must be 10MB or smaller.", code: "FILE_TOO_LARGE" }`

On success:
1. Resolve `freelancerId` from Clerk `userId` + `freelancerProfiles` lookup
2. Generate filename: `${crypto.randomUUID()}${ext}` where ext is derived from mimeType
3. Construct GCS path: `documents/${internalUserId}/${documentType}/${filename}`
4. Call existing presigned URL generator with path + maxSize: 10485760
5. Return `{ uploadUrl, storagePath }`

### Task 2.2 — Confirm Upload and Trigger Review

**File:** `artifacts/api-server/src/routes/documents.ts`

Add `POST /api/documents/confirm`

Request body: `{ documentType: string, storagePath: string }`

Steps:
1. Validate `documentType` and `storagePath` format
2. Upsert document row using `onConflictDoUpdate` (from plan.md Q6):
```ts
await db.insert(documents)
  .values({ freelancerId, documentType, fileUrl: storagePath, status: 'pending', aiNotes: null, confidence: null, reviewedBy: null, updatedAt: new Date() })
  .onConflictDoUpdate({
    target: [documents.freelancerId, documents.documentType],
    set: { fileUrl: storagePath, status: 'pending', aiNotes: null, confidence: null, adminNotes: null, reviewedBy: null, updatedAt: new Date() }
  });
```
3. Fire-and-forget review (do NOT await):
```ts
triggerDocumentReview(db, req.log, freelancerId, documentType).catch(err =>
  req.log.error({ err, freelancerId, documentType }, 'document review trigger failed')
);
```
4. Return `HTTP 201 { status: 'pending' }`

### Task 2.3 — Document Review Pipeline

**File:** `artifacts/api-server/src/lib/documentReview.ts` (create new file)

```ts
export async function triggerDocumentReview(db, log, freelancerId, documentType) {
  // 1. Fetch document row
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.freelancerId, freelancerId), eq(documents.documentType, documentType))
  });
  if (!doc) return;

  // 2. Generate signed GCS URL (15-minute TTL)
  const signedUrl = await generateSignedUrl(doc.fileUrl, 15 * 60);

  // 3. Call OpenAI vision with system prompt from plan.md Risk 1
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: DOCUMENT_REVIEW_SYSTEM_PROMPT },
        { type: 'image_url', image_url: { url: signedUrl, detail: 'high' } }
      ]
    }]
  });

  // 4. Parse JSON response — fallback to needs_review on parse failure
  let verdict: 'verified' | 'rejected' | 'needs_review' = 'needs_review';
  let confidence = 0;
  let notes = '';
  try {
    const parsed = JSON.parse(response.choices[0].message.content);
    verdict = parsed.verdict;
    confidence = parsed.confidence;
    notes = parsed.notes;
  } catch {
    log.warn({ freelancerId, documentType }, 'document review JSON parse failed');
    verdict = 'needs_review';
    notes = 'AI response could not be parsed — queued for manual review.';
  }

  // 5. Update document row
  await db.update(documents)
    .set({ status: verdict, confidence, aiNotes: notes, reviewedBy: 'ai', updatedAt: new Date() })
    .where(and(eq(documents.freelancerId, freelancerId), eq(documents.documentType, documentType)));

  // 6. Update freelancerProfiles.verificationLevel
  await updateVerificationLevel(db, freelancerId);

  // 7. Log token usage
  await logTokenUsage(db, SYSTEM_USER_ID, 'document_verification', {
    promptTokens: response.usage.prompt_tokens,
    completionTokens: response.usage.completion_tokens,
    totalTokens: response.usage.total_tokens,
  });
}
```

The `DOCUMENT_REVIEW_SYSTEM_PROMPT` constant uses the exact prompt from plan.md Risk 1. Define it at the top of the file.

### Task 2.4 — `updateVerificationLevel` Utility

**File:** `artifacts/api-server/src/lib/documentReview.ts`

```ts
async function updateVerificationLevel(db, freelancerId: string) {
  const verifiedCount = await db
    .select({ count: count() })
    .from(documents)
    .where(and(eq(documents.freelancerId, freelancerId), eq(documents.status, 'verified')));

  const n = verifiedCount[0]?.count ?? 0;
  const level = n === 0 ? 'unverified' : n === 1 ? 'partially_verified' : 'fully_verified';

  await db.update(freelancerProfiles)
    .set({ verificationLevel: level })
    .where(eq(freelancerProfiles.id, freelancerId));
}
```

Called after every document status change — both AI review and admin override.

### Task 2.5 — `GET /api/documents/me`

**File:** `artifacts/api-server/src/routes/documents.ts`

Returns the freelancer's own documents (all types, all statuses). Includes stuck-pending safety net from plan.md Risk 3:

```ts
// Before fetching — repair stuck pending documents
const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);
await db.update(documents)
  .set({ status: 'needs_review', aiNotes: 'AI review timed out — queued for manual review.', updatedAt: new Date() })
  .where(and(
    eq(documents.freelancerId, freelancerId),
    eq(documents.status, 'pending'),
    lt(documents.updatedAt, TEN_MINUTES_AGO)
  ));
```

Response:
```ts
{
  verificationLevel: 'unverified' | 'partially_verified' | 'fully_verified',
  documents: {
    documentType: string,
    status: 'pending' | 'verified' | 'rejected' | 'needs_review',
    confidence: number | null,
    aiNotes: string | null,
    adminNotes: string | null,
    updatedAt: string
  }[]
}
```

### Task 2.6 — Update `GET /api/freelancers/:id`

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Add to the existing response (employer view — verified info only, per plan.md Q7):
```ts
verification: {
  level: freelancerProfile.verificationLevel,
  verifiedDocumentCount: number  // count of documents with status='verified'
}
```

Do NOT expose individual document statuses, file URLs, or AI notes to employers.

### Task 2.7 — Update `GET /api/freelancers` (Talent Vault)

**File:** `artifacts/api-server/src/routes/freelancers.ts`

Add `?verified=true` filter support (from plan.md Q8):

```ts
if (query.verified === 'true') {
  // Add to WHERE clause:
  // EXISTS (SELECT 1 FROM documents WHERE documents.freelancer_id = freelancer_profiles.id AND documents.status = 'verified')
}
```

### Task 2.8 — Admin: Document Review Endpoints

**File:** `artifacts/api-server/src/routes/admin.ts`

Add two endpoints, both gated by `requireAdmin`:

`GET /api/admin/documents`
- Returns all documents with `status = 'needs_review'` ordered by `updatedAt ASC`
- Includes: `id`, `freelancerId`, `freelancerName`, `freelancerEmail`, `documentType`, `aiNotes`, `confidence`, `updatedAt`
- Does NOT include `fileUrl` (admin must request signed URL separately)
- Returns `{ data: [], total: number }` — paginated, 20 per page

`GET /api/admin/documents/:id/signed-url`
- Returns a 15-minute signed GCS URL for the document file
- Admin-only — never exposed to any other route

`PATCH /api/admin/documents/:id`
- Body: `{ verdict: 'verified' | 'rejected', adminNotes: string }`
- Updates document status, sets `reviewedBy: 'admin'`, updates `freelancerProfiles.verificationLevel`
- Calls `updateVerificationLevel()` after update

### Task 2.9 — GCS Route Guard for Document Files

**File:** `artifacts/api-server/src/routes/storage.ts` (or wherever `GET /api/storage/objects/*path` is handled)

Add guard per plan.md Risk 2:
```ts
if (req.params.path.startsWith('documents/')) {
  if (!req.adminSession) {
    return res.status(403).json({ error: 'Forbidden' });
  }
}
```

### Task 2.10 — OpenAPI Spec Update + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add all new endpoints:
- `POST /api/documents/upload-url`
- `POST /api/documents/confirm`
- `GET /api/documents/me`
- `GET /api/admin/documents`
- `GET /api/admin/documents/:id/signed-url`
- `PATCH /api/admin/documents/:id`

Update `GET /api/freelancers` spec to add optional `verified: boolean` query param.
Update `GET /api/freelancers/:id` response schema to include `verification` object.

Register all new routes in `artifacts/api-server/src/index.ts`.

Then run:
```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## Phase 3 — Frontend

### Task 3.1 — Verify Generated Hooks

Confirm codegen produced hooks:
- `usePostDocumentsUploadUrl()`
- `usePostDocumentsConfirm()`
- `useGetDocumentsMe()`

If missing, re-run codegen before continuing.

### Task 3.2 — Freelancer Verification Section on `/profile`

**File:** `artifacts/talentlock/src/pages/Profile.tsx`

Add a "Verification" section below the existing profile fields. Freelancer-role only.

See `UI.md` Component 1 for full spec including all states.

### Task 3.3 — Document Upload Flow Component

**File:** `artifacts/talentlock/src/components/DocumentUploader.tsx`

Reusable uploader used within the Verification section. Handles:
1. File selection + client-side validation (type + size)
2. Request presigned URL from `POST /api/documents/upload-url`
3. PUT to GCS using the presigned URL
4. Confirm upload via `POST /api/documents/confirm`
5. Poll `GET /api/documents/me` every 3 seconds while any document is `pending`

See `UI.md` Component 2 for full state spec.

### Task 3.4 — Verification Badge Component

**File:** `artifacts/talentlock/src/components/VerificationBadge.tsx`

Props:
```ts
interface VerificationBadgeProps {
  level: 'unverified' | 'partially_verified' | 'fully_verified';
  size?: 'sm' | 'md';  // default: 'md'
  showTooltip?: boolean;  // default: false
}
```

See `UI.md` Component 3 for full spec.

### Task 3.5 — Employer View on `/freelancers/:id`

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

Add Verification section below the freelancer bio. Shows:
- `<VerificationBadge level={verification.level} showTooltip={true} />`
- Verified document count
- AI disclaimer note
- Nothing about rejected/pending documents

See `UI.md` Page Integration 2 for full spec.

### Task 3.6 — Verified Badge on Talent Vault Cards

**File:** `artifacts/talentlock/src/components/FreelancerCard.tsx` (or equivalent)

Add `<VerificationBadge level={...} size="sm" showTooltip={true} />` badge on Talent Vault cards for freelancers with `level !== 'unverified'`.

### Task 3.7 — Verified Filter on Talent Vault

**File:** `artifacts/talentlock/src/pages/Freelancers.tsx`

Add a "Verified only" toggle/checkbox to the existing filter panel. When active, appends `?verified=true` to the `GET /api/freelancers` request.

See `UI.md` Page Integration 3.

### Task 3.8 — Verification Badge on Public Profile

**File:** `artifacts/talentlock/src/pages/PublicProfile.tsx` (`/f/:id`)

Add `<VerificationBadge>` below the freelancer name, same pattern as FreelancerDetail.

---

## Phase 4 — Admin Console

### Task 4.1 — Document Review Tab

**File:** Admin dashboard frontend (`/admin` route tree)

Add a "Document Review" tab to the admin tab bar. Tab label includes pending count badge: `Document Review (3)`.

Tab icon: `<ShieldCheck className="h-4 w-4" />` from lucide-react.

Tab content: a review queue table and per-document review actions.

See `UI.md` Admin Section for full spec.

---

## Acceptance Criteria

- [ ] `documents` table exists in Neon with unique constraint on `(freelancerId, documentType)`
- [ ] `verificationLevel` column exists on `freelancer_profiles`
- [ ] `document_verification` added to `TokenFeature` type
- [ ] `SYSTEM_USER_ID = 'system'` constant created; `checkTokenQuota` skips system user
- [ ] Upload URL endpoint rejects PDFs with `INVALID_FILE_TYPE` code
- [ ] Upload URL endpoint rejects files > 10MB with `FILE_TOO_LARGE` code
- [ ] Confirm endpoint upserts document row atomically (onConflictDoUpdate)
- [ ] AI review fires non-blocking; document row updated with verdict
- [ ] Stuck-pending safety net moves 10-min-old pending docs to `needs_review` on GET
- [ ] `verificationLevel` on `freelancer_profiles` updates after every status change
- [ ] `GET /api/documents/me` returns correct statuses and notes to freelancer
- [ ] `GET /api/freelancers/:id` includes `verification.level` and `verifiedDocumentCount`
- [ ] `GET /api/freelancers?verified=true` filters correctly
- [ ] `GET /api/storage/objects/documents/*` returns 403 without admin session
- [ ] Admin queue shows `needs_review` documents with signed URL access
- [ ] Admin can override verdict to `verified` or `rejected` with a note
- [ ] Freelancer profile shows all 3 document types with correct status UI
- [ ] Verified badge appears on Talent Vault cards and freelancer detail page
- [ ] "Verified only" filter works on Talent Vault
- [ ] AI disclaimer shown on `/freelancers/:id` verification section
- [ ] `pnpm typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 → 1.2 → 1.3 → 1.4 → 1.5
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7 → 2.8 → 2.9 → 2.10
Task 3.1 (after 2.10 codegen confirmed) → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8
Task 4.1 (after 3.4 VerificationBadge exists)
```

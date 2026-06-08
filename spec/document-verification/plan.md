# TalentLock — Implementation Plan: Document Verification Feature

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## What This File Is

`clarify.md` identified 9 open questions and 5 architectural risks. This file closes all of them with a final, binding decision and exact implementation guidance. No question should remain open after reading this file.

---

## Resolved Questions

---

### Q1 — GCS Storage Path Convention

**Decision: Option A — `documents/{userId}/{documentType}/{filename}`**

```ts
// Path passed to POST /api/storage/uploads/request-url
// Example: documents/user_2abc123/government_id/passport-scan.jpg
const storagePath = `documents/${internalUserId}/${documentType}/${filename}`;
```

- `documentType` is one of: `government_id` | `professional_credential` | `portfolio_proof`
- `filename` is a UUID + original extension: `${crypto.randomUUID()}${ext}`
- The path is stored in `documents.fileUrl` as the full GCS object key (not a full URL)
- When serving to admins, the server constructs a signed URL: `GET /api/storage/objects/documents/{userId}/{documentType}/{filename}`

---

### Q2 — PDF Support

**Decision: Image-only in this phase. PDFs rejected at upload validation.**

Accepted MIME types:
```ts
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
```

If the freelancer uploads a PDF, the presigned URL request returns:
```json
HTTP 400
{ "error": "Only JPEG, PNG, and WebP images are accepted. PDF support coming soon.", "code": "INVALID_FILE_TYPE" }
```

The frontend validates MIME type client-side before requesting the presigned URL, showing the same error message inline without a server round-trip.

---

### Q3 — AI Review Trigger: Fire-and-Forget

**Decision: Option C — fire-and-forget within the same Node.js process.**

The upload endpoint:
1. Saves the document row with `status: 'pending'`
2. Returns `HTTP 201` immediately
3. Calls `triggerDocumentReview(documentId)` without `await` — non-blocking

```ts
// In POST /api/documents route handler
const doc = await saveDocument(db, freelancerId, documentType, storagePath);
// Non-awaited — fire and forget
triggerDocumentReview(db, doc.id).catch(err =>
  req.log.error({ err, documentId: doc.id }, 'document review failed to start')
);
return res.status(201).json(doc);
```

`triggerDocumentReview()` is defined in `artifacts/api-server/src/lib/documentReview.ts`:
1. Fetches the document row
2. Generates a signed GCS URL (15-minute TTL) for the file
3. Calls OpenAI vision with the signed URL
4. Parses the structured JSON response
5. Updates the document row with the verdict, confidence, and notes
6. Calls `logTokenUsage(db, SYSTEM_USER_ID, 'document_verification', usage)`

**Stuck-pending safety net:** If a document has `status = 'pending'` and `updatedAt < now - 10 minutes`, the `GET /api/documents/me` handler automatically sets it to `needs_review` before returning. This is a read-time repair — no cron job needed.

---

### Q4 — Token Logging: System User

**Decision: Option A — `SYSTEM_USER_ID = 'system'` constant.**

```ts
// In artifacts/api-server/src/lib/constants.ts (create if not exists)
export const SYSTEM_USER_ID = 'system';
```

Update `logTokenUsage()` signature:
```ts
// lib/tokenLogger.ts
export async function logTokenUsage(
  db: DB,
  userId: string | 'system',  // ← updated
  feature: TokenFeature,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
  conversationId?: string
)
```

Update `checkTokenQuota()`:
```ts
// lib/subscriptionGating.ts
if (userId === 'system') return { allowed: true }; // ← add this guard at top
```

The `token_usage.userId` column is `TEXT NOT NULL` — `'system'` is a valid string value. No schema change needed.

---

### Q5 — Maximum File Size

**Decision: 10MB per document.**

```ts
// Enforced in two places:
// 1. Client-side before requesting presigned URL
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
if (file.size > MAX_FILE_SIZE_BYTES) {
  setError('File must be 10MB or smaller.');
  return;
}
// 2. Presigned URL request includes content-length-range condition (GCS policy)
// The backend passes maxSize: 10485760 to the presigned URL generator
```

---

### Q6 — Re-upload Behaviour

**Decision: Option C — update in place with unique constraint.**

```ts
// Schema: unique constraint on (freelancerId, documentType)
// lib/db/schema.ts
export const documents = pgTable('documents', {
  // ... columns
}, (t) => ({
  uniq: unique().on(t.freelancerId, t.documentType),
}));
```

Re-upload upsert using Drizzle `onConflictDoUpdate`:
```ts
await db.insert(documents)
  .values({ freelancerId, documentType, fileUrl, status: 'pending', aiNotes: null, confidence: null })
  .onConflictDoUpdate({
    target: [documents.freelancerId, documents.documentType],
    set: {
      fileUrl,
      status: 'pending',
      aiNotes: null,
      confidence: null,
      updatedAt: new Date(),
    }
  });
```

This is atomic — no race condition. Old file URL is overwritten; old GCS file is NOT deleted (storage cleanup is out of scope for this phase).

---

### Q7 — Employer Document Visibility

**Decision: Option A — employers see verified count and overall level only. No rejected/pending details shown to employers.**

```ts
// GET /api/freelancers/:id response — add to existing response shape
verificationLevel: 'unverified' | 'partially_verified' | 'fully_verified',
verifiedDocumentCount: number,
// employer sees NOTHING about rejected or pending documents
```

Verification level calculation:
```ts
const verifiedCount = documents.filter(d => d.status === 'verified').length;
const verificationLevel =
  verifiedCount === 0 ? 'unverified' :
  verifiedCount === 1 ? 'partially_verified' : 'fully_verified';
```

---

### Q8 — Talent Vault Verified Filter

**Decision: `?verified=true` query param on `GET /api/freelancers`.**

```ts
// In GET /api/freelancers handler
if (query.verified === 'true') {
  // Add WHERE EXISTS (
  //   SELECT 1 FROM documents
  //   WHERE documents.freelancer_id = freelancer_profiles.id
  //   AND documents.status = 'verified'
  // )
}
```

The OpenAPI spec adds `verified` as an optional boolean query param on `GET /api/freelancers`.

---

### Q9 — Admin `needs_review` Notification

**Decision: Option A — no email. Tab badge only.**

The admin "Document Review" tab label shows a count badge: `Document Review (3)` when there are pending manual reviews. Count is fetched from a new `GET /api/admin/documents` endpoint that returns the queue. No email, no push — those are deferred to when the Notifications Centre feature ships.

---

## Resolved Risks

---

### Risk 1 — OpenAI Vision Accuracy Disclaimer

**Resolution: Display a disclaimer wherever the Verified badge appears.**

On `/freelancers/:id` alongside the verification section:
```
ℹ Document reviewed by AI — not a legal identity verification.
```

`text-xs text-muted-foreground`

The same disclaimer appears as a tooltip on the Verified badge on Talent Vault cards when hovered.

The AI system prompt must also set expectations clearly:

```
You are reviewing a document image for a freelance platform. Assess whether the document appears to be:
- A genuine, legible identity document or professional credential
- Free from obvious signs of tampering or digital manipulation
- Matching the submitted document type

Return ONLY a JSON object — no preamble, no markdown:
{
  "verdict": "verified" | "rejected" | "needs_review",
  "confidence": number (0-100),
  "notes": "Brief plain-English reason, max 2 sentences. Be specific about why rejected."
}

If you cannot determine authenticity with reasonable confidence, return "needs_review".
Do NOT attempt to extract personal data (name, DOB, ID numbers) from the document.
```

---

### Risk 2 — GCS File Privacy (Signed URLs)

**Resolution: Documents are NEVER served via public GCS URLs. All access goes through the server.**

- The `documents.fileUrl` column stores the GCS object key only (not a public URL)
- `GET /api/storage/objects/*path` currently serves objects — it must be gated: if the path starts with `documents/`, require admin session (`requireAdmin` middleware)
- Admin document view: server generates a signed URL with 15-minute TTL, returns it to the admin client only
- Freelancer never receives a URL to their own document file (they uploaded it, they don't need to view it back)

```ts
// In GET /api/storage/objects/*path handler — add guard
if (req.params.path.startsWith('documents/')) {
  if (!req.adminSession) return res.status(403).json({ error: 'Forbidden' });
}
```

---

### Risk 3 — Stuck-Pending Safety Net

**Resolution: Read-time repair in `GET /api/documents/me`.**

```ts
// In GET /api/documents/me handler, before returning results
const TEN_MINUTES_AGO = new Date(Date.now() - 10 * 60 * 1000);
await db.update(documents)
  .set({ status: 'needs_review', aiNotes: 'AI review timed out — queued for manual review.' })
  .where(
    and(
      eq(documents.freelancerId, freelancerId),
      eq(documents.status, 'pending'),
      lt(documents.updatedAt, TEN_MINUTES_AGO)
    )
  );
// Then fetch and return documents
```

---

### Risk 4 — Unique Constraint Race Condition

**Resolution: Drizzle `onConflictDoUpdate` — atomic upsert. Documented in Q6 above. No additional handling needed.**

---

### Risk 5 — Codegen Export Rules

**Resolution: Same mandatory post-codegen checks as all previous features.**

After `pnpm --filter @workspace/api-spec run codegen`:
1. Verify `lib/api-zod/orval.config.ts` still has `indexFiles: false`
2. Verify `lib/api-zod/src/index.ts` only exports `./generated/api`
3. Run `pnpm typecheck` before proceeding to Phase 3

---

## New Token Feature Label

Add `document_verification` to the `TokenFeature` union type:

```ts
// In artifacts/api-server/src/lib/tokenLogger.ts
export type TokenFeature =
  | 'ai_match'
  | 'agreement_generation'
  | 'ai_match_explanation'
  | 'contract_redlining'
  | 'job_description_assistant'
  | 'interview_questions'
  | 'document_verification'  // ← new
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/document-verification/features.md` read
- [ ] `specs/document-verification/clarify.md` read
- [ ] This `plan.md` read — all 9 questions and 5 risks are resolved
- [ ] `specs/document-verification/task.md` read — phase order understood
- [ ] `specs/document-verification/UI.md` read — all component states understood
- [ ] Token-consumption feature confirmed deployed (logTokenUsage live)
- [ ] GCS storage confirmed working (portfolio/signature uploads functional)
- [ ] OpenAI client confirmed accessible server-side

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Database — `documents` table + migration | ⬜ Not started |
| Phase 2 | Backend — upload route, review pipeline, endpoints, OpenAPI, codegen | ⬜ Not started |
| Phase 3 | Frontend — freelancer profile, employer views, Talent Vault filter | ⬜ Not started |
| Phase 4 | Admin — document review queue tab | ⬜ Not started |

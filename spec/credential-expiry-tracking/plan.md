# TalentLock — Implementation Plan: Credential Expiry Tracking

> **Status: APPROVED — Ready for implementation**
> Resolves every question from `clarify.md` with exact code. Wins over `task.md` on conflict.

---

## Pre-Implementation Codebase Checks (already run — results below)

```bash
grep -A 5 "documentsTable = pgTable" lib/db/src/schema/documents.ts        # status enum: pending|verified|rejected|needs_review, no expiry column
grep -n "teachingLicenceExpiry\|dbsCheckStatus" lib/db/src/schema/freelancerProfiles.ts   # both exist; dbsCheckStatus has no date field
grep -n "updateVerificationLevel" artifacts/api-server/src/lib/documentReview.ts          # counts status='verified' only — reused as-is
grep -n "app.use(\"/api/admin\"" artifacts/api-server/src/app.ts                          # CSRF middleware scoped to /api/admin — new cron route must live outside this prefix
```

Confirmed: no cron/scheduler infra anywhere; `.replit` deployment target is `autoscale`.

---

## Resolved Decisions

### D1 — Schema additions

**File:** `lib/db/src/schema/documents.ts`

```ts
expiryDate: timestamp("expiry_date", { withTimezone: true }),
expiryAlertStage: text("expiry_alert_stage").notNull().default("none"),
// none | 90d | 30d | 7d | expired
```

**File:** `lib/db/src/schema/freelancerProfiles.ts`

```ts
teachingLicenceAlertStage: text("teaching_licence_alert_stage").notNull().default("none"),
// none | 90d | 30d | 7d | expired
```

**File:** `artifacts/api-server/src/lib/documentConstants.ts` — extend status list:

```ts
export const DOCUMENT_STATUSES = [
  "pending",
  "verified",
  "rejected",
  "needs_review",
  "expired",
] as const;
```

### D2 — Shared expiry-stage utility (new file)

**File:** `artifacts/api-server/src/lib/credentialExpiryUtils.ts`

```ts
export const EXPIRY_ALERT_STAGES = ["none", "90d", "30d", "7d", "expired"] as const;
export type ExpiryAlertStage = (typeof EXPIRY_ALERT_STAGES)[number];

const STAGE_ORDER: Record<ExpiryAlertStage, number> = { none: 0, "90d": 1, "30d": 2, "7d": 3, expired: 4 };

export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function targetStageForDaysRemaining(daysRemaining: number): ExpiryAlertStage {
  if (daysRemaining <= 0) return "expired";
  if (daysRemaining <= 7) return "7d";
  if (daysRemaining <= 30) return "30d";
  if (daysRemaining <= 90) return "90d";
  return "none";
}

export function stageAdvanced(current: string | null | undefined, target: ExpiryAlertStage): boolean {
  const cur = (EXPIRY_ALERT_STAGES as readonly string[]).includes(current ?? "")
    ? (current as ExpiryAlertStage)
    : "none";
  return STAGE_ORDER[target] > STAGE_ORDER[cur];
}

export function alertCopyForStage(stage: ExpiryAlertStage, credentialLabel: string, daysRemaining: number) {
  switch (stage) {
    case "90d":
      return {
        subject: "Your credential expires in about 90 days",
        message: `${credentialLabel} expires in ${daysRemaining} days. Renew it soon to keep your verification current.`,
        email: true,
        inApp: false,
      };
    case "30d":
      return {
        subject: "Your credential expires in 30 days",
        message: `${credentialLabel} expires in ${daysRemaining} days. Please renew it to avoid losing your verified status.`,
        email: true,
        inApp: true,
      };
    case "7d":
      return {
        subject: "Urgent: your credential expires in 7 days",
        message: `${credentialLabel} expires in ${daysRemaining} days. Renew it now to avoid losing your verified status and Talent Vault visibility.`,
        email: true,
        inApp: true,
      };
    case "expired":
      return {
        subject: "Your credential has expired",
        message: `${credentialLabel} has expired. Please upload a renewed document to restore your verified status.`,
        email: true,
        inApp: true,
      };
    default:
      return null;
  }
}
```

### D3 — Cron endpoint (outside `/api/admin` to avoid CSRF middleware)

**File:** `artifacts/api-server/src/lib/cronAuth.ts` (new)

```ts
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.CRON_SECRET;
  if (!configured) {
    res.status(500).json({ error: "Cron not configured" });
    return;
  }
  const provided = req.header("x-cron-secret");
  if (typeof provided !== "string" || !timingSafeEqualStr(provided, configured)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
```

**File:** `artifacts/api-server/src/lib/credentialExpiryScan.ts` (new) — core scan logic, DB-only, testable in isolation:

```ts
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db, documentsTable, freelancerProfilesTable } from "@workspace/db";
import { updateVerificationLevel } from "./documentReview";
import { createNotification, NotificationType, userIdFromFreelancerProfileId } from "./createNotification";
import { sendNotificationEmailAsync } from "./emailService";
import { daysUntil, targetStageForDaysRemaining, stageAdvanced, alertCopyForStage } from "./credentialExpiryUtils";
import type { Logger } from "pino";

export interface CredentialExpiryScanResult {
  documentsScanned: number;
  documentAlertsSent: number;
  documentsExpired: number;
  licencesScanned: number;
  licenceAlertsSent: number;
}

export async function runCredentialExpiryScan(log: Logger): Promise<CredentialExpiryScanResult> {
  const now = new Date();
  const result: CredentialExpiryScanResult = {
    documentsScanned: 0, documentAlertsSent: 0, documentsExpired: 0,
    licencesScanned: 0, licenceAlertsSent: 0,
  };

  const docs = await db.select().from(documentsTable)
    .where(and(isNotNull(documentsTable.expiryDate), ne(documentsTable.expiryAlertStage, "expired")));

  for (const doc of docs) {
    if (!doc.expiryDate) continue;
    result.documentsScanned += 1;
    const remaining = daysUntil(doc.expiryDate, now);
    const target = targetStageForDaysRemaining(remaining);
    if (!stageAdvanced(doc.expiryAlertStage, target)) continue;

    const shouldFlipStatus = target === "expired" && doc.status === "verified";
    await db.update(documentsTable)
      .set({
        expiryAlertStage: target,
        status: shouldFlipStatus ? "expired" : doc.status,
        updatedAt: now,
      })
      .where(eq(documentsTable.id, doc.id));

    if (shouldFlipStatus) {
      await updateVerificationLevel(db, doc.freelancerId);
      result.documentsExpired += 1;
    }

    const copy = alertCopyForStage(target, "Your professional credential", remaining);
    if (copy) {
      const userId = await userIdFromFreelancerProfileId(doc.freelancerId);
      if (userId) {
        if (copy.inApp) {
          createNotification(db, {
            userId, type: NotificationType.CREDENTIAL_EXPIRING,
            entityType: "document", entityId: doc.id, message: copy.message,
          }).catch((err) => log.warn({ err }, "credential expiry notification failed"));
        }
        if (copy.email) {
          sendNotificationEmailAsync(db, userId, copy.subject, copy.message, "/profile", log);
        }
        result.documentAlertsSent += 1;
      }
    }
  }

  const freelancers = await db.select().from(freelancerProfilesTable)
    .where(and(
      isNotNull(freelancerProfilesTable.teachingLicenceExpiry),
      ne(freelancerProfilesTable.teachingLicenceAlertStage, "expired"),
    ));

  for (const fp of freelancers) {
    if (!fp.teachingLicenceExpiry) continue;
    result.licencesScanned += 1;
    const remaining = daysUntil(fp.teachingLicenceExpiry, now);
    const target = targetStageForDaysRemaining(remaining);
    if (!stageAdvanced(fp.teachingLicenceAlertStage, target)) continue;

    await db.update(freelancerProfilesTable)
      .set({ teachingLicenceAlertStage: target, updatedAt: now })
      .where(eq(freelancerProfilesTable.id, fp.id));

    const copy = alertCopyForStage(target, "Your teaching licence", remaining);
    if (copy) {
      createNotification(db, {
        userId: fp.userId, type: NotificationType.CREDENTIAL_EXPIRING,
        entityType: "freelancer_profile", entityId: fp.id, message: copy.message,
      }).catch((err) => log.warn({ err }, "licence expiry notification failed"));
      sendNotificationEmailAsync(db, fp.userId, copy.subject, copy.message, "/profile", log);
      result.licenceAlertsSent += 1;
    }
  }

  return result;
}
```

**File:** `artifacts/api-server/src/routes/cron.ts` (new)

```ts
import { Router } from "express";
import { requireCronSecret } from "../lib/cronAuth";
import { runCredentialExpiryScan } from "../lib/credentialExpiryScan";

const router = Router();

router.post("/cron/credential-expiry", requireCronSecret, async (req, res) => {
  try {
    const result = await runCredentialExpiryScan(req.log);
    req.log.info({ result }, "Credential expiry scan complete");
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log.error({ err }, "Credential expiry scan failed");
    res.status(500).json({ error: "Scan failed" });
  }
});

export default router;
```

Register in `artifacts/api-server/src/routes/index.ts`: `router.use(cronRouter);` — mounted under `/api` (not `/api/admin`), so `app.use("/api/admin", ...)` CSRF middleware never applies to `/api/cron/credential-expiry`.

**New notification type** — `artifacts/api-server/src/lib/createNotification.ts`:

```ts
CREDENTIAL_EXPIRING: "credential_expiring",
```

### D4 — `POST /documents/confirm` resets expiry on re-upload; accepts optional `expiryDate`

**File:** `artifacts/api-server/src/routes/documents.ts` — extend `PostDocumentsConfirmBody` and both insert/upsert value sets:

```ts
const PostDocumentsConfirmBody = z.object({
  documentType: z.string(),
  storagePath: z.string(),
  expiryDate: z.string().datetime().nullable().optional(),
});
```

Insert/upsert `values`/`set` both include:

```ts
expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
expiryAlertStage: "none",
```

New endpoint to edit expiry without re-uploading:

```ts
router.patch("/documents/:documentType/expiry", async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  if (!clerkId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const documentType = req.params.documentType;
  if (!isDocumentType(documentType)) { res.status(400).json({ error: "Invalid document type" }); return; }
  const parsed = z.object({ expiryDate: z.string().datetime().nullable() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "expiryDate required (ISO date-time or null)" }); return; }
  try {
    const ctx = await resolveFreelancerContext(clerkId);
    if (!ctx) { res.status(404).json({ error: "User not found" }); return; }
    if (ctx.forbidden || !ctx.profile) { res.status(403).json({ error: "Freelancer profile required" }); return; }
    const [updated] = await db.update(documentsTable)
      .set({
        expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
        expiryAlertStage: "none",
        updatedAt: new Date(),
      })
      .where(and(eq(documentsTable.freelancerId, ctx.profile.id), eq(documentsTable.documentType, documentType)))
      .returning({ id: documentsTable.id });
    if (!updated) { res.status(404).json({ error: "Document not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update document expiry");
    res.status(500).json({ error: "Internal server error" });
  }
});
```

`GET /documents/me` response gains `expiryDate` and a derived `daysUntilExpiry` per document (only when `expiryDate` is set):

```ts
documents.map((doc) => ({
  ...doc,
  updatedAt: doc.updatedAt.toISOString(),
  expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : null,
  daysUntilExpiry: doc.expiryDate ? daysUntil(doc.expiryDate) : null,
}))
```

### D5 — Teaching licence renewal resets alert stage

**File:** `artifacts/api-server/src/routes/freelancers.ts` — `PATCH /freelancers/me` handler, where `merged` is built:

```ts
if (
  data.teachingLicenceExpiry !== undefined &&
  data.teachingLicenceExpiry !== current.teachingLicenceExpiry?.toISOString()
) {
  (data as any).teachingLicenceAlertStage = "none";
}
```

### D6 — Talent Vault exclusion (Q3 scope)

**File:** `artifacts/api-server/src/routes/freelancers.ts` — `GET /freelancers`, added alongside the existing `completenessScore >= 60` condition:

```ts
import { eq, and, or, isNull, lte, gte, sql, SQL, exists, not, lt, isNotNull, inArray } from "drizzle-orm";

// ...
conditions.push(
  not(
    and(
      eq(freelancerProfilesTable.professionCategory, "education"),
      eq(freelancerProfilesTable.educationProfessionType, "school_teacher"),
      isNotNull(freelancerProfilesTable.teachingLicenceExpiry),
      lt(freelancerProfilesTable.teachingLicenceExpiry, new Date()),
    )!,
  )!,
);
```

`GET /freelancers/:id` and `/f/:id` (public profile) are **unaffected** — direct-link access always works regardless of Vault visibility, matching the existing pattern for `completenessScore < 60` freelancers (never blocked from direct access, only excluded from list/search).

### D7 — Vault "Expiring Soon" indicator

**File:** `artifacts/api-server/src/routes/freelancers.ts` — after fetching `results`, before `res.json`:

```ts
const now = new Date();
const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
const freelancerIds = results.map((r) => r.id);

const expiringDocs = freelancerIds.length
  ? await db.select({ freelancerId: documentsTable.freelancerId, expiryDate: documentsTable.expiryDate })
      .from(documentsTable)
      .where(and(
        inArray(documentsTable.freelancerId, freelancerIds),
        eq(documentsTable.status, "verified"),
        isNotNull(documentsTable.expiryDate),
        gte(documentsTable.expiryDate, now),
        lte(documentsTable.expiryDate, sevenDaysOut),
      ))
  : [];
const docExpiryByFreelancer = new Map(expiringDocs.map((d) => [d.freelancerId, d.expiryDate!]));

res.json(results.map((p) => {
  const mapped = mapProfile(p);
  let soonest: Date | null = docExpiryByFreelancer.get(p.id) ?? null;
  if (p.teachingLicenceExpiry && p.teachingLicenceExpiry >= now && p.teachingLicenceExpiry <= sevenDaysOut) {
    if (!soonest || p.teachingLicenceExpiry < soonest) soonest = p.teachingLicenceExpiry;
  }
  return {
    ...mapped,
    expiringCredential: soonest ? { daysRemaining: daysUntil(soonest, now) } : null,
  };
}));
```

Import `daysUntil` from `../lib/credentialExpiryUtils`.

### D8 — GitHub Actions scheduled trigger

**File:** `.github/workflows/credential-expiry-cron.yml` (new)

```yaml
name: Credential Expiry Cron

on:
  schedule:
    - cron: "0 7 * * *"   # 07:00 UTC daily
  workflow_dispatch: {}

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger credential expiry scan
        run: |
          curl -sf -X POST "${{ secrets.API_BASE_URL }}/api/cron/credential-expiry" \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
```

Requires GitHub repo secrets `API_BASE_URL` and `CRON_SECRET` (same value as the API server's `CRON_SECRET` env var). Documented in `plan.md`/`validation.md` — not auto-configurable by the agent.

### D9 — OpenAPI additions

- `Freelancer` schema: add `expiringCredential` (nullable object `{ daysRemaining: integer }`)
- `DocumentsConfirmBody`: add optional `expiryDate` (nullable string date-time)
- `DocumentMeItem`: add `expiryDate` (nullable date-time), `daysUntilExpiry` (nullable integer), extend `status` description to include `expired`
- New path `/documents/{documentType}/expiry` PATCH
- New path `/cron/credential-expiry` POST (tag `cron`, documented for completeness even though it's machine-only — no Clerk auth, so excluded from the React Query codegen usage but still contract-documented)

---

## New Environment Variable

| Variable | Required | Purpose |
|---|---|---|
| `CRON_SECRET` | Required for the cron endpoint to function (fails closed with 500 if unset, same pattern as `CSRF_SECRET`) | Shared secret compared via timing-safe check against `x-cron-secret` header |

---

## Pre-Implementation Checklist

- [ ] Confirm `documents` table has no existing `expiry_date`/`expiry_alert_stage` columns (checked — none)
- [ ] Confirm `/api/admin` CSRF middleware would otherwise apply to any route under that prefix (checked — yes, hence new route lives at `/api/cron/*`)
- [ ] Confirm `updateVerificationLevel()` signature accepts a `DbClient` compatible with plain `db` (checked — yes)
- [ ] Run `pnpm --filter @workspace/db run push` after schema edits
- [ ] Run codegen + `pnpm run typecheck` before frontend work

---

## Phase Sign-Off

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Database — `documents.expiryDate`/`expiryAlertStage`, `freelancer_profiles.teachingLicenceAlertStage` | ✅ Complete; `db push` run by user against the real database 2026-07-21 |
| 2 | Backend — utils, scan logic, cron route, confirm/expiry endpoints, Vault query, OpenAPI + codegen | ✅ Complete; typechecked; 15 unit tests added; live-verified end-to-end against the real database (16/16 seeded scenario checks + auth paths + success path) 2026-07-21 |
| 3 | Frontend — badges, banners, GitHub Actions cron workflow | ✅ Complete; typechecked; visual QA pending a running dev server |

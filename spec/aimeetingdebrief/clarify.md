# TalentLock — Clarification & Verification: AI Meeting Brief Generator

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `meetings` table exists with `status` column | Confirmed in `project.md` schema |
| `PATCH /api/meetings/:id` is the update route | Confirmed in `project.md` API routes |
| `GET /api/meetings/:id` is the detail route | Confirmed |
| `freelancer_profiles` has `skills`, `rate`, `bio`, `fieldOfWork`, `completenessScore`, `averageRating`, `reviewCount` | Confirmed in `project.md` |
| `job_requirements` has title, description, required skills, budget/rate columns | Confirmed |
| `rateSuggestionUtils.ts` exists with `getMarketMedian()` and `getEmployerHistoricalAvg()` | Confirmed — Smart Rate Suggestions feature |
| `earningsUtils.ts` exists for earnings/market calculations | Confirmed — Dashboard analytics |
| `sendNotificationEmail()` available for email delivery | Confirmed |
| `createNotification()` fire-and-forget pattern established | Confirmed — 15+ notification types |
| OpenAI client available server-side | Confirmed |
| `logTokenUsage()` + `TokenFeature` union exists | Confirmed |
| `sanitiseText()` for all free-text writes | Confirmed |
| `accessControl.ts` pattern for employer-only routes | Confirmed |
| Fire-and-forget `.catch()` pattern — never awaited from route handlers | Confirmed — Cursor notes |
| Documents table exists for credential verification status | Confirmed |
| `employer_profiles` linked to employer identity | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — What Are the Exact `meetings` Table Columns?

**Question:** The brief is cached on the `meetings` table as `briefContent` and `briefGeneratedAt`. Before adding these columns, confirm the exact existing column names on `meetings` — particularly `status` values and the columns linking the meeting to the booking or job requirement.

**Recommendation:**
```bash
grep -A 30 "meetings\s*=" lib/db/src/schema/*.ts | head -35
```

Specifically looking for:
- What values can `status` take? (`pending`, `confirmed`, `cancelled`, `completed`?)
- Does the meeting link to a `bookingId` or directly to `jobRequirementId`?
- Does the meeting link to a `freelancerId` and `employerId` directly?
- Is there a `scheduledAt` or `meetingDate` column?

The answers determine how to query the job requirement and both parties when the brief is generated.

---

### Q2 — What Triggers the Meeting Status Change to `confirmed`?

**Question:** The brief fires when `status` changes to `'confirmed'`. Confirm who sets this status and via what action. Options:

- **(A)** The employer confirms the meeting (after freelancer proposes it)
- **(B)** The freelancer confirms (accepts the meeting time)
- **(C)** Either party can confirm depending on who initiated

**Impact:** The brief is employer-facing only. If the freelancer is the one who changes status to `confirmed`, the server still has the employer's context from the meeting row and can generate the brief correctly — but the notification goes to the employer, not the confirming party.

**Recommendation:** Inspect the `PATCH /api/meetings/:id` handler to confirm:
```bash
grep -A 20 "status.*confirmed\|confirmed.*status" artifacts/api-server/src/routes/meetings.ts
```

The brief generation is status-change-based regardless of who triggered it — the confirmation action always produces a brief for the employer.

---

### Q3 — Does `meetings` Already Link to `jobRequirementId`?

**Question:** The brief requires the job requirement (title, description, required skills, budget) to generate the "why they match" section and the tailored questions. If `meetings` does not have a direct `jobRequirementId` FK, the brief generator must navigate via `bookings` to find the relevant job.

**Options for the join path:**
- **(A)** `meetings.jobRequirementId` → `job_requirements.id` (direct)
- **(B)** `meetings.bookingId` → `bookings.jobRequirementId` → `job_requirements.id` (one hop)
- **(C)** `meetings.freelancerId` + `meetings.employerId` — query latest booking between the two parties

**Recommendation:** Inspect the schema to find the correct path. If no join to job requirements exists, fall back to Option C — find the most recent booking between the employer and freelancer and use its linked job requirement.

---

### Q4 — What Is `rateSuggestionUtils.ts` Function Signature?

**Question:** The brief's rate context section calls `getMarketMedian()` and `getEmployerHistoricalAvg()`. Confirm the exact function signatures — particularly what parameters they accept.

**Recommendation:**
```bash
cat artifacts/api-server/src/lib/rateSuggestionUtils.ts
```

The brief generator calls these functions at brief generation time and embeds the results in `briefContent.rateContext`. This is read-only usage — these functions are not modified.

---

### Q5 — Is `briefContent` the Right Cache Location, or Should It Be a Separate Table?

**Question:** Caching the brief as a `jsonb` column on `meetings` is simple and requires no new table. However, if a single meeting can have multiple briefs (e.g. the employer regenerates after the job requirements change), a separate `meeting_briefs` table with version history might be preferred.

**Options:**
- **(A)** `jsonb` on `meetings` — simple, single current brief only (regeneration overwrites)
- **(B)** Separate `meeting_briefs` table with `meetingId`, `version`, `content`, `createdAt`

**Recommendation: Option A.** The features spec explicitly states that brief history is a non-goal. One brief per meeting, overwritten on regeneration. The `briefGeneratedAt` timestamp tells the employer when it was last generated. If brief versioning is ever needed, it can be added later as a separate table without breaking the current cached-on-meeting pattern.

---

### Q6 — Should the Brief Be Generated for All Plans or Gated?

**Question:** `features.md` gates AI-generated questions behind `employer_growth` and above. For `employer_starter`, only the candidate snapshot and rate context are generated. This creates two code paths in the brief generator.

**Options:**
- **(A)** One prompt for all plans — full brief always generated; questions section displayed conditionally in the UI only
- **(B)** Two separate prompts — starter gets a short prompt (no questions), growth+ gets the full prompt

**Recommendation: Option A.** Always generate the full brief regardless of plan. In the frontend, the questions section is conditionally replaced with an upgrade prompt for `employer_starter`. This is simpler server-side, easier to test, and avoids two prompt paths. The token cost difference between a brief with and without questions is minimal (~150 tokens) — not worth the complexity of two code paths.

---

### Q7 — What Verified Credential Types Should Be Shown in the Snapshot?

**Question:** The candidate snapshot includes "Verified Credentials" from the `documents` table. What document types should be surfaced in the brief?

**Recommendation:** Query `documents` for all rows where `freelancerId = meeting.freelancerId` AND `status = 'verified'`. Map `documentType` to a human-readable label:

```ts
const DOCUMENT_LABELS: Record<string, string> = {
  identity:             'Identity Verified',
  degree_certificate:   'Degree Verified',
  teaching_licence:     'Teaching Licence Verified',
  dbs_check:            'DBS Checked',
  transcripts:          'Transcripts Verified',
  professional_licence: 'Professional Licence Verified',
};
```

If no verified documents: "No documents verified yet" — shown without a ✅ badge.

---

## ⚠️ Risks & Notes

### Risk 1 — Brief Generation Fails Silently

If the OpenAI call fails, the meeting is still confirmed correctly. The brief simply does not exist (`briefContent` remains null). The meeting detail page must handle `briefContent === null` gracefully — showing a "Brief not yet generated" state with a "Generate brief" button rather than an error.

**Mitigation:** The fire-and-forget `.catch()` logs the failure. The `POST /api/meetings/:id/brief` manual route provides a retry mechanism. The frontend checks `briefContent !== null` before rendering the brief card.

### Risk 2 — Job Requirement Not Found

If the meeting has no resolvable link to a job requirement (no `jobRequirementId` and no associated booking), the brief generator cannot produce "why they match" or tailored questions.

**Mitigation:** If no job requirement is found, generate a partial brief — candidate snapshot and rate context only. The "why they match" section says "No job requirement linked to this meeting — add one to unlock full brief." Log this as a warning (not an error).

### Risk 3 — Brief Generated for Wrong Meeting State

If a meeting is confirmed and then immediately cancelled, the brief generation (which is fire-and-forget) may complete after the cancellation. The meeting would then have a brief despite being cancelled.

**Mitigation:** At the start of `generateMeetingBrief()`, re-fetch the meeting and check that `status` is still `'confirmed'`. If not, exit without generating.

```ts
const freshMeeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
if (freshMeeting?.status !== 'confirmed') return; // Status changed before generation completed
```

### Risk 4 — `rateSuggestionUtils.ts` Requires DB Access

If `getMarketMedian()` requires a database connection, confirm that the brief generator passes the `db` instance correctly. The function should not open a new connection — it should receive the shared `db` instance from the route handler.

### Risk 5 — Brief Token Cost at Scale

At 700 tokens per brief × 100 confirmed meetings/day = 70,000 tokens/day platform-wide. At GPT-4o pricing this is approximately $0.70/day — negligible. However, if the platform scales to 10,000 meetings/day, monitor token costs via the admin token-usage dashboard.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | `meetings` exact columns (status values, FK to job/booking/freelancer) | Task 1.1 (schema inspection) and Task 2.2 (brief generator) |
| Q2 | Who triggers `confirmed` status | Task 2.1 (hook placement in meetings route) |
| Q3 | Join path from meeting → job requirement | Task 2.2 (brief generator data loading) |
| Q4 | `rateSuggestionUtils.ts` function signatures | Task 2.2 (rate context section) |

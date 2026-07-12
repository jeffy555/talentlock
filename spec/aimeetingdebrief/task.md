# TalentLock — Task Breakdown: AI Meeting Brief Generator

---

## Summary

Three phases: Database (2 new columns on `meetings`) → Backend (`meetingBriefGenerator.ts`, hook in meetings route, 1 new route, OpenAPI + codegen) → Frontend (brief card on meeting detail page, plan-gated questions, regenerate button). No new tables. No changes to any other route or table.

---

## Phase 1 — Database

### Task 1.1 — Codebase Inspection

Run all pre-implementation checks from `plan.md`. Document and confirm:
- Exact `meetings` table columns — especially `status` values, `freelancerId`, `employerId`, and any FK to `jobRequirementId` or `bookingId`
- Exact location of `PATCH /api/meetings/:id` handler and where `status` is written
- Confirmed `rateSuggestionUtils.ts` export names for market median and employer historical average
- `meeting_brief` token label confirmed absent from `tokenLogger.ts`
- No existing `briefContent` or `brief_content` column on `meetings`

### Task 1.2 — Add Columns to `meetings`

**File:** `lib/db/src/schema/` — meetings table

```ts
briefContent:     jsonb('brief_content').$type<MeetingBrief>(),
briefGeneratedAt: timestamp('brief_generated_at', { withTimezone: true }),
```

Both nullable — existing confirmed meetings will have `null` brief. No backfill needed — they can be generated on demand via `POST /api/meetings/:id/brief`.

### Task 1.3 — Export `MeetingBrief` Type

**File:** `lib/db/src/schema/` (or a shared types file)

```ts
export interface MeetingBrief {
  candidateSnapshot: {
    name: string;
    field: string;
    experience: string;
    rate: number;
    rateType: string;
    completenessScore: number;
    averageRating: number;
    reviewCount: number;
    verifiedCredentials: string[];
  };
  whyTheyMatch: string[];
  suggestedQuestions: string[];
  rateContext: {
    proposedRate: number;
    jobBudgetMin: number | null;
    jobBudgetMax: number | null;
    marketMedian: number;
    platformPercentile: number;
    employerHistoricalAvg: number;
    assessment: string;
    withinBudget: boolean;
  };
  watchPoints: string[];
  generatedAt: string;
}
```

### Task 1.4 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'meetings'
AND column_name IN ('brief_content', 'brief_generated_at');
```

- [ ] Both columns present and nullable
- [ ] All existing meeting rows have `brief_content IS NULL`
- [ ] All existing meeting rows have `brief_generated_at IS NULL`

---

## Phase 2 — Backend

### Task 2.1 — Add Token Feature

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

```ts
| 'meeting_brief'   // Pre-meeting brief generation for employer
```

### Task 2.2 — Create `meetingBriefGenerator.ts`

**File:** `artifacts/api-server/src/lib/meetingBriefGenerator.ts` (create new)

Implement the full generator per `plan.md` including:
1. `generateMeetingBrief(db, meetingId, log)` — main entry point
2. `resolveJobRequirement(db, meeting)` — three-path job requirement resolution
3. `buildMeetingBriefPrompt(context)` — verbatim prompt from `plan.md`
4. `calculatePercentile(rate, median)` — rough percentile helper
5. `DOCUMENT_LABELS` constant — document type → human label mapping

Key implementation notes:
- Re-fetch meeting at start of function and check `status === 'confirmed'` before proceeding (Risk 3 mitigation)
- All context loading in `Promise.all()` — never sequential awaits for independent data
- Token logging is fire-and-forget `.catch()` — never awaited
- `createNotification()` and `sendNotificationEmail()` are fire-and-forget `.catch()` — never awaited
- Parse AI response with `.replace(/```json|```/g, '').trim()` then `JSON.parse()`
- Wrap the entire outer function body in try/catch — log error, never throw

### Task 2.3 — Hook Into `PATCH /api/meetings/:id`

**File:** `artifacts/api-server/src/routes/meetings.ts`

```ts
import { generateMeetingBrief } from '../lib/meetingBriefGenerator';

// BEFORE the db.update() call — capture previous status:
const previousMeeting = await db.query.meetings.findFirst({
  where: eq(meetings.id, meetingId),
});
const previousStatus = previousMeeting?.status;

// Perform the existing update logic (unchanged):
const [updated] = await db.update(meetings)
  .set(sanitisedPayload)
  .where(eq(meetings.id, meetingId))
  .returning();

return res.json(updated); // Response sent first — unchanged

// After response — fire brief generation if status just became 'confirmed':
if (updated.status === 'confirmed' && previousStatus !== 'confirmed') {
  generateMeetingBrief(db, meetingId, req.log)
    .catch(err => req.log.warn({ err, meetingId }, 'meeting brief generation failed'));
}
```

**Important:** The `previousStatus` capture requires ONE extra DB read per `PATCH /api/meetings/:id` call. This is acceptable — meetings are low-frequency events. The read is on `meetings` primary key — indexed, fast.

### Task 2.4 — Add `POST /api/meetings/:id/brief` Route

**File:** `artifacts/api-server/src/routes/meetings.ts` (add new route to existing file)

```ts
// POST /api/meetings/:id/brief — employer-only, manual regeneration
router.post('/:id/brief', requireAuth, async (req, res) => {
  const { id: meetingId } = req.params;

  // Resolve employer identity
  const { userId } = getAuth(req);
  const user = await db.query.users.findFirst({ where: eq(users.clerkId, userId) });
  const employer = await db.query.employerProfiles.findFirst({ where: eq(employerProfiles.userId, user.id) });

  if (!employer) return res.status(403).json({ error: 'Employer only' });

  // Confirm meeting belongs to this employer
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId) });
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  if (meeting.employerId !== employer.id) return res.status(403).json({ error: 'Not authorised' });
  if (meeting.status !== 'confirmed') return res.status(422).json({ error: 'Meeting must be confirmed to generate a brief' });

  // Return immediately — generation is async
  res.status(202).json({ message: 'Brief generation started' });

  // Fire generation
  generateMeetingBrief(db, meetingId, req.log)
    .catch(err => req.log.warn({ err, meetingId }, 'meeting brief manual generation failed'));
});
```

HTTP 202 Accepted — the client polls `GET /api/meetings/:id` to check when `briefGeneratedAt` is populated.

### Task 2.5 — Update `GET /api/meetings/:id` Response

**File:** `artifacts/api-server/src/routes/meetings.ts`

Ensure the meeting detail response includes `briefContent` and `briefGeneratedAt`. If the handler currently selects specific columns, add these two new columns to the selection. If it returns the full Drizzle row, they are included automatically.

### Task 2.6 — OpenAPI + Codegen

**File:** `lib/api-spec/openapi.yaml`

1. Add `briefContent` (object, nullable, schema matching `MeetingBrief`) and `briefGeneratedAt` (string ISO datetime, nullable) to the `Meeting` response schema
2. Add `POST /api/meetings/{id}/brief` endpoint — request body empty, response `{ message: string }`, status 202

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
- `orval.config.ts` still has `indexFiles: false`
- `index.ts` only exports `./generated/api`
- `pnpm run typecheck` — zero errors

---

## Phase 3 — Frontend

### Task 3.1 — Verify Generated Hooks

```bash
grep -r "meetingBrief\|brief_content\|briefContent" lib/api-client-react/src/ | head -5
```

- [ ] `Meeting` type includes `briefContent` (nullable `MeetingBrief`) and `briefGeneratedAt`
- [ ] `usePostMeetingsIdBrief()` hook generated

### Task 3.2 — Create `<MeetingBriefCard />`

**File:** `artifacts/talentlock/src/components/meetings/MeetingBriefCard.tsx` (create new)

See `UI.md` for full component spec. States to handle:
1. `briefContent === null && briefGeneratedAt === null` — never generated → "Generate brief" button
2. `briefContent === null && briefGeneratedAt !== null` — generation in progress (polling) → spinner
3. `briefContent !== null` — brief loaded → render full card
4. After clicking "Regenerate" → show spinner, poll for update

### Task 3.3 — Integrate Into Meeting Detail Page

**File:** `artifacts/talentlock/src/pages/MeetingDetail.tsx` (or equivalent `/meetings/:id` page)

```tsx
// Render MeetingBriefCard only when userRole === 'employer'
// and meeting.status === 'confirmed'
{userRole === 'employer' && meeting.status === 'confirmed' && (
  <MeetingBriefCard
    brief={meeting.briefContent}
    briefGeneratedAt={meeting.briefGeneratedAt}
    meetingId={meeting.id}
    userPlan={userPlan}
  />
)}
```

Freelancers never see the brief card. Only employers see it on confirmed meetings.

### Task 3.4 — Polling for Brief Generation

When `briefContent` is null after generation is triggered:

```tsx
// Poll GET /api/meetings/:id every 3 seconds until briefContent is populated
const [isGenerating, setIsGenerating] = useState(false);
const { refetch } = useGetMeetingsId(meeting.id);

useEffect(() => {
  if (!isGenerating) return;
  const interval = setInterval(async () => {
    const { data } = await refetch();
    if (data?.briefContent) {
      setIsGenerating(false);
      clearInterval(interval);
    }
  }, 3000);
  return () => clearInterval(interval);
}, [isGenerating]);
```

Stop polling after 30 seconds (10 attempts) and show an error state.

---

## Acceptance Criteria

- [ ] `brief_content` (jsonb, nullable) added to `meetings` table
- [ ] `brief_generated_at` (timestamptz, nullable) added to `meetings` table
- [ ] `meeting_brief` token label in `TokenFeature`
- [ ] `generateMeetingBrief()` only runs when meeting `status === 'confirmed'` (re-fetch check at start)
- [ ] Brief generation fires fire-and-forget AFTER `res.json()` in `PATCH /api/meetings/:id`
- [ ] `PATCH /api/meetings/:id` response time unaffected (< 300ms additional overhead — only the pre-fetch of previous status is synchronous)
- [ ] Brief generated when meeting confirmed by EITHER party (employer or freelancer)
- [ ] `POST /api/meetings/:id/brief` returns 202 for confirmed meetings
- [ ] `POST /api/meetings/:id/brief` returns 422 for non-confirmed meetings
- [ ] `POST /api/meetings/:id/brief` returns 403 for freelancers
- [ ] `GET /api/meetings/:id` response includes `briefContent` and `briefGeneratedAt`
- [ ] Brief includes all 5 sections: candidateSnapshot, whyTheyMatch, suggestedQuestions, rateContext, watchPoints
- [ ] `whyTheyMatch` has exactly 3 items
- [ ] `suggestedQuestions` has 5–8 items
- [ ] `watchPoints` may be empty array — no fabricated concerns
- [ ] Token usage logged as `meeting_brief` to employer account
- [ ] Employer notification `meeting_brief_ready` created after generation
- [ ] Employer email sent after generation
- [ ] Partial brief generated gracefully when no job requirement linked (no error thrown)
- [ ] Brief card not rendered for freelancers — confirmed via role check in JSX
- [ ] Brief card not rendered for non-confirmed meetings
- [ ] Plan gating: `employer_starter` sees upgrade prompt instead of questions
- [ ] "Regenerate brief" button triggers `POST /api/meetings/:id/brief` and shows spinner
- [ ] Polling stops after brief is loaded or after 30 seconds
- [ ] `pnpm run typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3 → 1.4 (verify migration)
Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 (codegen + typecheck)
Task 3.1 (verify hooks) → 3.2 → 3.3 → 3.4
```

# TalentLock — Task Breakdown: Smart Rate Suggestions

---

## Phase 1 — Backend Utility + TokenFeature

### Task 1.1 — Codebase Inspection
Run all inspection commands from `plan.md`. Document rate input location, fieldOfWork column name, booking column names.

### Task 1.2 — Add `rate_suggestion` to TokenFeature

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

```ts
export type TokenFeature =
  | /* existing values */
  | 'rate_suggestion'  // ← add if not present
```

### Task 1.3 — Create `rateSuggestionUtils.ts`

**File:** `artifacts/api-server/src/lib/rateSuggestionUtils.ts` (create new)

```ts
export async function getMarketMedian(db: DB, fieldOfWork: string): Promise<number | null> {
  const rates = await db.select({ rate: freelancerProfiles.rate })
    .from(freelancerProfiles)
    .where(and(
      eq(freelancerProfiles.fieldOfWork, fieldOfWork),
      isNotNull(freelancerProfiles.rate)
    ));
  if (rates.length < 3) return null;
  const sorted = rates.map(r => Number(r.rate)).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export async function getEmployerHistoricalAvg(
  db: DB, employerId: string, fieldOfWork: string
): Promise<number | null> {
  const rows = await db.select({ rate: bookings.proposedRate })
    .from(bookings)
    .innerJoin(freelancerProfiles, eq(freelancerProfiles.id, bookings.freelancerId))
    .where(and(
      eq(bookings.employerId, employerId),
      eq(bookings.negotiationStatus, 'agreed'),
      eq(freelancerProfiles.fieldOfWork, fieldOfWork),
      isNotNull(bookings.proposedRate)
    ));
  if (rows.length < 2) return null;
  return Math.round(rows.reduce((s, r) => s + Number(r.rate), 0) / rows.length);
}
```

---

## Phase 2 — Backend Endpoint + OpenAPI + Codegen

### Task 2.1 — Add `POST /api/ai/rate-suggestion`

**File:** `artifacts/api-server/src/routes/aiAssist.ts`

Guards:
1. Require Clerk auth + `userRole === 'employer'` → 403
2. `checkTokenQuota()` — Growth/Enterprise only for AI; Starter gets static data (no token check)
3. Fetch freelancer profile, validate exists → 404

Logic:
1. Get `freelancerRate`, `marketMedian`, `historicalAvg` from utility functions
2. For Starter plan: return static data only, no OpenAI call
3. For Growth/Enterprise: call OpenAI with system prompt from `plan.md`
4. Parse JSON response — on parse failure return `{ suggestedRate: freelancerRate, explanation: 'Could not generate suggestion.', confidence: 'low' }`
5. Log tokens: `logTokenUsage(db, internalUserId, 'rate_suggestion', usage)`

Response:
```ts
{
  freelancerRate: number,
  marketMedian: number | null,
  yourHistoricalAvg: number | null,
  suggestedRate: number,
  explanation: string,
  confidence: 'high' | 'medium' | 'low',
  isAiSuggestion: boolean  // false for Starter plan
}
```

### Task 2.2 — OpenAPI Spec + Codegen

Add `POST /api/ai/rate-suggestion` to `lib/api-spec/openapi.yaml`.

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen checks: `indexFiles: false`, index exports, `pnpm run typecheck`.

---

## Phase 3 — Frontend

### Task 3.1 — Inspect Booking Form Rate Input

```bash
grep -n "rate\|proposedRate" artifacts/talentlock/src/pages/FreelancerDetail.tsx | head -20
```

### Task 3.2 — Create `<RateSuggestionWidget />`

**File:** `artifacts/talentlock/src/components/RateSuggestionWidget.tsx` (create new)

Props:
```ts
interface RateSuggestionWidgetProps {
  freelancerId: string;
  jobRequirementId?: string;
  bookingId?: string;
  onUseSuggestion: (rate: number) => void;
  userPlan: string;
}
```

See `UI.md` for all states.

### Task 3.3 — Add Widget to Booking Creation Form

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

Place `<RateSuggestionWidget />` immediately below the rate input field.

### Task 3.4 — Add Widget to Negotiation Panel

**File:** `artifacts/talentlock/src/pages/BookingDetail.tsx`

Show when `booking.negotiationStatus === 'negotiating'` and `userRole === 'employer'`.

---

## Acceptance Criteria

- [ ] `rate_suggestion` in `TokenFeature`
- [ ] `getMarketMedian()` returns null when < 3 freelancers in field
- [ ] `getEmployerHistoricalAvg()` uses only `negotiationStatus = 'agreed'` bookings
- [ ] Starter employers receive static data only — no AI call, no tokens
- [ ] Growth/Enterprise: `checkTokenQuota()` applied before OpenAI call
- [ ] Market median never exposes individual freelancer rates
- [ ] Tokens logged correctly as `rate_suggestion`
- [ ] Codegen hook `usePostAiRateSuggestion()` confirmed
- [ ] Widget visible below rate input on `/freelancers/:id`
- [ ] Widget visible in negotiation panel on `/bookings/:id` (employer, negotiating)
- [ ] "Get AI suggestion" button only on Growth/Enterprise
- [ ] "Use suggested rate" fills input only — never submits form
- [ ] `pnpm run typecheck` passes

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2 → 1.3
Task 2.1 → 2.2 (codegen + typecheck)
Task 3.1 (inspect) → 3.2 → 3.3 → 3.4
```

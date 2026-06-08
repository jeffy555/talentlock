# TalentLock — Task Breakdown: AI Proposal Generator

---

## Phase 1 — TokenFeature + Inspection

### Task 1.1 — Codebase Inspection
Run all inspection commands from `plan.md`. Document:
- Freelancer token quota existence
- `jobRequirementId` nullability on `bookings`
- Confirmed booking status strings for pending/negotiating

### Task 1.2 — Add `ai_proposal` to TokenFeature

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

Add `'ai_proposal'` to the `TokenFeature` union type if not present.

---

## Phase 2 — Backend Endpoint + Codegen

### Task 2.1 — Add `POST /api/ai/proposal`

**File:** `artifacts/api-server/src/routes/aiAssist.ts`

Request body: `{ bookingId: string, tone: 'professional' | 'friendly' | 'concise' }`

Guards:
1. Require Clerk auth + `userRole === 'freelancer'` → 403
2. Fetch booking — 404 if not found
3. Verify `booking.freelancerId === internalUserId` → 403
4. Verify booking status is `pending` or `negotiating` → 400 `{ code: 'BOOKING_NOT_PENDING' }`
5. Skip `checkTokenQuota()` for freelancers if no quota defined (per plan.md Q1)

Logic:
1. Fetch freelancer profile
2. Fetch job requirement (if `booking.jobRequirementId` is set)
3. Select system prompt based on `tone` (from plan.md prompts — verbatim)
4. Call OpenAI
5. Log tokens: `logTokenUsage(db, internalUserId, 'ai_proposal', usage)`

Response: `{ proposal: string }`

On OpenAI failure: `{ proposal: '', error: 'Could not generate proposal. Please try again.' }`

### Task 2.2 — OpenAPI Spec + Codegen

Add `POST /api/ai/proposal` to `lib/api-spec/openapi.yaml`.

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen checks: `indexFiles: false`, index exports, `pnpm run typecheck`.

---

## Phase 3 — Frontend

### Task 3.1 — Create `<ProposalGeneratorDrawer />`

**File:** `artifacts/talentlock/src/components/ProposalGeneratorDrawer.tsx` (create new)

Props:
```ts
interface ProposalGeneratorDrawerProps {
  bookingId: string;
  isOpen: boolean;
  onClose: () => void;
  onAccept: (proposal: string) => void;
}
```

Internal state:
```ts
const [tone, setTone] = useState<'professional' | 'friendly' | 'concise'>('professional');
const [proposalOutput, setProposalOutput] = useState<string | null>(null);
```

Uses `usePostAiProposal()` mutation. See `UI.md` for all states.

### Task 3.2 — Add Proposal Section to `/bookings/:id` (Freelancer View)

**File:** `artifacts/talentlock/src/pages/BookingDetail.tsx`

```tsx
// State
const [isDrawerOpen, setIsDrawerOpen] = useState(false);
const [acceptedProposal, setAcceptedProposal] = useState<string | null>(null);

// Render
{['pending', 'negotiating'].includes(booking.status) && userRole === 'freelancer' && (
  <>
    <Button
      variant="outline"
      size="sm"
      onClick={() => setIsDrawerOpen(true)}
    >
      <Sparkles className="h-4 w-4 mr-1" />
      Write proposal
    </Button>

    {acceptedProposal && (
      <AcceptedProposalBlock proposal={acceptedProposal} />
    )}

    <ProposalGeneratorDrawer
      bookingId={booking.id}
      isOpen={isDrawerOpen}
      onClose={() => setIsDrawerOpen(false)}
      onAccept={(proposal) => {
        setAcceptedProposal(proposal);
        setIsDrawerOpen(false);
      }}
    />
  </>
)}
```

---

## Acceptance Criteria

- [ ] `ai_proposal` in `TokenFeature`
- [ ] Endpoint returns 403 for employers
- [ ] Endpoint returns 403 when booking belongs to different freelancer
- [ ] Endpoint returns 400 when booking status is not pending/negotiating
- [ ] Tokens logged as `ai_proposal`
- [ ] Codegen hook `usePostAiProposal()` confirmed
- [ ] "Write proposal" button only on pending/negotiating bookings for freelancers
- [ ] Three tone options in drawer: Professional, Friendly, Concise
- [ ] State isolation: booking page unmodified until Accept clicked
- [ ] Accepted proposal shown in copyable textarea below booking info
- [ ] `pnpm run typecheck` passes

---

## Dependencies & Order

```
Task 1.1 (inspect) → 1.2
Task 2.1 → 2.2 (codegen + typecheck)
Task 3.1 → 3.2
```

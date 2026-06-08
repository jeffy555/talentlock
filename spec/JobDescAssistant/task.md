# TalentLock — Task Breakdown: Job Description Assistant

## Summary

Add an AI writing assistant drawer to the job post form. Three phases: Type check → Backend endpoint → Frontend drawer + integration. Phase 2 may be skipped entirely if the endpoint was already built as part of ai-enhancements.

---

## Phase 1 — Type Check

### Task 1.1 — Inspect and Patch `TokenFeature`

**File:** `artifacts/api-server/src/lib/tokenLogger.ts`

Run:
```bash
grep "job_description_assistant" artifacts/api-server/src/lib/tokenLogger.ts
```

If missing, add:
```ts
export type TokenFeature =
  | 'ai_match'
  | 'agreement_generation'
  | 'ai_match_explanation'
  | 'contract_redlining'
  | 'job_description_assistant'  // ← add
  | 'interview_questions'
  | 'document_verification'
```

If already present — confirm and move on. No migration needed.

---

## Phase 2 — Backend API (Skip if endpoint already exists)

> Before starting Phase 2 run:
> ```bash
> grep -r "job-description" artifacts/api-server/src/routes/
> ```
> If `POST /api/ai/job-description` already exists and handles all 3 modes — skip this entire phase and confirm `usePostAiJobDescription()` hook exists in `lib/api-client-react/`. Proceed to Phase 3.

### Task 2.1 — Create `aiAssist.ts` Route File

**File:** `artifacts/api-server/src/routes/aiAssist.ts` (create new)

Add `POST /api/ai/job-description`

**Request body validation:**
```ts
{
  mode: 'generate' | 'improve' | 'check',  // required
  content: string,                           // required, min 10 chars
  jobTitle?: string                          // optional
}
```

**Guards (in order):**
1. Require Clerk auth + `userRole === 'employer'` → 403
2. Validate `mode` is one of the 3 allowed values → 400
3. Validate `content.trim().length >= 10` → 400 `{ error: 'Content is too short to process', code: 'CONTENT_TOO_SHORT' }`
4. `checkTokenQuota(db, internalUserId)` → 402 `TOKEN_LIMIT`

**Mode routing:**

```ts
switch (mode) {
  case 'generate':
    // Use Generate system prompt from plan.md
    // Return { mode: 'generate', output: string }
    break;
  case 'improve':
    // Use Improve system prompt from plan.md
    // Return { mode: 'improve', output: string }
    break;
  case 'check':
    // Use Check system prompt from plan.md (Q6 rubric)
    // Parse JSON response: { score, missing }
    // Return { mode: 'check', score: number, missing: string[] }
    break;
}
```

For `generate` and `improve` — return the AI response as plain text in `output`.

For `check` — the AI returns JSON. Parse it:
```ts
try {
  const parsed = JSON.parse(response.choices[0].message.content);
  return res.json({ mode: 'check', score: parsed.score, missing: parsed.missing });
} catch {
  req.log.warn({ mode }, 'check mode JSON parse failed');
  return res.json({ mode: 'check', score: 0, missing: ['Could not analyse job post — please try again.'] });
}
```

**Token logging (all modes):**
```ts
await logTokenUsage(db, internalUserId, 'job_description_assistant', {
  promptTokens: response.usage.prompt_tokens,
  completionTokens: response.usage.completion_tokens,
  totalTokens: response.usage.total_tokens,
});
```

**Response type:**
```ts
{
  mode: 'generate' | 'improve' | 'check',
  output?: string,
  score?: number,
  missing?: string[]
}
```

### Task 2.2 — Register Route

**File:** `artifacts/api-server/src/index.ts`

Import and register `aiAssistRouter` from `./routes/aiAssist`.

### Task 2.3 — OpenAPI Spec Update + Codegen

**File:** `lib/api-spec/openapi.yaml`

Add `POST /api/ai/job-description` with full request and response schema.

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen mandatory checks:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## Phase 3 — Frontend

### Task 3.1 — Inspect Job Form

Before writing any frontend code:

```bash
ls artifacts/talentlock/src/pages/ | grep -i job
```

Read the job form component(s). Document:
- Exact file path of the job form
- Name of the `description` controlled state variable
- Whether auto-save exists

### Task 3.2 — Create `<JobDescriptionAssistant />`

**File:** `artifacts/talentlock/src/components/JobDescriptionAssistant.tsx` (create new)

**Props interface:**
```ts
interface JobDescriptionAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  descriptionValue: string;     // read-only snapshot source
  onAccept: (value: string) => void; // only way to modify form
}
```

**Internal state:**
```ts
const [activeTab, setActiveTab] = useState<'generate' | 'improve' | 'check'>('generate');
const [generateInput, setGenerateInput] = useState('');
const [snapshot, setSnapshot] = useState('');
const [assistantOutput, setAssistantOutput] = useState<string | null>(null);
const [score, setScore] = useState<number | null>(null);
const [missing, setMissing] = useState<string[]>([]);
const [inputError, setInputError] = useState<string | null>(null);
const [drawerError, setDrawerError] = useState<'quota_reached' | 'api_error' | null>(null);
const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
```

**Tab change handler:**
```ts
const handleTabChange = (tab: string) => {
  if (tab === 'improve') {
    setSnapshot(descriptionValue); // snapshot at open time
  }
  setActiveTab(tab as typeof activeTab);
  setAssistantOutput(null);
  setScore(null);
  setMissing([]);
  setInputError(null);
  setDrawerError(null);
};
```

**Sheet close guard (plan.md Q7):**
```ts
const handleCloseAttempt = () => {
  if (assistantOutput || score !== null) {
    setShowDiscardConfirm(true);
  } else {
    onClose();
  }
};
```

**Token quota error handler (plan.md Risk 3):**
```ts
const handleApiError = (error: unknown) => {
  if ((error as any)?.status === 402 && (error as any)?.body?.code === 'TOKEN_LIMIT') {
    setDrawerError('quota_reached');
  } else {
    setDrawerError('api_error');
  }
};
```

See `UI.md` for full rendering of all states.

### Task 3.3 — Add Trigger Button to Job Form

**File:** Job form component (path from Task 3.1 inspection)

Add state:
```ts
const [isAssistantOpen, setIsAssistantOpen] = useState(false);
```

Add button next to the Description label:
```tsx
<div className="flex items-center justify-between mb-1">
  <label className="text-sm font-medium">Description</label>
  <Button
    type="button"
    variant="ghost"
    size="sm"
    onClick={() => setIsAssistantOpen(true)}
  >
    <Sparkles className="h-4 w-4 mr-1" />
    AI Assist
  </Button>
</div>
```

Add component below the form (before closing tag):
```tsx
<JobDescriptionAssistant
  isOpen={isAssistantOpen}
  onClose={() => setIsAssistantOpen(false)}
  descriptionValue={description}  // use actual state variable name
  onAccept={(value) => {
    setDescription(value);         // use actual state setter name
    setIsAssistantOpen(false);
  }}
/>
```

### Task 3.4 — Verify Hook Exists

```bash
grep -r "usePostAiJobDescription" lib/api-client-react/src/
```

If missing, re-run codegen before continuing.

---

## Acceptance Criteria

- [ ] `job_description_assistant` in `TokenFeature` type
- [ ] `POST /api/ai/job-description` exists and handles all 3 modes
- [ ] Endpoint returns 403 for non-employers
- [ ] Endpoint returns 400 `CONTENT_TOO_SHORT` for content < 10 chars
- [ ] Endpoint returns 402 `TOKEN_LIMIT` when quota exceeded
- [ ] Generate mode returns `{ mode: 'generate', output: string }`
- [ ] Improve mode returns `{ mode: 'improve', output: string }`
- [ ] Check mode returns `{ mode: 'check', score: number, missing: string[] }`
- [ ] Check mode JSON parse failure returns fallback gracefully
- [ ] `job_description_assistant` tokens logged correctly
- [ ] `usePostAiJobDescription()` hook exists from codegen
- [ ] `✨ AI Assist` button visible next to Description label on job form
- [ ] Button present on both `/jobs/new` and `/jobs/:id` (edit)
- [ ] Sheet opens from the right at `w-[480px]` desktop, full-width mobile
- [ ] Three tabs rendered: Generate, Improve, Check
- [ ] Generate tab: empty input → inline error before API call
- [ ] Generate tab: AI output renders in violet border area
- [ ] Generate tab: Accept copies to form textarea and closes sheet
- [ ] Generate tab: Discard clears output, sheet stays open
- [ ] Improve tab: pre-populated with snapshot of current description
- [ ] Improve tab: same Accept/Discard behaviour as Generate
- [ ] Check tab: score ring renders with correct colour (green/amber/red)
- [ ] Check tab: missing items listed below score
- [ ] Check tab: no Accept/Discard buttons
- [ ] Closing sheet with output present → confirmation dialog
- [ ] Quota reached error shown inline in drawer — no page redirect
- [ ] Employer's input text preserved after quota error
- [ ] Form description field NOT modified until Accept clicked
- [ ] Auto-save (if present) not triggered by AI output
- [ ] `pnpm typecheck` passes with zero errors

---

## Dependencies & Order

```
Task 1.1 (inspect TokenFeature)
Task 2.1 → 2.2 → 2.3 (skip entire Phase 2 if endpoint already exists)
Task 3.1 (inspect job form) → 3.2 → 3.3 → 3.4
```

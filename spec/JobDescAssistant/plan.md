# TalentLock — Implementation Plan: Job Description Assistant

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

Before writing any code the agent must run these and report findings:

```bash
# 1. Find job form component files
ls artifacts/talentlock/src/pages/ | grep -i job
find artifacts/talentlock/src -name "*.tsx" | xargs grep -l "job\|Job" | grep -v node_modules

# 2. Check if endpoint already exists
grep -r "job-description\|jobDescription\|job_description" artifacts/api-server/src/routes/

# 3. Check TokenFeature type
grep "job_description_assistant" artifacts/api-server/src/lib/tokenLogger.ts

# 4. Check job form description state variable name
# (inspect the actual job form component found in step 1)

# 5. Check for auto-save behaviour
grep -n "useEffect\|debounce\|onChange\|autosave\|auto.save" artifacts/talentlock/src/pages/Jobs.tsx
```

Report all findings before any implementation.

---

## Resolved Questions

---

### Q1 — Job Form Component Location

**Decision: Inspect first, then implement in the correct file.**

After running the inspection commands:
- If a shared `<JobForm />` component exists — add the button and drawer to that component only
- If the form is duplicated across `Jobs.tsx` (new) and a separate edit page — add to both, extracting a shared component if clean to do so
- Document the actual file path(s) in a comment at the top of the drawer component file

---

### Q2 — `description` State Variable Name

**Decision: Inspect first, use the actual variable name.**

After reading the job form component, identify the controlled state variable for the description textarea. The drawer receives it as a prop:

```ts
interface JobDescriptionAssistantProps {
  descriptionValue: string;        // current value of description field
  onAccept: (value: string) => void; // called when employer accepts AI output
}
```

`onAccept` sets the form's description state from the parent — the drawer never sets it directly.

---

### Q3 — Auto-Save Behaviour

**Decision: Regardless of whether auto-save exists, enforce state isolation.**

The drawer component NEVER modifies the form's description field except through the `onAccept` callback. This is enforced structurally — the drawer has no direct access to the form's state setter.

If auto-save exists: it fires only on form `description` state changes. Since the drawer uses its own `assistantOutput` state, auto-save is never triggered by AI output until the employer explicitly accepts.

---

### Q4 — `job_description_assistant` in `TokenFeature`

**Decision: Check first. Add if missing.**

```bash
grep "job_description_assistant" artifacts/api-server/src/lib/tokenLogger.ts
```

If missing, add it:
```ts
export type TokenFeature =
  | 'ai_match'
  | 'agreement_generation'
  | 'ai_match_explanation'
  | 'contract_redlining'
  | 'job_description_assistant'  // ← add if not present
  | 'interview_questions'
  | 'document_verification'
```

---

### Q5 — Endpoint Already Exists?

**Decision: Check first. Skip Phase 2 entirely if already implemented.**

```bash
grep -r "job-description" artifacts/api-server/src/routes/
```

If `POST /api/ai/job-description` already exists and handles all three modes (`generate`, `improve`, `check`):
- Skip Phase 2 entirely
- Confirm the codegen hook `usePostAiJobDescription()` exists
- Proceed directly to Phase 3

If endpoint does not exist — implement Phase 2 as specified.

---

### Q6 — Completeness Scoring Rubric

**Decision: Use this exact rubric in the Check mode system prompt.**

A complete job post should include all of the following. Each missing item deducts points from 100:

| Field | Points |
|---|---|
| Role title / job title | 10 |
| Project or product overview | 15 |
| Key responsibilities (3+) | 15 |
| Required skills or experience | 15 |
| Experience level (junior/mid/senior) | 10 |
| Engagement type (contract/full-time/part-time) | 10 |
| Duration or timeline | 10 |
| Budget or rate range | 10 |
| Remote/on-site/hybrid preference | 5 |

Total: 100 points. Score = sum of present fields.

System prompt for check mode:
```
You are a job post quality reviewer for a freelance platform.
Evaluate the following job post against this rubric. For each item,
determine if it is present and adequately described.

Rubric items (10 pts each unless noted):
1. Role title / job title (10 pts)
2. Project or product overview (15 pts)
3. Key responsibilities — at least 3 listed (15 pts)
4. Required skills or experience (15 pts)
5. Experience level stated (junior/mid/senior/lead) (10 pts)
6. Engagement type stated (contract/part-time/full-time) (10 pts)
7. Duration or timeline mentioned (10 pts)
8. Budget or rate range indicated (10 pts)
9. Remote/on-site/hybrid preference (5 pts)

Return ONLY a JSON object — no preamble, no markdown:
{
  "score": <total score 0-100>,
  "missing": ["plain English description of what is missing", ...]
}

Only include an item in "missing" if it is absent or completely vague.
If the post scores 100, return "missing": [].
```

---

### Q7 — Sheet Dismissal Behaviour

**Decision: Non-dismissible by overlay when output exists. Dismissible when empty.**

```ts
// In the Sheet component
<Sheet
  open={isOpen}
  onOpenChange={(open) => {
    // Only allow overlay-close when no output is present
    if (!open && assistantOutput) return; // block accidental close
    setIsOpen(open);
  }}
>
```

When `assistantOutput` is non-empty and the employer tries to close via overlay or `[×]` button, show a confirmation:
```
Discard AI output and close?   [Keep editing]  [Discard & close]
```

Use `shadcn/ui <AlertDialog>` for this confirmation. Only shown when output exists. The `[×]` button in the sheet header triggers the same confirmation check.

---

### Q8 — Endpoint File Location

**Decision: Option B — `artifacts/api-server/src/routes/aiAssist.ts`**

Create a new `aiAssist.ts` route file. Register it in `artifacts/api-server/src/index.ts`. This keeps all AI assist endpoints together as the feature set grows (interview questions will go here too).

---

## Resolved Risks

---

### Risk 1 — State Isolation Between Drawer and Form

**Resolution: Structural enforcement via props.**

The `<JobDescriptionAssistant />` component accepts `descriptionValue` (read-only snapshot) and `onAccept` callback. It has NO access to the form's state setter. It cannot accidentally modify the form.

```ts
// Parent (job form page)
const [description, setDescription] = useState('');

<JobDescriptionAssistant
  descriptionValue={description}       // read-only snapshot
  onAccept={(value) => {
    setDescription(value);             // only path to modify form
    setIsAssistantOpen(false);
  }}
/>
```

The drawer manages its own isolated state:
```ts
// Inside JobDescriptionAssistant
const [assistantOutput, setAssistantOutput] = useState<string | null>(null);
const [score, setScore] = useState<number | null>(null);
const [missing, setMissing] = useState<string[]>([]);
```

---

### Risk 2 — Improve Tab Snapshot Staleness

**Resolution: Snapshot taken on tab open, clearly labelled.**

```ts
const [snapshot, setSnapshot] = useState('');

// When Improve tab becomes active
const handleTabChange = (tab: string) => {
  if (tab === 'improve') {
    setSnapshot(descriptionValue); // capture current value at open time
  }
  setActiveTab(tab);
};
```

Label above the snapshot textarea: `"Current description (snapshot — not live)"` in `text-xs text-muted-foreground`.

---

### Risk 3 — Token Quota Error in Drawer

**Resolution: Inline error state inside the drawer. No redirect.**

When `POST /api/ai/job-description` returns `402 TOKEN_LIMIT`:

```ts
if (error?.status === 402 && error?.body?.code === 'TOKEN_LIMIT') {
  setDrawerError('quota_reached');
  return; // do NOT navigate('/pricing')
}
```

Show inline in the drawer below the action button:
```
⚡ Monthly AI token limit reached.
Tokens reset on {resetDate}.  [Upgrade Plan →]
```

The employer's input text is preserved — they can still read what they typed. The link to `/pricing` is inline.

---

### Risk 4 — Empty Content Validation

**Resolution: Client-side guard before API call.**

```ts
const handleGenerate = () => {
  if (!inputText.trim()) {
    setInputError('Please describe the role before generating.');
    return;
  }
  // proceed with API call
};

const handleImprove = () => {
  if (!snapshot.trim()) {
    setInputError('Your job description is empty. Add some content first.');
    return;
  }
  // proceed with API call
};
```

Error shown below the relevant textarea: `text-sm text-red-500`.

Also enforced server-side:
```ts
if (!content || content.trim().length < 10) {
  return res.status(400).json({
    error: 'Content is too short to process',
    code: 'CONTENT_TOO_SHORT'
  });
}
```

---

### Risk 5 — Codegen Export Rules

**Resolution: Mandatory post-codegen checks.**

After `pnpm --filter @workspace/api-spec run codegen`:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## System Prompts (Exact — Use Verbatim)

### Generate Mode

```
You are a professional job post writer for a freelance platform.
The employer has described a role in plain language.
Write a complete, well-structured job post based on their description.

Structure the output as:
- A clear, specific job title (1 line)
- Project overview (2-3 sentences)
- Key responsibilities (4-6 bullet points)
- Required skills and experience (4-6 bullet points)
- Engagement details (type, duration, rate if mentioned, remote/on-site)

Write in a professional but approachable tone.
Do not add information the employer did not provide — work only with what is given.
Return the job post as plain text with clear section headings.
Do not use markdown formatting — no asterisks, no hashes.
```

### Improve Mode

```
You are a professional job post editor for a freelance platform.
Rewrite the following job post to improve its clarity, structure, and completeness.

Rules:
- Keep all factual details from the original (skills, rate, timeline, etc.)
- Improve vague language — replace "good communication skills" with specific examples
- Add structure if missing — use clear sections for overview, responsibilities, requirements
- Do not add information that was not in the original
- Return as plain text with clear section headings
- Do not use markdown formatting — no asterisks, no hashes
```

### Check Mode

Use the exact prompt from Q6 above.

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full this session
- [ ] `specs/job-description-assistant/features.md` read
- [ ] `specs/job-description-assistant/clarify.md` read
- [ ] This `plan.md` read — all 8 questions and 5 risks resolved
- [ ] `specs/job-description-assistant/task.md` read — phase order understood
- [ ] `specs/job-description-assistant/UI.md` read — all drawer states understood
- [ ] Token-consumption feature confirmed deployed (`logTokenUsage`, `checkTokenQuota` live)
- [ ] Codebase inspection complete — Q1, Q2, Q4, Q5 confirmed from actual files

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Type check — add `job_description_assistant` if missing | ⬜ Not started |
| Phase 2 | Backend — endpoint + OpenAPI + codegen (skip if already done) | ⬜ Not started |
| Phase 3 | Frontend — drawer component + page integration | ⬜ Not started |

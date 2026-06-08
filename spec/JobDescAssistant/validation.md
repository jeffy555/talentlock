# TalentLock — Validation Guide: Job Description Assistant

> **Purpose:** Verify the Job Description Assistant feature is correctly implemented before it is considered complete. Run after all phases of `task.md` are marked done.
>
> **How to use:** Run each check in order. Mark ✅ pass or ❌ fail. Fix failures before marking a phase complete.

---

## Phase 1 Validation — Type Check

### V1.1 — `job_description_assistant` in `TokenFeature`

```bash
grep "job_description_assistant" artifacts/api-server/src/lib/tokenLogger.ts
```

- [ ] `'job_description_assistant'` is present in the `TokenFeature` union type

---

## Phase 2 Validation — Backend API

### V2.1 — Endpoint Exists

```bash
grep -r "job-description" artifacts/api-server/src/routes/
```

- [ ] `POST /api/ai/job-description` is defined in `aiAssist.ts` (or equivalent)
- [ ] Route is registered in `artifacts/api-server/src/index.ts`

### V2.2 — Auth Guard: Freelancers Blocked

```bash
curl -X POST http://localhost:8080/api/ai/job-description \
  -H "Authorization: Bearer <freelancer_token>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"generate","content":"I need a developer"}'
```

- [ ] Returns `HTTP 403`

### V2.3 — No Auth: Blocked

```bash
curl -X POST http://localhost:8080/api/ai/job-description \
  -H "Content-Type: application/json" \
  -d '{"mode":"generate","content":"I need a developer"}'
```

- [ ] Returns `HTTP 401`

### V2.4 — Content Too Short

```bash
curl -X POST http://localhost:8080/api/ai/job-description \
  -H "Authorization: Bearer <employer_token>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"generate","content":"hi"}'
```

- [ ] Returns `HTTP 400`
- [ ] Response: `{ "code": "CONTENT_TOO_SHORT" }`

### V2.5 — Generate Mode: Happy Path

```bash
curl -X POST http://localhost:8080/api/ai/job-description \
  -H "Authorization: Bearer <employer_token>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"generate","content":"I need a senior React developer to build a dashboard, remote, 3 months, $80-100/hr","jobTitle":"Senior React Developer"}'
```

- [ ] Returns `HTTP 200`
- [ ] Response: `{ "mode": "generate", "output": "<non-empty string>" }`
- [ ] Output contains structured sections (title, responsibilities, requirements)
- [ ] `token_usage` table has new row with `feature = 'job_description_assistant'`

### V2.6 — Improve Mode: Happy Path

```bash
curl -X POST http://localhost:8080/api/ai/job-description \
  -H "Authorization: Bearer <employer_token>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"improve","content":"We need someone to help with our website. Must know coding. Good pay."}'
```

- [ ] Returns `HTTP 200`
- [ ] Response: `{ "mode": "improve", "output": "<improved string>" }`
- [ ] Output is notably clearer and more structured than the input

### V2.7 — Check Mode: Happy Path

```bash
curl -X POST http://localhost:8080/api/ai/job-description \
  -H "Authorization: Bearer <employer_token>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"check","content":"We need someone to help with our website. Must know coding. Good pay."}'
```

- [ ] Returns `HTTP 200`
- [ ] Response: `{ "mode": "check", "score": <0-100>, "missing": ["..."] }`
- [ ] `score` is an integer 0–100
- [ ] `missing` is an array of strings
- [ ] Score for a vague post is below 50

### V2.8 — Check Mode: Good Post Scores High

```bash
curl -X POST http://localhost:8080/api/ai/job-description \
  -H "Authorization: Bearer <employer_token>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"check","content":"Senior React Developer\n\nWe are building a SaaS analytics dashboard and need an experienced React developer for a 3-month contract.\n\nResponsibilities:\n- Build and maintain React components\n- Collaborate with designers\n- Write unit tests\n\nRequirements:\n- 5+ years React experience\n- TypeScript proficiency\n- Remote work experience\n\nEngagement: Contract, Remote, 3 months, $90-110/hr"}'
```

- [ ] `score` is ≥ 80
- [ ] `missing` array is empty or has 1–2 minor items

### V2.9 — Token Quota Exceeded

Set employer quota to minimum, then call endpoint:

```sql
-- Temporarily exhaust quota
UPDATE subscriptions SET monthly_token_limit = 1 WHERE user_id = '<employer_id>';
```

```bash
curl -X POST http://localhost:8080/api/ai/job-description \
  -H "Authorization: Bearer <employer_token>" \
  -d '{"mode":"generate","content":"I need a developer for my project building something great"}'
```

- [ ] Returns `HTTP 402`
- [ ] Response: `{ "code": "TOKEN_LIMIT" }`

Reset: `UPDATE subscriptions SET monthly_token_limit = 50000 WHERE user_id = '<employer_id>';`

### V2.10 — TypeCheck Passes

```bash
pnpm typecheck
```

- [ ] Zero TypeScript errors

---

## Phase 3 Validation — Frontend

### V3.1 — Trigger Button Visible

Navigate to `/jobs/new` as an employer.

- [ ] `✨ AI Assist` button visible next to the Description label
- [ ] Button has sparkle icon
- [ ] Button is `type="button"` — does NOT submit the form when clicked

Navigate to `/jobs/:id` (edit an existing job):

- [ ] Same button visible in the same position

### V3.2 — Sheet Opens Correctly

Click `✨ AI Assist`:

- [ ] Sheet slides in from the right
- [ ] Sheet width is approximately 480px on desktop
- [ ] Sheet is full-width on mobile
- [ ] Sheet heading: `"Job Description Assistant"` with sparkle icon
- [ ] Three tabs visible: Generate, Improve, Check
- [ ] Generate tab is active by default

### V3.3 — Generate Tab: Empty Input Validation

Click `✦ Generate` without entering anything:

- [ ] Error shown below textarea: `"Please describe the role before generating."`
- [ ] No API call made (check Network tab — no request fired)

### V3.4 — Generate Tab: Full Happy Path

Type a role description and click Generate:

- [ ] Textarea becomes disabled while loading
- [ ] Button shows spinner + `"Generating..."`
- [ ] AI output appears in violet-bordered area after response
- [ ] Label `"AI Suggestion"` above the output
- [ ] `[Discard]` and `[Accept →]` buttons appear

Click Accept:
- [ ] Sheet closes
- [ ] Job form description textarea now contains the AI output
- [ ] Toast `"Description updated."` appears
- [ ] Form description was NOT modified before clicking Accept

Click Discard (on a fresh generate):
- [ ] Output area is cleared
- [ ] Input textarea is re-enabled and still contains the employer's original text
- [ ] Sheet remains open

### V3.5 — Improve Tab: Snapshot

Switch to the Improve tab:

- [ ] Snapshot textarea pre-populated with current job form description
- [ ] Label: `"Current description (snapshot — not live)"`
- [ ] Snapshot textarea is read-only (disabled)

Change the description in the job form while the sheet is open, then close and reopen the Improve tab:

- [ ] Snapshot reflects the value at tab-open time, NOT real-time updates

Empty description case:

- [ ] Improve tab shows: `"Your job description is empty. Add some content to your description first, then come back to improve it."`
- [ ] No Improve button shown

### V3.6 — Check Tab: Scoring

Switch to the Check tab. Click `✦ Check Completeness`:

- [ ] Score ring appears with correct colour (green/amber/red based on score)
- [ ] Score number displayed in the ring
- [ ] `"out of 100"` label below ring
- [ ] Missing items listed with amber warning icons
- [ ] `↺ Check Again` button appears below results
- [ ] No Accept/Discard buttons on this tab

Perfect score (100):
- [ ] Green ring
- [ ] `"Great job post — nothing missing!"` message
- [ ] No missing items listed

Empty description case:
- [ ] Check button is disabled
- [ ] `"Your job description is empty. Add some content first."` message shown

### V3.7 — Discard Confirmation Dialog

Generate AI output, then click the `[×]` close button on the sheet:

- [ ] `<AlertDialog>` appears: `"Discard AI output?"`
- [ ] `"Your generated content will be lost."` body text
- [ ] `[Keep editing]` closes the dialog, sheet stays open
- [ ] `[Discard & close]` closes both dialog and sheet, output is cleared

Click outside the sheet (overlay) with output present:
- [ ] Same confirmation dialog appears
- [ ] Sheet does NOT close without confirmation

With no output present, click outside the sheet:
- [ ] Sheet closes immediately (no confirmation needed)

### V3.8 — Quota Reached: Inline Error

With quota exhausted (use SQL from V2.9):

- [ ] After clicking Generate, amber banner appears inside the drawer
- [ ] Banner text: `"⚡ Monthly AI token limit reached. Tokens reset on {date}."`
- [ ] `"Upgrade Plan →"` link navigates to `/pricing`
- [ ] Page does NOT redirect automatically
- [ ] Employer's input text is preserved in the textarea
- [ ] Sheet remains open

### V3.9 — Form State Isolation

With the job form's description field containing "My original description":

Open the drawer, generate AI output, but do NOT click Accept.
Close the drawer (via Discard & close).

- [ ] Job form description field still contains "My original description"
- [ ] AI output is gone with no trace

Inspect the form in React DevTools:
- [ ] `description` state only changes when Accept is clicked
- [ ] `assistantOutput` state is completely separate from `description` state

---

## Security Validation

### S1 — Freelancers Cannot Use the Endpoint

```bash
curl -X POST http://localhost:8080/api/ai/job-description \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"mode":"generate","content":"Looking for work as a developer"}'
```

- [ ] Returns `HTTP 403`

### S2 — Token Usage Attributed to Correct User

```sql
SELECT user_id, feature, total_tokens, created_at
FROM token_usage
WHERE feature = 'job_description_assistant'
ORDER BY created_at DESC LIMIT 1;
```

- [ ] `user_id` is the employer's internal DB ID
- [ ] `feature = 'job_description_assistant'`
- [ ] `total_tokens` is a positive integer

### S3 — Input Content Not Stored

Verify the endpoint does NOT persist the job post content to any database table:

```sql
-- Check no new columns were added to job_requirements
SELECT column_name FROM information_schema.columns
WHERE table_name = 'job_requirements'
AND column_name LIKE '%assistant%';
```

- [ ] No new columns were added to store AI input/output

---

## Regression Validation

### R1 — Job Form Still Saves Correctly

Create a new job post the normal way (without using AI Assist):

- [ ] `POST /api/job-requirements` succeeds
- [ ] Job post visible in the jobs list
- [ ] No change to the save/submit behaviour

### R2 — Edit Job Still Works

Edit an existing job post and save:

- [ ] `PATCH /api/job-requirements/:id` succeeds
- [ ] Changes saved correctly

### R3 — Job Form Description Not Auto-Modified

With auto-save (if present):

- [ ] Changing the description field still triggers auto-save as before
- [ ] Opening the AI Assist drawer does NOT trigger auto-save
- [ ] Generating AI output does NOT trigger auto-save

### R4 — TypeCheck and Build Pass

```bash
pnpm typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```

- [ ] Zero TypeScript errors
- [ ] Both builds complete without errors

---

## Final Sign-Off

| Phase | All Checks Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 — Type Check | ⬜ | | |
| Phase 2 — Backend API | ⬜ | | |
| Phase 3 — Frontend | ⬜ | | |
| Security Checks | ⬜ | | |
| Regression Checks | ⬜ | | |
| **Feature Complete** | ⬜ | | |

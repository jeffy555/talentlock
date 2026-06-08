# TalentLock — Clarification & Verification: Job Description Assistant

This file audits `features.md` against `project.md` and the completed token-consumption feature to surface gaps, architectural risks, and decisions that must be resolved before `task.md` is written.

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `/jobs/new` and `/jobs/:id` routes exist | Confirmed in `project.md` frontend routes |
| `POST /api/job-requirements` and `PATCH /api/job-requirements/:id` exist | Confirmed in `project.md` API routes |
| `job_requirements` table exists | Confirmed in `project.md` database schema |
| `logTokenUsage()` utility exists | Completed in token-consumption Phase 2 |
| `checkTokenQuota()` gates AI routes | Completed in token-consumption Phase 2 |
| `402 TOKEN_LIMIT` + `402 PLAN_LIMIT` response patterns | Confirmed in existing codebase |
| OpenAI client available server-side | `lib/integrations-openai-ai-server/` confirmed |
| shadcn/ui `<Sheet>`, `<Tabs>`, `<Toast>` available | Confirmed tech stack |
| Orval codegen → React Query hooks pattern | Confirmed `lib/api-client-react/` |
| `job_description_assistant` in `TokenFeature` | Added in ai-enhancements Phase 1, Task 1.4 |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Where Exactly Is the Job Form?

**Question:** The job form lives on `/jobs/new` and `/jobs/:id`. Is this a single shared `<JobForm />` component used in both places, or are they two separate page components with duplicated form logic?

**Impact:** The `✨ AI Assist` button and the drawer must be added in one place. If it's a shared component, one change covers both pages. If not, the button needs adding to two separate files.

**Recommendation:** Inspect `artifacts/talentlock/src/pages/` before writing any frontend code:
```bash
ls artifacts/talentlock/src/pages/ | grep -i job
```

---

### Q2 — What Is the `description` Field's Controlled State Variable Name?

**Question:** The drawer reads the current description value for the Improve tab snapshot. What is the exact variable name of the controlled state for the description textarea in the job form?

**Impact:** The drawer component needs to receive this value as a prop or via context. Getting the variable name wrong means the Improve tab opens empty.

**Recommendation:** Inspect the job form component before writing the drawer.

---

### Q3 — Does the Job Form Have Auto-Save?

**Question:** `features.md` and plan.md both reference "auto-save on the form (if present)." Does the job form currently have any auto-save, debounced-save, or onChange-triggered API call behaviour?

**Impact:** If auto-save exists, the plan.md Risk 3 decision (AI output held in separate state) is critical to enforce. If no auto-save exists, the risk is lower but the separation of state is still required.

**Recommendation:** Check the job form component for `useEffect`, `debounce`, or `onChange` handlers that call the API.

---

### Q4 — Does `job_description_assistant` Already Exist in `TokenFeature`?

**Question:** The ai-enhancements Phase 1 was supposed to add `job_description_assistant` to the `TokenFeature` union type. Has that phase been executed?

**Impact:** If not yet done, Task 1.1 of this feature must add it. If already done, skip Task 1.1.

**Recommendation:**
```bash
grep "job_description_assistant" artifacts/api-server/src/lib/tokenLogger.ts
```

---

### Q5 — Does `POST /api/ai/job-description` Already Exist?

**Question:** The ai-enhancements spec includes this endpoint as Task 2.4. Has it been implemented already as part of ai-enhancements execution?

**Impact:** If already implemented, Phase 2 of this feature is entirely skipped and we go straight to the frontend. If not, Phase 2 must build it.

**Recommendation:**
```bash
grep -r "job-description\|jobDescription" artifacts/api-server/src/routes/
```

---

### Q6 — What Does the Completeness Check Score Against?

**Question:** The Check tab returns a score (0–100) and a list of missing items. What specific fields should the AI check for? The scoring criteria need to be defined in the system prompt.

**Impact:** Without a defined rubric, the AI produces inconsistent scores across calls. The system prompt must list exactly what a complete job post includes.

**Recommendation:** Define the scoring rubric in `plan.md` as part of the system prompt — a checklist of 8–10 fields that a good job post should contain.

---

### Q7 — How Is the Sheet Dismissed?

**Question:** When the employer clicks Accept or Discard, the sheet closes. Should it also close when the employer clicks outside the sheet (overlay click), or should the overlay be non-dismissible to prevent accidental loss of AI output?

**Impact:** shadcn/ui `<Sheet>` is dismissible by overlay click by default. If the employer has generated output and accidentally clicks outside, they lose it.

**Recommendation:** Make the sheet non-dismissible by overlay when `assistantOutput` is non-empty. Only closeable via the `[×]` button or Accept/Discard buttons. When output is empty, overlay click can close it.

---

### Q8 — What Route File Should the Endpoint Live In?

**Question:** `features.md` references `POST /api/ai/job-description`. Should this live in:
- **(A)** `artifacts/api-server/src/routes/jobs.ts` — alongside existing job routes
- **(B)** `artifacts/api-server/src/routes/aiAssist.ts` — a new shared AI routes file

**Impact:** Option B is cleaner as more AI assist endpoints are added (interview questions, etc). Option A keeps job-related logic together.

**Recommendation:** Option B — `aiAssist.ts`. Consistent with how the ai-enhancements spec organises it and keeps AI routes together as the feature set grows.

---

## ⚠️ Risks & Notes

### Risk 1 — State Isolation Between Drawer and Form

The most critical risk. The drawer's `assistantOutput` state must be completely separate from the form's `description` state. If a developer wires them together — for example by setting `description` in an `onChange` or `useEffect` — the employer's draft gets overwritten silently. This must be enforced in code review.

### Risk 2 — Improve Tab Snapshot Staleness

The Improve tab takes a snapshot of `description` when the tab opens. If the employer has unsaved changes in the description field and then opens the drawer, the snapshot reflects the current textarea value (even if not yet saved). This is correct behaviour — the snapshot should be the current text, not the last-saved text.

### Risk 3 — Token Quota Mid-Session

An employer could open the drawer, type a long description, click Generate, and receive a `402 TOKEN_LIMIT` error. The error must be shown inside the drawer — not a page redirect. The employer's input text must be preserved so they can try again after upgrading.

### Risk 4 — Empty Content Validation

If the employer clicks Generate with an empty textarea, or Improve with an empty description, the endpoint should return a 400 error. The frontend should validate before making the API call and show an inline error in the drawer.

### Risk 5 — Codegen Export Rules

After adding `POST /api/ai/job-description` to the OpenAPI spec:
1. `lib/api-zod/orval.config.ts` — confirm `indexFiles: false`
2. `lib/api-zod/src/index.ts` — confirm only exports `./generated/api`
3. `pnpm typecheck` — fix all errors before Phase 3

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Job form component location | Task 3.1 (frontend) |
| Q2 | `description` state variable name | Task 3.2 (drawer component) |
| Q4 | `job_description_assistant` in TokenFeature | Task 1.1 (schema/type check) |
| Q5 | Endpoint already exists? | Phase 2 (skip if done) |
| Q6 | Completeness scoring rubric | Task 2.1 (system prompt) |

Questions Q3, Q7, Q8 are resolved in `plan.md`.

# TalentLock — Features Specification: Job Description Assistant

## Overview

Writing a good job post is harder than it looks. Employers on TalentLock currently fill in a free-text description field with no guidance on what to include, no way to improve a rough draft, and no feedback on whether the post is complete enough to attract strong candidates. The result is job posts that are vague, missing key details like budget or experience level, and less likely to match well in the AI Talent Matching chat.

This feature adds an AI writing assistant that slides in from the right side of the job form. It has three modes — Generate (write from scratch), Improve (rewrite a draft), and Check (score completeness and list what is missing). The assistant output is always a suggestion — the employer explicitly accepts it into their job post or discards it. The form is never modified without the employer's conscious action.

This feature is available on all employer plans and consumes from the existing monthly token quota.

---

## Feature Modules

### Module 1 — Trigger Button

An `✨ AI Assist` button appears in the job form toolbar next to the Description field label. Clicking it opens the assistant drawer. Available on `/jobs/new` and `/jobs/:id` (edit mode). Employer-only.

---

### Module 2 — Generate Tab

The employer describes the role in plain language — a sentence or two like "I need a senior React developer to build a dashboard for our SaaS product, remote, 3 month contract." The AI generates a fully structured job post with a title, overview, responsibilities, requirements, and engagement details.

Output appears in a preview area with a violet left border (AI-generated content marker). The employer can Accept (copies into the description field, closes drawer) or Discard (clears output, stays in drawer).

---

### Module 3 — Improve Tab

The Improve tab pre-populates with a snapshot of the employer's current description field. The employer clicks Improve and the AI rewrites it with better clarity, structure, and completeness. Same Accept/Discard pattern as Generate.

The snapshot is taken when the tab opens — it does not sync live with the form. The employer's original text is never overwritten until they click Accept.

---

### Module 4 — Check Tab

The employer clicks "Check Completeness" and the AI scores their current job post from 0 to 100 and returns a list of what is missing. Examples: "Required experience level not specified", "Budget range not included", "Remote/on-site preference unclear".

The score is displayed as a ring with colour coding:
- Green (≥ 80) — ready to post
- Amber (50–79) — needs improvement
- Red (< 50) — missing critical information

This tab is read-only feedback — there is no Accept/Discard because no content is generated. The employer uses the feedback to manually improve their description or switches to the Improve tab to let the AI do it.

---

### Module 5 — State Isolation

The drawer manages its own `assistantOutput` state completely separate from the job form's `description` state. Auto-save on the form (if present) only fires when the employer's own `description` field changes. Clicking Discard clears `assistantOutput` and closes the drawer without touching form state. This is a hard rule — the AI never touches the form without explicit employer action.

---

## API

One new endpoint: `POST /api/ai/job-description`

Request body:
```ts
{
  mode: 'generate' | 'improve' | 'check',
  content: string,     // plain language prompt (generate) or current draft (improve/check)
  jobTitle?: string    // optional context for better output
}
```

Response:
```ts
{
  mode: 'generate' | 'improve' | 'check',
  output?: string,      // for generate and improve
  score?: number,       // for check (0–100)
  missing?: string[]    // for check
}
```

Token logging: `job_description_assistant`
Gating: `checkTokenQuota()` before every OpenAI call

---

## Plan Gating

| Plan | Available |
|---|---|
| `employer_starter` | ✅ |
| `employer_growth` | ✅ |
| `employer_enterprise` | ✅ |

All employer plans have access. Token quota applies.

---

## Non-Goals (Out of Scope for This Feature)

- Freelancer-facing job post assistant
- Auto-saving AI-generated content without employer confirmation
- Storing past AI-generated drafts for reuse
- AI-generated job post titles (titles remain manual)
- Suggesting required skills from a taxonomy
- Comparing this job post against similar posts on the platform
- Auto-populating budget or rate fields from the description

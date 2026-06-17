# TalentLock — Features Specification: Agreement AI Summary

## Overview

When a TalentLock agreement is generated, it is a full legal document — typically 800–2,000 words covering deliverables, payment terms, IP ownership, termination clauses, confidentiality, and dispute resolution. Employers generate these contracts from job details using AI. For an employer who uses legal agreements regularly, scanning it is familiar. For a freelancer — especially one without a legal background — reading and fully understanding every clause before signing is daunting, slow, and often skipped entirely.

Skipping it is the worst outcome. A freelancer who signs without understanding the terms may later be surprised by IP assignment clauses, non-compete language, or termination conditions they did not expect. This creates disputes, damages trust, and erodes the platform's value proposition.

This feature adds an **AI Agreement Summary** button on the freelancer's view of `/agreements/:id`. When clicked, the AI reads the full agreement and produces a structured plain-English summary covering the six most important areas a freelancer needs to understand before signing. The summary highlights any terms that warrant careful attention before committing — with explicit freelancer-facing framing throughout.

The feature is **freelancer-only** — employers generate and understand the contract through the generation and redlining workflow. This is the freelancer's counterpart: a reading aid, not a legal opinion.

---

## Feature Modules

### Module 1 — Summary on Demand

A "✦ Summarise for me" button appears on `/agreements/:id` for the freelancer view. It is:
- Visible to the freelancer who is a party to the agreement
- Not visible to employers (they have redlining and health score)
- Always on demand — never automatic

Clicking it triggers a loading state, calls the backend AI endpoint, and renders the structured summary below the agreement content.

---

### Module 2 — Six-Section Structured Summary

The AI response is structured into exactly six named sections — always in this order:

| # | Section | What it covers |
|---|---|---|
| 1 | **What you're being hired to do** | The deliverables, scope of work, project description in plain language |
| 2 | **How and when you get paid** | Payment terms, amount, milestones, invoicing, what triggers payment |
| 3 | **Who owns the work** | IP ownership, work-for-hire, what the freelancer retains vs assigns |
| 4 | **How this can end** | Termination clauses — what can end the contract, notice periods, kill fee |
| 5 | **Important restrictions** | Non-compete, non-solicitation, confidentiality, exclusivity clauses if present |
| 6 | **Key dates and deadlines** | Start date, end date, milestone due dates, notice periods |

If a section is not present in the contract (e.g. no non-compete clause), the AI explicitly states "Not mentioned in this contract" rather than inventing content.

---

### Module 3 — Attention Flags

After the six sections, the AI produces up to 3 **attention flags** — specific terms or clauses the freelancer should read carefully before signing. These are not legal advice; they are a "you should know this exists" signal.

Examples of what would generate a flag:
- A perpetual IP assignment clause
- A non-compete covering similar work for 12 months
- A termination-at-will clause with no kill fee
- A clause requiring exclusivity during the engagement
- Unusual payment timing (e.g. "paid 90 days after delivery")

Format: each flag is a 1–2 sentence plain-English note with the relevant section header from the contract quoted (≤ 8 words) so the freelancer knows where to look.

If no notable terms exist: "No unusual terms found — this appears to be a standard freelance engagement contract."

---

### Module 4 — Summary Caching

The summary is expensive to compute (~800–1,200 tokens). It must not be recomputed on every page view.

**New columns on `agreements`:**
- `freelancerSummary` — jsonb, nullable — the structured summary object
- `freelancerSummaryScoredAt` — timestamptz, nullable — when it was generated

**Cache invalidation:** When `PATCH /api/agreements/:id/accept-redline` runs (content changes), the freelancer summary cache is nullified alongside the health score cache — same pattern, same line in the handler.

On the frontend: if a cached summary exists, it is shown immediately on mount without a new API call (no button needed — show "Summary" tab with the cached content, and a "Regenerate" option).

---

### Module 5 — API Endpoint

`POST /api/agreements/:id/summarise`

- Requires Clerk auth
- Freelancer only — returns `403` for employers
- Verifies the freelancer is a party to this agreement
- Checks cache — returns immediately if valid cache exists (`cached: true`)
- Calls OpenAI when no cache
- Caches result on `agreements` table
- Returns structured summary

Token label: `agreement_summary`
Plan gating: All freelancer plans. No plan gate. Token quota not applicable to freelancers (consistent with AI Proposal Generator and AI Contract Health Score patterns).

---

### Module 6 — Agreement List Badge

On the `/agreements` list page, agreements that have a cached summary show a small "Summarised" badge next to their title — giving the freelancer a visual cue that they have already processed this contract.

---

## Response Shape

```ts
{
  cached: boolean,
  truncated: boolean,
  freelancerSummaryScoredAt: string,  // ISO timestamp
  sections: {
    whatYouDo:       { title: string; content: string },
    howYouGetPaid:   { title: string; content: string },
    whoOwnsTheWork:  { title: string; content: string },
    howItCanEnd:     { title: string; content: string },
    restrictions:    { title: string; content: string },
    keyDates:        { title: string; content: string },
  },
  attentionFlags: {
    exists: boolean,
    items: { heading: string; detail: string }[]  // up to 3
  },
  disclaimer: string  // always: "This is an AI-generated summary for your convenience. It is not legal advice. Read the full agreement before signing."
}
```

---

## Plan Gating

| Plan | Available | Token cost |
|---|---|---|
| `freelancer_free` | ✅ | ~900 tokens |
| `freelancer_pro` | ✅ | ~900 tokens |
| Employer plans | ❌ (403) | N/A |

Available to all freelancer plans. Employers do not see this feature — they have redlining and health score.

---

## Non-Goals

- Legal advice or liability assessment (clearly disclaimed in every response)
- Translating the summary into non-English languages
- Suggesting specific edits to the contract (that is redlining — employer-only Growth+)
- Comparing this agreement to other agreements the freelancer has signed
- Scoring the agreement (that is the AI Contract Health Score — visible to both parties)
- Auto-summarising every agreement on generation — on-demand only
- Summary visible to the employer (freelancer-only feature)

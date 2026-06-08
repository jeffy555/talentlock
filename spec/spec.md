# TalentLock — Master Specification

> **This is the single entry point for all feature work on TalentLock.**
> Every new feature follows the same folder structure and document execution order defined here.
> Read this file first. Always.

---

## Folder Structure

All feature specification files live under a top-level `specs/` directory at the repository root, alongside `artifacts/`, `lib/`, and other workspace packages.

```
talentlock/
├── artifacts/
│   ├── talentlock/              ← React + Vite frontend
│   └── api-server/              ← Express 5 API server
├── lib/
│   ├── db/
│   ├── api-spec/
│   ├── api-client-react/
│   ├── api-zod/
│   └── ...
├── specs/                                    ← ALL specification files live here
│   ├── spec.md                               ← THIS FILE — master index + execution rules
│   │
│   ├── token-usage/                          ← ✅ Complete
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   └── UI.md
│   │
│   ├── ai-enhancements/                      ← 🔄 In Progress
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   └── UI.md
│   │
│   ├── document-verification/                ← 🟡 Ready to Execute
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── smarter-matching/                     ← 🟡 Ready to Execute
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── agreement-templates-redlining/        ← 🟡 Ready to Execute
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── job-description-assistant/            ← 🟡 Ready to Execute
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── per-conversation-token-breakdown/     ← 🟡 Ready to Execute
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── reviews-ratings/                       ← 🟡 Ready to Execute
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── notifications-centre/                 ← 🟡 Ready to Execute
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── earnings-intelligence/                ← 🟡 Ready to Execute
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── employer-spend-analytics/             ← 🟡 Ready to Execute
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── employer-analytics-dashboard/         ← 🟡 Ready to Execute
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── AvailabilityCalendar/                 ← ✅ Complete
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── SecurityHardening/                    ← ✅ Complete
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md
│   │
│   ├── ProductGaps/                          ← ✅ Complete (validated 2026-06-08)
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md                     ← sign-off complete
│   │
│   ├── ai-proposal-generator/                ← ✅ Complete (validated 2026-06-08)
│   │   ├── features.md
│   │   ├── clarify.md
│   │   ├── plan.md
│   │   ├── task.md
│   │   ├── UI.md
│   │   └── validation.md                     ← sign-off complete
│   │
│   └── {next-feature}/                       ← Future features follow the same pattern
│       ├── features.md
│       ├── clarify.md
│       ├── plan.md
│       ├── task.md
│       ├── UI.md
│       └── validation.md
│
├── project.md                                ← Architecture reference (keep at repo root)
└── package.json
```

---

## The Six Specification Files

Every feature folder contains exactly these six files, created and consumed in this order:

| # | File | Owner | Purpose |
|---|---|---|---|
| 1 | `features.md` | Product | Defines the feature: what it does, who it serves, module breakdown, plan/quota details, and explicit non-goals |
| 2 | `clarify.md` | Product + Engineering | Audits `features.md` against the existing architecture, surfaces blockers, flags open questions that must be resolved before work starts |
| 3 | `plan.md` | Engineering | Resolves every open question and risk from `clarify.md` with binding decisions and exact TypeScript code. Wins over `task.md` on any conflict |
| 4 | `task.md` | Engineering | Breaks the feature into ordered implementation tasks with exact file paths, code snippets, and acceptance criteria |
| 5 | `UI.md` | Engineering + Design | Specifies every component, page integration, state variant, copy string, interaction, and accessibility requirement for the frontend |
| 6 | `validation.md` | Engineering | Phase-by-phase test checklist covering API behaviour, UI states, security, and regression checks. Run after all `task.md` phases are complete |

---

## How Each File Feeds the Next

```
features.md
    │  defines scope and modules
    ▼
clarify.md
    │  raises questions FROM features.md
    ▼
plan.md
    │  answers every question FROM clarify.md
    │  (agent never needs clarify.md — plan.md absorbs it)
    ▼
task.md
    │  implements decisions FROM plan.md
    │  references exact file paths and code
    ▼
UI.md
    │  specifies every component FROM task.md Phase 3
    │  (only needed during frontend work)
    ▼
validation.md
    │  verifies every acceptance criterion FROM task.md
    └  feature is not merged until this is fully checked off
```

---

## Execution Order

**Follow this order without skipping steps. Each file depends on the one before it.**

---

### Step 1 — Read `project.md`

Before touching any spec file, re-read `project.md` at the repo root.

- Confirm the current tech stack, database schema, existing routes, and auth pattern.
- Note any tables or utilities already in place that the feature can reuse.
- This prevents re-implementing what already exists (e.g. the `SELECT … FOR UPDATE` gating pattern, the `402 PLAN_LIMIT` redirect flow, the UTC-month reset logic).

---

### Step 2 — `features.md`

**Purpose:** Define the feature at the product level. No implementation decisions yet.

Must include:
- One-paragraph overview of the feature and the user problem it solves
- Named feature modules (numbered list)
- Any plan/quota/limit values
- Explicit non-goals section (what this phase does NOT cover)

**Gate:** `features.md` is complete when every stakeholder agrees on scope and non-goals. Do not proceed to `clarify.md` until this is signed off.

---

### Step 3 — `clarify.md`

**Purpose:** Cross-check `features.md` against `project.md` and flag everything that needs resolution before engineering begins.

Must include:
- A "Verified" table confirming which parts of the spec are already supported by the existing architecture
- Numbered open questions (`Q1`, `Q2`, …) — each with: the question, its impact on implementation, and a recommendation where possible
- A "Risks & Notes" section for architectural risks, race conditions, and third-party integration gotchas
- A "Summary of Blockers" table that maps each blocking question to the task it gates

**Gate:** All blockers in the Summary table must be resolved (with answers written directly into `plan.md`) before `task.md` is written. Non-blocking questions can be resolved during implementation.

---

### Step 4 — `plan.md`

**Purpose:** Resolve every open question and architectural risk from `clarify.md` with a final, binding decision. This is what the Cursor Agent reads alongside `task.md` before writing any code.

Must include:
- A numbered resolution for every question in `clarify.md` (Q1, Q2, …) with exact TypeScript code where relevant
- A resolution for every risk in `clarify.md` (Risk 1, Risk 2, …)
- Any new constants, type updates, or migration notes that flow from the decisions
- A pre-implementation checklist the agent must verify before starting
- A phase execution sign-off table (updated as phases complete)

**Rules:**
- If `plan.md` and `task.md` ever conflict, `plan.md` wins
- No question from `clarify.md` may remain open in `plan.md`
- The Cursor Agent prompt for every phase must include `@plan.md`

**Gate:** `plan.md` is complete when zero blockers remain and every decision has exact implementation guidance. Do not write `task.md` until `plan.md` is done.

---

### Step 5 — `task.md`

**Purpose:** Define exactly how to build the feature. This is the engineering execution plan.

Must include:
- Tasks grouped into numbered phases (Database → Backend → Frontend → Admin/Other)
- Each task: a title, the exact file(s) to create or modify, code snippets or schema definitions where relevant
- Dependencies between tasks expressed as a graph or ordered list
- A flat acceptance criteria checklist (checkboxes) at the bottom

**Rules:**
- Every task references a specific file path — no vague descriptions like "update the backend"
- Tasks build on each other in dependency order; a developer can work top-to-bottom
- Frontend tasks (Phase 3) always come after API tasks (Phase 2) because the codegen step produces the React Query hooks
- Never start Phase 3 before Phase 2 codegen is confirmed and `pnpm typecheck` passes

**Gate:** `task.md` is complete when a developer could implement the entire feature from it without asking a product question. All blockers from `clarify.md` must be resolved in `plan.md` first.

---

### Step 6 — `UI.md`

**Purpose:** Define the complete frontend behaviour. This is the design + interaction source of truth.

Must include:
- Design tokens and colour semantics specific to this feature
- Every new component: props interface, all state variants (loading, empty, error, each data state), layout diagrams, Tailwind class specifics
- Every page integration: exact placement, render conditions, responsive behaviour
- Copy reference table with every user-facing string
- Loading and error state summary table
- Component file summary table (new vs. modified, mapped to task numbers)

**Rules:**
- States are exhaustive — every possible data state has a specified rendering
- Copy strings are final — no "TBD" or placeholder text
- Component props are typed — interfaces are written in TypeScript
- Page integrations specify DOM order, not just "add it somewhere on the page"

**Gate:** `UI.md` is complete when a developer could build every screen and component without a design mockup.

---

### Step 7 — `validation.md`

**Purpose:** Verify the feature is correctly implemented before it is considered complete. Run after all phases of `task.md` are marked done.

Must include:
- One validation section per implementation phase (matching `task.md` phases)
- Each check: what to run (exact `curl` command or SQL query), and what the expected result is
- A dedicated Security section covering auth guards, data isolation, and privacy rules
- A Regression section confirming existing features are unaffected
- A final sign-off table with one row per phase, signed off by date

**Rules:**
- Every acceptance criterion in `task.md` must have a corresponding check in `validation.md`
- Security checks are mandatory — they cannot be skipped
- A failed check must be fixed and re-run — do not mark a phase complete with known failures
- Both the implementing developer and a reviewer should run this checklist independently

**Gate:** Feature is not merged until every check in `validation.md` is marked ✅ and the sign-off table is complete.

---

## Rules for All Spec Files

1. **One feature, one folder.** Never mix two features in the same spec folder.
2. **Files are ordered, not parallel.** Do not write `task.md` before `plan.md` is complete.
3. **`project.md` is the architectural source of truth.** If a spec conflicts with `project.md`, flag it in `clarify.md` — do not silently deviate.
4. **`plan.md` wins over `task.md`.** If the two conflict, `plan.md` is authoritative.
5. **Non-goals are binding.** If a non-goal from `features.md` comes up during implementation, stop and re-open the spec rather than silently expanding scope.
6. **Acceptance criteria in `task.md` are checkboxes.** Mark them done as tasks complete. Do not close a feature without all boxes checked.
7. **UI states are exhaustive.** If a component has a loading state, it must be in `UI.md`. Unspecified states become developer guesses.
8. **Copy is final before implementation.** The copy table in `UI.md` is the last step before a developer writes a single line of frontend code.
9. **Validation is mandatory.** No feature ships without a completed `validation.md` sign-off table.
10. **Never commit `task.md` until all blockers in `clarify.md` are resolved in `plan.md`.**

---

## What the Cursor Agent Reads

The agent never needs `features.md` or `clarify.md` — those are already absorbed into `plan.md`.

| Phase | Files to reference |
|---|---|
| Verification (before coding) | `@project.md` `@plan.md` `@task.md` |
| Phase 1 — Database | `@project.md` `@plan.md` `@task.md` |
| Phase 2 — Backend | `@project.md` `@plan.md` `@task.md` |
| Phase 3 — Frontend | `@project.md` `@plan.md` `@task.md` `@UI.md` |
| Phase 4 — Admin | `@project.md` `@plan.md` `@task.md` `@UI.md` |
| Validation | `@project.md` `@validation.md` |

`features.md` and `clarify.md` are **your reference documents** — for tracing back why a decision was made. The agent does not need them during execution.

---

## Cursor Agent Rules

Every Cursor Agent session that implements a feature must begin with this prompt pattern:

```
Read @project.md @specs/{feature}/plan.md @specs/{feature}/task.md
before writing any code.

Execute Phase {N} only. Do not touch any files outside this phase.
```

The `.cursor/rules/talentlock.mdc` file at the repo root enforces these rules automatically for every session.

---

## Feature Index

| Feature | Folder | Status |
|---|---|---|
| AI Token Consumption Dashboard | `specs/token-usage/` | ✅ Complete |
| AI Enhancements | `specs/ai-enhancements/` | ✅ Complete |
| Document Verification | `specs/document-verification/` | ✅ Complete |
| Smarter Matching Explanation | `specs/smarter-matching/` | ✅ Complete |
| Agreement Templates + Redlining | `specs/agreement-templates-redlining/` | ✅ Complete |
| Job Description Assistant | `specs/job-description-assistant/` | ✅ Complete |
| Per-Conversation Token Breakdown | `specs/per-conversation-token-breakdown/` | ✅ Complete |
| Reviews & Ratings | `specs/reviews-ratings/` | ✅ Complete |
| Notifications Centre | `specs/notifications-centre/` | ✅ Complete |
| Earnings Intelligence | `specs/earnings-intelligence/` | ✅ Complete |
| Employer Spend Analytics | `specs/employer-spend-analytics/` | ✅ Complete |
| Employer Analytics Dashboard | `specs/employer-analytics-dashboard/` | ✅ Complete |
| Availability Calendar (Visual) | `spec/AvailabilityCalendar/` | ✅ Complete |
| Security Hardening | `spec/SecurityHardening/` | ✅ Complete |
| Product Gaps | `spec/ProductGaps/` | ✅ Complete (validated 2026-06-08) |
| AI Proposal Generator | `spec/ai-proposal-generator/` | ✅ Complete (validated 2026-06-08) |

> Add new features to this table when their `features.md` is created.
> Update status as work progresses: 🟡 Ready → 🔄 In Progress → ✅ Complete

---

## Starting a New Feature

When a new feature request comes in:

1. Create `specs/{feature-slug}/` folder
2. Add the feature to the Feature Index table above with status `🟡 Ready`
3. Follow Steps 1–7 in order — do not skip or reorder
4. Never commit `task.md` until all blockers in `clarify.md` are resolved in `plan.md`
5. Never merge the feature until `validation.md` sign-off table is fully complete
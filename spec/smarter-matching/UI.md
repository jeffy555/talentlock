# TalentLock — UI Specification: Smarter Matching Explanation

## Overview

This document specifies the complete UI for the Smarter Matching Explanation feature. One new component (`<MatchExplanationCard />`), two page integrations (`/ai-match` and `/freelancers/:id`), all states, all copy, and all interactions are defined here.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter routing.
**Employer-only.** No freelancer-facing pages are modified.

---

## Design Tokens

| Semantic | Tailwind Classes | Used for |
|---|---|---|
| AI content border | `border-l-4 border-violet-400` | All AI-generated cards |
| Matched skill | `bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 text-xs` | Skills that match |
| Gap skill | `bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-xs` | Skills that are missing |
| Within budget | `bg-emerald-100 text-emerald-700` | Rate fit badge |
| Above budget | `bg-red-100 text-red-700` | Rate fit badge |
| Below budget | `bg-amber-100 text-amber-700` | Rate fit badge |
| Available | `bg-emerald-100 text-emerald-700` | Availability badge |
| Unavailable | `bg-red-100 text-red-700` | Availability badge |
| Unknown | `bg-slate-100 text-slate-500` | Unknown state badge |
| Card wrapper | `rounded-md border border-violet-200 bg-violet-50 p-4` | Card container |
| Summary text | `text-sm text-slate-700 italic` | overallSummary paragraph |

---

## Component — `<MatchExplanationCard />`

**File:** `artifacts/talentlock/src/components/MatchExplanationCard.tsx`

### Props

```ts
interface MatchExplanationCardProps {
  freelancerId: string;
  jobRequirementId?: string;
  conversationId: string;
}
```

### Data Source

`usePostAiMatchExplanation()` — called on mount with `{ freelancerId, jobRequirementId, conversationId }`.

---

### State 1 — Loading

Renders while the API call is in flight.

```
┌────────────────────────────────────────────────────┐
│  border-l-4 border-violet-300                      │
│  ░░░░░░░░░░░░░░░░░░  (skeleton — heading)           │
│                                                    │
│  ░░░░░░  ░░░░░░░░░░  ░░░░░  (skeleton — chips)     │
│                                                    │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░  (skeleton — bar)        │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  (skeleton — text)  │
└────────────────────────────────────────────────────┘
```

Use shadcn/ui `<Skeleton />`. Three skeleton rows:
- Row 1: `<Skeleton className="h-4 w-32" />` — heading placeholder
- Row 2: `<Skeleton className="h-6 w-full" />` — chips placeholder
- Row 3: `<Skeleton className="h-10 w-full" />` — summary placeholder

---

### State 2 — Loaded (with job context — `jobRequirementId` present and budget/start date available)

Full card with all four sections.

```
┌────────────────────────────────────────────────────────┐
│  border-l-4 border-violet-400  bg-violet-50            │
│                                                        │
│  ✦ Why this match                                      │
│                                                        │
│  Skills Alignment                                      │
│  [✅ React] [✅ TypeScript] [✅ Node.js]                │  ← green chips
│  [⚠ GraphQL] [⚠ AWS]                                  │  ← amber chips
│                                                        │
│  Rate Fit                                              │
│  $85/hr  ·  Budget: $70 – $100/hr  [Within Budget ✓]  │
│                                                        │
│  Availability                                          │
│  Available from Jun 10  ·  Required: Jun 15            │
│  [Available ✓]                                         │
│                                                        │
│  "Strong match on core stack. Two skill gaps           │
│   (GraphQL, AWS) are learnable on the job and          │
│   the rate falls within budget."                       │
└────────────────────────────────────────────────────────┘
```

**Card wrapper:**
`className="rounded-md border border-violet-200 bg-violet-50 p-4 border-l-4 border-l-violet-400 mt-2"`

**Heading:**
`<p className="text-xs font-semibold text-violet-700 mb-3">✦ Why this match</p>`

**Skills Alignment section:**

Section label: `<p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Skills Alignment</p>`

Matched chips:
```tsx
{matched.map(skill => (
  <span key={skill} className="bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 text-xs mr-1 mb-1 inline-flex items-center gap-1">
    ✅ {skill}
  </span>
))}
```

Gap chips:
```tsx
{gaps.map(skill => (
  <span key={skill} className="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-xs mr-1 mb-1 inline-flex items-center gap-1">
    ⚠ {skill}
  </span>
))}
```

When `matched` is empty and `gaps` is empty:
```
No specific skills data available.
```
`text-xs text-slate-400`

**Rate Fit section** (only when `rateFit !== null`):

Section label: `<p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Rate Fit</p>`

```tsx
<div className="flex items-center gap-2 text-sm">
  <span className="text-slate-700">${freelancerRate}/hr</span>
  {budgetMin && budgetMax && (
    <span className="text-slate-400">· Budget: ${budgetMin} – ${budgetMax}/hr</span>
  )}
  <RateFitBadge assessment={assessment} />
</div>
```

`RateFitBadge` mapping:
```tsx
const badgeConfig = {
  within_budget: { label: 'Within Budget ✓', className: 'bg-emerald-100 text-emerald-700' },
  above_budget:  { label: 'Above Budget',     className: 'bg-red-100 text-red-700' },
  below_budget:  { label: 'Below Budget',     className: 'bg-amber-100 text-amber-700' },
  unknown:       null, // render nothing
};
```

When `assessment === 'unknown'` — omit the entire Rate Fit section.

**Availability section:**

Section label: `<p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Availability</p>`

```tsx
<div className="flex items-center gap-2 text-sm flex-wrap">
  {availableFrom && (
    <span className="text-slate-700">Available from {formatDate(availableFrom)}</span>
  )}
  {requiredStartDate && (
    <span className="text-slate-400">· Required: {formatDate(requiredStartDate)}</span>
  )}
  <AvailabilityBadge assessment={availabilityAssessment} />
</div>
```

`AvailabilityBadge` mapping:
```tsx
const badgeConfig = {
  available:   { label: 'Available ✓',        className: 'bg-emerald-100 text-emerald-700' },
  unavailable: { label: 'Unavailable',         className: 'bg-red-100 text-red-700' },
  unknown:     { label: 'Availability unknown', className: 'bg-slate-100 text-slate-500' },
};
```

**Overall Summary:**

```tsx
<p className="text-sm text-slate-700 italic mt-3 pt-3 border-t border-violet-200">
  "{overallSummary}"
</p>
```

---

### State 3 — Loaded (without job context — `jobRequirementId` absent or no budget/date data)

Same as State 2 but:
- Rate Fit section is **omitted entirely** — no label, no empty row
- Availability section shows `assessment: 'unknown'` badge if no start date
- Summary is always present

```
┌────────────────────────────────────────────────────┐
│  ✦ Why this match                                  │
│                                                    │
│  Skills Alignment                                  │
│  [✅ React] [✅ TypeScript]                         │
│  [⚠ AWS]                                           │
│                                                    │
│  Availability                                      │
│  Available from Jun 10  ·  [Availability unknown]  │
│                                                    │
│  "Strong frontend skills with React and            │
│   TypeScript. No job context provided for          │
│   rate or timeline comparison."                    │
└────────────────────────────────────────────────────┘
```

---

### State 4 — Quota Reached (`402 TOKEN_LIMIT`)

Inline state — no redirect. No full card skeleton.

```
┌────────────────────────────────────────────────────┐
│  border-l-4 border-amber-400  bg-amber-50          │
│                                                    │
│  ⚡ Monthly AI token limit reached                 │
│  Match explanations are paused until {resetDate}.  │
│  [Upgrade Plan →]                                  │
└────────────────────────────────────────────────────┘
```

`className="rounded-md border border-amber-200 bg-amber-50 p-3 border-l-4 border-l-amber-400 mt-2"`

Heading: `text-sm font-medium text-amber-800`
Body: `text-xs text-amber-700`
"Upgrade Plan →": `<a>` or Wouter `<Link to="/pricing">` — `text-xs font-medium text-amber-800 underline`

---

### State 5 — Error / Parse Error

```
┌────────────────────────────────────────────────────┐
│  Could not load match explanation.   [Retry]       │
└────────────────────────────────────────────────────┘
```

`className="rounded-md border border-slate-200 bg-slate-50 p-3 mt-2"`
Text: `text-sm text-muted-foreground`
Retry: `<Button variant="ghost" size="sm">` — calls the mutation again

For `parseError: true` specifically, show:
```
Match explanation returned unexpected format.  [Retry]
```

---

## Page Integration 1 — `/ai-match`

**File:** `artifacts/talentlock/src/pages/AiMatch.tsx`

### Placement

Each `<MatchExplanationCard />` renders directly below the chat message bubble that recommended the freelancer. It is part of the message list — not a sidebar or modal.

```
┌─────────────────────────────────────────────────┐
│  [AI message bubble]                            │
│  "Here are the top matches for your role..."    │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  [Freelancer card: Sarah Chen]    ← existing UI │
│  Senior React Developer · $85/hr                │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  ✦ Why this match                ← NEW          │
│  Skills · Rate · Availability · Summary         │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  [Freelancer card: João Alves]                  │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│  ✦ Why this match                               │
└─────────────────────────────────────────────────┘
```

### Render Condition

```tsx
// Only render explanation cards when:
// 1. Message is from the AI (not the employer)
// 2. Parsed recommendations array is non-empty
// 3. userRole === 'employer'
{isAiMessage && visibleRecommendations.length > 0 && visibleRecommendations.map(rec => (
  <MatchExplanationCard
    key={rec.freelancerId}
    freelancerId={rec.freelancerId}
    jobRequirementId={activeConversation?.jobRequirementId ?? undefined}
    conversationId={activeConversation.id}
  />
))}
```

### Historical Messages

For messages sent before this feature shipped (plain text format — no `recommendations` array), `parseChatResponse()` returns `recommendations: []`. No explanation cards are rendered for these messages. This is the correct behaviour — no backfill.

---

## Page Integration 2 — `/freelancers/:id`

**File:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

### Placement

Inserted below the freelancer bio section, above the skills/portfolio sections.

```
[FreelancerHero]        ← name, role, rate, badges
[FreelancerBio]         ← about text
[MatchExplanationCard]  ← NEW — only when ?jobId= present
[SkillsSection]
[PortfolioSection]
[ReviewsSection]
```

### Render Condition

```tsx
const search = useSearch(); // Wouter
const jobId = new URLSearchParams(search).get('jobId');

{jobId && userRole === 'employer' && (
  <MatchExplanationCard
    freelancerId={freelancer.id}
    jobRequirementId={jobId}
    conversationId="direct-view"
  />
)}
```

- `conversationId="direct-view"` is a sentinel value — tokens are still logged but not tied to a chat conversation
- When `jobId` is absent: nothing rendered, no empty space, no placeholder
- When `userRole !== 'employer'`: nothing rendered

### How Employers Arrive Here With `?jobId=`

From the job requirement page (`/jobs/:id`), a "Find Matches" button navigates to `/freelancers/:id?jobId={jobId}`. This flow already exists or should be added as part of this feature integration.

---

## Copy Reference

| Location | String |
|---|---|
| Card heading | `✦ Why this match` |
| Skills section label | `Skills Alignment` |
| Rate section label | `Rate Fit` |
| Availability section label | `Availability` |
| No skills data | `No specific skills data available.` |
| Rate — within budget | `Within Budget ✓` |
| Rate — above budget | `Above Budget` |
| Rate — below budget | `Below Budget` |
| Availability — available | `Available ✓` |
| Availability — unavailable | `Unavailable` |
| Availability — unknown | `Availability unknown` |
| Quota reached heading | `⚡ Monthly AI token limit reached` |
| Quota reached body | `Match explanations are paused until {resetDate}.` |
| Quota reached CTA | `Upgrade Plan →` |
| Error state | `Could not load match explanation.` |
| Parse error state | `Match explanation returned unexpected format.` |
| Retry button | `Retry` |

---

## Loading & Error States Summary

| State | Trigger | Rendering |
|---|---|---|
| Loading | API call in flight | 3-row skeleton inside violet card |
| Loaded (full) | `jobRequirementId` present, all data returned | 4 sections: skills + rate + availability + summary |
| Loaded (partial) | No `jobRequirementId` or no budget/date | 3 sections: skills + availability + summary |
| Quota reached | `402 TOKEN_LIMIT` response | Amber inline card, no redirect |
| Error | Any non-402 API error | Slate card with retry button |
| Parse error | `parseError: true` in response | Slate card with specific message + retry |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/MatchExplanationCard.tsx` | **New** | 3.3 |
| `src/pages/AiMatch.tsx` | Modified | 3.2, 3.4 |
| `src/pages/FreelancerDetail.tsx` | Modified | 3.5 |

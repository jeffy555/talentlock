# TalentLock — UI Specification: AI Meeting Brief Generator

## Overview

One new component (`<MeetingBriefCard />`) inserted into the existing `/meetings/:id` meeting detail page. Employer-only. Freelancers never see it. The card renders below the existing meeting metadata (date, time, participants) as a collapsible or always-open panel with four distinct sections.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Brief card header | `bg-amber-50 border-amber-200 text-amber-800` | Warm amber — brief is preparation context |
| Section heading | `text-slate-700 font-semibold text-sm` | Section labels |
| Match reason | `bg-emerald-50 text-emerald-700 border-emerald-200` | Why they match bullets |
| Watch point | `bg-amber-50 text-amber-700 border-amber-200` | Watch point warnings |
| Rate — within budget | `text-emerald-700` | Rate in range |
| Rate — over budget | `text-red-600` | Rate out of range |
| Question number | `bg-slate-100 text-slate-600` | Q1, Q2 etc. badges |
| Credential badge | `bg-blue-50 text-blue-700 border-blue-200` | Verified credential pills |
| Regenerate button | `variant="outline" size="sm"` | Subtle — not primary action |

---

## Meeting Detail Page Integration

**File:** `artifacts/talentlock/src/pages/MeetingDetail.tsx`

The brief card is inserted after the meeting header section (title, date, participants) and before any action buttons (e.g. "Start meeting", "Cancel meeting"):

```
┌─────────────────────────────────────────────────────────────────┐
│  Discovery Meeting                                               │
│  Sarah Chen × React Dashboard Contract                          │
│  📅 June 20, 2026 at 10:00 AM                                   │
│  ● Confirmed                                                     │
├─────────────────────────────────────────────────────────────────┤
│  ✦ AI Meeting Brief                    [Regenerate]  [▼]        │  ← NEW
│  Generated June 18, 2026                                        │
│  [Brief content sections below]                                 │
├─────────────────────────────────────────────────────────────────┤
│  [Cancel meeting]                                               │
└─────────────────────────────────────────────────────────────────┘
```

Conditionally rendered:
```tsx
{userRole === 'employer' && meeting.status === 'confirmed' && (
  <MeetingBriefCard
    brief={meeting.briefContent}
    briefGeneratedAt={meeting.briefGeneratedAt}
    meetingId={meeting.id}
    userPlan={userPlan}
  />
)}
```

---

## State 1 — Brief Not Yet Generated

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ AI Meeting Brief                                             │
│                                                                  │
│  Get AI-generated preparation for this meeting — candidate      │
│  summary, suggested questions, and rate context.                │
│                                                                  │
│                                    [✦ Generate brief]           │
└─────────────────────────────────────────────────────────────────┘
```

```tsx
<div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
  <div className="flex items-center gap-2 mb-3">
    <Sparkles className="h-4 w-4 text-amber-600" />
    <h3 className="text-sm font-semibold text-amber-800">AI Meeting Brief</h3>
  </div>
  <p className="text-sm text-amber-700 mb-4">
    Get AI-generated preparation for this meeting — candidate summary,
    suggested questions, and rate context.
  </p>
  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white"
    onClick={handleGenerate}>
    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
    Generate brief
  </Button>
</div>
```

---

## State 2 — Generating (Polling)

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ AI Meeting Brief                                             │
│                                                                  │
│  ⟳ Generating your meeting brief...                             │
│    This usually takes 10–15 seconds.                            │
└─────────────────────────────────────────────────────────────────┘
```

```tsx
<div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
  <div className="flex items-center gap-2">
    <Sparkles className="h-4 w-4 text-amber-600 animate-pulse" />
    <span className="text-sm font-semibold text-amber-800">AI Meeting Brief</span>
  </div>
  <div className="flex items-center gap-2 mt-3 text-sm text-amber-700">
    <Loader2 className="h-4 w-4 animate-spin" />
    Generating your meeting brief...
  </div>
  <p className="text-xs text-amber-600 mt-1">This usually takes 10–15 seconds.</p>
</div>
```

---

## State 3 — Brief Loaded (Full View)

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ AI Meeting Brief              Generated Jun 18 · [Regenerate]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CANDIDATE SNAPSHOT                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Sarah Chen    ★ 4.9  (12 reviews)   94/100 profile        │ │
│  │  Full Stack Development                                    │ │
│  │  Rate: $95/hr                                               │ │
│  │  [Identity Verified] [Degree Certificate]                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  WHY THEY MATCH                                                  │
│  ✅ React + TypeScript skills match the job's required stack     │
│  ✅ Rate within the job's stated budget ($85–$105/hr)            │
│  ✅ Available from June 15 — matches the job's start date        │
│                                                                  │
│  SUGGESTED QUESTIONS              [employer_starter: upgrade]    │
│  Q1  Walk me through your most complex React project...         │
│  Q2  How do you handle handover at the end of a contract?       │
│  Q3  Your profile lists TypeScript but no TypeScript portfolio  │
│      items — can you tell me about that experience?             │
│  Q4  What's your experience working directly from Figma?        │
│  Q5  How do you handle state management in large React apps?    │
│                                                                  │
│  RATE CONTEXT                                                    │
│  Their rate:     $95/hr       ✅ Within budget ($85–$105/hr)     │
│  Market median:  $88/hr       Platform: 67th percentile         │
│  Your avg paid:  $91/hr                                          │
│  Assessment:     Competitive rate, slight negotiation room      │
│                  exists (market median is $88/hr).               │
│                                                                  │
│  WATCH POINTS                                                    │
│  ⚠ Lists Next.js but has no Next.js portfolio items             │
│  ⚠ Only 2 reviews — limited platform track record               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## `<MeetingBriefCard />` Full Component

**File:** `artifacts/talentlock/src/components/meetings/MeetingBriefCard.tsx`

```tsx
interface MeetingBriefCardProps {
  brief: MeetingBrief | null;
  briefGeneratedAt: string | null;
  meetingId: string;
  userPlan: string;
}

export function MeetingBriefCard({ brief, briefGeneratedAt, meetingId, userPlan }: MeetingBriefCardProps) {
  const generateMutation = usePostMeetingsIdBrief();
  const [isGenerating, setIsGenerating] = useState(false);
  const { refetch } = useGetMeetingsId(meetingId);
  const isGrowth = userPlan === 'employer_growth' || userPlan === 'employer_enterprise';

  const handleGenerate = async () => {
    setIsGenerating(true);
    await generateMutation.mutateAsync({ id: meetingId });
    // Begin polling
    const maxAttempts = 10;
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const { data } = await refetch();
      if (data?.briefContent || attempts >= maxAttempts) {
        setIsGenerating(false);
        clearInterval(poll);
      }
    }, 3000);
  };

  // State 1: Not generated
  if (!brief && !isGenerating) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-800">AI Meeting Brief</h3>
        </div>
        <p className="text-sm text-amber-700 mb-4">
          Get AI-generated preparation for this meeting — candidate summary, suggested questions, and rate context.
        </p>
        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleGenerate}>
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Generate brief
        </Button>
      </div>
    );
  }

  // State 2: Generating
  if (isGenerating) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-amber-600 animate-pulse" />
          <h3 className="text-sm font-semibold text-amber-800">AI Meeting Brief</h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-amber-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating your meeting brief...
        </div>
        <p className="text-xs text-amber-600 mt-1">This usually takes 10–15 seconds.</p>
      </div>
    );
  }

  // State 3: Brief loaded
  return (
    <div className="rounded-lg border border-slate-200 bg-white mb-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-800">AI Meeting Brief</h3>
        </div>
        <div className="flex items-center gap-3">
          {briefGeneratedAt && (
            <span className="text-xs text-slate-400">
              Generated {formatDate(briefGeneratedAt)}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleGenerate} className="h-7 text-xs">
            <RefreshCw className="h-3 w-3 mr-1" />
            Regenerate
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-6">

        {/* Section 1: Candidate Snapshot */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Candidate Snapshot
          </h4>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-slate-800">{brief.candidateSnapshot.name}</p>
                <p className="text-sm text-slate-600">{brief.candidateSnapshot.field}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-slate-800">
                  ${brief.candidateSnapshot.rate}/{brief.candidateSnapshot.rateType === 'hourly' ? 'hr' : brief.candidateSnapshot.rateType}
                </p>
                <p className="text-xs text-slate-500">
                  ★ {brief.candidateSnapshot.averageRating.toFixed(1)} ({brief.candidateSnapshot.reviewCount} reviews)
                </p>
              </div>
            </div>
            {brief.candidateSnapshot.verifiedCredentials.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {brief.candidateSnapshot.verifiedCredentials.map((cred, i) => (
                  <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-200
                    rounded px-2 py-0.5">
                    ✓ {cred}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Why They Match */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Why They Match
          </h4>
          <div className="space-y-2">
            {brief.whyTheyMatch.map((reason, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-emerald-700
                bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                {reason}
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Suggested Questions — plan-gated */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Suggested Questions
          </h4>
          {isGrowth ? (
            <div className="space-y-2">
              {brief.suggestedQuestions.map((q, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="flex-shrink-0 text-xs font-semibold bg-slate-100
                    text-slate-500 rounded px-1.5 py-0.5 mt-0.5">
                    Q{i + 1}
                  </span>
                  {q}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-sm text-slate-600 mb-2">
                AI-generated interview questions are available on the Growth plan.
              </p>
              <a href="/pricing" className="text-sm font-medium text-violet-600 hover:underline">
                Upgrade to Growth →
              </a>
            </div>
          )}
        </div>

        {/* Section 4: Rate Context */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Rate Context
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500 mb-0.5">Their rate</p>
              <p className={`text-sm font-semibold ${brief.rateContext.withinBudget ? 'text-emerald-700' : 'text-red-600'}`}>
                ${brief.rateContext.proposedRate}/hr
                {brief.rateContext.jobBudgetMin && brief.rateContext.jobBudgetMax && (
                  <span className="text-xs font-normal text-slate-500 ml-1">
                    (budget ${brief.rateContext.jobBudgetMin}–${brief.rateContext.jobBudgetMax})
                  </span>
                )}
              </p>
              {brief.rateContext.withinBudget ? (
                <p className="text-xs text-emerald-600 mt-0.5">✅ Within budget</p>
              ) : (
                <p className="text-xs text-red-500 mt-0.5">⚠ Above budget</p>
              )}
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500 mb-0.5">Market median</p>
              <p className="text-sm font-semibold text-slate-800">${brief.rateContext.marketMedian}/hr</p>
              <p className="text-xs text-slate-500 mt-0.5">{brief.rateContext.platformPercentile}th percentile</p>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500 mb-0.5">Your avg paid</p>
              <p className="text-sm font-semibold text-slate-800">${brief.rateContext.employerHistoricalAvg}/hr</p>
              <p className="text-xs text-slate-500 mt-0.5">for similar roles</p>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 col-span-1">
              <p className="text-xs text-slate-500 mb-0.5">Assessment</p>
              <p className="text-xs text-slate-700 leading-relaxed">{brief.rateContext.assessment}</p>
            </div>
          </div>
        </div>

        {/* Section 5: Watch Points */}
        {brief.watchPoints.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Watch Points
            </h4>
            <div className="space-y-2">
              {brief.watchPoints.map((point, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-amber-700
                  bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  {point}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
```

---

## Copy Reference

| Location | String |
|---|---|
| Card heading | `AI Meeting Brief` |
| Not generated — body | `Get AI-generated preparation for this meeting — candidate summary, suggested questions, and rate context.` |
| Generate button | `Generate brief` |
| Generating — body | `Generating your meeting brief...` |
| Generating — sub | `This usually takes 10–15 seconds.` |
| Regenerate button | `Regenerate` |
| Section — snapshot | `Candidate Snapshot` |
| Section — match | `Why They Match` |
| Section — questions | `Suggested Questions` |
| Section — rate | `Rate Context` |
| Section — watch | `Watch Points` |
| Within budget | `✅ Within budget` |
| Over budget | `⚠ Above budget` |
| Rate — their rate | `Their rate` |
| Rate — median | `Market median` |
| Rate — avg | `Your avg paid` |
| Rate — assessment | `Assessment` |
| Upgrade prompt | `AI-generated interview questions are available on the Growth plan.` |
| Upgrade CTA | `Upgrade to Growth →` |
| No watch points | Section hidden entirely — not rendered if `watchPoints.length === 0` |
| Generation timeout | `Brief generation is taking longer than expected. Please try again.` |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/meetings/MeetingBriefCard.tsx` | **New** | 3.2 |
| `src/pages/MeetingDetail.tsx` | Modified | 3.3 |

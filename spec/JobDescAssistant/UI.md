# TalentLock — UI Specification: Job Description Assistant

## Overview

This document specifies the complete UI for the Job Description Assistant feature. One new component (`<JobDescriptionAssistant />`), one trigger button integration, all tab states, all drawer states, and all copy strings.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter routing.
**Employer-only.** No freelancer-facing changes.

---

## Design Tokens

| Semantic | Tailwind Classes | Used for |
|---|---|---|
| AI output border | `border-l-4 border-violet-400 bg-violet-50` | Generated/improved content preview |
| Score — green | `text-emerald-700 bg-emerald-100` | Score ≥ 80 |
| Score — amber | `text-amber-700 bg-amber-100` | Score 50–79 |
| Score — red | `text-red-700 bg-red-100` | Score < 50 |
| Missing item | `text-amber-700 text-sm` | Each missing field |
| Quota error | `bg-amber-50 border-amber-200 text-amber-800` | Token limit banner |
| API error | `bg-red-50 border-red-200 text-red-700` | General error state |
| Input error | `text-red-500 text-sm` | Inline validation |
| Snapshot label | `text-xs text-muted-foreground` | Improve tab label |

---

## Trigger Button

**File:** Job form component (path confirmed in Task 3.1)

Placed to the right of the "Description" field label, on the same row:

```
Description                              [✨ AI Assist]
┌──────────────────────────────────────────────────────┐
│                                                      │
│  [description textarea]                              │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Button spec:
```tsx
<Button type="button" variant="ghost" size="sm">
  <Sparkles className="h-4 w-4 mr-1 text-violet-500" />
  AI Assist
</Button>
```

`type="button"` is mandatory — prevents accidental form submission.

---

## Component — `<JobDescriptionAssistant />`

**File:** `artifacts/talentlock/src/components/JobDescriptionAssistant.tsx`

### Sheet Container

```tsx
<Sheet open={isOpen} onOpenChange={handleCloseAttempt}>
  <SheetContent side="right" className="w-[480px] sm:w-full flex flex-col">
    <SheetHeader>
      <SheetTitle className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        Job Description Assistant
      </SheetTitle>
    </SheetHeader>
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
      <TabsList className="grid grid-cols-3 mb-4">
        <TabsTrigger value="generate">Generate</TabsTrigger>
        <TabsTrigger value="improve">Improve</TabsTrigger>
        <TabsTrigger value="check">Check</TabsTrigger>
      </TabsList>
      {/* Tab content */}
    </Tabs>
  </SheetContent>
</Sheet>
```

Sheet width: `w-[480px]` on desktop, `sm:w-full` on mobile.
The sheet uses `flex flex-col` so tab content fills available height.

---

## Tab 1 — Generate

### Empty State (no output yet)

```
Describe the role in plain language

┌─────────────────────────────────────────────────┐
│  e.g. "I need a senior React developer to       │
│  build a dashboard for our SaaS product,        │
│  remote, 3 month contract, $80–100/hr"          │
│                                                 │
└─────────────────────────────────────────────────┘

                                    [✦ Generate]
```

Textarea: `rows={4}` placeholder as shown above. `className="resize-none"`
Generate button: `<Button size="sm">` with `<Sparkles className="h-4 w-4 mr-1" />`

**Inline validation error** (shown when Generate clicked with empty input):
```
Please describe the role before generating.
```
`text-sm text-red-500 mt-1`

---

### Loading State (API call in flight)

```
Describe the role in plain language

┌─────────────────────────────────────────────────┐
│  [disabled textarea — employer text preserved]  │
└─────────────────────────────────────────────────┘

                             [⟳ Generating...]
```

Textarea is `disabled`. Button shows `<Loader2 className="h-4 w-4 animate-spin mr-1" />` + `"Generating..."` and is `disabled`.

---

### Output State (AI returned content)

```
Describe the role in plain language

┌─────────────────────────────────────────────────┐
│  [employer's original input — still editable]   │
└─────────────────────────────────────────────────┘

AI Suggestion
┌───────────────────────────────────────────────────┐
│  border-l-4 border-violet-400 bg-violet-50 p-4   │
│                                                   │
│  Senior React Developer                           │
│                                                   │
│  We are looking for an experienced React          │
│  developer to build a data dashboard...           │
│                                                   │
│  Responsibilities:                                │
│  • Build and maintain React components            │
│  • ...                                            │
│                                                   │
│                      [Discard]  [Accept →]        │
└───────────────────────────────────────────────────┘
```

"AI Suggestion" label: `text-xs font-medium text-violet-700 mb-2`
Output area: `rounded-md border-l-4 border-violet-400 bg-violet-50 p-4 text-sm text-slate-700 whitespace-pre-wrap overflow-y-auto max-h-[300px]`

Discard: `<Button variant="ghost" size="sm">` — clears `assistantOutput`, re-enables textarea
Accept: `<Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">` — calls `onAccept(assistantOutput)`, shows toast

Accept toast: `"Description updated."` — standard duration

---

### Quota Reached State

```
┌─────────────────────────────────────────────────┐
│  [employer's input — preserved, still editable] │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  bg-amber-50 border border-amber-200 p-3        │
│  ⚡ Monthly AI token limit reached.              │
│  Tokens reset on {resetDate}.                   │
│  [Upgrade Plan →]                               │
└─────────────────────────────────────────────────┘
```

Input text is NOT cleared — employer can still see what they typed.
"Upgrade Plan →": `<Link to="/pricing">` styled `text-sm font-medium text-amber-800 underline`

---

### API Error State

```
┌─────────────────────────────────────────────────┐
│  bg-red-50 border border-red-200 p-3            │
│  Could not generate description.  [Try Again]   │
└─────────────────────────────────────────────────┘
```

Try Again: `<Button variant="ghost" size="sm">` — resets `drawerError` and re-enables the button.

---

## Tab 2 — Improve

### Empty Snapshot State (description field was empty when tab opened)

```
Your job description is empty.
Add some content to your description first, then come back to improve it.
```

`text-sm text-muted-foreground text-center py-8`

---

### With Snapshot (description had content)

```
Current description  (snapshot — not live)
┌─────────────────────────────────────────────────┐
│  [read-only snapshot of description at open]    │
│                                                 │
└─────────────────────────────────────────────────┘

                                    [✦ Improve]
```

Snapshot textarea: `disabled` (read-only), `rows={4}`, `className="bg-slate-50 resize-none"`
Label: `text-xs text-muted-foreground mb-1`

---

### Loading / Output / Error States

Identical layout to the Generate tab output states. Replace "AI Suggestion" with "Improved Version" as the label above the output area.

---

## Tab 3 — Check

### Empty State (no check run yet)

```
Check your job post for completeness.
The AI will score it and list what is missing.

                          [✦ Check Completeness]
```

`text-sm text-muted-foreground mb-4`

If `descriptionValue` is empty when Check tab opens:
```
Your job description is empty. Add some content first.
```

Button disabled when description is empty.

---

### Loading State

```
[⟳ Checking completeness...]
```

Button shows spinner and is `disabled`.

---

### Results State

```
Completeness Score
─────────────────────────────────────────────

          ╭──────────╮
          │    74    │   ← amber ring (score 50-79)
          ╰──────────╯
          out of 100

Missing items:
  ⚠  Required experience level not specified
  ⚠  Budget or rate range not included
  ⚠  Remote/on-site preference unclear
```

**Score ring:**

```tsx
<div className="flex flex-col items-center my-4">
  <div className={`
    w-20 h-20 rounded-full border-4 flex items-center justify-center
    text-2xl font-bold
    ${score >= 80 ? 'border-emerald-400 text-emerald-700 bg-emerald-50' :
      score >= 50 ? 'border-amber-400 text-amber-700 bg-amber-50' :
                   'border-red-400 text-red-700 bg-red-50'}
  `}>
    {score}
  </div>
  <p className="text-xs text-muted-foreground mt-1">out of 100</p>
</div>
```

**Missing items list:**
```tsx
{missing.length === 0 ? (
  <p className="text-sm text-emerald-700 flex items-center gap-1">
    <CheckCircle2 className="h-4 w-4" /> Great job post — nothing missing!
  </p>
) : (
  <ul className="space-y-1">
    {missing.map((item, i) => (
      <li key={i} className="text-sm text-amber-700 flex items-start gap-1">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        {item}
      </li>
    ))}
  </ul>
)}
```

No Accept/Discard buttons on this tab — it is read-only feedback.

Recheck button below results:
```
                              [↺ Check Again]
```
`<Button variant="outline" size="sm">` — resets score/missing and re-enables the button.

---

## Discard Confirmation Dialog

Shown when employer tries to close the sheet while `assistantOutput` is non-empty.

```
┌─────────────────────────────────────────────────────┐
│  Discard AI output?                                 │
│                                                     │
│  Your generated content will be lost.               │
│                                                     │
│              [Keep editing]  [Discard & close]      │
└─────────────────────────────────────────────────────┘
```

`shadcn/ui <AlertDialog>`
Keep editing: `<AlertDialogCancel>` — closes dialog, sheet stays open
Discard & close: `<AlertDialogAction className="bg-red-600 hover:bg-red-700">` — clears output, closes sheet

---

## Page Integration — Job Form

**Files:** Job form component(s) found in Task 3.1

### DOM Placement

```
[Job form fields — title, type, etc.]   ← existing

Description label row:
┌──────────────────────┬───────────────┐
│  Description         │  [✨ AI Assist]│
└──────────────────────┴───────────────┘
[description textarea]                  ← existing

[rest of form — rate, skills, etc.]     ← existing

<JobDescriptionAssistant ... />         ← new component (not visible, renders Sheet)
```

The `<JobDescriptionAssistant />` component is mounted but not visible — it renders a `<Sheet>` controlled by `isAssistantOpen` state.

---

## Copy Reference

| Location | String |
|---|---|
| Trigger button | `AI Assist` |
| Sheet heading | `Job Description Assistant` |
| Tab — generate | `Generate` |
| Tab — improve | `Improve` |
| Tab — check | `Check` |
| Generate label | `Describe the role in plain language` |
| Generate placeholder | `e.g. "I need a senior React developer to build a dashboard for our SaaS product, remote, 3 month contract, $80–100/hr"` |
| Generate button | `✦ Generate` |
| Generate loading | `Generating...` |
| Improve label | `Current description (snapshot — not live)` |
| Improve button | `✦ Improve` |
| Improve loading | `Improving...` |
| AI suggestion label (Generate) | `AI Suggestion` |
| AI suggestion label (Improve) | `Improved Version` |
| Accept button | `Accept →` |
| Discard button | `Discard` |
| Accept toast | `Description updated.` |
| Check button | `✦ Check Completeness` |
| Check loading | `Checking completeness...` |
| Check section heading | `Completeness Score` |
| Check score suffix | `out of 100` |
| Check perfect score | `Great job post — nothing missing!` |
| Check recheck | `↺ Check Again` |
| Empty description (improve) | `Your job description is empty. Add some content to your description first, then come back to improve it.` |
| Empty description (check) | `Your job description is empty. Add some content first.` |
| Generate validation error | `Please describe the role before generating.` |
| Quota reached heading | `⚡ Monthly AI token limit reached.` |
| Quota reset line | `Tokens reset on {resetDate}.` |
| Quota CTA | `Upgrade Plan →` |
| API error | `Could not generate description.` |
| Try again | `Try Again` |
| Discard dialog heading | `Discard AI output?` |
| Discard dialog body | `Your generated content will be lost.` |
| Discard dialog cancel | `Keep editing` |
| Discard dialog confirm | `Discard & close` |

---

## Loading & Error States Summary

| Tab | Loading | Error |
|---|---|---|
| Generate | Spinner on button + disabled textarea | Quota banner or API error below button |
| Improve | Spinner on button + disabled snapshot | Same as Generate |
| Check | Spinner on button | Quota banner or API error below button |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/JobDescriptionAssistant.tsx` | **New** | 3.2 |
| `src/pages/Jobs.tsx` (or job form component) | Modified | 3.3 |

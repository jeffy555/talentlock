# TalentLock — UI Specification: Per-Conversation Token Breakdown

## Overview

This document specifies the complete UI for the Per-Conversation Token Breakdown feature. Two new components (`<ConversationTokenBadge />` and `<ConversationTokenBreakdown />`), one page integration (`/ai-match`), all states, and all copy strings.

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter routing.
**Employer-only.** No freelancer-facing changes. All UI gated by `userRole === 'employer'`.

---

## Design Tokens

| Semantic | Tailwind Classes | Used for |
|---|---|---|
| Token badge | `text-xs text-muted-foreground bg-slate-100 rounded px-1.5 py-0.5` | Sidebar conversation badge |
| Panel toggle | `text-xs text-muted-foreground hover:text-foreground cursor-pointer` | Collapse toggle |
| Panel container | `border-t border-slate-100 pt-3 mt-3` | Breakdown panel wrapper |
| Table row even | `bg-white` | Message table rows |
| Table row odd | `bg-slate-50` | Message table alternating rows |
| Total line | `text-sm font-medium text-slate-700` | Total tokens line |
| Quota line | `text-xs text-muted-foreground` | % of monthly quota |
| Locked container | `rounded-md border border-dashed border-slate-300 bg-slate-50 p-3` | Starter locked state |
| Legacy text | `text-sm text-muted-foreground text-center py-4` | Legacy conversation message |

---

## Component 1 — `<ConversationTokenBadge />`

**File:** `artifacts/talentlock/src/components/ConversationTokenBadge.tsx`

### Purpose

Shows the total token cost of the active conversation as a small badge in the sidebar conversation list. Visible only on the selected/active conversation item.

### Rendering Rules

- Returns `null` when `userPlan === 'employer_starter'`
- Returns `null` when `!isActive` (not the selected conversation)
- Returns `null` while data is loading (no skeleton — absence is acceptable)
- Renders once data is available

### Rendered Output

```
[Conversation title]                    [1,240 tokens]
```

```tsx
<span className="text-xs text-muted-foreground bg-slate-100 rounded px-1.5 py-0.5 ml-2 shrink-0">
  {data.totalTokens.toLocaleString()} tokens
</span>
```

`shrink-0` prevents the badge from being squeezed when conversation titles are long. The title should use `truncate` / `overflow-hidden` to compress instead.

---

## Component 2 — `<ConversationTokenBreakdown />`

**File:** `artifacts/talentlock/src/components/ConversationTokenBreakdown.tsx`

### Purpose

A collapsible panel below the chat messages in the active conversation. Shows per-message token breakdown, conversation total, and percentage of monthly quota.

---

### State 1 — Locked (Starter Plan)

Shown in place of the toggle when `userPlan === 'employer_starter'`.

```
┌─────────────────────────────────────────────────────────┐
│  border-dashed border-slate-300 bg-slate-50 p-3         │
│  🔒 Per-conversation breakdown — Growth plan feature     │
│     [Upgrade to Growth →]                               │
└─────────────────────────────────────────────────────────┘
```

`className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3"`
Text: `text-sm text-slate-500`
Upgrade link: `<Link to="/pricing" className="text-sm font-medium text-slate-700 underline">`

---

### State 2 — Collapsed (Growth/Enterprise, default)

The panel is collapsed by default. Only the toggle is visible:

```
▾ Token usage for this conversation
```

```tsx
<button
  onClick={() => setExpanded(true)}
  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-3 pt-3 border-t border-slate-100 w-full"
>
  <ChevronDown className="h-3 w-3" />
  Token usage for this conversation
</button>
```

When expanded, the chevron rotates: `className="h-3 w-3 transition-transform rotate-180"` (when `expanded === true`).

---

### State 3 — Expanded, Legacy Data (`legacyData === true`)

```
▲ Token usage for this conversation

┌─────────────────────────────────────────────────────────┐
│  text-sm text-muted-foreground text-center py-4         │
│  Token breakdown is only available for conversations    │
│  started after June 4, 2025.                            │
└─────────────────────────────────────────────────────────┘
```

The date is `CONVERSATION_BREAKDOWN_LAUNCH_DATE` formatted as `"MMMM D, YYYY"` using `Intl.DateTimeFormat`.

---

### State 4 — Expanded, Loaded (Growth plan with data)

```
▲ Token usage for this conversation

Token Usage — This Conversation
──────────────────────────────────────────────────────────
Total: 1,240 tokens  ·  0.5% of monthly quota

  #    Prompt    Completion    Total      Time
  ──────────────────────────────────────────────────────
  1    320       180           500        10:24 AM
  2    410       330           740        10:31 AM
──────────────────────────────────────────────────────────
```

**Section heading:** `text-xs font-medium text-slate-500 uppercase tracking-wide mb-2`

**Total line:**
```tsx
<p className="text-sm font-medium text-slate-700 mb-1">
  Total: {totalTokens.toLocaleString()} tokens
  {percentOfQuota !== null && (
    <span className="text-xs text-muted-foreground ml-2">
      · {percentOfQuota}% of monthly quota
    </span>
  )}
</p>
```

**Message table:**
```tsx
<table className="w-full text-sm mt-3">
  <thead>
    <tr className="text-xs text-muted-foreground border-b border-slate-100">
      <th className="text-left pb-1 font-medium">#</th>
      <th className="text-right pb-1 font-medium">Prompt</th>
      <th className="text-right pb-1 font-medium">Completion</th>
      <th className="text-right pb-1 font-medium">Total</th>
      <th className="text-right pb-1 font-medium">Time</th>
    </tr>
  </thead>
  <tbody>
    {messages.map((msg, i) => (
      <tr key={msg.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
        <td className="py-1 text-slate-500">{i + 1}</td>
        <td className="py-1 text-right text-slate-600">{msg.promptTokens.toLocaleString()}</td>
        <td className="py-1 text-right text-slate-600">{msg.completionTokens.toLocaleString()}</td>
        <td className="py-1 text-right font-medium text-slate-700">{msg.totalTokens.toLocaleString()}</td>
        <td className="py-1 text-right text-muted-foreground text-xs">{formatMessageTime(msg.createdAt)}</td>
      </tr>
    ))}
  </tbody>
</table>
```

---

### State 5 — Expanded, Loaded (Enterprise — no quota %)

Identical to State 4 but the `"· {N}% of monthly quota"` part is omitted:

```
Total: 1,240 tokens
```

No percentage line. No explanation needed — Enterprise plan users understand they have unlimited quota.

---

### State 6 — Error

```
▲ Token usage for this conversation

Could not load breakdown.   [Retry]
```

`text-sm text-muted-foreground`
Retry: `<Button variant="ghost" size="sm">` — invalidates and re-fetches the query.

---

### State 7 — Loading (while `isLoading === true` after expand click)

```
▲ Token usage for this conversation

[Skeleton — 2 rows]
```

```tsx
<div className="space-y-2 mt-2">
  <Skeleton className="h-4 w-48" />
  <Skeleton className="h-16 w-full" />
</div>
```

Show skeleton only after the panel is expanded (not while collapsed). While collapsed, there is no loading indicator.

---

## Page Integration — `/ai-match`

**File:** `artifacts/talentlock/src/pages/AiMatch.tsx`

### Placement

**Sidebar conversation list** — badge added to each conversation item row (active conversation only):

```
┌────────────────────────────────────────────────┐
│  Sidebar                                       │
│  ─────────────────────────────────────         │
│  My React Project Search    [1,240 tokens]  ← active conversation badge
│  Design Freelancer Hunt                     ← no badge (not active)
│  Backend API Project                        ← no badge (not active)
└────────────────────────────────────────────────┘
```

**Chat area** — breakdown panel added below message list, above input:

```
┌────────────────────────────────────────────────┐
│  Chat messages area                            │
│  ─────────────────────────────────────         │
│  [AI message]                                  │
│  [Employer message]                            │
│  [AI message]                                  │
│  ─────────────────────────────────────         │
│  ▾ Token usage for this conversation        ← new |
│  ─────────────────────────────────────         │
│  [Message input]                               │
└────────────────────────────────────────────────┘
```

### DOM Order in Chat Area

```
<MessagesList />                     ← existing
<ConversationTokenBreakdown          ← NEW — below messages, above input
  conversationId={activeConversationId}
  userPlan={userPlan}
/>
<MessageInput />                     ← existing
```

### Render Conditions

```tsx
// Badge — only render on active conversation list item
{conversation.id === activeConversationId && (
  <ConversationTokenBadge
    conversationId={conversation.id}
    isActive={true}
    userPlan={userPlan}
  />
)}

// Breakdown panel — render when any conversation is active
{activeConversationId && userRole === 'employer' && (
  <ConversationTokenBreakdown
    conversationId={activeConversationId}
    userPlan={userPlan}
  />
)}
```

---

## Copy Reference

| Location | String |
|---|---|
| Sidebar badge | `{N} tokens` |
| Panel toggle (collapsed) | `▾ Token usage for this conversation` |
| Panel toggle (expanded) | `▲ Token usage for this conversation` |
| Panel heading | `Token Usage — This Conversation` |
| Total line | `Total: {N} tokens` |
| Quota line | `· {N}% of monthly quota` |
| Table header — # | `#` |
| Table header — prompt | `Prompt` |
| Table header — completion | `Completion` |
| Table header — total | `Total` |
| Table header — time | `Time` |
| Locked heading | `🔒 Per-conversation breakdown — Growth plan feature` |
| Locked CTA | `Upgrade to Growth →` |
| Legacy message | `Token breakdown is only available for conversations started after {date}.` |
| Error message | `Could not load breakdown.` |
| Error retry | `Retry` |

---

## Loading & Error States Summary

| Component | Loading | Error |
|---|---|---|
| `ConversationTokenBadge` | Hidden (no skeleton) | Hidden (fail silent) |
| `ConversationTokenBreakdown` (collapsed) | N/A — not fetching yet | N/A |
| `ConversationTokenBreakdown` (expanded) | 2-row skeleton inside panel | `"Could not load breakdown."` + Retry |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/ConversationTokenBadge.tsx` | **New** | 3.5 |
| `src/components/ConversationTokenBreakdown.tsx` | **New** | 3.6 |
| `src/lib/formatMessageTime.ts` | **New** | 3.3 |
| `src/lib/constants.ts` | New or Modified | 3.2 |
| `src/pages/AiMatch.tsx` | Modified | 3.7 |

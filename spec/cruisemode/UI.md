# TalentLock — UI Specification: Cruise Mode

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| Cruise Mode primary | `text-violet-700 bg-violet-600` | Brand colour for this feature |
| Active status | `bg-emerald-100 text-emerald-700 border-emerald-300` | Active / Live mode |
| Dry Run status | `bg-blue-100 text-blue-700 border-blue-300` | Dry Run mode |
| Paused status | `bg-amber-100 text-amber-700 border-amber-300` | Paused |
| Inactive status | `bg-slate-100 text-slate-500 border-slate-200` | Not configured |
| Score — high (75+) | `text-emerald-700 bg-emerald-50` | Good match |
| Score — mid (50–74) | `text-amber-700 bg-amber-50` | Partial match |
| Score — low (<50) | `text-red-700 bg-red-50` | Weak match |
| Decision — sent | `text-emerald-700 bg-emerald-50 border-emerald-200` | Message sent |
| Decision — dry run | `text-blue-700 bg-blue-50 border-blue-200` | Would have sent |
| Decision — skipped | `text-slate-500 bg-slate-50 border-slate-200` | Skipped |
| Decision — blocked | `text-red-600 bg-red-50 border-red-200` | Hard blocker |

---

## Page — `/cruise-mode`

**File:** `artifacts/talentlock/src/pages/CruiseMode.tsx`

Freelancer-only. Shows 403-style redirect for employers.

### Page Layout

```
Cruise Mode                                    [✦ Active — 3 sent today]
─────────────────────────────────────────────────────────────────────────

[Setup]  [Activity (12)]  [Stats]

[Tab content below]
```

Header: `text-2xl font-bold text-slate-800 flex items-center gap-2` with a `Zap` or `Rocket` icon.

Status pill: `<CruiseModeStatusBar />` — top right.

Tabs: shadcn/ui `<Tabs>` with three values: `setup`, `activity`, `stats`.

---

## Component — `<CruiseModeStatusBar />`

**File:** `src/components/cruise-mode/CruiseModeStatusBar.tsx`

Compact status strip. Always visible at the top of the page.

### Status: Inactive
```
[○ Cruise Mode is off]   [Activate]  [Dry Run]
```

### Status: Dry Run
```
[● Dry Run — evaluating, not sending]  [Go Live]  [Pause]
```
Blue badge. Pulsing dot animation (`animate-pulse`).

### Status: Active (Live)
```
[● Active — 3 sent today]  [Pause]  [Stop]
```
Emerald badge. Pulsing dot animation.

### Status: Paused
```
[◐ Paused since June 10]  [Resume]  [Stop]
```
Amber badge.

```tsx
// Activation confirmation — shown before going live from inactive/paused state
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Activate Cruise Mode?</AlertDialogTitle>
      <AlertDialogDescription>
        When active, your AI assistant will automatically express interest in
        matching jobs on your behalf. You will be notified of every message sent.
        You can pause or stop at any time.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction className="bg-violet-600 hover:bg-violet-700">
        Activate Cruise Mode
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Tab 1 — Setup

### Sub-state A: No Config Yet (first visit)

```
┌──────────────────────────────────────────────────────────────────┐
│  🚀 Set up Cruise Mode                                           │
│                                                                  │
│  Define your rules once. Your AI assistant will automatically    │
│  express interest in matching jobs while you're away.            │
│                                                                  │
│  ○ Build rules with a form                                       │
│  ○ Paste or upload a rules file (.txt or .md)                    │
│                                                                  │
│                                        [Get started →]           │
└──────────────────────────────────────────────────────────────────┘
```

### Sub-state B: Structured Rule Form

```
┌──────────────────────────────────────────────────────────────────┐
│  Your Cruise Mode Rules                              [Save rules] │
│                                                                  │
│  Required skills (AI will only respond to jobs with these)       │
│  [React]  [TypeScript]  [+ Add skill]                            │
│                                                                  │
│  Preferred skills (bonus match points)                           │
│  [Node.js]  [GraphQL]  [+ Add skill]                             │
│                                                                  │
│  Hourly rate range                                               │
│  From: [$80]   To: [$120]   (leave blank for no limit)          │
│                                                                  │
│  Project duration                                                │
│  Min: [─]  weeks    Max: [12]  weeks                             │
│                                                                  │
│  Excluded keywords (never respond to jobs mentioning these)      │
│  [crypto]  [gambling]  [adult]  [+ Add]                          │
│                                                                  │
│  Match threshold (only respond if match score ≥ this)           │
│  ●────────────────────────○  70 / 100                            │
│  Conservative (90)   ←→   Aggressive (50)                       │
│                                                                  │
│  Message tone                                                    │
│  ○ Professional  ● Friendly  ○ Concise                           │
│                                                                  │
│  Blackout windows (don't send during these times)                │
│  Timezone: [Asia/Kolkata ▾]                                      │
│  [+ Add window]   Mon–Fri 00:00–08:00 [×]                       │
│                                                                  │
│  Daily digest notifications  [●]  (batch into one daily summary) │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Sub-state C: Text/File Parser

```
┌──────────────────────────────────────────────────────────────────┐
│  Paste your rules or upload a .txt / .md file                    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  I want React and TypeScript projects,                   │   │
│  │  $80-$120/hr, no crypto or gambling.                    │   │
│  │  Max 3 months. I'm available from July 1.               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Upload .txt / .md]          [✦ Parse with AI]                  │
└──────────────────────────────────────────────────────────────────┘
```

After AI parse — show preview:

```
┌──────────────────────────────────────────────────────────────────┐
│  AI parsed your rules                              [Edit]  [Use] │
│                                                                  │
│  ✅ Required skills:       React, TypeScript                      │
│  ✅ Rate range:            $80 – $120/hr                          │
│  ✅ Excluded keywords:     crypto, gambling                       │
│  ✅ Max duration:          12 weeks (3 months)                    │
│  ✅ Available from:        July 1, 2026                           │
│                                                                  │
│  ⚠ No preferred skills found — add them to improve matching     │
│  ⚠ No blackout windows specified — Cruise Mode will run 24/7    │
└──────────────────────────────────────────────────────────────────┘
```

Parsed items: `text-sm flex items-center gap-2`. ✅ items: `text-emerald-700`. ⚠ items: `text-amber-700`.

---

## Tab 2 — Activity Feed

**Component:** `<CruiseModeActivityFeed />`

### Empty State
```
No Cruise Mode activity yet.
Activate Cruise Mode and new job matches will appear here.
```

### Loaded State

```
Activity                                    [Today ▾]  [All ▾]
─────────────────────────────────────────────────────────────────────

[87]  ✦ Sent        React Dashboard Contract — Acme Corp          2h ago
      Matched: React skill, rate in range, 8-week duration
      [▼ View message]  [Send follow-up]

[73]  ● Dry Run     Senior Frontend Developer — TechCorp          3h ago
      Would have sent (dry run active)
      [▼ View what would have been sent]

[42]  ○ Skipped     Blockchain NFT Platform — CryptoDAO            4h ago
      Excluded keyword: "blockchain"

[95]  ✦ Sent        TypeScript API Refactor — StartupXYZ           6h ago
      Matched: TypeScript + React, excellent rate match
      [▼ View message]  [Send follow-up]

[61]  ○ Skipped     iOS App Developer — MobileFirst               8h ago
      Score 61 below threshold (70). Missing: React, TypeScript skills
```

**Activity entry:**
```tsx
<div className="flex gap-4 py-4 border-b border-slate-100">
  {/* Score badge */}
  <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center
    justify-center text-sm font-bold border-2 ${scoreColour(score)}`}>
    {score}
  </div>

  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2 mb-1">
      <DecisionBadge decision={decision} />
      <span className="text-sm font-semibold text-slate-800 truncate">{jobTitle}</span>
      <span className="text-xs text-muted-foreground ml-auto shrink-0">{timeAgo}</span>
    </div>

    {/* Match reasons */}
    <p className="text-xs text-muted-foreground">
      {decision === 'sent' && `Matched: ${reasons.matched.join(', ')}`}
      {decision === 'skipped' && `Skipped: ${skippedReason}`}
      {decision === 'dry_run_would_send' && `Would have sent (dry run active)`}
    </p>

    {/* Expandable message */}
    {proposedMessage && (
      <Collapsible>
        <CollapsibleTrigger className="text-xs text-violet-600 mt-1 flex items-center gap-1">
          <ChevronDown className="h-3 w-3" /> View message
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded border-l-4 border-violet-300 bg-violet-50
            px-3 py-2 text-sm text-slate-700 italic">
            {proposedMessage}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )}

    {/* Actions */}
    {decision === 'sent' && !freelancerFollowUpSent && (
      <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs">
        Send follow-up message
      </Button>
    )}
    {freelancerFollowUpSent && (
      <span className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" /> Follow-up sent
      </span>
    )}
  </div>
</div>
```

---

## Tab 3 — Stats

```
Today's Activity                              [This month ▾]
─────────────────────────────────────────────────────────────────────

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐
│    12    │  │    3     │  │    9     │  │   3 / 10             │
│Evaluated │  │  Sent    │  │ Skipped  │  │ Messages this month  │
└──────────┘  └──────────┘  └──────────┘  └──────────────────────┘

Messages this month: ████████░░  3 / 10
                    Resets July 1

Top match reasons this month:
  React skill match          ████████████  8 jobs
  Rate within range          ██████████░░  7 jobs
  TypeScript match           ████████░░░░  6 jobs

Top skip reasons this month:
  Score below threshold      ████████████  14 jobs
  Excluded keyword           ████░░░░░░░░  5 jobs
  Outside rate range         ██░░░░░░░░░░  3 jobs
```

---

## Page Integration — Navigation

Add "Cruise Mode" to the freelancer sidebar nav:

```tsx
{userRole === 'freelancer' && (
  <NavItem href="/cruise-mode" icon={<Rocket className="h-4 w-4" />}>
    Cruise Mode
    {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
  </NavItem>
)}
```

The pulsing green dot when active gives the freelancer a persistent visual indicator.

---

## Employer Notification Card

When the employer receives a "Cruise Mode interest" notification, the notification card shows:

```
┌────────────────────────────────────────────────────────────┐
│  👤 Sarah Chen                          Cruise Mode ✦      │
│  expressed interest in "React Dashboard Contract"          │
│  2 hours ago                                               │
│                                         [View profile →]   │
└────────────────────────────────────────────────────────────┘
```

The `Cruise Mode ✦` badge uses `text-xs bg-violet-100 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5`.

---

## Copy Reference

| Location | String |
|---|---|
| Page heading | `Cruise Mode` |
| Page subtitle | `Your AI assistant finds and responds to matching jobs while you're away.` |
| Status — active | `● Active` |
| Status — dry run | `● Dry Run` |
| Status — paused | `◐ Paused` |
| Status — inactive | `○ Off` |
| Activate button | `Activate` |
| Dry run button | `Dry Run` |
| Pause button | `Pause` |
| Stop button | `Stop` |
| Go live button | `Go Live` |
| Resume button | `Resume` |
| Confirm activate title | `Activate Cruise Mode?` |
| Confirm activate body | `When active, your AI assistant will automatically express interest in matching jobs on your behalf. You will be notified of every message sent. You can pause or stop at any time.` |
| Confirm button | `Activate Cruise Mode` |
| Setup — heading | `Set up Cruise Mode` |
| Form — required skills | `Required skills` |
| Form — preferred skills | `Preferred skills (bonus match points)` |
| Form — rate range | `Hourly rate range` |
| Form — duration | `Project duration` |
| Form — excluded keywords | `Excluded keywords` |
| Form — threshold | `Match threshold` |
| Form — threshold note | `Conservative (90) ← → Aggressive (50)` |
| Form — tone | `Message tone` |
| Form — blackout | `Blackout windows` |
| Form — digest | `Daily digest notifications` |
| Text parser heading | `Paste your rules or upload a .txt / .md file` |
| Parse button | `✦ Parse with AI` |
| Parse preview heading | `AI parsed your rules` |
| Activity — empty | `No Cruise Mode activity yet. Activate Cruise Mode and new job matches will appear here.` |
| Decision — sent | `✦ Sent` |
| Decision — dry run | `● Dry Run` |
| Decision — skipped | `○ Skipped` |
| Decision — blocked | `⊘ Blocked` |
| Decision — quota | `⚡ Quota reached` |
| View message | `View message` |
| Follow-up button | `Send follow-up message` |
| Follow-up sent | `✓ Follow-up sent` |
| Stats — evaluated | `Evaluated` |
| Stats — sent | `Sent` |
| Stats — skipped | `Skipped` |
| Stats — monthly | `Messages this month` |
| Employer badge | `Cruise Mode ✦` |
| Nav item | `Cruise Mode` |
| Pro upgrade prompt | `Cruise Mode is available on the Pro plan. Upgrade to automate your job search.` |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/pages/CruiseMode.tsx` | **New** | 3.2 |
| `src/components/cruise-mode/CruiseModeStatusBar.tsx` | **New** | 3.5 |
| `src/components/cruise-mode/CruiseModeRuleBuilder.tsx` | **New** | 3.3 |
| `src/components/cruise-mode/CruiseModeActivityFeed.tsx` | **New** | 3.4 |
| `src/App.tsx` | Modified | 3.1 |
| Nav component | Modified | 3.1 |

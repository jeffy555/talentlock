# TalentLock — UI Specification: TalentSearch (Employer Cruise Mode)

## Overview

TalentSearch's UI mirrors Cruise Mode exactly in structure — three-tab page, status bar, rule builder, activity feed, stats. The differences are the role (employer not freelancer), the colour accent (teal instead of violet to distinguish the two features visually), the rule fields (profession/DBS/location instead of tech skills), and the activity feed content (freelancer cards instead of job cards).

**Tech stack:** React 19, Vite 7, Tailwind CSS, shadcn/ui, React Query, Wouter.
**Employer only.** All components and routes are invisible to freelancers.

---

## Design Tokens

| Semantic | Value | Used for |
|---|---|---|
| TalentSearch primary | `text-teal-700 bg-teal-600` | Brand colour — distinct from Cruise Mode violet |
| Active status | `bg-emerald-100 text-emerald-700 border-emerald-300` | Active / Live mode |
| Dry Run status | `bg-blue-100 text-blue-700 border-blue-300` | Dry Run mode |
| Inactive status | `bg-slate-100 text-slate-500 border-slate-200` | Not configured |
| Score — high (75+) | `text-emerald-700 bg-emerald-50` | Strong match |
| Score — mid (50–74) | `text-amber-700 bg-amber-50` | Partial match |
| Score — low (<50) | `text-red-700 bg-red-50` | Weak match |
| Decision — sent | `text-emerald-700 bg-emerald-50 border-emerald-200` | Notification sent |
| Decision — dry run | `text-blue-700 bg-blue-50 border-blue-200` | Would have sent |
| Decision — skipped | `text-slate-500 bg-slate-50 border-slate-200` | Skipped |
| Decision — blocked | `text-red-600 bg-red-50 border-red-200` | Hard blocker |
| TalentSearch badge | `bg-teal-50 text-teal-700 border-teal-200` | "TalentSearch ✦" pill |

---

## Page — `/talent-search`

**File:** `artifacts/talentlock/src/pages/TalentSearch.tsx`

Employer-only. Redirects or shows 403 for freelancers.

### Page Layout

```
TalentSearch                              [✦ Active — 2 sent today]
─────────────────────────────────────────────────────────────────────

[Setup]  [Activity (8)]  [Stats]

[Tab content below]
```

Header: `text-2xl font-bold text-slate-800 flex items-center gap-2` with a `Radar` or `Search` icon in teal.

Status pill: `<TalentSearchStatusBar />` — top right, always visible.

Tabs: shadcn/ui `<Tabs>` with three values: `setup`, `activity`, `stats`.

```tsx
export default function TalentSearch() {
  if (userRole !== 'employer') return <Redirect to="/" />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Radar className="h-7 w-7 text-teal-600" />
          <h1 className="text-2xl font-bold text-slate-800">TalentSearch</h1>
        </div>
        <TalentSearchStatusBar />
      </div>

      <Tabs defaultValue="setup">
        <TabsList className="mb-6">
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="activity">
            Activity {activityCount > 0 && `(${activityCount})`}
          </TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
        </TabsList>
        <TabsContent value="setup"><TalentSearchRuleBuilder /></TabsContent>
        <TabsContent value="activity"><TalentSearchActivityFeed /></TabsContent>
        <TabsContent value="stats"><TalentSearchStats /></TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## Component — `<TalentSearchStatusBar />`

**File:** `src/components/talent-search/TalentSearchStatusBar.tsx`

Two states only — Active and Inactive. Manual toggle only. Mirrors `CruiseModeStatusBar` with teal colours and employer-specific copy.

### State: Inactive

```
[○ TalentSearch is off]    [Turn On]  [Dry Run]
```

### State: Active (Live)

```
[● Active — 2 sent today]    1.2h / 6h used    [Turn Off]
```
Emerald badge with pulsing dot.

### State: Dry Run

```
[● Dry Run — evaluating, not sending]    [Go Live]  [Stop]
```
Blue badge with pulsing dot.

```tsx
function TalentSearchStatusBar() {
  const { data: config } = useGetTalentSearch();
  const activateMutation = usePatchTalentSearchActivate();
  const deactivateMutation = usePatchTalentSearchDeactivate();
  const [showConfirm, setShowConfirm] = useState(false);

  const isActive = config?.isActive && !config?.isDryRun;
  const isDryRun = config?.isActive && config?.isDryRun;

  return (
    <div className="flex items-center gap-3">
      {isActive && (
        <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700
          bg-emerald-100 border border-emerald-300 rounded-full px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Active — {stats?.sentToday ?? 0} sent today
        </span>
      )}
      {isDryRun && (
        <span className="flex items-center gap-1.5 text-sm font-medium text-blue-700
          bg-blue-100 border border-blue-300 rounded-full px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          Dry Run
        </span>
      )}
      {!config?.isActive && (
        <span className="text-sm text-slate-500 bg-slate-100 border border-slate-200
          rounded-full px-3 py-1">
          ○ TalentSearch is off
        </span>
      )}

      {isActive || isDryRun ? (
        <Button variant="outline" size="sm"
          onClick={() => deactivateMutation.mutate()}>
          Turn Off
        </Button>
      ) : (
        <>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => setShowConfirm(true)}>
            Turn On
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => activateDryRun()}>
            Dry Run
          </Button>
        </>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate TalentSearch?</AlertDialogTitle>
            <AlertDialogDescription>
              When active, your AI assistant will automatically send Express Interest
              notifications to matching freelancers on your behalf. You will be notified
              of every message sent. You can turn it off at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-teal-600 hover:bg-teal-700"
              onClick={() => activateMutation.mutate()}>
              Activate TalentSearch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

---

## Tab 1 — Setup

### First Visit (No Config)

```
Set up TalentSearch
Find the right talent while you focus on what matters.
Your AI assistant monitors new profiles and notifies
matching professionals on your behalf.

○ Build rules with a form
○ Paste or upload a rules file (.txt or .md)

                              [Get started →]
```

### Rule Form

```
Your TalentSearch Rules                          [Save rules]

Profession Category
(x) Any   ( ) Technology   ( ) Education

  Education sub-type (shown when Education selected)
  ( ) School Teacher   ( ) University Lecturer   ( ) Tutor   ( ) Researcher

Required skills / subjects
[GCSE Mathematics ×] [A-Level Physics ×] [+ Add]

Preferred skills / subjects
[Curriculum planning ×] [EYFS ×] [+ Add]

Rate range
From: [£100]  To: [£200]  per: [Day ▾]

Availability required from
[📅 July 1, 2026]  (leave blank for any availability)

Location (for in-person roles)
[Manchester, UK                  ]  within  [15] km

Credentials required
[✓] Must have a verified document on file
[✓] Must have a verified DBS / background check

Excluded keywords
[junior ×] [student ×] [no experience ×] [+ Add]

Match threshold
●────────────────○  75 / 100
Conservative (90) ←→ Aggressive (50)

Message tone
○ Professional   ● Friendly   ○ Concise

Blackout windows (don't send during these times)
Timezone: [Europe/London ▾]
[+ Add window]    Mon–Fri 18:00–08:00 [×]

Daily digest notifications  [●]
```

### Text/File Parser

```
Paste your rules or upload a .txt / .md file

┌──────────────────────────────────────────────────────────┐
│  I need GCSE Maths and Physics teachers in Manchester.   │
│  Rate £100-£200/day. Must have DBS check. No students.  │
│  Available from July. Don't send on weekends.            │
└──────────────────────────────────────────────────────────┘

[Upload .txt / .md]             [✦ Parse with AI]
```

After parsing:

```
AI parsed your rules                       [Edit]  [Use these]

✅ Profession:          Education — School Teacher
✅ Required subjects:   GCSE Mathematics, A-Level Physics
✅ Rate range:          £100–£200/day
✅ Location:            Manchester, UK
✅ DBS required:        Yes
✅ Excluded keywords:   student
✅ Blackout:            Weekends
⚠ No match threshold specified — using default (70/100)
⚠ No availability date found — will match any available teacher
```

---

## Tab 2 — Activity Feed

**Component:** `<TalentSearchActivityFeed />`

### Empty State

```
No TalentSearch activity yet.
Activate TalentSearch and matching freelancer profiles
will appear here as they are evaluated.
```

### Loaded State

```
Activity                                    [Today ▾]  [All ▾]
─────────────────────────────────────────────────────────────────────

[91]  ✦ Sent         Sarah Chen  [School Teacher]        2h ago
      GCSE Mathematics, A-Level Physics · Manchester
      Matched: Subject match, DBS verified, rate within range
      [▼ View message sent]  [Send follow-up]

[78]  ● Dry Run      James Okafor  [Private Tutor]        3h ago
      GCSE Science · Manchester
      Would have sent (dry run active)
      [▼ View what would have been sent]

[35]  ○ Skipped      Anna Müller  [University Lecturer]   5h ago
      Score 35 below threshold (75). No DBS check on file.

[88]  ✦ Sent         Priya Sharma  [School Teacher]       7h ago
      Mathematics, Physics · Salford
      Matched: Strong subject match, verified credentials
      [▼ View message sent]  [Send follow-up]
```

**Activity entry component:**

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
      <span className="text-sm font-semibold text-slate-800">
        {freelancerName}
      </span>
      {educationProfessionType && (
        <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200
          rounded px-1.5 py-0.5">
          {EDUCATION_TYPE_LABELS[educationProfessionType]}
        </span>
      )}
      <span className="text-xs text-muted-foreground ml-auto shrink-0">
        {timeAgo}
      </span>
    </div>

    <p className="text-xs text-muted-foreground mb-1">
      {primarySkills} · {location}
    </p>

    <p className="text-xs text-muted-foreground">
      {decision === 'sent' && `Matched: ${reasons.matched.join(', ')}`}
      {decision === 'skipped' && `Skipped: ${skippedReason}`}
      {decision === 'dry_run_would_send' && `Would have sent (dry run active)`}
    </p>

    {proposedMessage && (
      <Collapsible>
        <CollapsibleTrigger className="text-xs text-teal-600 mt-1 flex items-center gap-1">
          <ChevronDown className="h-3 w-3" /> View message sent
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded border-l-4 border-teal-300 bg-teal-50
            px-3 py-2 text-sm text-slate-700 italic">
            {proposedMessage}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )}

    {decision === 'sent' && !employerFollowUpSent && (
      <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs"
        onClick={() => handleFollowUp(activityId)}>
        Send follow-up message
      </Button>
    )}
    {employerFollowUpSent && (
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
Today's Activity                               [This month ▾]
─────────────────────────────────────────────────────────────────────

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐
│    18    │  │    4     │  │   14     │  │  1.2h / 6h           │
│Evaluated │  │  Sent    │  │ Skipped  │  │  Hours used today    │
└──────────┘  └──────────┘  └──────────┘  └──────────────────────┘

Daily usage: ████░░░░░░  1.2h / 6h    Resets at midnight UTC

Top match reasons this month:
  GCSE Mathematics match         ████████████  6 profiles
  DBS verified                   ██████████░░  5 profiles
  Rate within range              ████████░░░░  4 profiles

Top skip reasons this month:
  Score below threshold          ████████████  18 profiles
  No DBS check on file           ██████░░░░░░  8 profiles
  Rate above employer maximum    ████░░░░░░░░  5 profiles
```

---

## Freelancer Notification Card

When a freelancer receives a TalentSearch interest notification, their notification card shows:

```
┌────────────────────────────────────────────────────────────┐
│  🏢 Jefferson Academy         TalentSearch ✦              │
│  expressed interest in your profile                        │
│  "Hi Sarah, I'm reaching out from Jefferson Academy..."    │
│  2 hours ago                                               │
│                                    [View their profile →]  │
└────────────────────────────────────────────────────────────┘
```

The `TalentSearch ✦` badge uses:
`text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded px-1.5 py-0.5`

---

## Employer Navigation

Add "TalentSearch" to the employer sidebar nav:

```tsx
{userRole === 'employer' && (
  <NavItem href="/talent-search" icon={<Radar className="h-4 w-4" />}>
    TalentSearch
    {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
  </NavItem>
)}
```

The pulsing green dot when active gives the employer a persistent visual indicator across all pages.

---

## Copy Reference

| Location | String |
|---|---|
| Page heading | `TalentSearch` |
| Page subtitle | `Your AI assistant finds and notifies matching professionals while you focus on what matters.` |
| Status — active | `● Active` |
| Status — dry run | `● Dry Run` |
| Status — inactive | `○ TalentSearch is off` |
| Activate button | `Turn On` |
| Dry run button | `Dry Run` |
| Rules saved but inactive banner | `Rules saved — TalentSearch is not running until you click Turn On.` |
| Activation tooltip | `TalentSearch evaluates freelancers when they save their profile. Turning on will also scan current Talent Vault profiles.` |
| Cruise Mode distinction | `TalentSearch finds freelancers for you. Cruise Mode (freelancer feature) finds jobs for freelancers — they are different.` |
| Stop button | `Turn Off` |
| Confirm title | `Activate TalentSearch?` |
| Confirm body | `When active, your AI assistant will automatically send Express Interest notifications to matching freelancers on your behalf. You will be notified of every message sent. You can turn it off at any time.` |
| Confirm button | `Activate TalentSearch` |
| First visit heading | `Set up TalentSearch` |
| Form — profession | `Profession Category` |
| Form — education sub-type | `Education sub-type` |
| Form — required skills | `Required skills / subjects` |
| Form — preferred skills | `Preferred skills / subjects` |
| Form — rate range | `Rate range` |
| Form — availability | `Availability required from` |
| Form — location | `Location (for in-person roles)` |
| Form — credentials | `Credentials required` |
| Form — DBS label | `Must have a verified DBS / background check` |
| Form — verified doc label | `Must have a verified document on file` |
| Form — excluded keywords | `Excluded keywords` |
| Form — threshold | `Match threshold` |
| Form — tone | `Message tone` |
| Form — blackout | `Blackout windows` |
| Form — digest | `Daily digest notifications` |
| Text parser heading | `Paste your rules or upload a .txt / .md file` |
| Parse button | `✦ Parse with AI` |
| Parse preview heading | `AI parsed your rules` |
| Activity — empty | `No TalentSearch activity yet. Activate TalentSearch and matching freelancer profiles will appear here as they are evaluated.` |
| Decision — sent | `✦ Sent` |
| Decision — dry run | `● Dry Run` |
| Decision — skipped | `○ Skipped` |
| Decision — blocked | `⊘ Blocked` |
| Decision — limit | `⚡ Limit reached` |
| View message | `View message sent` |
| Follow-up button | `Send follow-up message` |
| Follow-up sent | `✓ Follow-up sent` |
| Freelancer badge | `TalentSearch ✦` |
| Nav item | `TalentSearch` |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/pages/TalentSearch.tsx` | New | 3.3 |
| `src/components/talent-search/TalentSearchStatusBar.tsx` | New | 3.4 |
| `src/components/talent-search/TalentSearchRuleBuilder.tsx` | New | 3.5 |
| `src/components/talent-search/TalentSearchActivityFeed.tsx` | New | 3.6 |
| `src/App.tsx` | Modified | 3.2 |
| Nav component | Modified | 3.2 |

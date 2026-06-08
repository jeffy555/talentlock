# TalentLock — UI Specification: AI Proposal Generator

---

## Trigger — "Write proposal" Button

On `/bookings/:id` (freelancer view, status = pending/negotiating):

```
[Booking details]
                              [✦ Write proposal]    ← new button
[Status/actions section]
```

Button: `<Button variant="outline" size="sm">` with `<Sparkles className="h-4 w-4 mr-1 text-violet-500" />`

---

## Component — `<ProposalGeneratorDrawer />`

**File:** `artifacts/talentlock/src/components/ProposalGeneratorDrawer.tsx`

Sheet: `side="right"`, `className="w-[480px] sm:w-full"`

### State 1 — Default (no output)

```
┌─────────────────────────────────────────────────────┐
│  ✦ Write Proposal                               [×] │
│                                                     │
│  Tone                                               │
│  ○ Professional  ○ Friendly  ○ Concise              │
│                                                     │
│  Generate a personalised proposal for this booking  │
│  based on your profile and the job requirements.    │
│                                                     │
│                             [✦ Generate Proposal]   │
└─────────────────────────────────────────────────────┘
```

Tone radio group: `shadcn/ui <RadioGroup>` with three options in a row.
Generate button: `<Button>` with sparkle icon.

### State 2 — Loading

```
[⟳ Writing your proposal...]
```

Button shows spinner, disabled.

### State 3 — Proposal Generated

```
┌─────────────────────────────────────────────────────┐
│  ✦ Write Proposal                               [×] │
│                                                     │
│  Tone:  ○ Professional  ○ Friendly  ○ Concise       │
│                                                     │
│  Your Proposal                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  border-l-4 border-violet-400 bg-violet-50   │   │
│  │  Hi, I'm Sarah Chen, a senior React devel-   │   │
│  │  oper with 8 years of experience building    │   │
│  │  complex SaaS applications...                │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│       [Regenerate]  [Discard]  [Accept Proposal]    │
└─────────────────────────────────────────────────────┘
```

Output area: `rounded border-l-4 border-violet-400 bg-violet-50 p-4 text-sm text-slate-700 whitespace-pre-wrap max-h-[400px] overflow-y-auto`

"Regenerate": `<Button variant="ghost" size="sm">` — calls API again with same tone
"Discard": `<Button variant="ghost" size="sm">` — clears output, back to State 1
"Accept Proposal": `<Button className="bg-violet-600 hover:bg-violet-700 text-white">` — calls `onAccept(proposalOutput)`

### State 4 — Error

```
Could not generate proposal. Please try again.   [Retry]
```

`text-sm text-muted-foreground`. Retry re-fires mutation.

---

## Accepted Proposal Block (on `/bookings/:id`)

After Accept is clicked, the drawer closes and this block appears on the booking page:

```
┌─────────────────────────────────────────────────────┐
│  ✦ Your AI-generated proposal                       │
│  ─────────────────────────────────────────────────  │
│  Hi, I'm Sarah Chen, a senior React developer...    │
│                                                     │
│                                      [Copy text]    │
└─────────────────────────────────────────────────────┘
```

Container: `rounded-md border border-violet-200 bg-violet-50 p-4`
Heading: `text-xs font-semibold text-violet-700 mb-2`
Text: `text-sm text-slate-700 whitespace-pre-wrap`
"Copy text": `<Button variant="ghost" size="sm">` with `<Copy className="h-4 w-4 mr-1" />` — copies to clipboard, shows "Copied!" toast.

---

## Copy Reference

| Location | String |
|---|---|
| Trigger button | `Write proposal` |
| Drawer heading | `✦ Write Proposal` |
| Tone label | `Tone` |
| Tone — professional | `Professional` |
| Tone — friendly | `Friendly` |
| Tone — concise | `Concise` |
| Description | `Generate a personalised proposal for this booking based on your profile and the job requirements.` |
| Generate button | `✦ Generate Proposal` |
| Loading | `Writing your proposal...` |
| Output label | `Your Proposal` |
| Regenerate | `Regenerate` |
| Discard | `Discard` |
| Accept button | `Accept Proposal` |
| Error | `Could not generate proposal. Please try again.` |
| Accepted block heading | `✦ Your AI-generated proposal` |
| Copy button | `Copy text` |
| Copied toast | `Copied to clipboard.` |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/components/ProposalGeneratorDrawer.tsx` | **New** | 3.1 |
| `src/pages/BookingDetail.tsx` | Modified | 3.2 |

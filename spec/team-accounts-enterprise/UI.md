# TalentLock — UI Specification: Team Accounts (Enterprise)

---

## Component 1 — `/team` Page

**File:** `artifacts/talentlock/src/pages/Team.tsx`

New route, enterprise-only. Non-enterprise employers see upgrade prompt.

### Page Layout

```
Team Management                          [Invite member]
─────────────────────────────────────────────────────────

Acme Corp                                Admin
─────────────────────────────────────────────────────────

Members  (4)
┌─────────────────────────────────────────────────────────┐
│  Name              Role     Status    Joined      Action│
│  ──────────────────────────────────────────────────────│
│  Alice Johnson     Admin    Active    Jan 12       ─    │
│  Bob Smith         Member   Active    Feb 3       [×]   │
│  carol@company.com Member   Invited   Mar 1       [×]   │
│  Dana Lee          Member   Active    Mar 8       [×]   │
└─────────────────────────────────────────────────────────┘
```

- Admin rows: `[×]` button disabled (cannot remove admin)
- Owner row: no `[×]` button
- Invited rows: email shown instead of name, status badge: `Invited` (amber)
- Active rows: status badge: `Active` (green)

**Invite member button:** opens `<InviteDialog />` (shadcn `<Dialog>`).

---

## `<InviteDialog />`

```
┌────────────────────────────────────────┐
│  Invite a team member              [×] │
│                                        │
│  Email address                         │
│  ┌──────────────────────────────────┐  │
│  │  colleague@company.com          │  │
│  └──────────────────────────────────┘  │
│                                        │
│  Role                                  │
│  ○ Member  ○ Admin                     │
│                                        │
│      [Cancel]      [Send invitation]   │
└────────────────────────────────────────┘
```

On success: toast `"Invitation sent to colleague@company.com."` Dialog closes.

---

## Accept Invite Page

**File:** `artifacts/talentlock/src/pages/AcceptInvite.tsx`

### Loading State
```
Accepting your invitation...
```
Spinner centered on page.

### Success State
```
          ✓ Welcome to Acme Corp!

You've joined the team. You now have access to all
enterprise features shared with your team.

                    [Go to Dashboard →]
```

### Error — Expired
```
This invitation has expired.
Please ask your team admin to send a new invite.
```

### Error — Already Used
```
This invitation has already been accepted.
If you need access, contact your team admin.
```

---

## Component 2 — Shared Shortlist on Talent Vault

**File:** `artifacts/talentlock/src/pages/Freelancers.tsx`

For enterprise team members: a "Team Shortlist" tab or panel appears alongside the search results.

```
[Search results]   [Team Shortlist (12)]
```

Clicking "Team Shortlist" shows only shortlisted freelancers with a small badge showing who added them:

```
[FreelancerCard]           Added by Alice · Feb 3   [Remove]
[FreelancerCard]           Added by you · Mar 1     [Remove]
```

The heart/shortlist button on each FreelancerCard in search results adds to the **shared team shortlist** (not personal) for enterprise members.

---

## Component 3 — Team Analytics Page

**File:** `artifacts/talentlock/src/pages/TeamAnalytics.tsx`

Route: `/team/analytics` — admin only. Non-admins see "Admin access required."

```
Team Analytics — Acme Corp
─────────────────────────────────────────────────────────

[30 days ▾]              (window selector — same as hiring analytics)

Total team spend:  $42,800    Bookings created:  18
─────────────────────────────────────────────────────────

Spend by team member
─────────────────────────────────────────────────────────
Alice Johnson    $18,400   ████████████████████
Bob Smith        $12,200   █████████████
Dana Lee          $7,100   ███████
You               $5,100   █████

Most hired freelancers (team-wide)
─────────────────────────────────────────────────────────
1  Sarah Chen     React Dev    $12,400    4 bookings
2  João Alves     UX Design     $8,200    2 bookings

Open job requirements by member
─────────────────────────────────────────────────────────
Alice Johnson    3 open jobs
Bob Smith        1 open job
```

Uses the same card/widget visual language as the existing analytics dashboards (`spend/` and `hiring/` component folders).

---

## Non-Enterprise Upgrade Prompt

For non-enterprise employers who navigate to `/team`:

```
┌────────────────────────────────────────────────────────┐
│  border-dashed border-slate-300 bg-slate-50 p-8        │
│                                                        │
│  👥 Team Accounts — Enterprise feature                 │
│                                                        │
│  Invite multiple hiring managers to share your         │
│  freelancer pool, shortlists, and analytics.           │
│                                                        │
│                      [Upgrade to Enterprise →]         │
└────────────────────────────────────────────────────────┘
```

Link: `<Link to="/pricing">Upgrade to Enterprise →</Link>`

---

## Copy Reference

| Location | String |
|---|---|
| Page heading | `Team Management` |
| Invite button | `Invite member` |
| Members section | `Members ({N})` |
| Table — name | `Name` |
| Table — role | `Role` |
| Table — status | `Status` |
| Table — joined | `Joined` |
| Status — active | `Active` |
| Status — invited | `Invited` |
| Invite dialog heading | `Invite a team member` |
| Email label | `Email address` |
| Role label | `Role` |
| Role — member | `Member` |
| Role — admin | `Admin` |
| Send button | `Send invitation` |
| Invite success toast | `Invitation sent to {email}.` |
| Remove member confirm | `Remove {name} from the team?` |
| Remove confirm body | `They will lose access to all team features.` |
| Accept invite loading | `Accepting your invitation...` |
| Accept invite success | `✓ Welcome to {teamName}!` |
| Accept invite success body | `You've joined the team. You now have access to all enterprise features shared with your team.` |
| Accept invite go to dash | `Go to Dashboard →` |
| Accept invite expired | `This invitation has expired. Please ask your team admin to send a new invite.` |
| Accept invite used | `This invitation has already been accepted.` |
| Shortlist tab | `Team Shortlist ({N})` |
| Shortlist added by | `Added by {name} · {date}` |
| Analytics heading | `Team Analytics — {teamName}` |
| Non-enterprise heading | `👥 Team Accounts — Enterprise feature` |
| Non-enterprise body | `Invite multiple hiring managers to share your freelancer pool, shortlists, and analytics.` |
| Upgrade CTA | `Upgrade to Enterprise →` |

---

## New Frontend Routes

| Path | Page | Access |
|---|---|---|
| `/team` | Team Management | `employer_enterprise` only |
| `/team/analytics` | Team Analytics | `employer_enterprise` admin only |
| `/team/accept-invite` | Accept Invite | Public |

---

## Component File Summary

| File | New / Modified | Task |
|---|---|---|
| `src/pages/Team.tsx` | **New** | A3.1 |
| `src/pages/AcceptInvite.tsx` | **New** | A3.3 |
| `src/pages/TeamAnalytics.tsx` | **New** | C2.1 |
| `src/pages/Freelancers.tsx` | Modified | B3.1 |
| Nav component | Modified | A3.2 |
| `src/App.tsx` | Modified | A3.1, A3.3 |

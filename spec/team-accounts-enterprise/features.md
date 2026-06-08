# TalentLock — Features Specification: Team Accounts (Enterprise)

## Overview

Enterprise employers on TalentLock currently operate as single accounts. In practice, enterprise organisations have multiple hiring managers, each responsible for different projects, departments, or regions — but sharing the same pool of vetted freelancers, the same agreed rates, and the same budget visibility requirements. A single account model forces all hiring activity through one login, creating bottlenecks, audit gaps, and no per-member spend visibility.

This feature adds Team Accounts for the `employer_enterprise` plan: an organisation can invite multiple team members who share the enterprise account's plan benefits, have role-based permissions (Admin vs Member), and see team-level analytics. A team admin can see all activity across the team. Individual members see only their own bookings and jobs but share the team's Talent Vault shortlist.

---

## Feature Modules

### Module 1 — `teams` and `team_members` Tables

Two new tables:

**`teams`**
- `id` — text primary key (slug, e.g. `acme-corp`)
- `name` — text (e.g. "Acme Corp")
- `ownerUserId` — references `users.id` — the enterprise employer who created the team
- `createdAt` — timestamptz

**`team_members`**
- `id` — serial primary key
- `teamId` — references `teams.id`
- `userId` — references `users.id`
- `role` — enum: `admin` | `member`
- `status` — enum: `invited` | `active` | `deactivated`
- `invitedAt` — timestamptz
- `joinedAt` — timestamptz nullable
- `inviteToken` — text nullable (UUID, cleared after join)

---

### Module 2 — Team Creation (Enterprise Owner)

When an employer on `employer_enterprise` plan creates or upgrades to enterprise, they are prompted to set up their team name. A `teams` row is created with them as owner.

Accessible at `/team` (new frontend route, enterprise only):
- Team name and overview
- Member list with roles and status
- Invite new member by email
- Remove or deactivate members
- Transfer team ownership

---

### Module 3 — Team Member Invitation

The team admin sends an invitation by email. The invited person receives an email with a signup link containing their `inviteToken`. On clicking:

1. If the person already has a TalentLock account: they are added to the team
2. If not: they complete onboarding as an employer, then are added to the team

Once a member joins, their subscription plan is automatically set to `employer_enterprise` (inherited from the team) and the team's token quota is shared.

New API routes:
- `POST /api/team/invite` — send invite (admin only)
- `GET /api/team/accept-invite?token=` — public, accepts invite token
- `DELETE /api/team/members/:userId` — remove member (admin only)

---

### Module 4 — Shared Talent Vault Shortlist

Team members share a single shortlist. When any team member shortlists a freelancer, all other team members see them in the shared shortlist on `/freelancers`. Individual member who added each item is shown.

New column on the shortlist table (if it exists) or a new `team_shortlist` table:
- `teamId` — references `teams.id`
- `freelancerId` — references `freelancer_profiles.id`
- `addedByUserId` — references `users.id`
- `addedAt` — timestamptz

---

### Module 5 — Team Analytics

A new `/team/analytics` page (team admins only) showing:
- Total spend across all team members (last 30/90 days)
- Bookings by team member (who hired how many freelancers)
- Most hired freelancers across the team
- Open job requirements across all team members

Feeds from existing `bookings`, `job_requirements` data — no new token consumption.

---

### Module 6 — Team Role Permissions

| Permission | Admin | Member |
|---|---|---|
| Invite/remove members | ✅ | ❌ |
| View all team bookings | ✅ | ❌ own only |
| View team analytics | ✅ | ❌ |
| Add to shared shortlist | ✅ | ✅ |
| Create job requirements | ✅ | ✅ |
| Generate agreements | ✅ | ✅ |
| Access AI features | ✅ | ✅ |

---

## API Routes

```
GET  /api/team                    Team details + member list (team members only)
POST /api/team                    Create team (enterprise employer, once per account)
PUT  /api/team                    Update team name/settings (admin only)
POST /api/team/invite             Invite a member by email (admin only)
GET  /api/team/accept-invite      Public — accept an invite token
DELETE /api/team/members/:userId  Remove/deactivate a team member (admin only)
GET  /api/team/shortlist          Shared shortlist for the team
POST /api/team/shortlist          Add to shared shortlist
DELETE /api/team/shortlist/:freelancerId  Remove from shared shortlist
GET  /api/team/analytics          Team-level spend and hiring analytics (admin only)
```

---

## Plan Gating

| Plan | Team feature |
|---|---|
| `employer_starter` | ❌ |
| `employer_growth` | ❌ |
| `employer_enterprise` | ✅ — full team management |

Non-enterprise employers visiting `/team` see an upgrade prompt.

---

## Non-Goals

- Per-member budget limits or spend caps
- Department/project hierarchy within a team
- SSO / SAML login for enterprise teams
- Custom roles beyond Admin/Member
- Team-level contract templates
- Activity audit log per team member (admin sees all bookings — sufficient for this phase)
- Slack or webhook integrations for team notifications

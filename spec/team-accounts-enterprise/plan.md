# TalentLock — Implementation Plan: Team Accounts (Enterprise)

> **Status: APPROVED — Ready for implementation**
> If this file and `task.md` conflict, this file wins.
> Implement in 3 sub-phases to manage scope.

---

## Pre-Implementation Codebase Checks

```bash
# 1. Check for existing shortlist/favourite table
grep -r "shortlist\|favourite\|heart" lib/db/src/schema/*.ts | head -10
grep -rn "shortlist" artifacts/api-server/src/routes/ | head -10

# 2. How plan is detected in route handlers
grep -n "userPlan\|employer_enterprise\|subscriptions" \
  artifacts/api-server/src/routes/bookings.ts | head -10

# 3. Check for any existing team/org concept
grep -rn "team\|org\|organisation\|organization" lib/db/src/schema/*.ts | head -10

# 4. Check employer_profiles schema
grep -A 20 "employerProfiles\s*=" lib/db/src/schema/*.ts

# 5. Check how Clerk admin SDK is available (from security-hardening)
grep -rn "clerkClient\|@clerk/backend" artifacts/api-server/src/ | head -5
```

---

## Resolved Questions

### Q1 — Shortlist Table
**Decision: Inspect first. If no shortlist table: create `team_shortlist` only (no individual shortlist persistence in this phase). If a shortlist table exists: add `teamId` column.**

### Q2 — Plan Detection
**Decision: Reuse existing pattern found in inspection. All team routes require `userPlan === 'employer_enterprise'` → 402 `PLAN_LIMIT`.**

### Q3 — Existing Org Concept
**Decision: If any existing team/org concept found: extend it. If none: create from scratch.**

### Q4 — Subscription on Invite Acceptance
**Decision: Option A — no change for already-enterprise users. Upgrade subscription for lower-plan users.**

```ts
// On invite acceptance
if (user.plan !== 'employer_enterprise') {
  await db.update(subscriptions)
    .set({ planId: 'employer_enterprise' })
    .where(eq(subscriptions.userId, userId));
}
```

### Q5 — Team Analytics Endpoint
**Decision: Option A — separate `GET /api/team/analytics` endpoint.**

### Q6 — Invite Email
**Decision: Direct Resend call with custom invite template. Not the standard notification email.**

---

## Sub-Phase Structure

### Sub-Phase A — Team Creation + Member Management
Covers: `teams` table, `team_members` table, team CRUD routes, invite flow, `/team` page.

### Sub-Phase B — Shared Shortlist
Covers: `team_shortlist` table (or extended shortlist), shortlist API routes, Talent Vault shared shortlist UI.

### Sub-Phase C — Team Analytics
Covers: `GET /api/team/analytics`, `/team/analytics` page.

---

## Schema Decisions

### `teams` table
```ts
export const teams = pgTable('teams', {
  id:          text('id').primaryKey(),           // slug e.g. 'acme-corp'
  name:        text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull().references(() => users.id),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `team_members` table
```ts
export const teamMembers = pgTable('team_members', {
  id:             serial('id').primaryKey(),
  teamId:         text('team_id').notNull().references(() => teams.id),
  userId:         text('user_id').references(() => users.id),  // null until accepted
  role:           text('role').notNull().default('member'),     // 'admin' | 'member'
  status:         text('status').notNull().default('invited'),  // 'invited' | 'active' | 'deactivated'
  invitedEmail:   text('invited_email').notNull(),
  inviteToken:    text('invite_token'),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  invitedAt:      timestamp('invited_at', { withTimezone: true }).defaultNow().notNull(),
  joinedAt:       timestamp('joined_at', { withTimezone: true }),
}, (t) => ({
  uniqTeamUser: unique().on(t.teamId, t.userId),
}));
```

### `team_shortlist` table (if no existing shortlist)
```ts
export const teamShortlist = pgTable('team_shortlist', {
  id:             serial('id').primaryKey(),
  teamId:         text('team_id').notNull().references(() => teams.id),
  freelancerId:   text('freelancer_id').notNull().references(() => freelancerProfiles.id),
  addedByUserId:  text('added_by_user_id').notNull().references(() => users.id),
  addedAt:        timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqTeamFreelancer: unique().on(t.teamId, t.freelancerId),
}));
```

---

## Permission Middleware

```ts
// artifacts/api-server/src/middleware/requireTeam.ts

export async function requireTeamMember(req, res, db) {
  // 1. Must be enterprise
  if (userPlan !== 'employer_enterprise') return res.status(402).json({ code: 'PLAN_LIMIT' });
  // 2. Must be active team member
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.userId, internalUserId), eq(teamMembers.status, 'active'))
  });
  if (!member) return res.status(403).json({ error: 'Not a team member' });
  return member;
}

export async function requireTeamAdmin(req, res, db) {
  const member = await requireTeamMember(req, res, db);
  if (member.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  return member;
}
```

---

## Invite Token Security

```ts
import { randomUUID } from 'crypto';

const inviteToken = randomUUID();
const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
```

On acceptance:
```ts
// Validate token
if (member.inviteExpiresAt < new Date()) return res.status(410).json({ error: 'Invite expired' });
// Clear token immediately
await db.update(teamMembers).set({
  inviteToken: null,
  inviteExpiresAt: null,
  status: 'active',
  userId: internalUserId,
  joinedAt: new Date(),
}).where(eq(teamMembers.inviteToken, token));
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full
- [ ] All 6 spec files read
- [ ] Codebase inspection complete — shortlist table, plan detection, org concept
- [ ] Sub-phase scope agreed — implement A first, B second, C third

---

## Phase Execution Sign-Off

| Sub-Phase | Description | Status |
|---|---|---|
| A — Phase 1 | Schema — teams + team_members | ⬜ Not started |
| A — Phase 2 | Backend — team CRUD + invite routes + OpenAPI + codegen | ⬜ Not started |
| A — Phase 3 | Frontend — /team page + invite flow | ⬜ Not started |
| B — Phase 1 | Schema — team_shortlist | ⬜ Not started |
| B — Phase 2 | Backend — shortlist routes | ⬜ Not started |
| B — Phase 3 | Frontend — shared shortlist in Talent Vault | ⬜ Not started |
| C — Phase 1 | Backend — /api/team/analytics | ⬜ Not started |
| C — Phase 2 | Frontend — /team/analytics page | ⬜ Not started |

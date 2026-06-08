# TalentLock — Task Breakdown: Team Accounts (Enterprise)

Implemented in 3 sub-phases. Execute Sub-Phase A completely before starting B or C.

---

## Sub-Phase A — Team Creation + Member Management

### Task A1.1 — Codebase Inspection
Run all inspection commands from `plan.md`. Confirm no existing team concept.

### Task A1.2 — Create Schema

**File:** `lib/db/src/schema/` — add to appropriate file

Create `teams` and `team_members` tables using the exact definitions from `plan.md`.

### Task A1.3 — Run Migration

```bash
pnpm --filter @workspace/db run push
```

Verify both tables exist in Neon.

### Task A2.1 — Create Permission Middleware

**File:** `artifacts/api-server/src/middleware/requireTeam.ts` (create new)

Implement `requireTeamMember()` and `requireTeamAdmin()` from `plan.md`.

### Task A2.2 — Create Team Routes

**File:** `artifacts/api-server/src/routes/team.ts` (create new)

Implement all 6 core team routes:

#### `POST /api/team` — Create team (enterprise employer, once)
- Guard: `employer_enterprise` plan only
- Guard: No existing team for this user
- Generate slug from company name
- Insert `teams` row with `ownerUserId`
- Insert `team_members` row with `role = 'admin'`, `status = 'active'`

#### `GET /api/team` — Team details + member list
- Guard: active team member
- Returns team + all `team_members` rows

#### `PUT /api/team` — Update team name
- Guard: team admin

#### `POST /api/team/invite` — Invite member
- Guard: team admin
- Generate `inviteToken` (UUID) + `inviteExpiresAt` (7 days)
- Insert `team_members` row with `status = 'invited'`
- Send invite email (direct Resend call with invite template)

```ts
// Invite email HTML template
const inviteUrl = `${process.env.APP_URL}/team/accept-invite?token=${inviteToken}`;
// Subject: "You've been invited to join [Team Name] on TalentLock"
// CTA: "Accept Invitation" → inviteUrl
```

#### `GET /api/team/accept-invite?token=` — Public accept
- Validate token exists + not expired
- If user authenticated: add them to team, upgrade plan if needed
- If not: redirect to signup with token preserved in URL params

#### `DELETE /api/team/members/:userId` — Remove member
- Guard: team admin
- Cannot remove the team owner
- Set `status = 'deactivated'`

### Task A2.3 — Register Routes

**File:** `artifacts/api-server/src/index.ts`

Register `teamRouter` from `./routes/team`.

### Task A2.4 — OpenAPI Spec + Codegen

Add all team routes to `lib/api-spec/openapi.yaml`.

```bash
pnpm --filter @workspace/api-spec run codegen
```

Post-codegen checks: `indexFiles: false`, index exports, `pnpm run typecheck`.

### Task A3.1 — Create `/team` Frontend Route

**File:** `artifacts/talentlock/src/pages/Team.tsx` (create new)

Add route to `App.tsx`:
```tsx
<Route path="/team" component={Team} />
```

Enterprise-only: redirect to `/pricing` for non-enterprise employers.

See `UI.md` Component 1 for full page spec.

### Task A3.2 — Add `/team` to Navigation

**File:** Nav component

Add "Team" link visible only for `employer_enterprise` plan users.

### Task A3.3 — Create Accept Invite Page

**File:** `artifacts/talentlock/src/pages/AcceptInvite.tsx` (create new)

Route: `/team/accept-invite`

Reads `?token=` from URL. Calls `GET /api/team/accept-invite`. Shows loading/success/error states.

---

## Sub-Phase B — Shared Shortlist

### Task B1.1 — Schema: `team_shortlist`

Check if shortlist table already exists. If not, create `team_shortlist` from `plan.md`. Run migration.

### Task B2.1 — Add Shortlist Routes

**File:** `artifacts/api-server/src/routes/team.ts`

Add to existing team router:

#### `GET /api/team/shortlist`
Returns all shortlisted freelancers for the team with `addedByUserId` resolved to display name.

#### `POST /api/team/shortlist`
Body: `{ freelancerId: string }`
Guard: active team member. UNIQUE constraint handles duplicates (return 200 not 409).

#### `DELETE /api/team/shortlist/:freelancerId`
Guard: active team member. Anyone can remove (not just who added).

### Task B3.1 — Shared Shortlist on Talent Vault

**File:** `artifacts/talentlock/src/pages/Freelancers.tsx`

For enterprise employers: show shared team shortlist tab alongside search results.

See `UI.md` Component 2 for spec.

---

## Sub-Phase C — Team Analytics

### Task C1.1 — Team Analytics Endpoint

**File:** `artifacts/api-server/src/routes/team.ts`

Add `GET /api/team/analytics`:
- Guard: team admin
- Fetch all team member IDs
- Query: total spend (approved milestones) across all member `employerIds`
- Query: bookings by member
- Query: most hired freelancers across team
- Query: open job requirements by member

Returns structured analytics object.

### Task C2.1 — `/team/analytics` Page

**File:** `artifacts/talentlock/src/pages/TeamAnalytics.tsx` (create new)

Route: `/team/analytics`
Guard: team admin only.

See `UI.md` Component 3 for spec.

---

## Acceptance Criteria

**Sub-Phase A:**
- [ ] `teams` and `team_members` tables exist with correct schema
- [ ] UNIQUE constraint on `team_members(teamId, userId)`
- [ ] `POST /api/team` returns 402 for non-enterprise employers
- [ ] `POST /api/team/invite` generates non-guessable token with 7-day expiry
- [ ] `GET /api/team/accept-invite` clears token immediately on use
- [ ] Expired token returns 410
- [ ] `DELETE /api/team/members/:userId` cannot remove team owner
- [ ] Team admin can see all members, non-admin cannot see admin routes
- [ ] `/team` page visible in nav for enterprise employers only
- [ ] Accept invite page handles authenticated and unauthenticated users

**Sub-Phase B:**
- [ ] `team_shortlist` table (or extended shortlist) exists
- [ ] All team members see the same shared shortlist
- [ ] Adding shows who added it
- [ ] UNIQUE prevents duplicate shortlist entries

**Sub-Phase C:**
- [ ] Team analytics shows spend across ALL team members (not just requester)
- [ ] Only team admins can access analytics
- [ ] `pnpm run typecheck` passes

---

## Dependencies & Order

```
A1.1 (inspect) → A1.2 → A1.3
A2.1 → A2.2 → A2.3 → A2.4 (codegen + typecheck)
A3.1 → A3.2 → A3.3

[After Sub-Phase A is complete]
B1.1 → B2.1 → B3.1

[After Sub-Phase B is complete]
C1.1 → C2.1
```

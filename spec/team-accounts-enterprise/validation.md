# TalentLock — Validation Guide: Team Accounts (Enterprise)

---

## Sub-Phase A Validation — Team Creation + Member Management

### VA1 — Tables Exist
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('teams', 'team_members');
```
- [ ] Both tables exist

```sql
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'team_members' AND constraint_type = 'UNIQUE';
```
- [ ] UNIQUE constraint on `(team_id, user_id)` exists

### VA2 — Non-Enterprise Cannot Create Team
```bash
curl -X POST http://localhost:8080/api/team \
  -H "Authorization: Bearer <starter_employer_token>" \
  -d '{"name":"My Team"}'
```
- [ ] Returns `HTTP 402`

### VA3 — Enterprise Employer Creates Team
```bash
curl -X POST http://localhost:8080/api/team \
  -H "Authorization: Bearer <enterprise_employer_token>" \
  -d '{"name":"Acme Corp"}'
```
- [ ] Returns `HTTP 201` with team details
- [ ] Creator is automatically an `admin` member with `status = 'active'`

### VA4 — Invite Member + Token Security
```bash
curl -X POST http://localhost:8080/api/team/invite \
  -H "Authorization: Bearer <team_admin_token>" \
  -d '{"email":"colleague@company.com","role":"member"}'
```
- [ ] Returns `HTTP 201`
- [ ] `team_members` row created with `status = 'invited'`
- [ ] `invite_token` is a UUID (not guessable)
- [ ] `invite_expires_at` is ~7 days in the future

### VA5 — Accept Invite
```bash
curl "http://localhost:8080/api/team/accept-invite?token=<invite_token>" \
  -H "Authorization: Bearer <invited_user_token>"
```
- [ ] Returns `HTTP 200` with team details
- [ ] `team_members.status` = `'active'`, `joined_at` populated
- [ ] `team_members.invite_token` = `null` (cleared)

### VA6 — Expired Token Rejected
```sql
-- Manually expire the token
UPDATE team_members SET invite_expires_at = NOW() - INTERVAL '1 day'
WHERE invite_token = '<token>';
```
```bash
curl "http://localhost:8080/api/team/accept-invite?token=<expired_token>"
```
- [ ] Returns `HTTP 410`

### VA7 — Non-Admin Cannot Invite
```bash
curl -X POST http://localhost:8080/api/team/invite \
  -H "Authorization: Bearer <team_member_token>" \
  -d '{"email":"test@test.com","role":"member"}'
```
- [ ] Returns `HTTP 403`

### VA8 — Cannot Remove Team Owner
```bash
curl -X DELETE http://localhost:8080/api/team/members/<owner_user_id> \
  -H "Authorization: Bearer <admin_token>"
```
- [ ] Returns `HTTP 409` or `HTTP 400` (cannot remove owner)

### VA9 — /team Page (Frontend)
Log in as enterprise employer:
- [ ] `/team` link visible in nav
- [ ] Team management page renders with member list
- [ ] "Invite member" opens dialog
- [ ] Submitting invite shows success toast

Log in as non-enterprise:
- [ ] `/team` shows upgrade prompt
- [ ] "Upgrade to Enterprise →" links to `/pricing`

---

## Sub-Phase B Validation — Shared Shortlist

### VB1 — Shortlist Shared Across Members
Team Member A shortlists Freelancer X. Team Member B views Talent Vault:
- [ ] Freelancer X appears in Member B's "Team Shortlist" tab
- [ ] Shows "Added by [Member A's name]"

### VB2 — Duplicate Prevention
Member A shortlists Freelancer X twice:
- [ ] No duplicate entries in `team_shortlist`
- [ ] Returns `HTTP 200` (idempotent, not `409`)

### VB3 — Remove Works for Any Member
Member B removes Freelancer X (added by Member A):
- [ ] Freelancer X removed from team shortlist for everyone

---

## Sub-Phase C Validation — Team Analytics

### VC1 — Admin Access Only
```bash
curl http://localhost:8080/api/team/analytics \
  -H "Authorization: Bearer <team_member_token>"
```
- [ ] Returns `HTTP 403`

### VC2 — Analytics Aggregates Across All Members
Create bookings as Member A ($5,000) and Member B ($3,000):
```bash
curl http://localhost:8080/api/team/analytics \
  -H "Authorization: Bearer <team_admin_token>"
```
- [ ] Total spend includes both A and B's bookings
- [ ] Breakdown shows per-member spend

### VC3 — Build Passes
```bash
pnpm run typecheck
pnpm --filter @workspace/talentlock run build
pnpm --filter @workspace/api-server run build
```
- [ ] Zero errors

---

## Final Sign-Off

| Sub-Phase | Pass | Signed Off By | Date |
|---|---|---|---|
| A — Team + Members | ⬜ | | |
| B — Shared Shortlist | ⬜ | | |
| C — Team Analytics | ⬜ | | |
| **Complete** | ⬜ | | |

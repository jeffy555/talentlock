# TalentLock — Clarification & Verification: Team Accounts (Enterprise)

---

## ✅ Verified

| Item | Verified Against |
|---|---|
| `employer_enterprise` plan exists in `plans.ts` | Confirmed in `project.md` |
| `users` table exists with Clerk ID | Confirmed |
| `employer_profiles` table exists | Confirmed |
| `subscriptions` table with plan and status | Confirmed |
| `bookings` with `employerId` | Confirmed |
| `job_requirements` with employer link | Confirmed |
| Clerk used for auth — new team members get Clerk accounts | Confirmed |
| Notification Centre built — invite emails can use `sendNotificationEmail()` | Confirmed |
| `/pricing` page exists for upgrade CTA | Confirmed |
| shadcn/ui `<Table>`, `<Dialog>`, `<Badge>` available | Confirmed |

---

## ❓ Open Questions

### Q1 — Does a Shortlist Table Already Exist?

**Question:** Module 4 adds a shared team shortlist. The Talent Vault has a heart/shortlist feature (Key Feature #2). Is the individual shortlist currently persisted in the database, or is it stored in local/session state?

**Impact:** If a shortlist table already exists, Module 4 extends it with `teamId`. If not, a new `team_shortlist` table is needed.

**Recommendation:**
```bash
grep -r "shortlist\|Shortlist\|heart\|favourite" lib/db/src/schema/*.ts | head -10
grep -rn "shortlist" artifacts/api-server/src/routes/ | head -10
```

---

### Q2 — How Is `employer_enterprise` Plan Detected at Request Time?

**Question:** Team-only features must verify the requesting user is on `employer_enterprise`. How is the current plan retrieved in route handlers?

**Recommendation:**
```bash
grep -n "userPlan\|subscriptions\|employer_enterprise" artifacts/api-server/src/routes/bookings.ts | head -10
```

---

### Q3 — Can an Enterprise Employer Already Have Multiple Logins?

**Question:** If two people at the same company are both on `employer_enterprise`, do they currently have two completely separate accounts with no link between them? Or is there any existing org/team concept?

**Impact:** If already separate accounts, Team Accounts creates a link between them. If some org concept exists, the implementation must extend it rather than create a parallel system.

---

### Q4 — What Happens to Existing Enterprise Employer's Subscriptions When They Join a Team?

**Question:** When an existing `employer_enterprise` account joins a team (accepts an invite), their subscription is now "inherited" from the team. Should their existing subscription row be:
- **(A)** Kept as-is (they already have enterprise — no change)
- **(B)** Marked as `team_member` with a reference to the team
- **(C)** Replaced by a team subscription record

**Recommendation:** Option A for this phase — if they're already enterprise, no change. If they're on a lower plan (e.g. Growth), their plan is upgraded to Enterprise on invite acceptance.

---

### Q5 — Should Team Analytics Reuse Existing Analytics Endpoints?

**Question:** Module 5 (team analytics) could either:
- **(A)** Be a new endpoint `GET /api/team/analytics` that aggregates across all team member IDs
- **(B)** Extend the existing `GET /api/dashboard/spend-analytics` to accept a `?teamId=` filter (admin only)

**Recommendation:** Option A — separate endpoint. Cleaner separation, doesn't complicate the existing dashboard endpoint.

---

### Q6 — Invite Token Delivery

**Question:** Module 3 sends an invite email. Does this use the existing `sendNotificationEmail()` from the Product Gaps feature (emailService.ts), or does it need a separate email template?

**Recommendation:** Use `sendNotificationEmail()` extended with a custom HTML template for the invite. The invite email has a different structure (CTA link with token, no notification context) so it uses a direct Resend call with a custom template — not the standard notification email pattern.

---

## ⚠️ Risks & Notes

### Risk 1 — Invite Token Security

The `inviteToken` is a UUID that grants team membership. It must:
- Be single-use (cleared immediately on acceptance)
- Expire after 7 days
- Be validated server-side — never trust the client

Add `inviteExpiresAt` timestamptz to `team_members`.

### Risk 2 — Shared Subscription / Token Quota

When multiple team members share an enterprise plan, their token usage must be aggregated against a single quota. Currently `checkTokenQuota()` checks per `userId`. For team accounts, this needs to check the team's aggregate usage. This is a non-trivial change to the token quota system — defer to a follow-up if scope is too large for this phase.

**Decision:** For this phase, each team member has their own token budget (they each get the enterprise unlimited quota individually). Token aggregation across team members is a future enhancement.

### Risk 3 — Permission Checks at Every Team Route

Every `/api/team/*` route must verify:
1. User is authenticated
2. User's plan is `employer_enterprise`
3. User is a member of the team (`team_members.status = 'active'`)
4. For admin-only actions: user's role is `admin`

Create a reusable `requireTeamAdmin(req, db)` middleware.

### Risk 4 — This Is the Largest Feature Scope

Team Accounts touches more files than any other feature: new tables, new routes, new frontend pages, email sending, Clerk account creation, subscription management. Consider implementing in sub-phases:
- Sub-phase A: Team creation + member management (no shortlist, no analytics)
- Sub-phase B: Shared shortlist
- Sub-phase C: Team analytics

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Shortlist table exists? | Task 1.2 (schema for team_shortlist) |
| Q2 | Plan detection pattern | Task 2.1 (enterprise guard) |
| Q3 | Existing org concept? | Task 1.1 (inspection — avoid duplication) |

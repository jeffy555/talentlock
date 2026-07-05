# TalentLock — Clarification & Verification: TalentSearch (Employer Cruise Mode)

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|---|---|
| `PUT /api/freelancers/me` exists and is the profile update endpoint | Confirmed in `project.md` |
| `employer_profiles` table exists with `id`, `employerId` | Confirmed in `project.md` schema |
| `freelancer_profiles` table has `skills`, `fieldOfWork`, `rate`, `bio`, `completenessScore` | Confirmed |
| `professionCategory`, `educationProfessionType`, `teachingSubjects`, `location`, `dbsCheckStatus` added by Teaching Professional Profile spec | Confirmed in `specs/teaching-professional-profile/` |
| `createNotification()` fire-and-forget pattern established across 15+ notification types | Confirmed |
| `sendNotificationEmail()` available for email alerts | Confirmed |
| OpenAI client available server-side | Confirmed |
| `logTokenUsage()` + `TokenFeature` union exists | Confirmed |
| Cruise Mode two-stage evaluation pattern (pre-filter + AI) already built | Confirmed in `specs/cruise-mode/` |
| `isInBlackoutWindow()` utility already exists in `cruiseModeUtils.ts` | Confirmed |
| `getNextMidnightUTC()` already exists in `cruiseModeUtils.ts` | Confirmed |
| `sanitiseText()` for all free-text input | Confirmed |
| Paginated response shape `{ data, total, page, pageSize, totalPages }` | Confirmed |
| `accessControl.ts` pattern for role-based route protection | Confirmed |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Exact Trigger Point on `PUT /api/freelancers/me`

**Question:** The TalentSearch evaluation must fire after a freelancer saves their profile. Confirm the exact location of the `PUT /api/freelancers/me` handler and the pattern for attaching a fire-and-forget hook after the `db.update()` call.

**Recommendation:**
```bash
# Find the PUT /api/freelancers/me handler
grep -n "router.put\|app.put\|PUT.*freelancers/me" artifacts/api-server/src/routes/freelancers.ts | head -5

# Confirm the db.update() call location
grep -n "db.update\|freelancerProfiles" artifacts/api-server/src/routes/freelancers.ts | head -10
```

The fire-and-forget hook must be placed AFTER `db.update()` returns — never before. Pattern mirrors the Cruise Mode hook in `POST /api/job-requirements`:

```ts
// AFTER db.update(freelancerProfiles) returns:
evaluateTalentSearchForUpdatedProfile(db, freelancer.id, req.log)
  .catch(err => req.log.warn({ err, freelancerId: freelancer.id }, 'talent-search hook failed'));

return res.json(updatedProfile); // Route returns immediately
```

---

### Q2 — Should New Freelancer Registration Also Trigger TalentSearch?

**Question:** TalentSearch fires on `PUT /api/freelancers/me` (profile update). Should it also fire when a freelancer first registers — i.e. when their profile row is first created?

**Options:**
- **(A)** Yes — fire on both creation (first `PUT`) and every subsequent update
- **(B)** Only fire when profile completeness reaches ≥ 60% (the Talent Vault visibility threshold) — prevents evaluating empty profiles
- **(C)** Only fire on explicit profile completion — a "Publish my profile" action

**Recommendation: Option B.** Gate the TalentSearch trigger on `completenessScore >= 60`. An employer's rules should not be evaluated against a profile with no photo, no bio, and no skills — it wastes evaluation time and produces meaningless scores. The existing `calculateCompletenessScore()` already runs on every `PUT /api/freelancers/me` call. Add a simple check:

```ts
if (updatedProfile.completenessScore < 60) return; // Skip TalentSearch
evaluateTalentSearchForUpdatedProfile(db, freelancer.id, req.log).catch(...);
```

---

### Q3 — How Does the Pre-Filter Differ from Cruise Mode's Pre-Filter?

**Question:** Cruise Mode's `preFilter()` checks a job post against a freelancer's rules. TalentSearch's pre-filter checks a freelancer profile against an employer's rules. The inputs are flipped. Confirm what the TalentSearch pre-filter checks specifically.

**Recommendation:** Build a separate `talentSearchPreFilter(rules, freelancerProfile)` function in a new `talentSearchUtils.ts`. Do not modify `cruiseModeUtils.ts`. Checks:

```ts
function talentSearchPreFilter(rules: TalentSearchRules, freelancer: NormalisedFreelancer): boolean {
  // 1. Profession category — must match if employer specified one
  if (rules.professionCategory && freelancer.professionCategory !== rules.professionCategory) return false;

  // 2. Education sub-type — must match if specified
  if (rules.educationSubType && freelancer.educationProfessionType !== rules.educationSubType) return false;

  // 3. Rate range — freelancer's rate must fall within employer's range
  if (rules.maxRate && freelancer.rate > rules.maxRate) return false;
  if (rules.minRate && freelancer.rate < rules.minRate) return false;

  // 4. Required skills — at least 1 must appear on freelancer profile
  const profileText = [...(freelancer.skills ?? []), ...(freelancer.teachingSubjects ?? []),
    freelancer.bio ?? '', freelancer.fieldOfWork ?? ''].join(' ').toLowerCase();
  if (rules.requiredSkills?.length > 0) {
    const hasAny = rules.requiredSkills.some(s => profileText.includes(s.toLowerCase()));
    if (!hasAny) return false;
  }

  // 5. Excluded keywords — must not appear on freelancer profile
  if (rules.excludedKeywords?.some(kw => profileText.includes(kw.toLowerCase()))) return false;

  // 6. DBS check requirement
  if (rules.requireDbs && freelancer.dbsCheckStatus !== 'verified') return false;

  // 7. Verified credentials requirement
  if (rules.requireVerifiedCredentials && !freelancer.hasAnyVerifiedDocument) return false;

  return true;
}
```

---

### Q4 — How Often Can TalentSearch Notify the Same Freelancer?

**Question:** If a freelancer updates their profile 5 times in one day (photo, bio, skills, rate, availability — each as a separate save), TalentSearch could notify the same freelancer up to 5 times on behalf of the same employer. This is a terrible user experience for the freelancer.

**Options:**
- **(A)** One notification per employer–freelancer pair per day (daily deduplication)
- **(B)** One notification per employer–freelancer pair ever (never notify the same freelancer twice)
- **(C)** One notification per employer–freelancer pair per 30 days (monthly deduplication)

**Recommendation: Option C — 30-day deduplication.** If the freelancer significantly updates their profile 31 days later (new skills, new credentials), they may now be a better match for the employer's rules and a fresh notification is appropriate. The duplicate check:

```ts
const recentlySent = await db.query.talentSearchActivity.findFirst({
  where: and(
    eq(talentSearchActivity.employerId, config.employerId),
    eq(talentSearchActivity.freelancerId, freelancer.id),
    eq(talentSearchActivity.decision, 'sent'),
    gte(talentSearchActivity.sentAt, subDays(new Date(), 30)),
  ),
});
if (recentlySent) return; // Skip silently
```

---

### Q5 — What Does the Message Sent to the Freelancer Look Like?

**Question:** The interest message is sent on behalf of the employer. Tone and content must feel like the employer wrote it, not an automated system. What context should the AI use to write this?

**Recommendation:** The AI prompt for TalentSearch message generation includes:
- Employer's company name, sector, and a brief description of their recent job postings
- The specific match reasons (why this freelancer scored highly)
- The employer's configured message tone
- The freelancer's name and primary skill/field

Sample output (Professional tone, education context):
> "Hi Sarah, I'm reaching out from Jefferson Academy. We noticed your profile on TalentLock and your experience in GCSE Mathematics and A-Level Physics caught our attention. We regularly need qualified supply teachers in the Manchester area and would love to have a conversation about potential opportunities. Would you be open to a quick discovery call?"

The freelancer notification card shows a "TalentSearch ✦" badge — making it clear this is AI-assisted outreach — but the message body reads naturally in the employer's voice.

---

### Q6 — `talent_search_evaluation` or Reuse `cruise_mode_evaluation` Token Label?

**Question:** TalentSearch AI evaluations consume tokens. Should a new token label `talent_search_evaluation` be added, or should `cruise_mode_evaluation` be reused?

**Recommendation:** Add a distinct label. TalentSearch evaluations are charged to the employer's account; Cruise Mode evaluations are charged to the freelancer's account. They must be tracked separately for billing, reporting, and the admin token-usage dashboard.

```ts
export type TokenFeature =
  | /* existing */
  | 'cruise_mode_parse'
  | 'cruise_mode_evaluation'
  | 'talent_search_parse'        // NEW — rule parsing from free-form text
  | 'talent_search_evaluation'   // NEW — per-freelancer AI evaluation
```

---

## ⚠️ Risks & Notes

### Risk 1 — High Volume of Profile Updates

Freelancers who update their profiles frequently (photographic uploads, iterative bio edits) could trigger many TalentSearch evaluations per day. With 100 employers having TalentSearch active, each profile update triggers up to 100 pre-filters and potentially many AI evaluations.

**Mitigation:** The 30-day duplicate window (Q4) prevents re-notification. The Stage 1 pre-filter eliminates most mismatches without an AI call. Cap concurrent evaluations per profile update at 50 (matching the Cruise Mode cap per job post).

### Risk 2 — Freelancer Spam Risk

A freelancer with a popular profile could receive many TalentSearch notifications from different employers in a short period. This is annoying even if each individual notification is legitimate.

**Mitigation:** Add a global rate limit: a freelancer cannot receive more than 3 TalentSearch notifications per day across all employers. The 4th+ evaluation that would result in a send is logged as `daily_freelancer_limit_reached` instead. This protects the freelancer experience without preventing employers from running TalentSearch.

Add `talentSearchNotificationsToday` (integer, reset daily) tracking on `freelancer_profiles`:
```ts
talentSearchNotificationsToday: integer('talent_search_notifications_today').notNull().default(0),
talentSearchNotificationsResetAt: timestamp('talent_search_notifications_reset_at', { withTimezone: true }),
```

### Risk 3 — `PUT /api/freelancers/me` Response Time

The TalentSearch hook fires fire-and-forget and must never delay the profile update response. Confirm the hook is attached AFTER `return res.json()` — not before. If Express flushes the response before the async hook completes, the hook still runs in the Node.js event loop.

### Risk 4 — Employer Identity Disclosure to Freelancer

The Express Interest notification tells the freelancer which employer is interested. This is intentional and required for the freelancer to make an informed decision about responding. However, employers should know that their identity (company name) will be disclosed to every freelancer TalentSearch contacts. Make this clear in the activation confirmation dialog and in the TalentSearch setup page copy.

### Risk 5 — Cruise Mode Symmetry Maintenance

TalentSearch shares the daily time budget model, the pre-filter → AI pattern, the fire-and-forget pipeline, and the activity feed structure with Cruise Mode. If Cruise Mode's core pipeline is ever updated (new decision values, new token label patterns, new notification types), TalentSearch must be updated in parallel. Document this dependency in both spec folders and in `project.md` Cursor notes.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|---|---|
| Q1 | Location of `PUT /api/freelancers/me` handler | Task 2.1 (hook attachment) |
| Q2 | Completeness threshold trigger decision | Task 2.1 (hook condition) |
| Q3 | TalentSearch pre-filter inputs confirmed | Task 2.2 (`talentSearchUtils.ts`) |
| Q4 | Duplicate window (30 days) confirmed | Task 2.3 (evaluator duplicate check) |
| Q6 | New token labels confirmed | Task 2.1 (tokenLogger.ts update) |

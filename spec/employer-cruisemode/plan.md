# TalentLock — Implementation Plan: TalentSearch (Employer Cruise Mode)

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read `specs/cruise-mode/plan.md` alongside this file —
> TalentSearch shares the same core pipeline architecture as Cruise Mode.
> If this file and `task.md` ever conflict, this file wins.

---

## Pre-Implementation Codebase Checks

```bash
# 1. Locate PUT /api/freelancers/me handler
grep -n "router.put\|app.put" artifacts/api-server/src/routes/freelancers.ts | head -5

# 2. Confirm db.update() call location in profile update handler
grep -n "db.update\|freelancerProfiles" artifacts/api-server/src/routes/freelancers.ts | head -10

# 3. Confirm calculateCompletenessScore() location and return value
grep -rn "calculateCompletenessScore\|completenessScore" artifacts/api-server/src/ | head -5

# 4. Confirm talent_search token labels do NOT already exist
grep "talent_search" artifacts/api-server/src/lib/tokenLogger.ts

# 5. Confirm employer_profiles table and column names
grep -A 20 "employerProfiles\s*=" lib/db/src/schema/*.ts | head -25

# 6. Confirm cruiseModeUtils.ts location (to reuse isInBlackoutWindow, getNextMidnightUTC)
ls artifacts/api-server/src/lib/cruiseModeUtils.ts

# 7. Check for existing freelancer spam protection columns
grep "talentSearchNotifications\|talent_search_notifications" lib/db/src/schema/*.ts
```

---

## Resolved Questions

---

### Q1 — Trigger Point on `PUT /api/freelancers/me`

**Decision: Fire after `db.update()` returns, conditioned on completeness score >= 60.**

```ts
// In PUT /api/freelancers/me handler — AFTER db.update() returns and response is sent:
import { evaluateTalentSearchForUpdatedProfile } from '../lib/talentSearchEvaluator';

// Calculate completeness (already runs as part of the handler)
const updatedProfile = await recalculateAndSaveCompleteness(db, freelancerId);

return res.json(updatedProfile); // Response sent first

// Fire-and-forget AFTER response — only if profile is complete enough to be in Talent Vault
if (updatedProfile.completenessScore >= 60) {
  evaluateTalentSearchForUpdatedProfile(db, freelancerId, req.log)
    .catch(err => req.log.warn({ err, freelancerId }, 'talent-search hook failed'));
}
```

The `completenessScore >= 60` gate prevents evaluating skeleton profiles with no skills, no bio, and no photo — which would waste evaluation time and produce meaningless results.

---

### Q2 — Completeness Threshold Decision

**Decision: Option B — fire only when `completenessScore >= 60`.**

This matches the existing Talent Vault visibility threshold — a profile that appears in Talent Vault results is a profile worth evaluating for TalentSearch. Profiles below 60% are invisible to employers browsing anyway; TalentSearch should not surface them either.

---

### Q3 — TalentSearch Pre-Filter Implementation

**Decision: New `talentSearchPreFilter()` in `talentSearchUtils.ts`. Do NOT modify `cruiseModeUtils.ts`.**

```ts
export interface NormalisedFreelancer {
  id: string;
  professionCategory: string;         // 'technology' | 'education'
  educationProfessionType: string | null;
  skills: string[];
  teachingSubjects: string[] | null;
  teachingLevels: string[] | null;
  fieldOfWork: string;
  rate: number;
  bio: string | null;
  dbsCheckStatus: string | null;      // 'not_uploaded' | 'uploaded' | 'verified' | 'expired'
  hasAnyVerifiedDocument: boolean;    // true if any document has status 'verified'
  location: string | null;
  completenessScore: number;
}

export function talentSearchPreFilter(
  rules: TalentSearchRules,
  freelancer: NormalisedFreelancer
): boolean {
  // 1. Profession category
  if (rules.professionCategory && freelancer.professionCategory !== rules.professionCategory) return false;

  // 2. Education sub-type (only checked if professionCategory = 'education')
  if (rules.educationSubType && freelancer.educationProfessionType !== rules.educationSubType) return false;

  // 3. Rate range — freelancer's rate must be within employer's acceptable range
  if (rules.maxRate !== null && freelancer.rate > rules.maxRate) return false;
  if (rules.minRate !== null && freelancer.rate < rules.minRate) return false;

  // 4. Required skills — at least one must appear in the freelancer's profile text
  const profileText = [
    ...(freelancer.skills ?? []),
    ...(freelancer.teachingSubjects ?? []),
    ...(freelancer.teachingLevels ?? []),
    freelancer.bio ?? '',
    freelancer.fieldOfWork ?? '',
  ].join(' ').toLowerCase();

  if (rules.requiredSkills?.length > 0) {
    const hasAny = rules.requiredSkills.some(s => profileText.includes(s.toLowerCase()));
    if (!hasAny) return false;
  }

  // 5. Excluded keywords — must not appear anywhere on the profile
  if (rules.excludedKeywords?.some(kw => profileText.includes(kw.toLowerCase()))) return false;

  // 6. DBS check — if employer requires it, freelancer must have a verified DBS
  if (rules.requireDbs && freelancer.dbsCheckStatus !== 'verified') return false;

  // 7. Verified credentials — at least one verified document on file
  if (rules.requireVerifiedCredentials && !freelancer.hasAnyVerifiedDocument) return false;

  return true;
}
```

---

### Q4 — Duplicate Window

**Decision: 30-day deduplication per employer–freelancer pair.**

```ts
const recentlySent = await db.query.talentSearchActivity.findFirst({
  where: and(
    eq(talentSearchActivity.employerId, config.employerId),
    eq(talentSearchActivity.freelancerId, freelancer.id),
    eq(talentSearchActivity.decision, 'sent'),
    gte(talentSearchActivity.sentAt, subDays(new Date(), 30)),
  ),
});
if (recentlySent) return; // Skip silently — no log entry
```

`subDays` can be implemented as: `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)`.

---

### Q5 — Express Interest Message Prompt

**Decision: Use verbatim system prompt below. Temperature 0.4 for natural variation.**

```
You are an AI assistant for a talent marketplace, composing an outreach message on behalf of an employer to a matching freelancer/professional.

EMPLOYER:
Company: ${companyName}
Sector: ${employerSector ?? 'not specified'}
Recent hiring focus: ${recentJobTitles.join(', ') || 'general hiring'}

EMPLOYER TALENT SEARCH RULES:
Profession: ${rules.professionCategory} ${rules.educationSubType ? '— ' + rules.educationSubType : ''}
Required skills: ${rules.requiredSkills.join(', ') || 'any'}
Rate range: ${rules.minRate ?? 0}–${rules.maxRate ?? '∞'} ${rules.rateType}
Location: ${rules.locationRequired ? rules.location + ' (within ' + rules.locationRadiusKm + 'km)' : 'remote OK'}
DBS required: ${rules.requireDbs ? 'Yes' : 'No'}

FREELANCER PROFILE:
Name: ${freelancerName}
Field: ${fieldOfWork}
Profession type: ${educationProfessionType ?? 'not specified'}
Skills: ${skills.join(', ')}
Teaching subjects: ${teachingSubjects?.join(', ') ?? 'N/A'}
Rate: ${rate} ${rateType}
Location: ${location ?? 'not specified'}

MATCH REASONS:
Matched: ${reasons.matched.join(', ')}
Concerns: ${reasons.concerns.join(', ') || 'none'}

Compose a personalised outreach message from the employer to the freelancer.
Rules:
- 80–120 words
- Written in first person as if the employer is writing it ("I'm reaching out from...")
- ${rules.messageTone} tone
- Reference 1–2 specific match reasons naturally (do not list them mechanically)
- End with a clear, low-pressure call to action ("Would you be open to a quick call?")
- Do NOT mention that this was AI-generated
- Do NOT use a subject line — body only

Return ONLY the message body, no preamble, no JSON wrapper.
```

---

### Q6 — Token Labels

**Decision: Two new labels. Both charged to the employer's account (not the freelancer's).**

```ts
export type TokenFeature =
  | /* existing */
  | 'cruise_mode_parse'
  | 'cruise_mode_evaluation'
  | 'talent_search_parse'        // Rule parsing from free-form text
  | 'talent_search_evaluation'   // Per-freelancer AI evaluation
```

---

### Risk 2 Mitigation — Freelancer Daily Notification Cap

**Decision: Max 3 TalentSearch notifications per freelancer per day. Enforced server-side.**

New columns on `freelancer_profiles`:
```ts
talentSearchNotificationsToday:    integer('talent_search_notifications_today').notNull().default(0),
talentSearchNotificationsResetAt:  timestamp('talent_search_notifications_reset_at', { withTimezone: true }),
```

Check and increment in the evaluator:
```ts
// Before sending:
const now = new Date();
let profile = freelancerProfile;

// Reset daily counter if past midnight UTC
if (profile.talentSearchNotificationsResetAt < now) {
  await db.update(freelancerProfiles).set({
    talentSearchNotificationsToday: 0,
    talentSearchNotificationsResetAt: getNextMidnightUTC(),
  }).where(eq(freelancerProfiles.id, profile.id));
  profile = { ...profile, talentSearchNotificationsToday: 0 };
}

if (profile.talentSearchNotificationsToday >= 3) {
  await logActivity(db, config, freelancer.id, { decision: 'daily_freelancer_limit_reached', ... });
  return;
}

// After sending:
await db.update(freelancerProfiles)
  .set({ talentSearchNotificationsToday: sql`${freelancerProfiles.talentSearchNotificationsToday} + 1` })
  .where(eq(freelancerProfiles.id, freelancer.id));
```

---

## Shared Utilities from Cruise Mode (Reuse Directly)

```ts
// From cruiseModeUtils.ts — reuse without copying:
import { isInBlackoutWindow } from './cruiseModeUtils';
import { getNextMidnightUTC } from './cruiseModeUtils';
```

Both utilities are profile-agnostic (they operate on rule schemas and timestamps) and can be used directly by TalentSearch without modification.

---

## Notification Content

**To freelancer (the Express Interest notification):**
```ts
createNotification(db, {
  userId: freelancer.id,
  type: 'talent_search_interest',
  title: `${companyName} is interested in your profile`,
  body: `${companyName} expressed interest in your profile for a ${fieldLabel} role. View their open positions to learn more.`,
  metadata: {
    employerId: config.employerId,
    activityId,
    isTalentSearch: true,   // drives the "TalentSearch ✦" badge in the UI
  },
});
```

**To employer (the confirmation notification):**
```ts
createNotification(db, {
  userId: config.employerId,
  type: 'talent_search_sent',
  title: 'TalentSearch sent an interest message',
  body: `Your AI assistant expressed interest in ${freelancerName}'s profile (match score: ${score}/100).`,
  metadata: { activityId, freelancerId: freelancer.id, score },
});
```

---

## Pre-Implementation Checklist

- [ ] `project.md` read in full
- [ ] `specs/cruise-mode/plan.md` read in full (shared architecture)
- [ ] All 6 TalentSearch spec files read
- [ ] Codebase inspection complete — Q1 handler location confirmed
- [ ] `talent_search_parse` and `talent_search_evaluation` added to `TokenFeature`
- [ ] `talentSearchPreFilter()` unit tested against 10 sample profiles before Phase 2
- [ ] Freelancer daily notification cap columns added to schema before Phase 2

---

## Phase Execution Sign-Off

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Schema — `talent_search_configs`, `talent_search_activity`, 2 new columns on `freelancer_profiles` | ⬜ Not started |
| Phase 2 | Backend — evaluation engine, hook on `PUT /api/freelancers/me`, all API routes, OpenAPI + codegen | ⬜ Not started |
| Phase 3 | Frontend — `/talent-search` page, rule builder, activity feed, status bar | ⬜ Not started |

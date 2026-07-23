# TalentLock — Features Specification: TalentSearch (Employer Cruise Mode)

## Overview

Employers miss great candidates every day — not because good freelancers do not exist on TalentLock, but because the employer was not actively browsing when a matching freelancer registered or updated their profile. A freelancer who joined last Tuesday while the employer was in back-to-back meetings is invisible to them.

**TalentSearch** solves this. It is the exact mirror of Cruise Mode, but working for the employer side.

The employer defines a set of rules — what profession category they hire for, the skills they need, the rate range they work within, the availability they require, and any hard exclusions. They write these rules once, in plain English or a markdown file, and activate TalentSearch manually. From that point on, when a new freelancer registers or an existing freelancer updates their profile and matches the employer's rules, TalentLock's AI:

1. Evaluates the freelancer profile against the employer's rules
2. Scores the match (0–100)
3. If the score exceeds the employer's configured threshold, sends a personalised **Express Interest** notification to the freelancer **on behalf of the employer**
4. Notifies the employer immediately about what it sent and why
5. Logs everything in a transparent activity feed so the employer stays in control

The employer wakes up to a list of interested, matching candidates who have already been notified — not a list of profiles they missed while they were not browsing.

---

## Relationship to Cruise Mode

TalentSearch and Cruise Mode are the two sides of TalentLock's bilateral AI automation story:

| Dimension | Cruise Mode (Freelancer) | TalentSearch (Employer) |
|---|---|---|
| Who activates it | Freelancer | Employer |
| Triggered by | New job post (`POST /api/job-requirements`) | New/updated freelancer profile (`PUT /api/freelancers/me`) |
| AI evaluates | Job post against freelancer's rules | Freelancer profile against employer's rules |
| Message sent to | Employer (via **Messages DM**) | Freelancer (via **Messages DM**) |
| Message sent on behalf of | Freelancer | Employer |
| Badge shown | "Cruise Mode ✦" on employer notification → opens DM | "TalentSearch ✦" on freelancer notification → opens DM |
| Activity table | `cruise_mode_activity` | `talent_search_activity` |
| Config table | `cruise_mode_configs` | `talent_search_configs` |
| Frontend page | `/cruise-mode` (freelancer only) | `/talent-search` (employer only) |

Both features share the same two-stage evaluation architecture (pre-filter → AI scoring), the same daily 6-hour usage budget model, the same manual ON/OFF control, and the same fire-and-forget background pipeline.

---

## Improvement Suggestions (Added to Core Spec)

**1. Rule Parsing from Natural Language or Markdown File**
The employer can write rules in free-form text ("I need React developers, $80–$120/hr, available from July, no junior candidates") or upload a `.md` or `.txt` rules file. The AI parses this into a structured rule set and shows the employer a preview before activation.

**2. Match Scoring with Transparent Explanation**
Every evaluation produces a match score AND a plain-English explanation. The employer sees "Sarah Chen scored 91/100 — strong React match, rate within range, DBS verified, available from July 1."

**3. Confidence Threshold Control**
The employer sets a minimum match score (e.g. 75/100). The AI only notifies freelancers for profiles scoring above that threshold. Higher threshold = fewer, higher-quality candidates notified.

**4. Dry Run Mode**
Before going live, the employer can run TalentSearch in "Dry Run" — the AI evaluates all new and updated profiles and shows what it would have sent, without notifying anyone. This builds confidence before the employer activates live outreach.

**5. Message Tone Control**
The employer picks a tone for AI-generated interest messages: Professional, Friendly, or Concise. The AI uses this when composing the outreach message sent to matching freelancers.

**6. Daily Digest Notification**
Instead of one notification per candidate, the employer can opt into a daily digest: "TalentSearch found 4 matches today — here's a summary." Reduces notification noise for active employers hiring across multiple roles.

**7. Freelancer Transparency Badge**
The notification sent to the freelancer shows a "TalentSearch ✦" badge so freelancers know this outreach was AI-assisted. The message body reads naturally in the employer's voice — the badge is on the notification card, not inside the message text.

**8. Blackout Windows**
The employer can configure time windows when TalentSearch should NOT send notifications (e.g. weekends, outside business hours). Prevents the AI from sending outreach messages at 2am which could appear unprofessional.

**9. Per-Candidate Follow-Up**
After TalentSearch sends a notification on the employer's behalf, the employer can review it and send a human follow-up message to personalise the outreach further. This keeps the employer in control of the relationship after the AI initiates it.

**10. Rule Versioning**
Every time the employer updates their rules, the old version is saved. The activity log shows which rule version was active when each notification was sent.

---

## Feature Modules

### Module 1 — TalentSearch Rules Engine

The employer defines their rules via:
- **(A)** A structured form in the UI (profession category, skills, rate range, availability, location, exclusions)
- **(B)** Free-form text or markdown uploaded/pasted — the AI parses it into the structured form

The parsed rule set is stored as a structured JSON object in the `talent_search_configs` table. The employer reviews and confirms the parsed rules before activation.

**Rule schema:**
```ts
{
  professionCategory: 'technology' | 'education' | null, // null = any profession
  educationSubType: 'school_teacher' | 'university_lecturer' | 'tutor' | 'researcher' | null,
  requiredSkills: string[],       // e.g. ["React", "TypeScript"]
  preferredSkills: string[],      // e.g. ["Node.js", "GraphQL"]
  minRate: number | null,         // e.g. 80 — minimum acceptable rate
  maxRate: number | null,         // e.g. 120 — maximum acceptable rate
  rateType: 'hourly' | 'per_day' | 'per_session' | 'per_course',
  availableFrom: string | null,   // ISO date — freelancer must be available from
  locationRequired: boolean,      // true = in-person, false = remote OK
  location: string | null,        // e.g. "Manchester, UK" — for in-person roles
  locationRadiusKm: number | null,// e.g. 15 — max distance from location
  excludedKeywords: string[],     // e.g. ["junior", "student", "no experience"]
  requireVerifiedCredentials: boolean, // true = only profiles with at least one verified doc
  requireDbs: boolean,            // true = only DBS-checked freelancers (education/healthcare)
  preferredFields: string[],      // e.g. ["Secondary Education", "GCSE Maths"]
  matchThreshold: number,         // 0-100, default 70
  messageTone: 'professional' | 'friendly' | 'concise',
  blackoutWindows: {
    timezone: string,             // e.g. "Asia/Kolkata"
    windows: { start: string, end: string, days: number[] }[]
  } | null,
  dryRun: boolean,
  dailyDigest: boolean,
  rawRulesText: string | null,    // original free-form text if parsed
  version: number,
}
```

---

### Module 2 — Profile Evaluation Engine (Background Worker)

When a freelancer updates their profile (`PUT /api/freelancers/me`) or registers for the first time, after the profile is saved, a background evaluation fires for all employers with TalentSearch active.

For each active TalentSearch employer:
1. Pull their rule set
2. Check blackout window — skip if currently in blackout
3. Check if the employer already sent an interest to this freelancer recently — skip if duplicate
4. Evaluate the freelancer profile against the rules using GPT
5. Get a match score (0–100) + explanation
6. If score ≥ threshold AND not dry run: send Express Interest notification to freelancer
7. Log the evaluation result in `talent_search_activity`
8. Create a notification for the employer

The background evaluation runs fire-and-forget from the profile update handler — it must never slow down `PUT /api/freelancers/me`.

---

### Module 3 — AI Match Evaluation

The AI evaluates each freelancer profile against the employer's rules:

**Inputs to the prompt:**
- Freelancer's profile (skills, bio, field, rate, rateType, verified credentials, DBS status, location, availability, educationProfessionType, teachingSubjects, teachingLevels)
- Employer's TalentSearch rules
- Employer's profile (company name, sector, recent job postings for context)

**Output:**
```ts
{
  score: number,               // 0–100
  decision: 'send' | 'skip',
  reasons: {
    matched: string[],         // e.g. ["React skill match", "Rate within range", "DBS verified"]
    concerns: string[],        // e.g. ["Only 2 reviews so far"]
    blockers: string[],        // e.g. ["No DBS check on file", "Rate above employer maximum"]
  },
  proposedMessage: string,     // The message to send to the freelancer if decision = "send"
}
```

---

### Module 4 — Express Interest Notification to Freelancer

When the AI decides to send:
1. A `bookings` record is NOT created — this is a pre-booking expression of interest
2. A new `talent_search_activity` row is created with the full context
3. The AI `proposedMessage` is delivered as a **real direct message (DM)** in a `human_direct` conversation to the freelancer — see `spec/cruise-mode-dm-delivery/`
4. The **freelancer** receives a notification with a **"TalentSearch ✦" badge** linking to the DM thread (`/messages/:conversationId`)
5. The **employer** is notified: "TalentSearch sent an interest message to [Freelancer Name]"
6. The freelancer can reply in Messages, visit the employer's profile, or ignore — they are never auto-booked

**Implementation note (2026-07-23):** Notification-only delivery was the original behaviour; DM delivery is required per `spec/cruise-mode-dm-delivery/features.md`.

**Freelancer notification preview:**
"[Company Name] expressed interest in your profile" — tap opens the full AI outreach message in Messages.

---

### Module 5 — TalentSearch Activity Feed

A dedicated `/talent-search` page showing the employer:
- Current rule set status (active / dry run / inactive)
- Today's stats: profiles evaluated, messages sent, profiles skipped
- Hours used today vs daily limit
- Full activity log: each freelancer evaluated, score, decision, message sent or reason skipped
- On/Off toggle to manually activate and deactivate TalentSearch
- Per-entry: "Send follow-up" button to add a human message on top of the AI-initiated one

---

### Module 6 — Rule Parsing from Text/File

The employer can paste free-form text or upload a `.md` / `.txt` file. The AI parses it into the structured rule schema. The result is shown as a preview:

```
AI parsed your rules:
✅ Profession category:    Education — School Teacher
✅ Required skills:        GCSE Mathematics, A-Level Physics
✅ Rate range:             £100–£200/day
✅ Location:               Manchester, UK (within 15km)
✅ Requires DBS check:     Yes
⚠ No availability date found — TalentSearch will match any available freelancer
⚠ No experience minimum specified — all experience levels will be considered

[Edit rules]  [Confirm and activate]
```

---

## New Database Tables

### `talent_search_configs`
| Column | Type | Description |
|---|---|---|
| `id` | text PK | UUID |
| `employerId` | text FK → employer_profiles.id | Owner |
| `isActive` | boolean | Manually controlled on/off — no auto-shutoff |
| `isDryRun` | boolean | Dry run mode — evaluate but never send |
| `rules` | jsonb | Full structured rule set (see Module 1) |
| `rulesVersion` | integer | Increments on each save |
| `rawRulesText` | text nullable | Original text if parsed from file |
| `hoursUsedToday` | decimal(4,2) | AI evaluation hours consumed today |
| `dailyLimitHours` | decimal(4,2) | Daily usage cap — default 6.0 |
| `hoursResetAt` | timestamptz | Midnight UTC reset timestamp |
| `activatedAt` | timestamptz nullable | When last manually activated |
| `deactivatedAt` | timestamptz nullable | When last manually deactivated |
| `deletedAt` | timestamptz nullable | Soft delete — GDPR only |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

UNIQUE constraint on `employerId` — one config per employer.

### `talent_search_activity`
| Column | Type | Description |
|---|---|---|
| `id` | text PK | UUID |
| `employerId` | text FK → employer_profiles.id | Owner |
| `freelancerId` | text FK → freelancer_profiles.id | The freelancer evaluated |
| `rulesVersion` | integer | Which rules version was used |
| `score` | integer | 0–100 match score |
| `decision` | text | `sent` / `skipped` / `dry_run_would_send` / `dry_run_skipped` / `blackout` / `duplicate` / `daily_limit_reached` / `talent_search_off` |
| `matchReasons` | jsonb | Matched / concerns / blockers arrays |
| `proposedMessage` | text nullable | The message sent to the freelancer |
| `sentAt` | timestamptz nullable | When notification was sent |
| `skippedReason` | text nullable | Human-readable skip reason |
| `employerFollowUpSent` | boolean | Whether employer sent a manual follow-up |
| `createdAt` | timestamptz | |

Indexes: `employerId`, composite `(employerId, freelancerId)` for duplicate check.

---

## API Routes

```
GET  /api/talent-search                          Get current employer config + status
POST /api/talent-search                          Create or update config + rules
PATCH /api/talent-search/activate                Manually turn ON (live mode)
PATCH /api/talent-search/dry-run                 Turn ON in dry run mode
PATCH /api/talent-search/deactivate              Manually turn OFF

POST /api/talent-search/parse-rules              AI parses free-form text into structured rules
GET  /api/talent-search/activity                 Paginated activity feed
GET  /api/talent-search/activity/:id             Single activity entry detail
POST /api/talent-search/activity/:id/follow-up   Send human follow-up for an activity entry

GET  /api/talent-search/stats                    Today's stats (evaluated, sent, skipped, hours used)
```

All routes require `userRole === 'employer'`. Freelancers receive 403 on all `/api/talent-search/*` routes.

---

## Plan Gating

### For Testing — All Employer Plans
During the testing phase, TalentSearch is available to all employer plans including `employer_starter`. This allows the feature to be validated without requiring a plan upgrade.

| Plan | Available | Daily limit |
|---|---|---|
| `employer_starter` | ✅ (testing) | 6 hours/day |
| `employer_growth` | ✅ | 6 hours/day |
| `employer_enterprise` | ✅ | 6 hours/day |

### How the Daily 6-Hour Limit Works

Identical model to Cruise Mode:

- The employer **manually turns TalentSearch ON** via the toggle on `/talent-search`
- The employer **manually turns TalentSearch OFF** when they want to stop
- While ON, every AI evaluation (Stage 2 GPT call) deducts elapsed processing time from `hoursUsedToday`
- Stage 1 pre-filter rejections cost zero time — only Stage 2 AI calls count
- At midnight UTC, `hoursUsedToday` resets to 0 for all employers
- If `hoursUsedToday >= dailyLimitHours`, evaluations fire but are logged as `daily_limit_reached` and no messages are sent
- **There is no automatic deactivation** — `isActive` only changes via manual toggle

### Future — Production Plan
Once testing is complete, the 6 hours/day limit will be gated behind `employer_growth` and above. The `dailyLimitHours` column allows per-employer limit adjustments without a schema change.

---

## Non-Goals

- Automated booking creation on behalf of the employer (TalentSearch only sends interest, never books)
- Automated agreement signing (TalentSearch never initiates a booking or signs anything)
- Automated rate negotiation (TalentSearch never proposes or counter-proposes rates)
- Contacting freelancers outside TalentLock (email, LinkedIn, WhatsApp)
- Multiple concurrent TalentSearch configs per employer (one config, always)
- Cruise Mode for freelancers — that is a separate feature (`specs/cruise-mode/`)
- TalentSearch accessing freelancer data outside TalentLock
- Auto-deactivating TalentSearch when daily limit is reached (always manual control)

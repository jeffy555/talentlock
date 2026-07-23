# TalentLock — Features Specification: Cruise Mode

## Overview

Freelancers miss jobs every day — not because they are unqualified, but because they were asleep, in a meeting, or simply overwhelmed. When an employer posts a job on TalentLock, the first few freelancers to respond with a compelling message are the ones who get shortlisted. A freelancer who responds 8 hours later is invisible.

**Cruise Mode** solves this. The freelancer defines a set of rules — what skills they want to work with, their acceptable rate range, their availability window, and any hard exclusions (e.g. no crypto, no adult content). They write these rules once, in plain English or a markdown file, and activate Cruise Mode manually. From that point on, when a new job is posted that matches their rules, TalentLock's AI:

1. Evaluates the job against the freelancer's rules
2. Scores the match (0–100)
3. If the score exceeds the freelancer's configured threshold, sends a personalised interest message to the employer **on behalf of the freelancer**
4. Notifies the freelancer immediately about what it sent and why
5. Logs everything in a transparent activity feed so the freelancer stays in control

The freelancer wakes up to a list of opportunities already in play — not a list of jobs they missed.

---

## My Improvement Suggestions (Added to Core Spec)

Beyond the original brief, the following enhancements make Cruise Mode significantly more powerful and trustworthy:

**1. Rule Parsing from Natural Language or Markdown File**
The freelancer can write rules in free-form text ("I want React projects, $80–$120/hr, no contracts longer than 3 months") or upload a `.md` or `.txt` rules file. The AI parses this into a structured rule set and shows the freelancer a preview before activation.

**2. Match Scoring with Transparent Explanation**
Every time the AI evaluates a job, it produces a match score AND a plain-English explanation of why it matched or why it was skipped. The freelancer can see "Job X scored 87/100 — strong React match, rate within range, duration acceptable."

**3. Confidence Threshold Control**
The freelancer sets a minimum match score (e.g. 70/100). The AI only sends interest messages for jobs scoring above that threshold. Lower threshold = more messages. Higher threshold = fewer, more targeted.

**4. Dry Run Mode**
Before activating live messaging, the freelancer can run Cruise Mode in "Dry Run" — the AI evaluates all new jobs and shows what it would have sent, without actually sending anything. This builds trust before the freelancer goes fully autonomous.

**5. Message Tone Control**
The freelancer picks a default tone for AI-generated interest messages: Professional, Friendly, or Concise. The AI uses this when composing responses. Same options as the AI Proposal Generator for consistency.

**6. Daily Digest Notification**
Instead of one notification per job, the freelancer can opt into a daily digest: "Cruise Mode sent 3 messages today — here's a summary." Reduces notification noise for active freelancers.

**7. Employer Transparency Flag**
The employer notification clearly shows a "Cruise Mode ✦" badge so employers know this interest was AI-assisted. The message body reads naturally in the freelancer's voice — the badge is on the notification card, not inside the message.

**8. Blackout Windows**
The freelancer can configure time windows when Cruise Mode should NOT send messages (e.g. weekends, specific hours). This prevents the AI from sending messages at 3am that could appear unprofessional.

**9. Per-Job Override**
After Cruise Mode sends a message, the freelancer can review it and send a follow-up human message to supersede or augment it. This keeps the freelancer in control of the conversation after the AI initiates it.

**10. Rule Versioning**
Every time the freelancer updates their rules, the old version is saved. The activity log shows which rule version was active when each message was sent.

---

## Feature Modules

### Module 1 — Cruise Mode Rules Engine

The freelancer defines their rules via:
- **(A)** A structured form in the UI (skills, rate range, availability, exclusions)
- **(B)** Free-form text or markdown uploaded/pasted — the AI parses it into the structured form

The parsed rule set is stored as a structured JSON object in the `cruise_mode_configs` table. The freelancer reviews and confirms the parsed rules before activation.

**Rule schema:**
```ts
{
  requiredSkills: string[],      // e.g. ["React", "TypeScript"]
  preferredSkills: string[],     // e.g. ["Node.js", "GraphQL"]
  minRate: number,               // e.g. 80
  maxRate: number,               // e.g. 120
  availableFrom: string | null,  // ISO date
  availableTo: string | null,    // ISO date
  maxDurationWeeks: number | null,
  minDurationWeeks: number | null,
  excludedKeywords: string[],    // e.g. ["crypto", "adult", "gambling"]
  preferredFields: string[],     // e.g. ["React Development", "Frontend"]
  matchThreshold: number,        // 0-100, default 70
  messageTone: "professional" | "friendly" | "concise",
  blackoutWindows: {
    timezone: string,            // e.g. "Asia/Kolkata"
    windows: { start: string, end: string, days: number[] }[]
  },
  dryRun: boolean,               // true = evaluate but don't send
  dailyDigest: boolean,          // true = batch notifications
  rawRulesText: string,          // original free-form text if parsed
  version: number,               // increments on each save
}
```

---

### Module 2 — Job Evaluation Engine (Background Worker)

When a new job is posted (`POST /api/job-requirements`), after the job is saved, a background evaluation fires for all freelancers with Cruise Mode active.

For each active Cruise Mode freelancer:
1. Pull their rule set
2. Check blackout window — skip if currently in blackout
3. Check if the freelancer is already booked/unavailable
4. Evaluate the job against the rules using GPT
5. Get a match score (0–100) + explanation
6. If score ≥ threshold AND not dry run: send interest message
7. Log the evaluation result in `cruise_mode_activity`
8. Create a notification for the freelancer

The background evaluation runs fire-and-forget from the job creation handler — it must never slow down `POST /api/job-requirements`.

---

### Module 3 — AI Match Evaluation

The AI evaluates each job against the freelancer's rules:

**Inputs to the prompt:**
- Job title, description, required skills, budget/rate
- Freelancer's profile (skills, bio, field, rate, portfolio summary)
- Freelancer's Cruise Mode rules

**Output:**
```ts
{
  score: number,              // 0–100
  decision: "send" | "skip",
  reasons: {
    matched: string[],        // e.g. ["React skill match", "Rate within range"]
    concerns: string[],       // e.g. ["Duration slightly long"]
    blockers: string[],       // e.g. ["Contains excluded keyword: crypto"]
  },
  proposedMessage: string,    // The message to send if decision = "send"
}
```

---

### Module 4 — Interest Message Sending

When the AI decides to send:
1. A `bookings` record is NOT created — this is a pre-booking interest expression
2. A new `cruise_mode_activity` row is created with the full context
3. The AI `proposedMessage` is delivered as a **real direct message (DM)** in a `human_direct` conversation to the employer — see `spec/cruise-mode-dm-delivery/`
4. The employer receives a notification with a **"Cruise Mode ✦" badge** linking to the DM thread (`/messages/:conversationId`)
5. A `job_interests` row is created for employer job-management UX (unchanged)
6. The freelancer is notified: "Cruise Mode sent a message for [Job Title]" (activity feed confirmation)

**Implementation note (2026-07-23):** Notification-only delivery was the original behaviour; DM delivery is required per `spec/cruise-mode-dm-delivery/features.md`.

---

### Module 5 — Cruise Mode Activity Feed

A dedicated `/cruise-mode` page showing the freelancer:
- Current rule set status (active / dry run / inactive)
- Today's stats: jobs evaluated, messages sent, jobs skipped
- Full activity log: each job evaluated, score, decision, message sent or reason skipped
- On/Off toggle to manually activate and deactivate Cruise Mode
- Per-entry: "Send follow-up" button to add a human message on top of the AI one

---

### Module 6 — Rule Parsing from Text/File

The freelancer can paste free-form text or upload a `.md` / `.txt` file. The AI parses it into the structured rule schema. The result is shown as a preview:

```
AI parsed your rules:
✅ Required skills: React, TypeScript
✅ Rate range: $80–$120/hr
✅ Excluded keywords: crypto, gambling
⚠ No availability dates found — Cruise Mode will run indefinitely
⚠ Max duration not specified — any project length will be considered

[Edit rules]  [Confirm and activate]
```

---

## New Database Tables

### `cruise_mode_configs`
| Column | Type | Description |
|---|---|---|
| `id` | text PK | UUID |
| `freelancerId` | text FK → freelancer_profiles.id | Owner |
| `isActive` | boolean | Manually controlled on/off toggle — no auto-shutoff |
| `isDryRun` | boolean | Dry run mode — evaluate but never send |
| `rules` | jsonb | Full structured rule set (see Module 1) |
| `rulesVersion` | integer | Increments on each save |
| `rawRulesText` | text nullable | Original text if parsed from file |
| `hoursUsedToday` | decimal(4,2) | Hours consumed today (resets at midnight UTC) |
| `dailyLimitHours` | decimal(4,2) | Daily usage cap — default 6.0 for testing (all plans) |
| `hoursResetAt` | timestamptz | When hoursUsedToday resets — midnight UTC each day |
| `activatedAt` | timestamptz nullable | When last manually activated |
| `deactivatedAt` | timestamptz nullable | When last manually deactivated |
| `deletedAt` | timestamptz nullable | Soft delete — GDPR only |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

### `cruise_mode_activity`
| Column | Type | Description |
|---|---|---|
| `id` | text PK | UUID |
| `freelancerId` | text FK | Owner |
| `jobRequirementId` | text FK → job_requirements.id | The job evaluated |
| `rulesVersion` | integer | Which rules version was used |
| `score` | integer | 0–100 match score |
| `decision` | text | `sent` / `skipped` / `dry_run_would_send` / `dry_run_skipped` / `blackout` / `duplicate` / `daily_limit_reached` / `cruise_mode_off` |
| `matchReasons` | jsonb | Matched / concerns / blockers arrays |
| `proposedMessage` | text nullable | The message content |
| `sentAt` | timestamptz nullable | When message was sent |
| `skippedReason` | text nullable | Human-readable skip reason |
| `freelancerFollowUpSent` | boolean | Whether freelancer sent a follow-up |
| `createdAt` | timestamptz | |

---

## API Routes

```
GET  /api/cruise-mode                    Get current config + status
POST /api/cruise-mode                    Create or update config + rules
PATCH /api/cruise-mode/activate          Manually turn ON (live mode)
PATCH /api/cruise-mode/dry-run           Turn ON in dry run mode
PATCH /api/cruise-mode/deactivate        Manually turn OFF

POST /api/cruise-mode/parse-rules        AI parses free-form text into structured rules
GET  /api/cruise-mode/activity           Paginated activity feed
GET  /api/cruise-mode/activity/:id       Single activity entry detail
POST /api/cruise-mode/activity/:id/follow-up   Send human follow-up for an entry

GET  /api/cruise-mode/stats              Today's stats (evaluated, sent, skipped, hours used)
```

---

## Plan Gating

### For Testing — All Plans
During the testing phase, Cruise Mode is available to **all freelancer plans including `freelancer_free`**. This allows the feature to be tested without requiring a plan upgrade.

| Plan | Available | Daily limit |
|---|---|---|
| `freelancer_free` | ✅ (testing) | 6 hours/day |
| `freelancer_pro` | ✅ | 6 hours/day |

### Future — Production Plan
Once testing is complete, the 6 hours/day limit will be tied to a paid plan (enterprise or pro). The `dailyLimitHours` column on `cruise_mode_configs` makes this easy to change per user without a schema migration.

### How the Daily 6-Hour Limit Works

The 6-hour limit is a **usage budget**, not an auto-shutoff timer.

- The freelancer **manually turns Cruise Mode ON** via the toggle on `/cruise-mode`
- The freelancer **manually turns Cruise Mode OFF** when they want to stop
- While ON, every AI evaluation that completes deducts time from `hoursUsedToday`
- Each evaluation takes approximately 2–5 seconds of active processing — this is what counts as "used time"
- At midnight UTC, `hoursUsedToday` resets to 0 for all freelancers
- If `hoursUsedToday >= dailyLimitHours`, the evaluation fires but is logged as `daily_limit_reached` and no message is sent — the freelancer is notified once that their daily budget is exhausted
- **There is no automatic deactivation** — Cruise Mode stays ON even after the daily limit is reached. New jobs will be evaluated but skipped with `daily_limit_reached` until the next day's reset

### What "hours used" means precisely
Each full AI evaluation (Stage 2 — the GPT call) counts as time used. The duration is measured from when the OpenAI call starts to when it returns, recorded in seconds and converted to fractional hours. Pre-filter rejections (Stage 1) do NOT count against the daily budget — they cost no AI time.

### No auto-shutoff — always manual control
The freelancer is always in control of the ON/OFF state. The daily limit only prevents new messages from being sent after 6 hours of AI evaluation time is consumed. It does not change the `isActive` flag. The freelancer can leave Cruise Mode ON overnight and trust that it will stop sending after 6 hours of active processing without needing to remember to turn it off.

---

## Non-Goals

- Cruise Mode for employers (auto-booking freelancers — this would require payment)
- Automated agreement signing (Cruise Mode only sends interest messages, never signs)
- Automated rate negotiation (Cruise Mode never counter-proposes rates)
- Sending messages to platforms outside TalentLock
- Multiple concurrent Cruise Mode configs per freelancer (one config, always)
- CV/resume parsing as part of rules (rules are preferences, not credentials)
- Auto-deactivating Cruise Mode when daily limit is reached (always manual control)
- Cruise Mode acting as an AI agent for the full hiring workflow end-to-end
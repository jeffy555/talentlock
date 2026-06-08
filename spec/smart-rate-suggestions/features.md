# TalentLock — Features Specification: Smart Rate Suggestions

## Overview

When an employer creates a booking they enter a rate blind — they have no context for whether their proposed rate is fair, competitive, or likely to be accepted. Freelancers often counter-propose, starting a negotiation loop that delays agreement generation and increases dropout. A freelancer who sees a rate significantly below market may decline without countering.

This feature adds an AI-powered rate suggestion widget that appears at the moment an employer proposes a rate — on the booking creation form (`/freelancers/:id`) and the rate negotiation panel (`/bookings/:id`). It shows the employer: the freelancer's listed rate, the market median for freelancers in that field, their own historical average paid rate, and an AI-generated recommendation with a short plain-English explanation.

No new database tables required. Uses existing data from `freelancer_profiles`, `bookings`, and `job_requirements`. One new AI call per suggestion request — consumes from the employer's token quota.

---

## Feature Modules

### Module 1 — Rate Context Widget (Booking Creation)

On `/freelancers/:id`, when the employer reaches the rate input in the booking form, a context card appears below the rate field:

```
Rate guidance for React Development
────────────────────────────────────────────────────────
Freelancer's listed rate:   $85/hr
Market median (TalentLock): $78/hr
Your historical average:    $82/hr

AI suggestion: $83/hr
"Sarah's rate is slightly above market but in line
with your typical spend for React developers. The
3-month contract length makes this rate reasonable."

[Use suggested rate]   [Set my own rate]
```

The widget is non-blocking — the employer can ignore it and type any rate they want.

---

### Module 2 — Rate Context Widget (Negotiation Panel)

On `/bookings/:id`, during rate negotiation (when `negotiationStatus = 'negotiating'`), the same widget appears in the negotiation panel alongside the counter-proposal input. It updates dynamically if the employer changes the rate they are entering.

---

### Module 3 — AI Rate Recommendation Engine

A new endpoint `POST /api/ai/rate-suggestion` accepts:

```ts
{
  freelancerId: string,
  proposedRate?: number,         // optional — if provided, AI evaluates it
  jobRequirementId?: string,     // optional — context for the role
  bookingId?: string             // optional — for negotiation context
}
```

Returns:
```ts
{
  freelancerRate: number,
  marketMedian: number | null,
  yourHistoricalAvg: number | null,
  suggestedRate: number,
  explanation: string,           // 2–3 sentence plain English
  confidence: 'high' | 'medium' | 'low'
}
```

The backend:
1. Fetches the freelancer's listed rate
2. Calculates market median from `freelancer_profiles` for same `fieldOfWork` (≥ 3 freelancers required)
3. Calculates the employer's historical average from completed `bookings.proposedRate` for same field
4. Passes all three data points to GPT with the role context
5. Returns structured suggestion

Token label: `rate_suggestion`
Plan gating: Growth and Enterprise only — Starter employers see the static context card (rates only, no AI suggestion, no token consumption).

---

### Module 4 — "Use Suggested Rate" Action

Clicking "Use suggested rate" auto-fills the rate input with the AI-suggested value. The employer can still edit it before submitting. One click, no additional API call.

---

## Plan Gating

| Plan | Rate context card | AI suggestion | Token cost |
|---|---|---|---|
| `employer_starter` | ✅ Static (rates only) | ❌ | 0 |
| `employer_growth` | ✅ Full | ✅ | ~300 tokens |
| `employer_enterprise` | ✅ Full | ✅ | ~300 tokens |

Freelancers do not see this feature.

---

## Non-Goals

- Freelancer-facing rate suggestions (what to charge)
- Rate suggestions for milestone amounts
- Rate history chart or trend over time
- Rate suggestion in the Talent Vault (only at booking creation)
- Automatic rate setting without employer confirmation
- Currency conversion (USD only)

# TalentLock — Clarification & Verification: Post-Engagement AI Debrief

---

## ✅ Verified — Consistent with Existing Architecture

| Item | Verified Against |
|------|------------------|
| `bookings` table with `status` (`pending` \| `active` \| `completed` \| `cancelled`) | `lib/db/src/schema/bookings.ts` |
| `PATCH /api/bookings/:id` updates status and unlocks freelancer on `completed` | `artifacts/api-server/src/routes/bookings.ts` |
| `canAccessBooking()` in `accessControl.ts` | Auth Hardening spec — used on GET/PATCH booking |
| `milestones` table linked by `bookingId` | `lib/db/src/schema/milestones.ts` |
| `job_requirements` linked via `bookings.jobRequirementId` | `bookings` schema |
| `agreements` linked via `bookingId` | `project.md` |
| `reviews` — one per completed booking, employer-authored | Reviews & Ratings feature |
| `conversations` + `messages` with `bookingId` for human_direct threads | Messaging spec |
| `meetings.briefContent` / `briefGeneratedAt` cache pattern | AI Meeting Brief — direct template |
| `generateMeetingBrief()` fire-and-forget pattern | `meetingBriefGenerator.ts` |
| `logTokenUsage()` + `TokenFeature` union | `tokenLogger.ts` |
| `checkTokenQuota()` with `FOR UPDATE` | `subscriptionGating.ts` |
| `createNotification()` + `sendNotificationEmailAsync()` fire-and-forget | Established pattern |
| `sanitiseText()` for free-text writes | Security Hardening |
| OpenAPI → Orval codegen workflow | `project.md` |
| `pnpm --filter @workspace/db run verify-schema` pre-push | Credential Expiry / Watchlist specs |

---

## ❓ Open Questions — Must Be Resolved Before Implementation

### Q1 — Who Can Mark a Booking `completed`?

**Question:** The debrief fires on `status → completed`. Confirm which roles can set this status via `PATCH /api/bookings/:id`.

**Impact:** Determines whether both parties or only employer can trigger auto-debrief.

**Recommendation:** Inspect `UpdateBookingBody` and PATCH handler. If both employer and freelancer can complete, debrief fires regardless of who triggered — same as status notification today.

---

### Q2 — Should Message History Be Included in the AI Prompt?

**Question:** Human messages on the booking thread may contain sensitive content. Should they be included?

**Options:**
- **(A)** Exclude messages entirely — debrief uses only structured data (milestones, job, agreement metadata)
- **(B)** Include last N messages, truncated and sanitised
- **(C)** Include message count only, no content

**Recommendation: Option B.** Include last 10 human_direct messages for `bookingId`, each truncated to 500 chars after `sanitiseText()`. If no thread exists, omit section. Provides richer outcome summary without full conversation dump.

---

### Q3 — Single OpenAI Call or Two Calls for Employer + Freelancer Debrief?

**Question:** `debriefContent` stores both role-specific debriefs.

**Options:**
- **(A)** One prompt returning `{ employer, freelancer }` — lower cost, consistent narrative
- **(B)** Two sequential prompts — higher cost, more tailored per role

**Recommendation: Option A.** One structured JSON response with both objects. ~900–1,200 tokens total. Simpler error handling and one `logTokenUsage` entry.

---

### Q4 — Token Charge: Employer Only or Split?

**Question:** Freelancers also receive a debrief. Who pays the token cost?

**Recommendation:** Charge **employer account only** (same as `meeting_brief`). Freelancer view is free. Aligns with employer as AI feature consumer on the platform.

---

### Q5 — Plan Gating: Server-Side or UI-Only?

**Question:** `employer_starter` gets truncated debrief per `features.md`.

**Options:**
- **(A)** Server generates full debrief; UI hides sections 3–5 for starter
- **(B)** Server generates shorter prompt for starter

**Recommendation: Option A.** Matches Meeting Brief pattern. Minimal token savings from shorter prompt not worth dual code paths.

---

### Q6 — Regeneration Debounce

**Question:** Manual `POST /api/bookings/:id/debrief` could be abused for token farming.

**Recommendation:** Debounce manual regeneration to **once per booking per 24 hours** using `debriefRegeneratedAt`. Auto-trigger on first `completed` transition is always allowed (not debounced). Return `429` with `{ code: "DEBRIEF_REGEN_COOLDOWN" }` if within cooldown.

---

### Q7 — GDPR: What Happens to Debrief on Account Deletion?

**Question:** `debriefContent` may reference names and engagement details.

**Recommendation:** In `accountDeletion.ts`, set `debriefContent = null` and `debriefGeneratedAt = null` on all bookings where the deleted user participated. Do not anonymise in-place JSON — nullify entire column (simpler, no PII leakage in nested strings).

---

### Q8 — Relationship to Reviews

**Question:** If employer submits review **after** debrief is generated, should debrief auto-update?

**Recommendation:** **No auto-update.** Review status in debrief reflects state at generation time. User may manually regenerate once (subject to cooldown) to refresh. Avoids surprise overwrites and extra token spend.

---

## ⚠️ Risks & Notes

### Risk 1 — IDOR on Debrief Endpoints

`GET /api/bookings/:id/debrief` must use `canAccessBooking()` — lesson from agreement redline audit (any employer could read any agreement).

**Mitigation:** Return only the caller's role slice (`employer` or `freelancer`). Non-participant → 403. Unknown booking → 404.

### Risk 2 — Debrief Generated After Status Reverted

Booking marked `completed` then quickly changed back to `active` (edge case).

**Mitigation:** At start of `generateBookingDebrief()`, re-fetch booking. Exit if `status !== 'completed'`.

### Risk 3 — OpenAI Failure Leaves No Debrief

Same as Meeting Brief — `debriefContent` stays null.

**Mitigation:** Frontend shows "Generate debrief" button calling `POST /api/bookings/:id/debrief`. Fire-and-forget logs warning.

### Risk 4 — Agreement Content in Prompt

Including full agreement text could blow token budget and leak legal text into logs.

**Mitigation:** Pass only `agreement.status`, `employerSignedAt`, `freelancerSignedAt`, `fully_signed` boolean — never `agreement.content`.

### Risk 5 — Freelancer Sees Employer Internal Notes

Employer section includes `internalNotesTemplate`.

**Mitigation:** `GET /api/bookings/:id/debrief` returns **only** `debriefContent.freelancer` for freelancers and **only** `debriefContent.employer` for employers. Never return full `debriefContent` to client.

### Risk 6 — Token Quota Race

Concurrent debrief requests could both pass `checkTokenQuota`.

**Mitigation:** Accepted platform pattern (documented in subscription gating). Pre-check with `FOR UPDATE` before OpenAI call.

---

## Summary of Blockers

| # | Question | Must Resolve Before |
|---|----------|-------------------|
| Q1 | Who can set `completed` | Task 2.1 (hook placement) |
| Q2 | Message history in prompt | Task 2.2 (prompt builder) |
| Q3 | One vs two OpenAI calls | Task 2.2 (generator design) |
| Q4 | Token charge target | Task 2.2 + token logger |
| Q5 | Plan gating approach | Task 3.2 (UI) + plan.md D5 |
| Q6 | Regeneration debounce | Task 2.3 (POST route) |
| Q7 | GDPR nullification | Task 2.5 (accountDeletion) |
| Q8 | Review auto-refresh | plan.md D8 — no auto-refresh |

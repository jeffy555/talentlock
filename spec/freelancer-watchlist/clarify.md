# TalentLock — Clarification & Verification: Freelancer Watchlist

---

## Verified — Consistent with Existing Architecture

| Item | Verified Against |
|------|------------------|
| `saved_freelancers` table exists with `employerUserId`, `freelancerId`, `createdAt` | `lib/db/src/schema/savedFreelancers.ts` |
| UNIQUE on `(employerUserId, freelancerId)` | `savedFreelancers.ts` |
| `GET/POST /api/freelancers/saved` and toggle save routes exist | `artifacts/api-server/src/routes/savedFreelancers.ts` |
| OpenAPI documents saved-freelancer endpoints | `lib/api-spec/openapi.yaml` lines ~2172–2224 |
| Generated hooks: `useListSavedFreelancers`, `useToggleSaveFreelancer`, `useCheckFreelancerSaved` | `lib/api-client-react` |
| Heart icon + save toggle on Vault cards and detail page | `FreelancersList.tsx`, `FreelancerDetail.tsx` |
| Enterprise **Team Shortlist** is separate (`team_shortlist` table + `/api/team/shortlist`) | `team.ts`, `team-accounts-enterprise` spec |
| Enterprise UI disables personal saved list (`useListSavedFreelancers` enabled only when `!isTeamMember`) | `FreelancersList.tsx` |
| `createNotification()` fire-and-forget pattern | `createNotification.ts` |
| HTTP 402 `PLAN_LIMIT` pattern with `{ error, code, planNeeded }` | `bookings.ts`, `jobRequirements.ts` |
| `PUT /api/freelancers/me` recalculates completeness atomically | `freelancers.ts` |
| Auth: Clerk for employers; no custom auth | `project.md` |

---

## Gaps in Current Implementation (This Spec Closes)

| Gap | Current State | Spec Resolution |
|-----|---------------|-----------------|
| N+1 query on list | `Promise.all` per freelancer ID | Single JOIN in `plan.md` D2 |
| No `notes` field | Not in schema | Module 1 — `notes` column |
| No dedicated watchlist panel (non-enterprise) | Filter chip only, hidden when count = 0 | Module 3 — Watchlist tab |
| No change alerts | None | Module 5 — `WATCHLIST_UPDATE` notification |
| No plan limits | Unlimited saves | Module 2 — starter 25 / growth 100 |
| `savedAt` not in OpenAPI type | Returns `FreelancerProfile[]` with ad-hoc `savedAt` | `WatchlistItem` schema |
| Enterprise can still hit personal save API | No server-side team-member guard | `plan.md` D4 |
| No regression tests | Listed in `spec/api-testing/task.md` as unchecked | Module 6 |

---

## Open Questions

### Q1 — Product name: "Watchlist" vs "Shortlist"?

**Question:** The UI currently says "Shortlist". Enterprise uses "Team Shortlist". Should personal employers see "Watchlist" or "Shortlist"?

**Impact:** Copy across Vault tab, dashboard card, notifications, empty states.

**Recommendation:** Use **Watchlist** for the personal employer list (active pipeline monitoring). Keep **Team Shortlist** for enterprise shared list. Heart `aria-label`: "Add to watchlist" / "Remove from watchlist" (personal); "Add to team shortlist" (enterprise, unchanged).

---

### Q2 — Enterprise personal save API behaviour?

**Question:** Active `team_members` rows with `status = 'active'` — should `POST /api/freelancers/:id/save` be blocked server-side?

**Impact:** Prevents split-brain between personal and team lists if a client bypasses the UI.

**Recommendation:** Yes. Return `403 { error: "Use team shortlist for enterprise accounts" }` for active team members. `GET /api/freelancers/saved` returns `[]`.

---

### Q3 — Where to hook change-detection?

**Question:** Module 5 triggers on profile changes. Hook in `PUT /api/freelancers/me` route handler, or a shared utility called from there?

**Impact:** Must not block the profile save response.

**Recommendation:** Fire-and-forget `notifyWatchlistSubscribers(freelancerId, before, after).catch(...)` at the end of the successful `PUT /api/freelancers/me` handler, after the DB update. Same pattern as cruise-mode re-evaluation.

---

### Q4 — Rate change threshold?

**Question:** What counts as a "rate change" worth notifying?

**Impact:** Too sensitive → notification spam; too loose → missed signals.

**Recommendation:** Notify when `hourlyRate` or `dailyRate` changes by **≥ 5%** (relative) or when the rate type's value goes from `null` to a number. Ignore changes < 5%.

---

### Q5 — Notes editing UX: inline vs modal?

**Question:** Should notes be edited inline on the watchlist card or in a drawer/modal?

**Impact:** Phase 3 UI complexity.

**Recommendation:** Inline expand below the card footer — a small "Add note" / "Edit note" text button reveals a `<Textarea>` with Save/Cancel. Keeps users on the watchlist panel without navigation.

---

### Q6 — Dashboard card data source?

**Question:** New API endpoint vs reuse `GET /api/freelancers/saved` with `?limit=3`?

**Impact:** Extra round-trip on dashboard if full list is fetched.

**Recommendation:** Reuse `useListSavedFreelancers` on dashboard with client-side slice to 3 items. Watchlist counts are small (≤ 100). No new endpoint.

---

### Q7 — Deleted or Vault-hidden freelancers on watchlist?

**Question:** If a freelancer drops below 60% completeness or is removed from Vault (expired teaching licence), should they remain on the watchlist?

**Impact:** Stale cards in watchlist panel.

**Recommendation:** Keep them on the watchlist (employer explicitly saved them). Card shows a muted "No longer in Talent Vault" badge if `completenessScore < 60` or Vault exclusion applies. Profile detail (`GET /api/freelancers/:id`) still works for direct access.

---

## Risks & Notes

### Risk 1 — Notification storm on bulk profile edits

A freelancer saving their profile multiple times in one session could trigger repeated evaluations. Mitigated by `lastAlertAt` 24 h debounce per employer–freelancer pair.

### Risk 2 — Team member edge case during invite acceptance

A user transitioning from solo employer (with personal watchlist) to team member may have orphaned `saved_freelancers` rows. Non-blocking: rows remain in DB but are hidden (`GET` returns `[]`). No migration/delete in this phase.

### Risk 3 — FK integrity

`saved_freelancers.freelancerId` is not a formal FK to `freelancer_profiles.id` today. List endpoint must `LEFT JOIN` and filter out missing profiles gracefully (orphan rows silently skipped).

### Risk 4 — Route ordering

`GET /api/freelancers/saved` must be registered **before** `GET /api/freelancers/:id` to avoid `:id` capturing `"saved"`. Confirmed: already correct in `savedFreelancers.ts` router mount order.

---

## Summary of Blockers

| ID | Blocker | Gates |
|----|---------|-------|
| Q1 | UI naming | Phase 3 copy |
| Q2 | Enterprise API guard | Phase 2 routes |
| Q3 | Change-detection hook location | Phase 2 utility |
| Q4 | Rate threshold | Phase 2 utility |
| Q5 | Notes UX pattern | Phase 3 UI |
| Q6 | Dashboard data source | Phase 3 (no new API) |
| Q7 | Stale Vault cards | Phase 3 badge |

All resolved in `plan.md`; no open blockers remain for `task.md`.

# TalentLock — Clarification Audit: UI/UX Improvements

> Cross-check of `features.md` against `project.md` and the current frontend.
> All blockers must be resolved in `plan.md` before implementation.

---

## Verified Against `project.md`

| Claim in `features.md` | Verified? | Evidence |
|---|---|---|
| Frontend lives in `artifacts/talentlock/src/` | ✅ | `project.md` Architecture |
| Brand tokens navy / gold / cream already in CSS | ✅ | `index.css` `:root` — `--primary: 222 47% 11%`, `--gold: 44 52% 52%`, `--background: 40 30% 98%`; fonts Playfair + Plus Jakarta |
| No schema / API / OpenAPI work required | ✅ | Feature is frontend-only; exclusivity lock already shipped in Availability Calendar Module 8 + Phase 4b |
| Exclusivity locks on agreement fully-signed → booking `active` | ✅ | `project.md` Security review P1 closed 2026-07-12; Availability Calendar Module 8 + Phase 4b |
| Pending booking must not claim “locked” | ✅ | Current UI contradicts backend — `FreelancerDetail.tsx` success dialog says “locked in exclusively”; CTA “Confirm & Lock In” |
| Admin auth is separate HMAC cookie (`tl_admin`) | ✅ | `project.md` Auth; `AdminLogin.tsx` posts to `/api/admin/login` — visual polish only, no auth logic change |
| Vite proxies `/api` — no CORS work | ✅ | `project.md` |
| Specs live under `spec/` (not `specs/`) | ✅ | Repo folders: `spec/AvailabilityCalendar/`, etc. |
| shadcn `button` / `badge` / `input` / `empty` exist | ✅ | `artifacts/talentlock/src/components/ui/{button,badge,input,empty}.tsx` |
| `BrandLogo` does not exist yet | ✅ | Glob finds zero `BrandLogo*` files; logo inlined in `AppLayout.tsx` |
| Freelancer-facing pages should not change product logic | ✅ | Workspace rule; shared booking views may get copy/primitive swaps only |

---

## Open Questions

### Q1 — Scope of violet / purple purge

**Question:** Phase 1 lists Teaching Details + tokens. Module 6 wants zero new violet and replacement of remaining accents. Grep shows violet in `AppLayout`, `CruiseMode*`, `MatchExplanationCard`, `NotificationItem`, `PostJob`, `BookingDetail`, `FreelancersList`, `Onboarding`, `MeetingBriefCard`, and more. Is the full purge in-scope for this feature, or only Phase 1 files plus surfaces touched by later phases?

**Impact:** Determines task count and risk of drive-by edits across Cruise Mode / TalentSearch UIs.

**Recommendation:** Full purge of `violet-*` / `purple-*` under `artifacts/talentlock/src/` is **in scope**, executed across phases: Phase 1 (Teaching Details + Onboarding profession cards), Phase 3 (shared accent helpers + high-traffic components), Phase 4 (Talent Vault filter chips + AI triggers). Chart tokens and semantic success/danger greens stay.

---

### Q2 — `BrandLogo` adoption surface

**Question:** Replace logo in AppLayout, Landing, AdminLogin, and Clerk auth chrome — or only AppLayout + AdminLogin?

**Impact:** Landing and Clerk custom appearance in `App.tsx` already use inline navy/gold; touching Landing is a non-goal except “trivial BrandLogo”.

**Recommendation:** Mandatory: `AppLayout.tsx` + `AdminLogin.tsx`. Optional/trivial: Landing header if a duplicate Shield+wordmark block exists. Do **not** rewrite Clerk appearance object beyond leaving existing navy/gold values.

---

### Q3 — Exact exclusivity copy strings

**Question:** What are the final strings for success dialog, form description, CTA, footer, and BookingDetail pending status?

**Impact:** Product-truth; must not imply lock-on-request.

**Recommendation (binding candidates for `plan.md`):**

| Location | Current | Proposed |
|---|---|---|
| Success `DialogDescription` | `{name} is now locked in exclusively.` | `Booking request sent for {name}. Exclusivity locks after both parties sign the agreement.` |
| Form `DialogDescription` | `…to lock in this talent exclusively.` | `Set engagement dates and payment terms. Exclusivity activates when the agreement is fully signed.` |
| CTA button | `Confirm & Lock In` | `Confirm Booking Request` |
| Footer microcopy | `Booking generates a binding exclusivity agreement automatically.` | `Booking creates an agreement draft. Exclusivity locks once both parties have signed.` |
| BookingDetail pending | `Pending Exclusivity` + `Lock` icon | `Exclusivity Pending` + `Clock` icon (keep `ShieldCheck` + `Exclusivity Locked` for `active`) |
| CardDescription Engage Talent | `Secure this professional exclusively…` | `Request an exclusive engagement with this professional.` |

409 toast for truly locked talent may keep “locked in an exclusive engagement” — that path only fires when `isAvailable === false` / active lock.

---

### Q4 — Status badge API shape

**Question:** Extend existing `badge.tsx` CVA variants, or add a separate `StatusBadge` component?

**Impact:** Import churn across list/detail pages.

**Recommendation:** Add a thin `StatusBadge` at `artifacts/talentlock/src/components/StatusBadge.tsx` that wraps `Badge` with a `status` prop (`pending` \| `active` \| `cancelled` \| `completed` \| `negotiating` \| `locked`). Keeps shadcn `badge` generic; maps exclusivity “locked” only when booking is `active`.

---

### Q5 — Mobile AI collapse mechanism

**Question:** Default Sheet closed on `< md`, or collapse to a FAB / bottom sheet?

**Impact:** Job Description Assistant, Proposal Generator, and similar drawers.

**Recommendation:** Keep existing Sheet/Drawer components. On viewports `< md` (`useMediaQuery` or CSS + default `open={false}` for mobile-mounted assistants), do not auto-open; primary trigger remains the ghost “AI Assist” / Sparkles button. No new mobile navigation chrome. Do not change Accept-flow rules for AI output.

---

### Q6 — Phase model vs master doc Database → Backend → Frontend

**Question:** Master `spec.md` assumes Phase 1 = DB. This feature is frontend-only. How should agents interpret phase numbers?

**Impact:** Agent rules say “never start Phase 3 before Phase 2 codegen”.

**Recommendation:** This feature’s phases are **local** (1–5 as in `task.md`). There is no database or API phase. Skip codegen. `pnpm --filter @workspace/talentlock run typecheck` is the gate between phases. Document clearly in `plan.md` so agents do not look for OpenAPI work.

---

## Risks & Notes

| # | Risk | Severity | Notes |
|---|---|---|---|
| R1 | Copy change confuses users who believed lock-on-book | Medium | Expected; align with Module 8 Phase 4b truth. Tooltips optional — out of scope if not in copy table. |
| R2 | Broad violet grep edits regress Cruise Mode / TalentSearch | Medium | Replace colour classes only; do not change behaviour, hooks, or copy meaning. |
| R3 | `BrandLogo` a11y — decorative vs informative | Low | Use `aria-label="TalentLock"` on link/wrapper; hide decorative Shield with `aria-hidden`. |
| R4 | Empty-state copy changes freelancer list empty UX | Low | Shared booking/agreement empties are dual-role — keep role-neutral wording. |
| R5 | Agent expands into Landing marketing rewrite | Low | Non-goal; plan must forbid. |
| R6 | Conflicting “Pending Exclusivity” vs “Exclusivity Pending” | Low | Pick one string in plan and UI.md — recommend **Exclusivity Pending**. |

---

## Summary of Blockers

| ID | Blocks | Resolution required in `plan.md` |
|---|---|---|
| Q1 | Phase 1 / 3 / 4 accent tasks | Binding violet purge scope |
| Q2 | BrandLogo tasks | Adoption surface list |
| Q3 | Phase 2 copy tasks | Exact final strings |
| Q4 | Phase 3 badge tasks | StatusBadge vs badge variants |
| Q5 | Phase 4 mobile AI | Collapse behaviour |
| Q6 | All phases | Frontend-only phase model clarification |
| R2 | Accent sweep | Class-only edit rule |
| R5 | Phase 4 / Landing | Explicit non-touch list |

**Gate:** Zero open blockers once `plan.md` records decisions for Q1–Q6 and R1–R6.

# TalentLock — Implementation Tasks: UI/UX Improvements

> Execute phases in order. Frontend-only — no DB, OpenAPI, or codegen.
> Read `@project.md` `@spec/ui-ux-improvements/plan.md` `@spec/ui-ux-improvements/task.md` before coding.
> For Phases 3–5 also read `@spec/ui-ux-improvements/UI.md`.
> If this file conflicts with `plan.md`, **plan.md wins**.

---

## Phase 1 — Design tokens + BrandLogo + Teaching Details violet removal

### Task 1.1 — Confirm / document token source of truth

**Files:** `artifacts/talentlock/src/index.css`

**Actions:**
- Verify `:root` tokens match brand: primary `222 47% 11%`, gold `44 52% 52%`, background `40 30% 98%`, fonts Playfair + Plus Jakarta.
- Add a short comment block at the top of the LIGHT MODE section (if missing) stating: navy = primary actions; gold = brand accent; cream = page background; no violet/purple utilities in app chrome.
- Do not invent a parallel palette. Do not change chart or destructive semantics unless broken.

**Acceptance:**
- [x] Token values unchanged or only clarified via comments
- [x] `--color-gold` remains exposed to Tailwind

---

### Task 1.2 — Create `BrandLogo`

**Create:** `artifacts/talentlock/src/components/BrandLogo.tsx`

**Actions:**
- Implement per `plan.md` Q2 (props: `size`, `variant`, `showWordmark`, `className`).
- Shield icon uses `text-gold`; wordmark uses `font-serif`.
- Accessible name: `aria-label="TalentLock"`; icon `aria-hidden`.

**Acceptance:**
- [x] Component exports `BrandLogo` + `BrandLogoProps`
- [x] Renders correctly for `onDark` and `onLight`

---

### Task 1.3 — Wire `BrandLogo` into AppLayout

**Modify:** `artifacts/talentlock/src/components/layout/AppLayout.tsx`

**Actions:**
- Replace inline Shield + “TalentLock” span with `<BrandLogo variant="onDark" size="md" />`.
- Preserve existing link/navigation wrapper behaviour.

**Acceptance:**
- [x] Sidebar/header shows BrandLogo
- [x] No duplicate wordmark text beside it

---

### Task 1.5 — Left Sidebar App Shell (addendum 2026-07-15)

**Modify:** `artifacts/talentlock/src/components/layout/AppLayout.tsx`

**Actions:**
- Replace crowded top horizontal nav with fixed left sidebar (`md+`) + slim top bar (bell + account).
- Group items: Workspace vs Intelligence; full labels always visible in sidebar.
- Hover / active states per `UI.md` (gold rail, translate, icon scale).
- Mobile: left drawer + overlay; hamburger on top bar.
- Keep Messages → chat box; BrandLogo in sidebar; floating chat box unchanged.

**Acceptance:**
- [x] Desktop does not show a dense top-nav strip of primary routes
- [x] Every nav item shows icon + label on the left
- [x] Hover and active states are visually distinct
- [x] Mobile drawer opens/closes without trapping scroll incorrectly
- [x] `pnpm --filter @workspace/talentlock run typecheck` passes

---

### Task 1.4 — Remove violet from Teaching Details + Onboarding profession cards

**Modify:**
- `artifacts/talentlock/src/components/onboarding/TeachingDetailsSection.tsx`
- `artifacts/talentlock/src/pages/Onboarding.tsx`

**Actions:**
- Replace all `violet-*` / `purple-*` classes with primary/gold/secondary per `plan.md` Q1 map.
- Teaching Details: navy/gold border + cream/secondary header (e.g. `border-primary/20`, `bg-primary/5`, `text-primary`).

**Acceptance:**
- [x] `rg "violet-|purple-" artifacts/talentlock/src/components/onboarding/TeachingDetailsSection.tsx` → no matches
- [x] `rg "violet-|purple-" artifacts/talentlock/src/pages/Onboarding.tsx` → no matches
- [x] `pnpm --filter @workspace/talentlock run typecheck` passes

---

## Phase 2 — Exclusivity copy alignment

### Task 2.1 — FreelancerDetail booking dialog copy

**Modify:** `artifacts/talentlock/src/pages/FreelancerDetail.tsx`

**Actions:** Apply binding strings from `plan.md` Q3:
- CardDescription, form DialogDescription, CTA, success DialogDescription, footer microcopy.
- Optional: success icon `CheckCircle2` instead of `ShieldCheck`.
- Do not change booking create mutation, 409 handling behaviour, or unavailable button logic.

**Acceptance:**
- [x] No string containing “locked in exclusively” on pending success path
- [x] CTA is `Confirm Booking Request` (not `Confirm & Lock In`)
- [x] Footer mentions agreement draft / both parties signed

---

### Task 2.2 — BookingDetail pending vs locked status line

**Modify:** `artifacts/talentlock/src/pages/BookingDetail.tsx`

**Actions:**
- `active` → `Exclusivity Locked` + `ShieldCheck` (keep).
- Non-active exclusivity line → `Exclusivity Pending` + `Clock` (replace `Pending Exclusivity` + `Lock`).
- Sparkles violet class may wait for Phase 3 if preferred, but must not say locked for pending.

**Acceptance:**
- [x] Pending never shows Lock icon for exclusivity line
- [x] Active still shows Exclusivity Locked

---

### Task 2.3 — FreelancersList copy audit

**Modify:** `artifacts/talentlock/src/pages/FreelancersList.tsx`

**Actions:**
- Audit for lock-on-request language; remove/reword if present.
- Keep true-lock “Booked” / unavailable badges when `isAvailable === false`.
- Violet filter chip classes deferred to Task 4.2 if not touching colours here — but do not introduce new violet.

**Acceptance:**
- [x] Available freelancers are not labelled “locked”
- [x] Booked state still communicates unavailability

---

### Task 2.4 — Phase 2 typecheck

```bash
pnpm --filter @workspace/talentlock run typecheck
```

**Acceptance:**
- [x] Typecheck passes

---

## Phase 3 — Shared primitives + accent governance

### Task 3.1 — `StatusBadge` component

**Create:** `artifacts/talentlock/src/components/StatusBadge.tsx`

**Actions:** Implement per `plan.md` Q4.

**Acceptance:**
- [x] Supports `pending` | `active` | `locked` | `cancelled` | `completed` | `negotiating`
- [x] No violet in styles

---

### Task 3.2 — Button / input focus consistency (minimal)

**Modify (only if needed):**
- `artifacts/talentlock/src/components/ui/button.tsx`
- `artifacts/talentlock/src/components/ui/input.tsx`
- `artifacts/talentlock/src/components/ui/badge.tsx`

**Actions:**
- Ensure default focus rings use primary navy, not violet.
- Do not fork a second button library.

**Acceptance:**
- [x] No `violet` / `purple` in these ui files
- [x] Existing variants still typecheck

---

### Task 3.3 — Empty state compositions on list pages

**Modify (as applicable):**
- `artifacts/talentlock/src/pages/FreelancersList.tsx`
- `artifacts/talentlock/src/pages/BookingsList.tsx`
- `artifacts/talentlock/src/pages/AgreementsList.tsx`
- `artifacts/talentlock/src/pages/MeetingsList.tsx` (if exists)
- Notification empty UI if a dedicated empty block exists

**Actions:**
- Use `Empty` / `EmptyHeader` / `EmptyMedia` / `EmptyTitle` / `EmptyDescription` from `ui/empty.tsx`.
- Copy from `UI.md` empty-state table.

**Acceptance:**
- [x] Touched empty states match `UI.md` strings
- [x] Dashed border / centred layout consistent

---

### Task 3.4 — Accent governance sweep (high-traffic violet)

**Modify (colour classes only):**
- `artifacts/talentlock/src/components/layout/AppLayout.tsx`
- `artifacts/talentlock/src/components/MatchExplanationCard.tsx`
- `artifacts/talentlock/src/components/NotificationItem.tsx`
- `artifacts/talentlock/src/components/meetings/MeetingBriefCard.tsx`
- `artifacts/talentlock/src/pages/PostJob.tsx`
- `artifacts/talentlock/src/pages/BookingDetail.tsx` (Sparkles / AI accents)
- `artifacts/talentlock/src/pages/CruiseMode.tsx`
- `artifacts/talentlock/src/components/cruise-mode/CruiseModeStatusBar.tsx`
- `artifacts/talentlock/src/components/cruise-mode/CruiseModeActivityFeed.tsx`
- `artifacts/talentlock/src/components/cruise-mode/CruiseModeRuleBuilder.tsx`
- Any other files still matching `violet-|purple-` under `artifacts/talentlock/src/`

**Actions:** Apply Q1 replacement map. Behaviour unchanged.

**Acceptance:**
- [x] `rg -n "violet-|purple-" artifacts/talentlock/src --glob '*.{tsx,ts,css}'` returns **zero** matches
- [x] `pnpm --filter @workspace/talentlock run typecheck` passes

---

## Phase 4 — Dashboard hierarchy + Talent Vault polish + mobile AI collapse

### Task 4.1 — Dashboard visual hierarchy

**Modify:** `artifacts/talentlock/src/pages/Dashboard.tsx`

**Actions:**
- Primary KPI row visually dominant; secondary analytics (Spend / Hiring / Earnings) below with quieter chrome.
- Serif section titles (`font-serif`).
- Reduce competing heavy shadows/borders; prefer `border-border` + light elevation.
- Do not change data hooks, charts data, or role gating.

**Acceptance:**
- [x] Employer and freelancer dashboards still render their panels
- [x] Clearer primary vs secondary hierarchy on desktop and mobile

---

### Task 4.2 — Talent Vault page chrome

**Modify:** `artifacts/talentlock/src/pages/FreelancersList.tsx`

**Actions:**
- Page title: Playfair / `font-serif`, brand-aligned.
- Filter chrome polish; replace any remaining violet active filter chips with primary/gold.
- No new filter logic; no API changes.

**Acceptance:**
- [x] Vault reads as brand-aligned
- [x] Filters still work (`q`, `availableFrom`, profession filters if present)

---

### Task 4.3 — Mobile AI collapse

**Modify:** AI assistant entry points as listed in `plan.md` Q5 (Job Description Assistant, Proposal Generator, match panels that auto-open).

**Optional create:** `artifacts/talentlock/src/hooks/useMediaQuery.ts` if not present.

**Actions:**
- Ensure sheets/drawers default closed; force closed when viewport `< md` if something auto-opens.
- Preserve `onAccept` rules — never write AI output into form state until Accept.

**Acceptance:**
- [x] On a &lt;768px viewport, primary form remains usable without an open AI drawer covering it
- [x] User can still open assistant via explicit control

---

### Task 4.4 — Phase 4 typecheck

```bash
pnpm --filter @workspace/talentlock run typecheck
```

**Acceptance:**
- [x] Typecheck passes

---

## Phase 5 — Admin login brand alignment

### Task 5.1 — AdminLogin BrandLogo + chrome

**Modify:** `artifacts/talentlock/src/pages/AdminLogin.tsx`

**Actions:**
- Replace “A” monogram block with `<BrandLogo variant="onLight" size="lg" />`.
- Keep HMAC login flow, CSRF header, credentials `include`, and toast behaviour unchanged.
- Cream background already via `bg-background` — keep; ensure card uses navy/gold accents consistently (`border-primary/10`, serif title).

**Acceptance:**
- [x] Admin login shows TalentLock BrandLogo
- [x] Login still succeeds / fails as before (no auth logic edits)
- [x] `pnpm --filter @workspace/talentlock run typecheck` passes

---

## Dependency order

```
1.1 → 1.2 → 1.3 → 1.4
         ↓
        2.1 → 2.2 → 2.3 → 2.4
         ↓
        3.1 → 3.2 → 3.3 → 3.4
         ↓
        4.1 → 4.2 → 4.3 → 4.4
         ↓
        5.1
         ↓
     validation.md
```

---

## Flat acceptance checklist

- [x] `BrandLogo` exists and is used in AppLayout + AdminLogin
- [x] Teaching Details / Onboarding have no violet/purple classes
- [x] Repo `artifacts/talentlock/src` has zero `violet-` / `purple-` matches
- [x] Pending booking UI never claims exclusivity is locked
- [x] Active booking still shows Exclusivity Locked
- [x] FreelancerDetail CTA is Confirm Booking Request
- [x] StatusBadge exists with documented variants
- [x] Empty states on touched lists use shared Empty primitives + UI.md copy
- [x] Dashboard hierarchy improved without data/logic changes
- [x] Talent Vault chrome brand-aligned; filters unchanged functionally
- [x] Mobile AI assistants do not auto-cover primary forms
- [x] Admin login branded; auth behaviour unchanged
- [x] `pnpm --filter @workspace/talentlock run typecheck` passes
- [x] No schema, OpenAPI, or API route files modified
- [x] Landing marketing rewrite not done (BrandLogo-only if touched)

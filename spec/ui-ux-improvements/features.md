# TalentLock — Features Specification: UI/UX Improvements

## Overview

TalentLock’s product surfaces already work — auth, bookings, exclusivity lock (Availability Calendar Module 8 + Phase 4b), Talent Vault, AI assistants, and admin HMAC login are all shipped. What remains is **design-system polish**: inconsistent tokens (hardcoded violet/purple accents), fragmented logo markup, exclusivity copy that still says “locked” while a booking is only `pending`, one-off empty states, uneven page hierarchy on Dashboard / Talent Vault, and feature UIs that invent their own accent colours.

This feature is a **frontend-only P2-style design refactor**. It does not add tables, API routes, OpenAPI changes, Stripe, or email. It aligns visual language to the established brand (navy / gold / cream + Playfair + Plus Jakarta) and corrects product-truth copy so UI claims match backend exclusivity rules.

Sibling precedent: Availability Calendar Module 8 + Phase 4b locks availability only when the agreement is **fully signed** → booking `active`. Pending bookings must never claim exclusivity is locked.

---

## Module 1 — Design Token Consolidation

**The problem:** `artifacts/talentlock/src/index.css` already defines navy primary (`222 47% 11%`), gold (`44 52% 52%`), cream background (`40 30% 98%`), and font stacks — but many components still hardcode Tailwind `violet-*` / `purple-*` utilities (notably onboarding Teaching Details, and scattered AI panels). Ad-hoc hex colours and one-off borders fight the token system.

**What it builds:**
- Audit and consolidate CSS variables in `index.css` so semantic tokens (`--primary`, `--gold`, `--background`, `--muted`, status colours) are the only approved colour sources for app chrome.
- Remove or replace every `violet-*` / `purple-*` class in scoped files for this feature (Phase 1 targets: `index.css`, onboarding Teaching Details; later phases finish remaining surfaces under accent governance).
- Document token usage rules for implementers (primary = navy actions; gold = brand accent / highlights; cream = page background; destructive = errors only).

**Plan gating:** N/A — visual only.

---

## Module 2 — Branding Chrome (`BrandLogo`)

**The problem:** App shell, landing, and admin login each inline logo markup differently (Shield icon + “TalentLock” serif text). Sizing, colour (white-on-navy vs navy-on-cream), and accessibility labels drift.

**What it builds:**
- A shared `BrandLogo` React component at `artifacts/talentlock/src/components/BrandLogo.tsx`.
- Props for size (`sm` | `md` | `lg`), colour variant (`onDark` | `onLight`), and optional `showWordmark`.
- Replace duplicated logo blocks in `AppLayout`, `Landing` (as needed), and `AdminLogin` with `BrandLogo`.
- Wordmark uses Playfair (`font-serif`); icon remains Lucide `Shield` with gold accent on the lock/shield detail where appropriate.

**Plan gating:** N/A.

---

## Module 3 — Exclusivity Copy Alignment

**The problem:** Backend exclusivity (Availability Calendar Module 8 Phase 4b) locks the freelancer only when the agreement is **fully signed** and the booking becomes `active`. The UI still tells employers the talent is “locked in exclusively” immediately after creating a **pending** booking, and Booking Detail shows “Pending Exclusivity” with a Lock icon that reads as already locked. Talent Vault “Booked” / lock badges are fine when `isAvailable === false` (true lock), but booking-flow copy is wrong.

**What it builds:**
- Rewritten user-facing strings on:
  - `artifacts/talentlock/src/pages/FreelancerDetail.tsx` — success dialog, form description, CTA, footer microcopy
  - `artifacts/talentlock/src/pages/BookingDetail.tsx` — status line for non-active bookings
  - `artifacts/talentlock/src/pages/FreelancersList.tsx` / `BookingsList.tsx` — any copy that implies lock-on-request
- Canonical language:
  | Booking / agreement state | Allowed copy |
  |---|---|
  | Booking `pending`, agreement not fully signed | “Exclusivity pending”, “Request sent”, “Awaiting agreement signatures” — **never** “locked” / “exclusivity locked” |
  | Booking `active` (fully signed path) | “Exclusivity locked”, ShieldCheck icon OK |
  | Cancelled / completed | Existing cancelled/complete copy |
- Toast / 409 `FREELANCER_UNAVAILABLE` copy may still say the freelancer is locked in an exclusive engagement — that is true for **active** locks only.

**Plan gating:** N/A — copy only; no API change.

---

## Module 4 — Shared UI Primitives

**The problem:** Buttons, inputs, badges, and empty states are used inconsistently — some pages compose raw Tailwind; empty states reinvent icon + message blocks; status badges use ad-hoc colour maps.

**What it builds:**
- Thin TalentLock wrappers / variant extensions on existing shadcn primitives under `artifacts/talentlock/src/components/ui/` (prefer extending `button.tsx`, `badge.tsx`, `input.tsx`, `empty.tsx` rather than parallel files unless a page-level composition helper is clearer).
- Standard **status badge** variants: `pending`, `active` / `locked`, `cancelled`, `completed`, `negotiating` — navy/gold/slate/destructive mappings documented in `UI.md`.
- Standard **empty state** compositions with approved copy table (Vault, Bookings, Agreements, Meetings, Notifications).
- No new design library; stay on existing CVA + `cn()` patterns.

**Plan gating:** N/A.

---

## Module 5 — Page Hierarchy & Surface Polish

**The problem:** Dashboard metric cards compete equally for attention; Talent Vault page chrome feels utilitarian vs brand-first; AI drawers / panels on small viewports crowd primary content.

**What it builds:**
- **Dashboard** (`Dashboard.tsx`): clearer visual hierarchy — primary KPI row, secondary analytics below; serif section titles; reduced competing borders/shadows; consistent card padding.
- **Talent Vault** (`FreelancersList.tsx`): hero-level page title treatment (Playfair), cream/navy/gold alignment, filter chrome polish without adding new filter logic.
- **Mobile AI collapse**: AI assistant drawers / side panels (Job Description Assistant, Proposal Generator, match panels as encountered) collapse or default closed on viewports `< md` so primary forms remain usable; expand via explicit control.
- Does **not** change freelancer-facing page behaviour beyond shared chrome/copy unless a shared primitive forces a trivial import swap.

**Plan gating:** N/A.

---

## Module 6 — Feature Accent Governance

**The problem:** Feature modules (Cruise Mode, Teaching Details, AI panels, redlining, notifications) introduced one-off accent colours (especially violet). Brand rule: navy + gold only for feature accents; soft cream/secondary for surfaces; semantic greens/reds only for success/danger.

**What it builds:**
- Binding rule: **no new `violet-*` / `purple-*` classes** in `artifacts/talentlock/src/`.
- Replace remaining violet accents in in-scope files with `primary`, `gold`, `secondary`, or `muted` equivalents.
- Teaching Details section restyled to navy/gold border + cream header (Phase 1).
- Document exception policy: chart series may use `--chart-*` tokens; verification / health score greens stay semantic.

**Plan gating:** N/A.

---

## Explicit Non-Goals

- No database schema changes, migrations, or backfills
- No OpenAPI / Orval codegen / new API routes
- No Stripe, email, or billing changes
- No changes to exclusivity **backend** rules (Module 8 Phase 4b remains source of truth)
- No freelancer accept/decline booking state machine
- No full design-system rewrite or new component library
- No dark-mode redesign beyond existing CSS variables
- No Landing page marketing rewrite (only shared `BrandLogo` if trivial)
- Do not modify freelancer-facing product logic unless required for shared primitive imports or exclusivity copy accuracy on shared booking views

---

## Success Criteria

1. Grep for `violet-` / `purple-` in Phase 1 scoped files returns zero matches; remaining repo violet is tracked and cleared under Module 6 / validation.
2. `BrandLogo` is the single logo component for AppLayout + AdminLogin.
3. Pending booking UI never claims exclusivity is locked; active bookings still show “Exclusivity Locked”.
4. Empty states and status badges on touched list pages use shared primitives / variants.
5. Dashboard and Talent Vault show clearer hierarchy and brand-aligned chrome.
6. Admin login visually matches main app brand (navy / gold / Playfair).
7. `pnpm --filter @workspace/talentlock run typecheck` passes.
8. Regression: Clerk auth, booking create (pending), exclusivity 409 on locked talent, agreement sign → active lock — all unchanged in behaviour.

---

## Dependencies

| Depends on | Why |
|---|---|
| Availability Calendar Module 8 + Phase 4b | Exclusivity lock semantics already shipped — this feature only aligns copy |
| Existing `index.css` brand tokens | Consolidation extends; does not invent a new palette |
| shadcn `ui/*` primitives | Extensions live on top of current components |

No dependency on incomplete backend features.

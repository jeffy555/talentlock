# TalentLock — Implementation Plan: UI/UX Improvements

> **Status: APPROVED — Ready for implementation**
> This file resolves every open question and risk from `clarify.md`.
> The Cursor Agent MUST read this file alongside `task.md` before writing any code.
> If this file and `task.md` ever conflict, this file wins.

---

## Feature phase model (read first)

This feature is **frontend-only**. There is:

- No database migration
- No OpenAPI / Orval codegen
- No API route work

Local phases in `task.md` are:

| Local phase | Focus |
|---|---|
| Phase 1 | Tokens + `BrandLogo` + Teaching Details / Onboarding violet removal |
| Phase 2 | Exclusivity copy alignment |
| Phase 3 | Shared primitives + high-traffic accent governance |
| Phase 4 | Dashboard hierarchy + Talent Vault polish + mobile AI collapse |
| Phase 5 | Admin login brand alignment |

Ignore the master-doc “Phase 1 = Database” numbering for this folder. Gate each local phase with:

```bash
pnpm --filter @workspace/talentlock run typecheck
```

---

## Pre-Implementation Checklist

Run before writing any code. Report findings.

```bash
# 1. Confirm brand tokens
grep -n "primary:\|gold:\|background:\|Playfair\|Plus Jakarta" artifacts/talentlock/src/index.css | head -40

# 2. Inventory violet / purple usage
rg -n "violet-|purple-" artifacts/talentlock/src --glob '*.{tsx,ts,css}'

# 3. Confirm BrandLogo does not exist
ls artifacts/talentlock/src/components/BrandLogo.tsx 2>/dev/null || echo "BrandLogo missing — expected"

# 4. Confirm exclusivity copy hotspots
rg -n "locked in exclusively|Confirm & Lock In|Pending Exclusivity|lock in this talent" \
  artifacts/talentlock/src/pages/FreelancerDetail.tsx \
  artifacts/talentlock/src/pages/BookingDetail.tsx \
  artifacts/talentlock/src/pages/FreelancersList.tsx

# 5. Confirm Module 8 Phase 4b lock semantics (backend — do not change)
rg -n "FREELANCER_UNAVAILABLE|fully.?signed|isAvailable" \
  artifacts/api-server/src/routes/bookings.ts \
  spec/AvailabilityCalendar/plan.md | head -30

# 6. Confirm ui primitives
ls artifacts/talentlock/src/components/ui/{button,badge,input,empty}.tsx

# 7. Confirm AdminLogin + AppLayout logo markup
rg -n "Shield|TalentLock|Admin Console" \
  artifacts/talentlock/src/components/layout/AppLayout.tsx \
  artifacts/talentlock/src/pages/AdminLogin.tsx
```

Document findings at the top of the first file you create/edit in Phase 1.

---

## Resolved Questions

### Q1 — Violet / purple purge scope

**Decision: Full purge of `violet-*` and `purple-*` under `artifacts/talentlock/src/` is in scope, phased.**

| Phase | Files (minimum) |
|---|---|
| 1 | `components/onboarding/TeachingDetailsSection.tsx`, profession-category cards in `pages/Onboarding.tsx` |
| 3 | `components/layout/AppLayout.tsx` (plan badge chips), `components/MatchExplanationCard.tsx`, `components/NotificationItem.tsx`, `components/meetings/MeetingBriefCard.tsx`, `pages/PostJob.tsx`, `pages/BookingDetail.tsx` (Sparkles only), `pages/CruiseMode.tsx`, `components/cruise-mode/*`, any TalentSearch display violet |
| 4 | `pages/FreelancersList.tsx` filter active chips |

**Replacement map (binding):**

| Old | New |
|---|---|
| `text-violet-500` / `600` / `700` / `800` | `text-primary` or `text-gold` (icons/highlights → gold; body emphasis → primary) |
| `bg-violet-50` / `100` | `bg-primary/5` or `bg-secondary` |
| `border-violet-200` / `300` / `400` | `border-primary/20` or `border-gold/40` |
| `bg-violet-600 hover:bg-violet-700` | `bg-primary hover:bg-primary/90` (or `bg-gold text-gold-foreground` only for rare brand CTAs — prefer primary) |
| `ring-violet-*` | `ring-primary/20` |

**Exceptions (do not “fix”):**

- `--chart-*` series colours
- Semantic greens/reds/ambers for success, destructive, warning, scores
- Third-party brand colours (e.g. Google Calendar blue `#4285F4`)

**Rule:** Colour-class-only edits. No behaviour, hook, or API changes while sweeping accents.

---

### Q2 — `BrandLogo` adoption

**Decision: Mandatory in AppLayout + AdminLogin. Landing only if a duplicate Shield+wordmark block is trivial to swap. Do not rewrite Clerk appearance.**

**New file:** `artifacts/talentlock/src/components/BrandLogo.tsx`

```tsx
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  variant?: "onDark" | "onLight";
  showWordmark?: boolean;
  className?: string;
};

const sizeMap = {
  sm: { icon: "h-4 w-4", text: "text-base", gap: "gap-1.5" },
  md: { icon: "h-5 w-5", text: "text-lg", gap: "gap-2" },
  lg: { icon: "h-7 w-7", text: "text-2xl", gap: "gap-2.5" },
} as const;

export function BrandLogo({
  size = "md",
  variant = "onDark",
  showWordmark = true,
  className,
}: BrandLogoProps) {
  const s = sizeMap[size];
  const wordmark =
    variant === "onDark" ? "text-white" : "text-primary";
  return (
    <span
      className={cn("inline-flex items-center", s.gap, className)}
      aria-label="TalentLock"
    >
      <Shield className={cn(s.icon, "text-gold shrink-0")} aria-hidden />
      {showWordmark && (
        <span className={cn("font-serif font-bold tracking-tight", s.text, wordmark)}>
          TalentLock
        </span>
      )}
    </span>
  );
}
```

**Integrations:**

- `AppLayout.tsx` — replace Shield + span block with `<BrandLogo variant="onDark" size="md" />`
- `AdminLogin.tsx` — replace “A” monogram with `<BrandLogo variant="onLight" size="lg" />` above title (or as title row); keep “Admin Console” as page heading

---

### Q3 — Exact exclusivity copy (binding)

**Decision: Use these strings verbatim. Never say “locked” for pending bookings.**

**File: `artifacts/talentlock/src/pages/FreelancerDetail.tsx`**

| Element | Binding copy |
|---|---|
| `CardDescription` (Engage Talent) | `Request an exclusive engagement with this professional.` |
| Form `DialogDescription` | `Set engagement dates and payment terms. Exclusivity activates when the agreement is fully signed.` |
| CTA (idle) | `Confirm Booking Request` |
| CTA (pending) | `Confirming...` (unchanged behaviour) |
| Success `DialogDescription` | `{freelancer.name} — booking request sent. Exclusivity locks after both parties sign the agreement.` |
| Success icon | Prefer `CheckCircle2` over `ShieldCheck` on pending success (optional but recommended) |
| Footer microcopy | `Booking creates an agreement draft. Exclusivity locks once both parties have signed.` |
| Unavailable button | `Currently Unavailable` (unchanged) |
| 409 toast description | Keep “locked in an exclusive engagement” — only for true lock |

**File: `artifacts/talentlock/src/pages/BookingDetail.tsx`**

| State | Binding UI |
|---|---|
| `booking.status === "active"` | `<ShieldCheck /> Exclusivity Locked` |
| else non-terminal (pending / negotiating path) | `<Clock /> Exclusivity Pending` |
| cancelled / completed | Existing status badges — do not use Lock for pending |

Replace `Pending Exclusivity` + `Lock` with `Exclusivity Pending` + `Clock`.

**File: `artifacts/talentlock/src/pages/FreelancersList.tsx`**

- Vault “Booked” / lock badge when `isAvailable === false` — **keep** (true lock).
- Do not add “locked” language to available cards or booking CTAs.
- Subtitle may stay: “Ready for exclusive engagements.” (does not claim lock-on-click).

**File: `BookingsList.tsx`** — only if copy implies lock-on-request; otherwise leave.

---

### Q4 — Status badge shape

**Decision: New `StatusBadge` wrapper component.**

**File:** `artifacts/talentlock/src/components/StatusBadge.tsx`

```tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusKind =
  | "pending"
  | "active"
  | "locked"
  | "cancelled"
  | "completed"
  | "negotiating";

const styles: Record<StatusKind, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  active: "bg-primary/10 text-primary border-primary/20",
  locked: "bg-primary text-primary-foreground border-primary",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  negotiating: "bg-secondary text-secondary-foreground border-border",
};

export function StatusBadge({
  status,
  children,
  className,
}: {
  status: StatusKind;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(styles[status], className)}>
      {children}
    </Badge>
  );
}
```

Map booking `active` exclusivity headline to `locked` or keep custom ShieldCheck row — do not label pending as `locked`.

Extend `button.tsx` / `input.tsx` only if needed for focus-ring consistency (`ring-primary`). Prefer using existing variants; document any new CVA variant in `UI.md`.

Empty states: compose existing `Empty*` from `ui/empty.tsx` with approved copy from `UI.md` on list pages touched in Phase 3–4.

---

### Q5 — Mobile AI collapse

**Decision: Assistants must not auto-open on viewports `< md`. Trigger button remains the only open control.**

Implementation guidance:

```tsx
// Prefer matching existing Sheet usage; default closed.
const [open, setOpen] = useState(false);

// If any code path auto-opens on mount for desktop helpers, gate it:
const isMdUp = useMediaQuery("(min-width: 768px)");
useEffect(() => {
  if (!isMdUp) setOpen(false);
}, [isMdUp]);
```

If no shared `useMediaQuery` exists, add a tiny hook at `artifacts/talentlock/src/hooks/useMediaQuery.ts` or use CSS (`hidden md:…`) without changing Accept rules.

**In scope files (as present in repo):**

- Job Description Assistant sheet consumer (`PostJob.tsx` / assistant component)
- AI Proposal Generator on `BookingDetail.tsx`
- Any match panel that defaults open on mobile

**Out of scope:** Redesigning drawer width, new FAB chrome, changing `onAccept` AI form rules.

---

### Q6 — Phase model

**Decision: Use local Phase 1–5 from `task.md`. Skip DB/API/codegen. Typecheck after each phase.**

---

## Resolved Risks

### R1 — User expectation shift on lock timing

**Decision: Accept.** Copy must match Module 8 Phase 4b. No tooltip required in this feature.

### R2 — Accent sweep regressions

**Decision: Colour classes only.** PR / phase review: `rg "violet-|purple-"` must trend to zero. Behaviour diffs in Cruise Mode / TalentSearch are bugs.

### R3 — BrandLogo a11y

**Decision:** Wrapper `aria-label="TalentLock"`; Shield `aria-hidden`. If wrapped in a link to `/dashboard` or `/`, ensure single accessible name.

### R4 — Empty-state dual-role copy

**Decision:** Role-neutral strings in `UI.md` empty-state table. No employer-only CTAs inside shared empty components unless the page is already employer-only (Talent Vault).

### R5 — Landing marketing rewrite

**Decision: Forbidden.** Only optional trivial `BrandLogo` swap. No hero/copy/layout changes on Landing.

### R6 — Pending label wording

**Decision: Canonical string is `Exclusivity Pending`.**

---

## Constants / types

No DB or API types. Frontend-only:

- `BrandLogoProps` in `BrandLogo.tsx`
- `StatusKind` in `StatusBadge.tsx`

---

## Pre-implementation agent gate

Before Phase 1 code:

- [x] Read `project.md`, this `plan.md`, and `task.md`
- [x] Ran pre-implementation checklist commands
- [x] Confirmed no schema/API edits planned
- [x] Confirmed exclusivity backend remains untouched

---

## Phase execution sign-off

| Phase | Description | Typecheck | Reviewer | Date |
|---|---|---|---|---|
| 1 | Tokens + BrandLogo + Teaching Details / Onboarding violet | ☑ | agent | 2026-07-12 |
| 2 | Exclusivity copy | ☑ | agent | 2026-07-12 |
| 3 | Shared primitives + accent governance sweep | ☑ | agent | 2026-07-12 |
| 4 | Dashboard + Vault + mobile AI | ☑ | agent | 2026-07-12 |
| 5 | Admin login brand alignment | ☑ | agent | 2026-07-12 |
| Validation | `validation.md` complete | ☑ | agent | 2026-07-12 |

---

## Conflict rule

**`plan.md` wins over `task.md`.** Exact copy strings and the violet replacement map in this file are authoritative.

# TalentLock — UI Specification: UI/UX Improvements

> Design + interaction source of truth for Phases 3–5 (also referenced for BrandLogo / copy in Phases 1–2).
> **Tech stack:** React, Vite, Tailwind CSS, shadcn/ui, Wouter.
> Brand: navy `hsl(222 47% 11%)`, gold `hsl(44 52% 52%)`, cream `hsl(40 30% 98%)`, Playfair Display + Plus Jakarta Sans.

---

## Design tokens

| Semantic | CSS / Tailwind | Use |
|---|---|---|
| Primary (navy) | `--primary` / `bg-primary` `text-primary` | Primary CTAs, headings, sidebar base |
| Primary foreground | `--primary-foreground` | Text on navy buttons |
| Gold | `--gold` / `text-gold` `bg-gold` | Brand accent, Shield icon, thin highlight bars |
| Gold foreground | `--gold-foreground` | Text on gold fills |
| Background (cream) | `--background` / `bg-background` | Page canvas |
| Card | `--card` / `bg-card` | White surfaces on cream |
| Secondary / muted | `--secondary` `--muted` | Soft fills, disabled chrome |
| Border | `--border` | Default borders |
| Destructive | `--destructive` | Errors only |
| Success (semantic) | `emerald-*` sparingly | Completed / success icons — not brand accent |
| Warning (semantic) | `amber-*` | Pending status badges |
| Chart series | `--chart-1` … `--chart-5` | Charts only |
| Serif | `font-serif` (Playfair) | Brand wordmark, page H1, section titles |
| Sans | `font-sans` (Plus Jakarta) | Body, UI controls |

**Forbidden in app chrome:** `violet-*`, `purple-*`, indigo-as-brand (except chart tokens already defined).

---

## Component — `BrandLogo`

**File:** `artifacts/talentlock/src/components/BrandLogo.tsx`

### Props

```tsx
export type BrandLogoProps = {
  size?: "sm" | "md" | "lg";       // default "md"
  variant?: "onDark" | "onLight"; // default "onDark"
  showWordmark?: boolean;           // default true
  className?: string;
};
```

### Variants

| Prop | Visual |
|---|---|
| `onDark` | Gold Shield + white Playfair wordmark (sidebar / navy bars) |
| `onLight` | Gold Shield + navy Playfair wordmark (cream / white surfaces) |
| `showWordmark={false}` | Icon only; parent must supply accessible name if not using default `aria-label` |

### States

| State | Rendering |
|---|---|
| Default | Icon + wordmark per variant |
| Icon-only | Shield only |
| In link | Inherit link focus ring; single accessible name “TalentLock” |

### Layout

```
[ Shield(gold) ][ TalentLock (serif) ]
```

---

## Component — `StatusBadge`

**File:** `artifacts/talentlock/src/components/StatusBadge.tsx`

### Variants

| `status` | Classes (approx) | Typical label |
|---|---|---|
| `pending` | `bg-amber-50 text-amber-800 border-amber-200` | Pending |
| `active` | `bg-primary/10 text-primary border-primary/20` | Active |
| `locked` | `bg-primary text-primary-foreground border-primary` | Locked / Exclusivity Locked |
| `cancelled` | `bg-destructive/10 text-destructive border-destructive/20` | Cancelled |
| `completed` | `bg-emerald-50 text-emerald-800 border-emerald-200` | Completed |
| `negotiating` | `bg-secondary text-secondary-foreground border-border` | Negotiating |

**Rule:** Never use `locked` for booking `pending`. Exclusivity headline on BookingDetail may remain custom (ShieldCheck / Clock) rather than StatusBadge — StatusBadge is for list chips.

---

## Shared empty states

Compose with `Empty`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription` from `artifacts/talentlock/src/components/ui/empty.tsx`.

| Surface | Title | Description | CTA (if any) |
|---|---|---|---|
| Talent Vault (employer) | `No talent matched` | `Try adjusting filters or keyword search. Profiles below 60% completeness stay hidden.` | Clear filters (if filters active) |
| Bookings | `No bookings yet` | `Exclusive engagements you request or receive will appear here.` | Employer: link to `/freelancers` |
| Agreements | `No agreements yet` | `Agreements are created from bookings once rates are agreed.` | — |
| Meetings | `No meetings scheduled` | `Discovery meetings with talent will show up here.` | — |
| Notifications | `You're all caught up` | `New booking, agreement, and match updates will land here.` | — |

Icon: Lucide relevant icon in `EmptyMedia variant="icon"` with `text-muted-foreground` — not violet.

---

## Exclusivity copy reference (final)

| ID | Location | String |
|---|---|---|
| E1 | FreelancerDetail CardDescription | `Request an exclusive engagement with this professional.` |
| E2 | FreelancerDetail form DialogDescription | `Set engagement dates and payment terms. Exclusivity activates when the agreement is fully signed.` |
| E3 | FreelancerDetail CTA | `Confirm Booking Request` |
| E4 | FreelancerDetail CTA busy | `Confirming...` |
| E5 | FreelancerDetail success description | `{name} — booking request sent. Exclusivity locks after both parties sign the agreement.` |
| E6 | FreelancerDetail footer | `Booking creates an agreement draft. Exclusivity locks once both parties have signed.` |
| E7 | BookingDetail active | `Exclusivity Locked` |
| E8 | BookingDetail pending | `Exclusivity Pending` |
| E9 | Unavailable CTA | `Currently Unavailable` |
| E10 | True-lock 409 toast | May retain locked language (active exclusivity only) |

---

## Page integrations

### AppLayout

- DOM: brand link → `<BrandLogo variant="onDark" size="md" />`
- Plan badge chips: primary/gold, not violet

### AdminLogin (`/admin/login`)

```
┌────────────────────────────┐
│      [BrandLogo onLight]   │
│      Admin Console (serif) │
│      Sign in description   │
│      username / password   │
│      [ Sign in ]           │
└────────────────────────────┘
```

- Background: `bg-background` (cream)
- Card: white, subtle border, serif title
- **No auth logic changes**

### Dashboard

1. Greeting / page title (serif)
2. **Primary KPI row** (dominant)
3. Secondary analytics panels (Spend / Hiring / Earnings) — quieter borders
4. Recent activity lists as today

Responsive: stack KPI cards; no new widgets.

### Talent Vault (`FreelancersList`)

1. Serif H1 “Talent Vault” (or existing title, Playfair treatment)
2. Supporting sentence (existing OK if not lock-on-click)
3. Filters (primary active state)
4. Grid of freelancer cards
5. Empty state per table above

### FreelancerDetail Engage card

- Gold top hairline (`bg-gold`) may remain
- Copy IDs E1–E6
- Success dialog: prefer `CheckCircle2` (green semantic) over ShieldCheck

### BookingDetail exclusivity row

- Active: ShieldCheck + E7
- Pending: Clock + E8

### AI assistants (mobile)

- Default `open={false}`
- `< md`: never auto-open; explicit trigger only
- Trigger icon: `text-gold` or `text-primary` (not violet)
- TOKEN_LIMIT errors stay inline — no `/pricing` redirect inside drawers

---

## Loading / error summary

| Surface | Loading | Error |
|---|---|---|
| BrandLogo | N/A (static) | N/A |
| StatusBadge | N/A | N/A |
| List empties | Existing skeleton/spinner patterns | Existing toast / inline |
| AdminLogin | Button `submitting` disabled | Destructive toast (unchanged) |
| Booking create | `Confirming...` | Existing 402 / 409 toasts |

---

## Accessibility notes

- BrandLogo: accessible name “TalentLock”; decorative Shield `aria-hidden`
- Status colours not sole indicator — include text label always
- Exclusivity Pending vs Locked: text must differ; icon change supports but does not replace text
- Focus rings: `ring-primary` / existing shadcn focus-visible
- Contrast: gold on navy and gold on cream must remain readable; prefer `text-gold` on navy, `text-primary` for body on cream
- Mobile AI: focus trap inside Sheet when open; closing returns focus to trigger

---

## Motion (light touch)

Existing `animate-fade-in` / `animate-slide-up-fade` OK on Dashboard KPI entrance if already used. Do not add noisy perpetual animation. Prefer 2–3 intentional fades max on polished pages.

---

## Component file summary

| File | New / Modified | Tasks |
|---|---|---|
| `artifacts/talentlock/src/index.css` | Modified | 1.1 |
| `artifacts/talentlock/src/components/BrandLogo.tsx` | **New** | 1.2 |
| `artifacts/talentlock/src/components/layout/AppLayout.tsx` | Modified | 1.3, 3.4 |
| `artifacts/talentlock/src/components/onboarding/TeachingDetailsSection.tsx` | Modified | 1.4 |
| `artifacts/talentlock/src/pages/Onboarding.tsx` | Modified | 1.4 |
| `artifacts/talentlock/src/pages/FreelancerDetail.tsx` | Modified | 2.1 |
| `artifacts/talentlock/src/pages/BookingDetail.tsx` | Modified | 2.2, 3.4 |
| `artifacts/talentlock/src/pages/FreelancersList.tsx` | Modified | 2.3, 3.3, 4.2 |
| `artifacts/talentlock/src/components/StatusBadge.tsx` | **New** | 3.1 |
| `artifacts/talentlock/src/components/ui/button.tsx` | Modified (if needed) | 3.2 |
| `artifacts/talentlock/src/components/ui/input.tsx` | Modified (if needed) | 3.2 |
| `artifacts/talentlock/src/components/ui/badge.tsx` | Modified (if needed) | 3.2 |
| `artifacts/talentlock/src/pages/BookingsList.tsx` | Modified | 3.3 |
| `artifacts/talentlock/src/pages/AgreementsList.tsx` | Modified | 3.3 |
| Match / Notification / Cruise / PostJob / MeetingBrief | Modified | 3.4 |
| `artifacts/talentlock/src/pages/Dashboard.tsx` | Modified | 4.1 |
| AI assistant consumers + optional `useMediaQuery.ts` | Modified / New | 4.3 |
| `artifacts/talentlock/src/pages/AdminLogin.tsx` | Modified | 5.1 |

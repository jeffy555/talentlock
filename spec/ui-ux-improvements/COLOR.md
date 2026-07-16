# TalentLock — Color Combinations

Quick reference for UI color pairing. Source of truth for classes: `artifacts/talentlock/src/index.css`. Spec table: `UI.md`.

## Core brand trio

| Role | Token | Approx |
|---|---|---|
| Navy | `--primary` | `hsl(222 47% 11%)` |
| Gold | `--gold` | `hsl(44 52% 52%)` |
| Cream | `--background` | `hsl(40 30% 98%)` |

## Ready-made combinations

Use these class names in components:

```tsx
<div className="combo-card rounded-xl p-4">…</div>
<span className="combo-gold-soft rounded-full px-2 py-0.5 text-xs">Highlight</span>
<span className="combo-success rounded-md px-2 py-1 text-xs">Verified</span>
```

| Class | When to use |
|---|---|
| `combo-shell` | Sidebar / navy chrome |
| `combo-page` | Page background |
| `combo-card` | Cards / panels |
| `combo-gold` | Solid brand CTA / badge |
| `combo-gold-soft` | Soft brand highlight |
| `combo-navy-soft` | Soft navy panel |
| `combo-success` | Success / verified |
| `combo-warning` | Pending / caution |
| `combo-info` | Neutral info |
| `combo-danger` | Soft error |
| `combo-nav-idle` | Sidebar idle item |
| `combo-nav-active` | Sidebar active item |

## Do not use

- Purple / violet stacks for chrome (`violet-*`, `purple-*`)
- Random teal/indigo as brand accents (TalentSearch/Cruise use gold pulse instead)

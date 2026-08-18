# TalentLock — UI Specification: Engagement Lists

## Shared toolbar

**Component:** `EngagementListToolbar`

| Element | Spec |
|---------|------|
| Search | Full-width input, left search icon, clear (×) when non-empty |
| Status | Chip row (`All` + each status/decision) — radiogroup |
| Clear | Text button; disabled when defaults |
| Summary | `N matching` muted text under toolbar |

Placeholders:

| Surface | Placeholder |
|---------|-------------|
| Meetings | Search by title, agenda, or name… |
| Bookings | Search by name… |
| Agreements | Search by title or name… |
| Jobs | Search by title or description… |
| Messages | Search by name… |
| TalentSearch activity | Search by freelancer name… |
| Cruise Mode activity | Search by job title… |

---

## Pagination bar

`Showing 1–10 of 47` · `← Prev` · `Page 2 of 5` · `Next →`

Hide entire bar when `total === 0`. Prefer always show summary when results exist.

---

## Page shells

Keep existing serif H1 + subtitle. Toolbar sits **below** header, **above** cards.  
Activity feeds: toolbar under the Activity heading.  
Messages: compact toolbar above the conversation list inside the chat box.

---

## Empty states

| State | Title | Action |
|-------|-------|--------|
| True empty | Existing copy | Existing CTA |
| No matches | No {entity} match your search or filters | Clear filters |

---

## A11y

- Search input labelled
- Status chips selected state
- Pagination buttons disabled at ends

---

## Visual

Follow `ui-ux-improvements` tokens — navy/gold/cream; no violet filter chips. TalentSearch retains teal accents on decision badges.

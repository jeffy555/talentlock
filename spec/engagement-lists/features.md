# TalentLock — Features Specification: Engagement Lists (Search, Filter & Pagination)

## Overview

Operational list surfaces across TalentLock need consistent **search**, **status/decision filters**, and **pagination** (`pageSize` 10, Showing X–Y of Z). Product Gaps Module 5 added API pagination for Meetings / Bookings / Agreements; this feature extends the same chrome to every remaining role list that lacked it.

**Covered surfaces:**

| Surface | Role | Route / component |
|---------|------|-------------------|
| Meetings | Both | `/meetings` |
| Bookings | Both | `/bookings` |
| Agreements | Both | `/agreements` |
| Jobs | Both | `/jobs` |
| Messages inbox | Both | Chat box conversation list |
| TalentSearch activity | Employer | `/talent-search` activity feed |
| Cruise Mode activity | Freelancer | `/cruise-mode` activity feed |

**Builds on:** `spec/ProductGaps/` Module 5 (pagination contract).  
**Does not replace:** Talent Vault search (`?q=` on freelancers) — different domain.  
**Out of scope:** Notification panel, Dashboard widgets, Admin lists, Team roster, ReviewList embedded pager.

---

## Feature Modules

### Module 1 — Shared list toolbar (UI)

Use `EngagementListToolbar` above results:

```
[ Search 🔍 ……………………………… ]   [ Status ▾ / chips ]   [ Clear ]
Results: N matching · Page size 10
────────────────────────────────────
… cards / rows …
────────────────────────────────────
[← Prev]   Page 2 of 5   [Next →]     Showing 11–20 of 47
```

- Search placeholder is surface-specific (Module 2).
- Status / decision control is surface-specific (Module 3).
- Changing search or status **resets to page 1**.
- Full pages (Meetings / Bookings / Agreements / Jobs) sync URL `?q=&status=&page=`.
- Embedded feeds (TalentSearch / Cruise Mode / Messages) use local state.

---

### Module 2 — Keyword search

| Surface | Query param | Matches (server-side, case-insensitive) |
|---------|-------------|-----------------------------------------|
| Meetings | `q` | `title`, `agenda`, counterparty name |
| Bookings | `q` | counterparty name |
| Agreements | `q` | title / booking-linked title, counterparty name |
| Jobs | `q` | `title`, `description` |
| Messages | `q` | counterparty display name |
| TalentSearch activity | `q` | freelancer name |
| Cruise Mode activity | `q` | job title |

Rules:

- Debounce **400ms**.
- Min effective query length: **2** characters; shorter → ignore `q`.
- Prefer **ILIKE `%term%`** via `sanitiseIlikeQuery`.
- Search is **AND** with status/decision filter and party scope.

---

### Module 3 — Status / decision filters

| Surface | Filter values | API |
|---------|---------------|-----|
| Meetings | `all` \| `pending` \| `confirmed` \| `completed` \| `cancelled` | `status` on `GET /meetings` |
| Bookings | `all` \| `pending` \| `negotiating` \| `active` \| `completed` \| `cancelled` | `status` on `GET /bookings` |
| Agreements | `all` \| `draft` \| `redlined` \| `partially_signed` \| `fully_signed` | `status` on `GET /agreements` |
| Jobs | `all` \| `open` \| `filled` \| `closed` | `status` on `GET /job-requirements` |
| Messages | `all` \| `unread` | `unread=true` on `GET /conversations/direct` |
| TalentSearch / Cruise Mode | `all` \| `sent` \| `dry_run_would_send` \| `skipped` \| `prefilter_rejected` \| `duplicate_skipped` \| `dm_failed` | `decision` on activity endpoints |

---

### Module 4 — Pagination polish

- Default **`pageSize: 10`** on list UIs (API may default to 20; UIs pass 10 explicitly).
- Display **“Showing X–Y of Z”** plus **Page N of M** via `PaginationControls`.
- Scroll to top of list on page change where applicable.

---

### Module 5 — Empty & filtered-empty states

| Condition | Copy pattern |
|-----------|----------------|
| No rows at all (no filters) | Existing empty |
| Filters/search active, zero hits | “No … match your search or filters.” + **Clear filters** CTA |

---

### Module 6 — API / OpenAPI

| Endpoint | Add / wire |
|----------|------------|
| `GET /api/meetings` | `status`, `q` |
| `GET /api/bookings` | `status`, `q` |
| `GET /api/agreements` | `status`, `q` |
| `GET /api/job-requirements` | `page`, `pageSize`, `q`, `status`; response **paginated** `{ data, total, page, pageSize, totalPages }` |
| `GET /api/conversations/direct` | `q`, `unread` |
| `GET /api/talent-search/activity` | `q`, `decision` |
| `GET /api/cruise-mode/activity` | `q`, `decision` |

Codegen required after OpenAPI edits.

---

## Plan Gating

All plans. No tokens. No quota.

---

## Non-Goals

- Infinite scroll
- Saved filter presets / multi-status multi-select
- Full-text ranking / boolean search operators
- Filtering by date range (phase 2)
- Admin list pages
- Talent Vault (own search system)
- Changing Dashboard widgets that fetch first page only

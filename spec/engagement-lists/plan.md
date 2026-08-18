# TalentLock — Implementation Plan: Engagement Lists

> Binding. Wins over `task.md` on conflict.

---

## Decisions

| ID | Decision |
|----|----------|
| D1 | List UI default `pageSize = 10` |
| D2 | Search via server `q` + ILIKE (phase 1) |
| D3 | URL sync `q`, `status`, `page` on full list pages; local state for embedded feeds |
| D4 | Meetings / Bookings / Agreements / Jobs / Messages / TalentSearch / Cruise Mode covered |
| D5 | Jobs API returns paginated shape (breaking vs prior array) |
| D6 | Activity filter param is `decision`; Messages use `unread` boolean |
| D7 | Extend `PaginationControls` with total range label |

---

## D1 — OpenAPI

- Meetings / bookings / agreements: `status` + `q` as applicable
- Jobs: `page`, `pageSize`, `q`, `status` → `PaginatedJobRequirementsResult`
- Conversations direct: `q`, `unread`
- TalentSearch / Cruise Mode activity: `q`, `decision`

Codegen + typecheck.

---

## D2 — Backend

Apply filters **before** `limit/offset`; `total` must reflect filtered count. Use `sanitiseIlikeQuery`.

---

## D3 — Frontend shared toolbar

`EngagementListToolbar` on all covered surfaces.  
`useEngagementListQueryState` for Meetings / Bookings / Agreements / Jobs.

---

## D4 — Pagination

```ts
total?: number;
pageSize?: number;
// renders "Showing {from}–{to} of {total}" when total provided
```

---

## D5 — Cursor notes

- Never filter only the current page client-side
- Pass `pageSize: 10` from list UIs
- Reset `page` to 1 when `q` or status/decision changes
- AiMatch job picker uses paginated jobs with `pageSize: 100`

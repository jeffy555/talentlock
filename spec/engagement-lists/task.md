# TalentLock — Task Breakdown: Engagement Lists

## Phase 1 — Database

None (no schema change for ILIKE phase 1).

---

## Phase 2 — Backend

### Task 2.1 — OpenAPI params + paginated jobs schema

### Task 2.2 — Codegen + checks (`indexFiles: false`, typecheck)

### Task 2.3 — Implement filters

- `meetings.ts`, `bookings.ts`, `agreements.ts`
- `jobRequirements.ts` (paginated + `q`)
- `conversations.ts` (`q`, `unread`)
- `talentSearch.ts` / `cruiseMode.ts` activity (`q`, `decision`)

---

## Phase 3 — Frontend

### Task 3.1 — `EngagementListToolbar`

### Task 3.2 — Extend `PaginationControls`

### Task 3.3 — Wire list pages + feeds

- Meetings / Bookings / Agreements / Jobs (`pageSize: 10`, URL sync where applicable)
- TalentSearch + Cruise Mode activity feeds
- Messages `ConversationList`
- Fix AiMatch for paginated jobs

---

## Checklist

- [x] Meetings support `status` + `q`
- [x] Bookings/agreements UI use `status` + `q`
- [x] Jobs paginated + `q` + status UI
- [x] Messages inbox `q` + unread + pageSize 10
- [x] TalentSearch / Cruise Mode activity `q` + decision
- [x] Page size 10; showing X–Y of Z
- [x] No client-only filter of one page
- [x] Typecheck passes

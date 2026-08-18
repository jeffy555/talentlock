# TalentLock — Clarification: Engagement Lists

## Verified

| Item | State |
|------|--------|
| Bookings/agreements/meetings return paginated shape | Product Gaps Module 5 ✅ |
| `PaginationControls` on three list pages | ✅ Prev / Page N of M / Next |
| Default UI `pageSize: 20` | ✅ — this feature moves list UIs to **10** |
| `GET /bookings?status=` implemented | ✅ backend; ❌ UI |
| `GET /agreements?status=` implemented | ✅ backend; ❌ UI |
| `GET /meetings` status / `q` | ❌ neither |
| Keyword `q` on bookings/agreements | ❌ |
| Product Gaps deferred “Filtering bookings/agreements by status” | Explicit non-goal → **this feature owns it** |

---

## Gaps

| Gap | Resolution |
|-----|------------|
| No search on engagement lists | Module 2 `q` |
| Status filters unused in UI | Module 3 |
| Meetings lack status API | Add `status` query |
| Weak pagination chrome | Module 4 + total count |
| pageSize 20 vs “>10 needs pages” | Default **10** on these pages |

---

## Open Questions

### Q1 — Search implementation: ILIKE vs tsvector?

**Recommendation:** **ILIKE** on allowlisted columns for phase 1 (per-user lists, low volume). Revisit tsvector if lists exceed thousands per user.

### Q2 — Sync filters to URL?

**Recommendation:** **Yes** — `?q=&status=&page=` so refresh/back works. Use `wouter` / `URLSearchParams`.

### Q3 — Should Dashboard keep fetching unfiltered pages?

**Recommendation:** Unchanged — Dashboard uses its own limited fetches; out of scope.

### Q4 — Counterparty name search requires join

**Recommendation:** Join freelancer/employer profile name in list query (already enriched for display) — apply `q` in SQL with joins, not client-side filter of one page.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Client-side filter of current page only | Forbidden — always server `q`/`status` |
| Breaking Dashboard if pageSize default changes globally | List pages pass explicit `pageSize: 10`; API default can remain 20 |
| Status enum drift | Use same enums as detail badges |

---

## Blockers

None.

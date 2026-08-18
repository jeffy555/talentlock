# TalentLock — Validation Guide: Engagement Lists

## API

- [ ] `GET /meetings?status=confirmed` returns only confirmed
- [ ] `GET /meetings?q=…` matches title/agenda/name; total updates
- [ ] `GET /bookings?status=active&q=…` combines filters
- [ ] `GET /agreements?status=fully_signed&q=…` combines filters
- [ ] Invalid status → 400
- [ ] `pageSize=10` respected; totalPages = ceil(total/10)

## UI

- [ ] All three pages show search + status + pagination summary
- [ ] Changing filter resets to page 1
- [ ] URL reflects `q`/`status`/`page` (if implemented)
- [ ] Filtered empty shows Clear filters
- [ ] True empty unchanged when no filters
- [ ] No violet chips

## Regression

- [ ] Detail pages unchanged
- [ ] Dashboard still loads
- [ ] Product Gaps pagination shape intact

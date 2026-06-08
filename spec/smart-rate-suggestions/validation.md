# TalentLock — Validation Guide: Smart Rate Suggestions

---

## Phase 1 — Backend Utility

### V1.1 — TokenFeature Updated
```bash
grep "rate_suggestion" artifacts/api-server/src/lib/tokenLogger.ts
```
- [ ] `'rate_suggestion'` present in `TokenFeature` union

### V1.2 — Market Median Null Below Threshold
With fewer than 3 freelancers in a field: `getMarketMedian()` returns `null`.

### V1.3 — Historical Avg Uses Only Agreed Bookings
```sql
-- All bookings used in avg should have negotiation_status = 'agreed'
SELECT negotiation_status FROM bookings
WHERE employer_id = '<id>' AND proposed_rate IS NOT NULL;
```
- [ ] Only `agreed` rows contribute to the average

---

## Phase 2 — Backend API

### V2.1 — Freelancer Cannot Call Endpoint
```bash
curl -X POST http://localhost:8080/api/ai/rate-suggestion \
  -H "Authorization: Bearer <freelancer_token>" \
  -d '{"freelancerId":"<id>"}'
```
- [ ] Returns `HTTP 403`

### V2.2 — Starter Gets Static Data Only
```bash
curl -X POST http://localhost:8080/api/ai/rate-suggestion \
  -H "Authorization: Bearer <starter_employer_token>" \
  -d '{"freelancerId":"<id>"}'
```
- [ ] Returns `HTTP 200` with `isAiSuggestion: false`
- [ ] No `token_usage` row created

### V2.3 — Growth Gets Full AI Response
```bash
curl -X POST http://localhost:8080/api/ai/rate-suggestion \
  -H "Authorization: Bearer <growth_employer_token>" \
  -d '{"freelancerId":"<id>"}'
```
- [ ] Returns `suggestedRate`, `explanation`, `confidence`, `isAiSuggestion: true`
- [ ] `token_usage` row created with `feature = 'rate_suggestion'`

### V2.4 — Market Median Not Exposed
Response: `marketMedian` is a single number — no individual rates or freelancer IDs.

### V2.5 — TypeCheck Passes
```bash
pnpm run typecheck
```
- [ ] Zero errors

---

## Phase 3 — Frontend

### V3.1 — Widget Visible on Booking Form
On `/freelancers/:id`: rate context card visible below rate input.

### V3.2 — Starter: No AI Button
Log in as Starter employer: no "Get AI suggestion" button visible.

### V3.3 — Growth: Button Triggers AI Call
Click "Get AI suggestion": spinner shows → AI suggestion loads with rate + explanation.

### V3.4 — "Use Rate" Fills Input Only
Click "Use $83/hr": rate input updates to 83. Form is NOT submitted.
- [ ] Booking creation form still requires separate submit action

### V3.5 — Widget in Negotiation Panel
On `/bookings/:id` with `negotiationStatus = 'negotiating'` as employer: widget visible.
- [ ] Not visible for freelancer viewing same booking

### V3.6 — Build Passes
```bash
pnpm run typecheck && pnpm --filter @workspace/talentlock run build
```
- [ ] Zero errors

---

## Final Sign-Off

| Phase | Pass | Signed Off By | Date |
|---|---|---|---|
| Phase 1 | ⬜ | | |
| Phase 2 | ⬜ | | |
| Phase 3 | ⬜ | | |
| **Complete** | ⬜ | | |

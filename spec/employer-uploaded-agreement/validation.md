# TalentLock — Validation: Employer Uploaded Agreement

## Automated

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server test -- tests/unit/employerAgreementSummaryUtils.test.ts
pnpm --filter @workspace/api-server test -- tests/unit/agreementEnrichUtils.test.ts
```

---

## Manual QA Checklist

### Booking Detail

- [ ] After rate agreed, employer sees AI Generate and Upload tabs
- [ ] Upload PDF creates agreement and redirects to detail
- [ ] Upload with negotiation pending shows error
- [ ] Freelancer does not see upload option

### Agreement Workflow (Employer)

- [ ] Employer summary displays after upload
- [ ] Can add/remove amendment points
- [ ] Enrich updates content with booking dates and rate (correct currency)
- [ ] Finalize runs health score
- [ ] Cannot sign before finalize
- [ ] Can sign after finalize
- [ ] Freelancer notified after employer signs

### Edge Cases

- [ ] Empty/scanned PDF returns 422
- [ ] Token limit shows inline error on summary/enrich/finalize
- [ ] Second agreement on same booking blocked

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Agent | | | Pending |
| Human QA | | | Pending |

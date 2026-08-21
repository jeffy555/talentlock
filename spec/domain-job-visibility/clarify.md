# TalentLock — Clarification: Domain Job Visibility

## Verified

| Item | Source |
|------|--------|
| `professionCategory` on profiles + jobs | Teaching / healthcare / legal-finance specs |
| Values | `technology` \| `education` \| `healthcare` \| `legal_finance` |
| `GET /job-requirements` is public (paginated) | `project.md`, jobs crud integration test |
| Cruise Mode fires on `POST /job-requirements` | `evaluateCruiseModeForNewJob` |
| Teaching spec deferred Cruise domain filter | `spec/teaching-professional-profile/validation.md` V “Cruise Mode untouched” |

## Resolved in `plan.md`

### Q1 — Append to teaching / healthcare / cruise specs?

**No.** Those specs shipped verticals and explicitly left Cruise cross-domain. This is a **platform visibility rule** across all four domains → new folder `spec/domain-job-visibility/`.

### Q2 — Log Cruise skips for other domains?

**No.** Silent skip. Logging would drown the activity feed whenever a technology job posts.

### Q3 — Anonymous job list?

**Unchanged.** Only **signed-in freelancers** are domain-scoped. Public list + employer list stay global / owner-scoped.

### Q4 — Direct URL to another domain’s job?

**404** for that freelancer (list + detail + interest). Do not show the title.
